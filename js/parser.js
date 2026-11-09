// TalkCheck — rule-based parser
// Turns a spoken cabin finding (Portuguese or English) into structured data:
// cabin zone (with a position along the fuselage), priority and suggested ATA chapter.
// Runs 100% offline: no network, no external AI.

import { AIRCRAFT, DEFAULT_AIRCRAFT } from './aircraft.js';

/** Lowercase, remove accents and collapse spaces, so "Oxigênio" == "oxigenio". */
export function normalize(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Builds a whole-word regex from a keyword list (accepts simple plurals: -s / -es). */
function wordRegex(words) {
  const alt = words
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+'))
    .join('|');
  return new RegExp(`\\b(?:${alt})(?:e?s)?\\b`);
}

// ---------------------------------------------------------------------------
// Zone detection
// ---------------------------------------------------------------------------

const FLIGHT_DECK = wordRegex(['cockpit', 'flight deck', 'cabine de comando', 'cabine de pilotagem']);
const ROW_KEYWORD = /\b(?:fileira|fila|row|poltrona|assento|seat|banco|cadeira)\s*(\d{1,2})([a-k])?\b/;
const BARE_SEAT = /\b(\d{1,2})([a-k])\b/; // e.g. "23c"
const PREP_ROW = /\b(?:na|no|em|perto da|perto do|at|near)\s+(\d{1,2})([a-k])?\b/; // e.g. "na 12"
const LAV = /\b(?:lav|lavatorio|lavatory|banheiro|toalete|toilet)\s*([lr])?\s*-?\s*(\d)?\b/;
const GALLEY = /\b(?:galley|galei|cozinha)\b/;
const DOOR_KEYWORD = /\b(?:porta|door|saida|exit)\s*([lr])\s*-?\s*(\d)\b/;
const BARE_DOOR = /\b([lr])\s*-?\s*(\d)\b/; // e.g. "L2"
const FWD = /\b(?:dianteir[oa]|da frente|frontal|forward|fwd)\b/;
const MID = /\b(?:do meio|central|meio|mid|middle)\b/;
const AFT = /\b(?:traseir[oa]|do fundo|de tras|aft|rear)\b/;

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/** Position (0 = nose, 1 = tail) of a door number for a given aircraft. */
export function doorPosition(doorNumber, aircraft) {
  const { doors } = aircraft;
  const n = clamp(doorNumber, 1, doors);
  return 0.05 + ((n - 1) / Math.max(1, doors - 1)) * 0.9;
}

/** Position (0 = nose, 1 = tail) of a seat row for a given aircraft. */
export function rowPosition(row, aircraft) {
  return 0.08 + (clamp(row, 1, aircraft.rows) / aircraft.rows) * 0.84;
}

function seatSide(letter) {
  if (!letter) return null;
  if ('abc'.includes(letter)) return 'L';
  if ('ghjk'.includes(letter)) return 'R';
  return 'C';
}

function rowZone(match, aircraft) {
  const row = Number(match[1]);
  const letter = match[2] || '';
  return {
    type: 'seat',
    label: `Row ${row}${letter.toUpperCase()}`,
    pos: rowPosition(row, aircraft),
    side: seatSide(letter),
  };
}

/**
 * Finds where in the cabin the finding is.
 * Order goes from most specific to least specific.
 * @returns {{type:string,label:string,pos:number|null,side:string|null}|null}
 */
export function detectZone(text, aircraft = AIRCRAFT[DEFAULT_AIRCRAFT]) {
  const t = normalize(text);
  let m;

  if (FLIGHT_DECK.test(t)) {
    return { type: 'flightdeck', label: 'Flight deck', pos: 0.01, side: null };
  }

  if ((m = t.match(ROW_KEYWORD))) return rowZone(m, aircraft);

  if ((m = t.match(LAV))) {
    const side = m[1] ? m[1].toUpperCase() : null;
    const num = m[2] ? Number(m[2]) : null;
    return {
      type: 'lav',
      label: `Lav${side || num ? ' ' : ''}${side ?? ''}${num ?? ''}`,
      pos: num ? doorPosition(num, aircraft) : null,
      side,
    };
  }

  if (GALLEY.test(t)) {
    if (FWD.test(t)) return { type: 'galley', label: 'Fwd galley', pos: 0.05, side: null };
    if (MID.test(t)) return { type: 'galley', label: 'Mid galley', pos: 0.5, side: null };
    if (AFT.test(t)) return { type: 'galley', label: 'Aft galley', pos: 0.95, side: null };
    const d = t.match(BARE_DOOR);
    if (d) {
      return { type: 'galley', label: `Galley ${d[2]}`, pos: doorPosition(Number(d[2]), aircraft), side: null };
    }
    return { type: 'galley', label: 'Galley', pos: null, side: null };
  }

  if ((m = t.match(DOOR_KEYWORD) || t.match(BARE_DOOR))) {
    const side = m[1].toUpperCase();
    const num = Number(m[2]);
    return { type: 'door', label: `Door ${side}${num}`, pos: doorPosition(num, aircraft), side };
  }

  if ((m = t.match(BARE_SEAT) || t.match(PREP_ROW))) return rowZone(m, aircraft);

  return null;
}

// ---------------------------------------------------------------------------
// Priority
// ---------------------------------------------------------------------------

export const PRIORITY = { CRITICAL: 'critical', NORMAL: 'normal', COSMETIC: 'cosmetic' };

// Safety / emergency equipment and anything that may ground the aircraft.
const CRITICAL = wordRegex([
  'oxigenio', 'oxygen', 'mascara', 'mask',
  'emergencia', 'emergency', 'evacuacao', 'evacuation',
  'fumaca', 'smoke', 'fogo', 'fire', 'faisca', 'spark', 'queimado', 'burning',
  'extintor', 'extinguisher',
  'escorregadeira', 'slide', 'colete', 'life vest', 'lifevest',
  'cinto', 'seat belt', 'seatbelt',
  'saida', 'exit', 'lanterna', 'flashlight',
  'vazamento', 'leak', 'leaking',
]);

// Appearance-only findings.
const COSMETIC = wordRegex([
  'rasgado', 'rasgada', 'rasgo', 'torn', 'tear',
  'mancha', 'manchado', 'stain', 'stained',
  'sujo', 'suja', 'dirty',
  'arranhado', 'arranhada', 'arranhao', 'scratch', 'scratched',
  'descascado', 'descascando', 'peeling',
]);

export function detectPriority(text) {
  const t = normalize(text);
  if (CRITICAL.test(t)) return PRIORITY.CRITICAL;
  if (COSMETIC.test(t)) return PRIORITY.COSMETIC;
  return PRIORITY.NORMAL;
}

// ---------------------------------------------------------------------------
// ATA chapter suggestion (first matching rule wins, so order matters)
// ---------------------------------------------------------------------------

const ATA_RULES = [
  { chapter: '35', title: 'Oxygen', re: wordRegex(['oxigenio', 'oxygen', 'mascara', 'mask']) },
  { chapter: '26', title: 'Fire Protection', re: wordRegex(['fumaca', 'smoke', 'extintor', 'extinguisher', 'fogo', 'fire']) },
  { chapter: '25', title: 'Emergency Equipment', re: wordRegex(['escorregadeira', 'slide', 'colete', 'life vest', 'lifevest', 'lanterna', 'flashlight']) },
  { chapter: '33', title: 'Lights', re: wordRegex(['luz', 'lampada', 'iluminacao', 'light', 'lamp', 'sign', 'placa', 'aviso luminoso']) },
  { chapter: '38', title: 'Water / Waste', re: wordRegex(['descarga', 'vaso', 'privada', 'pia', 'torneira', 'agua', 'esgoto', 'ralo', 'flush', 'sink', 'faucet', 'water', 'drain']) },
  { chapter: '44', title: 'Cabin Systems / IFE', re: wordRegex(['tela', 'monitor', 'entretenimento', 'ife', 'fone', 'headset', 'controle remoto', 'handset', 'screen', 'usb', 'tomada', 'power outlet']) },
  { chapter: '23', title: 'Communications', re: wordRegex(['interfone', 'interphone', 'sistema de som', 'pa system', 'chamada', 'attendant call', 'call button']) },
  { chapter: '21', title: 'Air Conditioning', re: wordRegex(['gasper', 'ventilacao', 'ar condicionado', 'air conditioning', 'temperatura', 'temperature']) },
  { chapter: '25', title: 'Equipment / Furnishings', re: wordRegex([
    'poltrona', 'assento', 'braco', 'apoio de braco', 'mesinha', 'mesa', 'encosto', 'reclinar', 'cinto',
    'seat', 'armrest', 'tray table', 'tray', 'recline', 'seat belt', 'seatbelt',
    'galley', 'forno', 'oven', 'cafeteira', 'coffee', 'chiller', 'trolley', 'carrinho',
    'carpete', 'carpet', 'bagageiro', 'bin', 'cortina', 'curtain', 'painel', 'panel', 'lixo', 'trash',
  ]) },
  { chapter: '52', title: 'Doors', re: wordRegex(['porta', 'door', 'macaneta', 'handle']) },
];

export function suggestAta(text) {
  const t = normalize(text);
  const rule = ATA_RULES.find((r) => r.re.test(t));
  return rule ? { chapter: rule.chapter, title: rule.title } : null;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function parseFinding(text, aircraftKey = DEFAULT_AIRCRAFT) {
  const aircraft = AIRCRAFT[aircraftKey] ?? AIRCRAFT[DEFAULT_AIRCRAFT];
  return {
    zone: detectZone(text, aircraft),
    priority: detectPriority(text),
    ata: suggestAta(text),
  };
}
