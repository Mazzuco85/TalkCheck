// TalkCheck — UI logic.
// Findings live only in memory: nothing is saved or sent anywhere.

import { parseFinding, PRIORITY } from './parser.js';
import { AIRCRAFT, DEFAULT_AIRCRAFT } from './aircraft.js';

const state = {
  aircraft: DEFAULT_AIRCRAFT,
  items: [],
  nextId: 1,
  filter: 'all', // all | open
};

const $ = (sel) => document.querySelector(sel);
const els = {
  form: $('#entry-form'),
  input: $('#entry-input'),
  aircraft: $('#aircraft'),
  list: $('#list'),
  map: $('#map-dots'),
  counts: $('#counts'),
  filter: $('#filter-open'),
  copy: $('#btn-copy'),
  reset: $('#btn-reset'),
  toast: $('#toast'),
};

const PRIORITY_ORDER = { [PRIORITY.CRITICAL]: 0, [PRIORITY.NORMAL]: 1, [PRIORITY.COSMETIC]: 2 };
const PRIORITY_LABEL = { critical: 'CRIT', normal: 'NORM', cosmetic: 'COSM' };

const time = (d) => d.toTimeString().slice(0, 5);

function addFinding(text) {
  const clean = text.trim();
  if (!clean) return;
  state.items.push({
    id: state.nextId++,
    text: clean,
    time: new Date(),
    done: false,
    ...parseFinding(clean, state.aircraft),
  });
  render();
}

function reparseAll() {
  state.items = state.items.map((it) => ({ ...it, ...parseFinding(it.text, state.aircraft) }));
}

/** Return order: critical first, then front-to-back by cabin position, then by number. */
export function returnOrder(items) {
  return [...items].sort((a, b) => {
    const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (p) return p;
    const pa = a.zone?.pos ?? 2;
    const pb = b.zone?.pos ?? 2;
    return pa - pb || a.id - b.id;
  });
}

function itemLine(it) {
  const zone = it.zone ? it.zone.label : '—';
  const ata = it.ata ? `ATA ${it.ata.chapter}` : 'ATA ?';
  return `#${it.id} ${time(it.time)} [${it.done ? 'X' : ' '}] ${PRIORITY_LABEL[it.priority]} | ${zone} | ${ata} | ${it.text}`;
}

function exportText() {
  const ac = AIRCRAFT[state.aircraft].name;
  const open = state.items.filter((i) => !i.done).length;
  const header = `TalkCheck — ${ac} — ${new Date().toLocaleString()}\nItems: ${state.items.length} | Open: ${open}\n`;
  return header + '\n' + returnOrder(state.items).map(itemLine).join('\n');
}

function toast(msg) {
  els.toast.textContent = msg;
  els.toast.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (els.toast.hidden = true), 1800);
}

function render() {
  const visible = returnOrder(state.items).filter((i) => state.filter === 'all' || !i.done);

  els.list.replaceChildren(
    ...visible.map((it) => {
      const li = document.createElement('li');
      li.className = `item ${it.priority}${it.done ? ' done' : ''}`;
      li.dataset.id = it.id;
      li.innerHTML = `
        <button class="check" aria-label="Toggle resolved">${it.done ? '✓' : ''}</button>
        <div class="body">
          <div class="meta">
            <span class="num">#${it.id}</span>
            <span>${time(it.time)}</span>
            <span class="badge">${PRIORITY_LABEL[it.priority]}</span>
            <span>${it.zone ? it.zone.label : '—'}</span>
            <span>${it.ata ? `ATA ${it.ata.chapter} · ${it.ata.title}` : 'ATA ?'}</span>
          </div>
          <div class="text" contenteditable="true" spellcheck="false"></div>
        </div>`;
      li.querySelector('.text').textContent = it.text;
      return li;
    }),
  );

  // Cabin map: one dot per finding with a known position.
  els.map.replaceChildren(
    ...state.items
      .filter((it) => it.zone?.pos != null)
      .map((it) => {
        const dot = document.createElement('span');
        dot.className = `dot ${it.priority}${it.done ? ' done' : ''}`;
        dot.style.left = `${it.zone.pos * 100}%`;
        dot.style.top = it.zone.side === 'L' ? '28%' : it.zone.side === 'R' ? '72%' : '50%';
        dot.title = `#${it.id} ${it.text}`;
        dot.textContent = it.id;
        return dot;
      }),
  );

  const open = state.items.filter((i) => !i.done).length;
  const crit = state.items.filter((i) => !i.done && i.priority === PRIORITY.CRITICAL).length;
  els.counts.textContent = `${state.items.length} items · ${open} open · ${crit} critical`;
}

// --- Events ---------------------------------------------------------------

els.form.addEventListener('submit', (e) => {
  e.preventDefault();
  addFinding(els.input.value);
  els.input.value = '';
  els.input.focus();
});

els.list.addEventListener('click', (e) => {
  const btn = e.target.closest('.check');
  if (!btn) return;
  const it = state.items.find((i) => i.id === Number(btn.closest('.item').dataset.id));
  it.done = !it.done;
  render();
});

// Editing the text re-runs the parser (fixes dictation mistakes).
els.list.addEventListener('focusout', (e) => {
  if (!e.target.classList.contains('text')) return;
  const it = state.items.find((i) => i.id === Number(e.target.closest('.item').dataset.id));
  const text = e.target.textContent.trim();
  if (it && text && text !== it.text) {
    Object.assign(it, { text }, parseFinding(text, state.aircraft));
    render();
  }
});

els.aircraft.addEventListener('change', () => {
  state.aircraft = els.aircraft.value;
  reparseAll();
  render();
});

els.filter.addEventListener('change', () => {
  state.filter = els.filter.checked ? 'open' : 'all';
  render();
});

els.copy.addEventListener('click', async () => {
  if (!state.items.length) return toast('Nothing to copy');
  try {
    await navigator.clipboard.writeText(exportText());
    toast('Copied');
  } catch {
    toast('Copy failed');
  }
});

els.reset.addEventListener('click', () => {
  if (state.items.length && !confirm('Start a new check? The current list will be cleared.')) return;
  state.items = [];
  state.nextId = 1;
  render();
  els.input.focus();
});

// Warn before leaving with open items (data is not saved anywhere).
window.addEventListener('beforeunload', (e) => {
  if (state.items.length) e.preventDefault();
});

// Populate aircraft selector.
els.aircraft.replaceChildren(
  ...Object.entries(AIRCRAFT).map(([key, ac]) => new Option(ac.name, key, false, key === state.aircraft)),
);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

render();
