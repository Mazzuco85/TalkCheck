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
  mic: $('#btn-mic'),
  autoAdd: $('#auto-add'),
};

// Time without new text before a dictated finding is added automatically.
const AUTO_ADD_DELAY_MS = 2000;

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
        <button class="delete" aria-label="Delete item">✕</button>
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

let autoAddTimer;

function submitInput() {
  clearTimeout(autoAddTimer);
  addFinding(els.input.value);
  els.input.value = '';
  els.input.focus();
}

els.form.addEventListener('submit', (e) => {
  e.preventDefault();
  submitInput();
});

// Auto-add: keyboard dictation has no "finished" event, so we wait for a pause
// in text changes. Each new word restarts the countdown.
els.input.addEventListener('input', () => {
  clearTimeout(autoAddTimer);
  if (!els.autoAdd.checked || !els.input.value.trim()) return;
  autoAddTimer = setTimeout(submitInput, AUTO_ADD_DELAY_MS);
});

// --- In-app mic (Web Speech API) -------------------------------------------
// One tap: listen → add automatically when speech ends.
// Browser speech recognition may need a network connection; keyboard
// dictation remains the offline fallback.

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (!Recognition) {
  els.mic.hidden = true;
} else {
  // iOS Safari does not always fire `onend` after a result, which used to leave
  // the app thinking it was still listening (the next tap did nothing).
  // So every session is fully torn down by us, and every tap starts clean.
  const MAX_LISTEN_MS = 15000; // safety net if Safari never ends the session
  let rec = null;
  let watchdog;

  function teardown() {
    clearTimeout(watchdog);
    if (rec) {
      rec.onresult = rec.onerror = rec.onend = null;
      try { rec.abort(); } catch { /* already stopped */ }
    }
    rec = null;
    els.mic.classList.remove('listening');
    els.mic.setAttribute('aria-pressed', 'false');
  }

  // Adds whatever was heard (once) and resets the mic.
  function finish() {
    const text = els.input.value.trim();
    teardown();
    if (text) {
      addFinding(text);
      els.input.value = '';
    }
  }

  function startListening() {
    teardown(); // always discard any previous session first

    const session = new Recognition();
    session.lang = 'pt-BR';
    session.interimResults = true;
    session.continuous = false; // stops by itself after a pause

    session.onresult = (e) => {
      els.input.value = Array.from(e.results).map((r) => r[0].transcript).join(' ');
      if (e.results[e.results.length - 1].isFinal) finish();
    };
    session.onerror = (e) => {
      if (e.error === 'network') toast('Mic needs internet — use the keyboard mic');
      else if (e.error === 'not-allowed') toast('Microphone permission denied');
      else if (e.error !== 'no-speech' && e.error !== 'aborted') toast(`Mic error: ${e.error}`);
      teardown();
    };
    // Some browsers end without a final result: keep what was heard.
    session.onend = finish;

    rec = session;
    els.mic.classList.add('listening');
    els.mic.setAttribute('aria-pressed', 'true');
    watchdog = setTimeout(finish, MAX_LISTEN_MS);
    try {
      session.start();
    } catch {
      teardown();
      toast('Mic busy — tap again');
    }
  }

  // Tap while idle → start. Tap while listening → stop and keep what was heard.
  els.mic.addEventListener('click', () => (rec ? finish() : startListening()));
}

els.list.addEventListener('click', (e) => {
  const btn = e.target.closest('.check, .delete');
  if (!btn) return;
  const id = Number(btn.closest('.item').dataset.id);
  const it = state.items.find((i) => i.id === id);

  if (btn.classList.contains('check')) {
    it.done = !it.done;
  } else {
    if (!confirm(`Delete #${id}?\n"${it.text}"`)) return;
    state.items = state.items.filter((i) => i.id !== id);
    // Deleting the most recent item (a wrong dictation) frees its number,
    // so the next finding reuses it and numbering stays continuous.
    if (id === state.nextId - 1) state.nextId = id;
  }
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
