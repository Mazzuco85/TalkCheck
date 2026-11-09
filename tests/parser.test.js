// Run with: node --test   (Node 18+, no dependencies)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, detectZone, detectPriority, suggestAta, parseFinding, PRIORITY } from '../js/parser.js';
import { AIRCRAFT } from '../js/aircraft.js';

const B787 = AIRCRAFT.B787;

test('normalize removes accents and case', () => {
  assert.equal(normalize('  Máscara de OXIGÊNIO  '), 'mascara de oxigenio');
});

test('zone: seat row with letter (PT)', () => {
  const z = detectZone('braço quebrado na fileira 23C', B787);
  assert.equal(z.label, 'Row 23C');
  assert.equal(z.side, 'L');
});

test('zone: seat row (EN) on right side', () => {
  const z = detectZone('tray table broken seat 41K', B787);
  assert.equal(z.label, 'Row 41K');
  assert.equal(z.side, 'R');
});

test('zone: bare seat like "14d" is center', () => {
  const z = detectZone('reading light out 14d', B787);
  assert.equal(z.label, 'Row 14D');
  assert.equal(z.side, 'C');
});

test('zone: "na 12" is read as a row', () => {
  assert.equal(detectZone('carpete manchado na 12', B787).label, 'Row 12');
});

test('zone: later rows sit further aft', () => {
  const front = detectZone('fileira 5', B787).pos;
  const back = detectZone('fileira 45', B787).pos;
  assert.ok(back > front);
});

test('zone: lavatory with side and number', () => {
  const z = detectZone('descarga do lav L4 não funciona', B787);
  assert.equal(z.type, 'lav');
  assert.equal(z.label, 'Lav L4');
  assert.ok(z.pos > 0.9);
});

test('zone: galley by position words', () => {
  assert.equal(detectZone('forno do galley traseiro não aquece', B787).label, 'Aft galley');
  assert.equal(detectZone('fwd galley coffee maker inop', B787).label, 'Fwd galley');
});

test('zone: door by number', () => {
  const z = detectZone('slide pressure low door R2', B787);
  assert.equal(z.label, 'Door R2');
});

test('zone: flight deck', () => {
  assert.equal(detectZone('luz do cockpit queimada', B787).type, 'flightdeck');
});

test('zone: unknown returns null', () => {
  assert.equal(detectZone('algo estranho', B787), null);
});

test('priority: safety items are critical', () => {
  assert.equal(detectPriority('máscara de oxigênio caída na 30A'), PRIORITY.CRITICAL);
  assert.equal(detectPriority('emergency light inop'), PRIORITY.CRITICAL);
  assert.equal(detectPriority('cinto de segurança rasgado'), PRIORITY.CRITICAL); // safety wins over cosmetic
});

test('priority: appearance-only is cosmetic', () => {
  assert.equal(detectPriority('carpete manchado perto da 12'), PRIORITY.COSMETIC);
});

test('priority: everything else is normal', () => {
  assert.equal(detectPriority('mesinha não trava'), PRIORITY.NORMAL);
});

test('ATA: chapter suggestions', () => {
  assert.equal(suggestAta('luz de leitura queimada').chapter, '33');
  assert.equal(suggestAta('descarga do lav não funciona').chapter, '38');
  assert.equal(suggestAta('máscara de oxigênio').chapter, '35');
  assert.equal(suggestAta('braço da poltrona quebrado').chapter, '25');
  assert.equal(suggestAta('tela do IFE travada').chapter, '44');
  assert.equal(suggestAta('detector de fumaça').chapter, '26');
});

test('ATA: unknown returns null', () => {
  assert.equal(suggestAta('nada a ver'), null);
});

test('parseFinding: full example', () => {
  const r = parseFinding('luz de emergência apagada na porta L3', 'B777');
  assert.equal(r.priority, PRIORITY.CRITICAL);
  assert.equal(r.ata.chapter, '33');
  assert.equal(r.zone.label, 'Door L3');
});

test('zone: Boeing 737 has 2 doors (L2 is aft)', () => {
  const z = detectZone('slide door L2', AIRCRAFT.B737);
  assert.equal(z.label, 'Door L2');
  assert.ok(z.pos > 0.9);
});
