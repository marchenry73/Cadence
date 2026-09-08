// The interaction layer — everything that makes this read as an app rather
// than a page. Press feedback on pointerdown (not click), sheets that drag,
// swipe-to-complete rows, edge-back, pull-to-refresh, directional screen
// transitions, haptics, and a keyboard-safe viewport.
import { S } from './state.js';
import { t } from './i18n.js';
import { esc } from './util.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------- haptics

export function haptic(kind = 'light') {
  if (!S.prefs.haptics) return;
  const H = window.Capacitor?.Plugins?.Haptics;
  if (H) {
    if (kind === 'success') H.notification({ type: 'SUCCESS' }).catch(() => {});
    else if (kind === 'warn') H.notification({ type: 'WARNING' }).catch(() => {});
    else H.impact({ style: kind === 'heavy' ? 'HEAVY' : kind === 'medium' ? 'MEDIUM' : 'LIGHT' }).catch(() => {});
    return;
  }
  if (navigator.vibrate) navigator.vibrate(kind === 'success' ? [8, 40, 12] : kind === 'heavy' ? 18 : 8);
}

// ---------------------------------------------------------------- guest

// Call at the top of any action that needs a real account (team, the
// weekly board, support tickets, image uploads). Returns true — and tells
// the guest why — so the caller can just `if (guestBlocked()) return;`.
export function guestBlocked(message = t('guest.blocked')) {
  if (!S.guest) return false;
  toast(message, 'warn');
  return true;
}

// ---------------------------------------------------------------- actions

const actions = new Map();

export function registerActions(map) {
  for (const k in map) actions.set(k, map[k]);
}

export function runAction(name, node, ev) {
  const fn = actions.get(name);
  if (!fn) { console.warn('No action', name); return; }
  fn(node?.dataset || {}, node, ev);
}

// Set when a swipe actually engages, and read by the click delegation just
// below. Releasing a swipe would otherwise ALSO click whatever button the
// finger started on - firing the row action and opening the editor from one
// gesture. The guard that used to stand here read node.dataset.swipeOpen,
// which nothing in the codebase has ever set.
let swipeUntil = 0;

// One listener for the whole app. Buttons carry data-act (+ any data-* the
// handler needs), so re-rendering markup never leaks listeners.
export function installDelegation() {
  document.addEventListener('click', ev => {
    const node = ev.target.closest('[data-act]');
    if (!node || node.hasAttribute('disabled')) return;
    if (Date.now() < swipeUntil) return;   // the click that trails a swipe
    // Native inputs keep their own behaviour (date/time pickers, selects,
    // text carets). Calling preventDefault on those stops the picker opening.
    const tag = node.tagName;
    if (tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') ev.preventDefault();
    runAction(node.dataset.act, node, ev);
  });

  // Press state fires on pointerdown: that ~120 ms gap between touch and
  // click is most of what people mean by "it feels like a website".
  const press = ev => {
    const node = ev.target.closest('.tap, button, [data-act]');
    if (!node) return;
    node.classList.add('is-press');
    const off = () => { node.classList.remove('is-press'); };
    node.addEventListener('pointerup', off, { once: true });
    node.addEventListener('pointercancel', off, { once: true });
    node.addEventListener('pointerleave', off, { once: true });
  };
  document.addEventListener('pointerdown', press, { passive: true });

  // Long-press = context sheet, for anything that declares data-hold.
  let holdTimer = null;
  document.addEventListener('pointerdown', ev => {
    const node = ev.target.closest('[data-hold]');
    if (!node) return;
    holdTimer = setTimeout(() => { haptic('medium'); runAction(node.dataset.hold, node, ev); }, 480);
  }, { passive: true });
  const clearHold = () => { clearTimeout(holdTimer); holdTimer = null; };
  ['pointerup', 'pointercancel', 'pointermove', 'scroll'].forEach(e =>
    document.addEventListener(e, clearHold, { passive: true }));
}

// ---------------------------------------------------------------- toast

let toastTimer = null;

export function toast(msg, kind = 'info') {
  const host = $('#toast');
  if (!host) return;
  host.className = 'toast on ' + kind;
  host.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => host.classList.remove('on'), 2600);
}

// ---------------------------------------------------------------- sheets

let sheetStack = [];

export function openSheet({ title = '', body = '', footer = '', onMount, dismissable = true, full = false, layer = 1, onDismiss }) {
  const scrim = $('#scrim');
  const wrap = $(layer > 1 ? '#sheet2' : '#sheet');
  // Re-opening into a node that is already on the stack REPLACES its entry.
  // Pushing a second one for the same node would leave a phantom layer: the
  // first close would pop it without emptying the stack, so the scrim would
  // stay lit over a sheet that is no longer there.
  const below = sheetStack[sheetStack.length - 1];
  const replacing = !!below && below.wrap === wrap;
  // The layer underneath goes inert, so the tab order and a screen reader
  // cannot wander into a form that is currently buried under a dialog.
  if (below && !replacing) below.wrap.inert = true;
  wrap.inert = false;
  wrap.className = 'sheet' + (layer > 1 ? ' sheet-alt' : '') + (full ? ' sheet-full' : '');
  wrap.innerHTML = `
    <div class="sheet-grip" aria-hidden="true"></div>
    <div class="sheet-head">
      <h2>${esc(title)}</h2>
      <button class="icon-btn" data-act="sheetClose" aria-label="${esc(t('common.close'))}">✕</button>
    </div>
    <div class="sheet-body">${body}</div>
    ${footer ? `<div class="sheet-foot">${footer}</div>` : ''}`;
  scrim.classList.add('on');
  document.body.classList.add('sheet-open');
  wrap.style.transform = 'translateY(100%)';
  requestAnimationFrame(() => {
    wrap.style.transition = reduceMotion ? 'none' : 'transform .26s cubic-bezier(.2,.8,.2,1)';
    wrap.style.transform = 'translateY(0)';
  });
  const entry = { wrap, dismissable, onDismiss };
  if (replacing) sheetStack[sheetStack.length - 1] = entry;
  else sheetStack.push(entry);
  installSheetGlobals();
  installSheetDrag(wrap, dismissable);
  onMount?.(wrap);
  // Autofocus the first field, but never on touch — it yanks the keyboard up
  // before the sheet has finished moving.
  // A confirmation has no input to focus. Without the footer fallback the
  // keyboard stayed on the Delete button in the sheet underneath - which is
  // the button that opened this dialog in the first place.
  if (!matchMedia('(pointer: coarse)').matches)
    ($('input,textarea', wrap) || $('.sheet-foot .btn', wrap))?.focus();
  return closeSheet;
}

export function closeSheet() {
  // Pop first and act on what was popped. The old version read #sheet
  // unconditionally and guarded on the scrim still being on - which is true
  // whenever anything is open - so closing the second layer tore down the
  // first, and an early return left the stack counter stranded at 1 for the
  // rest of the session.
  const top = sheetStack.pop();
  if (!top) return;
  const wrap = top.wrap;
  wrap.style.transition = reduceMotion ? 'none' : 'transform .2s ease-out';
  wrap.style.transform = 'translateY(100%)';
  const wasLast = sheetStack.length === 0;
  setTimeout(() => {
    if (wasLast) {
      $('#scrim')?.classList.remove('on');
      document.body.classList.remove('sheet-open');
    }
    wrap.innerHTML = '';
    wrap.style.transition = '';
    wrap.inert = true;
  }, reduceMotion ? 0 : 190);
  // Whatever is left on the stack becomes reachable again.
  const below = sheetStack[sheetStack.length - 1];
  if (below) below.wrap.inert = false;
  // Fires for every close, including a scrim tap or Escape - which is the
  // whole point: those used to leave the awaited promise dangling forever.
  top.onDismiss?.();
}

// A sheet must always have a way out: tap the scrim, press Escape, hit ✕,
// or drag it down. "dismissable:false" now only means "don't close by
// accident" — it never means trapped.
let sheetGlobals = false;
function installSheetGlobals() {
  if (sheetGlobals) return;
  sheetGlobals = true;
  document.addEventListener('click', ev => {
    if (ev.target.id === 'scrim' && sheetStack.length) closeSheet();
  });
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && sheetStack.length) { ev.preventDefault(); closeSheet(); }
  });
}

function installSheetDrag(wrap, dismissable) {
  const grip = $('.sheet-grip', wrap);
  const head = $('.sheet-head', wrap);
  const bodyEl = $('.sheet-body', wrap);
  let startY = null, dy = 0;
  const down = e => {
    // Drag from the body only when it is already scrolled to the top,
    // otherwise the gesture belongs to the scroller.
    if (e.currentTarget === bodyEl && bodyEl.scrollTop > 2) return;
    if (e.target.closest('input,textarea,select,button')) return;
    startY = e.clientY; dy = 0;
    wrap.style.transition = 'none';
    wrap.setPointerCapture?.(e.pointerId);
  };
  const move = e => {
    if (startY == null) return;
    dy = Math.max(0, e.clientY - startY);
    wrap.style.transform = `translateY(${dy}px)`;
  };
  const up = () => {
    if (startY == null) return;
    startY = null;
    if (dy > 110) { haptic('light'); closeSheet(); }
    else {
      wrap.style.transition = 'transform .2s cubic-bezier(.2,.8,.2,1)';
      wrap.style.transform = 'translateY(0)';
    }
  };
  [grip, head, bodyEl].filter(Boolean).forEach(node => {
    node.addEventListener('pointerdown', down);
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
  });
}

export function confirmSheet({ title, message, confirm = t('common.delete'), danger = true }) {
  return new Promise(resolve => {
    let settled = false;
    const finish = v => { if (settled) return; settled = true; closeSheet(); resolve(v); };
    registerActions({
      __confirmYes: () => { haptic(danger ? 'warn' : 'light'); finish(true); },
      __confirmNo: () => finish(false)
    });
    openSheet({
      layer: 2,
      // Dismissing by scrim, Escape or drag never reached finish(), so the
      // await never settled. Resolve directly rather than calling finish:
      // finish would re-enter closeSheet and pop the editor underneath.
      onDismiss: () => { if (!settled) { settled = true; resolve(false); } },
      title,
      body: `<p class="sheet-msg">${esc(message || '')}</p>`,
      footer: `<button class="btn ghost" data-act="__confirmNo">${esc(t('common.cancel'))}</button>
               <button class="btn ${danger ? 'danger' : 'primary'}" data-act="__confirmYes">${esc(confirm)}</button>`
    });
  });
}

// ---------------------------------------------------------------- screens

// Directional transition between screens. Kept deliberately short — anything
// over ~150ms reads as lag on a phone. Any leftover screen from an
// interrupted transition is dropped first so nothing ghosts behind.
export function swapScreen(host, html, dir = 0) {
  while (host.children.length > 1) host.lastElementChild.remove();
  if (reduceMotion || !host.firstElementChild) { host.innerHTML = html; return; }
  const old = host.firstElementChild;
  const next = document.createElement('div');
  next.className = 'screen';
  next.innerHTML = html;
  const from = dir === 0 ? 0 : dir > 0 ? 14 : -14;
  host.appendChild(next);
  old.style.position = 'absolute';
  old.style.inset = '0';
  old.style.pointerEvents = 'none';
  const fade = old.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 100, easing: 'ease-out', fill: 'forwards' });
  next.animate([{ opacity: 0, transform: `translateX(${from}px)` },
                { opacity: 1, transform: 'translateX(0)' }],
               { duration: 140, easing: 'cubic-bezier(.2,.8,.2,1)' });
  fade.onfinish = () => old.remove();
  setTimeout(() => old.remove(), 200);
}

// ---------------------------------------------------------------- gestures

// Swipe a row: drag left/right past the threshold to fire its action.
export function installRowSwipes(root) {
  let node = null, startX = 0, startY = 0, dx = 0, active = false, locked = false;

  root.addEventListener('pointerdown', e => {
    const row = e.target.closest('[data-swipe]');
    // Text controls keep the exclusion - a horizontal drag inside one means
    // selecting text. Buttons do not: a swipeable row is made ENTIRELY of
    // buttons, so excluding them left nowhere for the gesture to begin.
    if (!row || e.target.closest('input,textarea,select')) return;
    node = row; startX = e.clientX; startY = e.clientY; dx = 0; active = true; locked = false;
    node.style.transition = 'none';
  }, { passive: true });

  root.addEventListener('pointermove', e => {
    if (!active || !node) return;
    const ax = e.clientX - startX, ay = e.clientY - startY;
    if (!locked) {
      if (Math.abs(ay) > Math.abs(ax) || Math.abs(ax) < 8) {
        if (Math.abs(ay) > 10) { reset(); return; }   // it's a scroll, let it scroll
        return;
      }
      locked = true;
    }
    dx = ax;
    const clamped = Math.max(-140, Math.min(140, dx));
    node.style.transform = `translateX(${clamped}px)`;
    node.classList.toggle('swipe-armed', Math.abs(dx) > 88);
  }, { passive: true });

  const end = () => {
    if (!active || !node) return;
    const fired = Math.abs(dx) > 88;
    const which = dx > 0 ? node.dataset.swipeRight : node.dataset.swipeLeft;
    const n = node;
    n.style.transition = 'transform .22s cubic-bezier(.2,.8,.2,1)';
    n.style.transform = 'translateX(0)';
    n.classList.remove('swipe-armed');
    active = false; node = null;
    // Only when the finger actually travelled: a plain tap must still reach
    // the button it landed on.
    if (locked) swipeUntil = Date.now() + 350;
    if (fired && which) { haptic('success'); runAction(which, n); }
  };
  const reset = () => {
    if (node) {
      node.style.transition = 'transform .18s ease-out';
      node.style.transform = 'translateX(0)';
      node.classList.remove('swipe-armed');
    }
    if (locked) swipeUntil = Date.now() + 350;
    active = false; node = null;
  };
  root.addEventListener('pointerup', end, { passive: true });
  root.addEventListener('pointercancel', reset, { passive: true });
}

// Swipe in from the left edge to go back, the way every native stack works.
export function installEdgeBack(onBack) {
  let tracking = false, startX = 0, startY = 0;
  document.addEventListener('pointerdown', e => {
    tracking = e.clientX < 26 && !document.body.classList.contains('sheet-open');
    startX = e.clientX; startY = e.clientY;
  }, { passive: true });
  document.addEventListener('pointerup', e => {
    if (!tracking) return;
    tracking = false;
    if (e.clientX - startX > 70 && Math.abs(e.clientY - startY) < 60) { haptic('light'); onBack(); }
  }, { passive: true });
}

// Pull down at the top of a scroller to force a sync.
export function installPullToRefresh(scroller, onRefresh) {
  const spinner = $('#ptr');
  let startY = null, pull = 0, busy = false;

  scroller.addEventListener('pointerdown', e => {
    if (scroller.scrollTop > 2 || busy) { startY = null; return; }
    startY = e.clientY; pull = 0;
  }, { passive: true });

  scroller.addEventListener('pointermove', e => {
    if (startY == null) return;
    pull = e.clientY - startY;
    if (pull <= 0) { spinner.style.transform = 'translateY(-40px)'; return; }
    const eased = Math.min(84, pull * 0.55);
    spinner.style.transform = `translateY(${eased - 40}px) rotate(${eased * 4}deg)`;
    spinner.classList.toggle('armed', eased > 52);
  }, { passive: true });

  const release = async () => {
    if (startY == null) return;
    const eased = Math.min(84, pull * 0.55);
    startY = null;
    spinner.classList.remove('armed');
    if (eased > 52) {
      busy = true;
      spinner.classList.add('spin');
      spinner.style.transform = 'translateY(14px)';
      haptic('light');
      try { await onRefresh(); } finally {
        busy = false;
        spinner.classList.remove('spin');
        spinner.style.transform = 'translateY(-40px)';
      }
    } else {
      spinner.style.transform = 'translateY(-40px)';
    }
  };
  scroller.addEventListener('pointerup', release, { passive: true });
  scroller.addEventListener('pointercancel', release, { passive: true });
}

// Keep inputs above the on-screen keyboard.
export function installKeyboardInset() {
  const vv = window.visualViewport;
  if (!vv) return;
  const apply = () => {
    const inset = Math.max(0, innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty('--kb', inset + 'px');
    document.body.classList.toggle('kb-open', inset > 90);
  };
  vv.addEventListener('resize', apply);
  vv.addEventListener('scroll', apply);
  apply();
}

// ---------------------------------------------------------------- form bits

export const field = (label, control, hint = '') =>
  `<label class="field"><span class="field-label">${esc(label)}</span>${control}
   ${hint ? `<span class="field-hint">${esc(hint)}</span>` : ''}</label>`;

export const textInput = (name, value = '', extra = '') =>
  `<input class="input" name="${name}" value="${esc(value)}" ${extra}>`;

export const textArea = (name, value = '', rows = 3) =>
  `<textarea class="input" name="${name}" rows="${rows}">${esc(value)}</textarea>`;

export const segmented = (name, options, value) =>
  `<div class="segmented" data-seg="${name}">${options.map(o =>
    `<button type="button" class="seg-item${o.value === value ? ' on' : ''}"
      data-act="segPick" data-seg="${name}" data-value="${esc(o.value)}">${esc(o.label)}</button>`).join('')}</div>`;

export const stepper = (name, value, { min = 0, max = 100, step = 1, unit = '' } = {}) =>
  `<div class="stepper">
     <button type="button" class="icon-btn" data-act="stepDown" data-name="${name}" data-step="${step}" data-min="${min}">−</button>
     <output data-out="${name}">${value}${esc(unit)}</output>
     <input type="hidden" name="${name}" value="${value}" data-min="${min}" data-max="${max}">
     <button type="button" class="icon-btn" data-act="stepUp" data-name="${name}" data-step="${step}" data-max="${max}">+</button>
   </div>`;

// Read a sheet's inputs as a plain object.
export function readForm(root = $('#sheet')) {
  const out = {};
  $$('input,textarea,select', root).forEach(node => {
    if (!node.name) return;
    out[node.name] = node.type === 'checkbox' ? node.checked : node.value;
  });
  return out;
}
