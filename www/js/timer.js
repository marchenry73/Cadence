// Focus timer. Device-local by design: a timer running on your phone should
// not start ticking on your laptop. Survives reload, backgrounding and app
// restarts by storing the target time rather than a countdown.
import { logActivity, S } from './state.js';
import { t } from './i18n.js';
import { haptic, toast } from './ui.js';

const KEY = 'cadence.timer';

let timer = load();
let ticking = null;
const listeners = new Set();

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && typeof raw === 'object') return { label: '', minutes: 25, endsAt: null, remaining: 25 * 60, ...raw };
  } catch {}
  return { label: '', minutes: 25, endsAt: null, remaining: 25 * 60 };
}

function persist() {
  if (S.guest) return;
  try { localStorage.setItem(KEY, JSON.stringify(timer)); } catch {}
}

export function onTimer(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const emit = () => listeners.forEach(fn => { try { fn(snapshot()); } catch {} });

export function snapshot() {
  const running = !!timer.endsAt;
  const remaining = running
    ? Math.max(0, Math.round((timer.endsAt - Date.now()) / 1000))
    : timer.remaining;
  return { running, remaining, minutes: timer.minutes, label: timer.label };
}

export function timerChip() {
  const s = snapshot();
  const m = Math.floor(s.remaining / 60), sec = s.remaining % 60;
  return `${s.running ? '▮▮' : '▶'} ${m}:${String(sec).padStart(2, '0')}`;
}

export function startTimer(minutes = timer.minutes, label = '') {
  timer.minutes = minutes;
  timer.label = label || timer.label;
  timer.endsAt = Date.now() + (timer.remaining && timer.remaining < minutes * 60 ? timer.remaining : minutes * 60) * 1000;
  persist(); tick(); haptic('medium'); emit();
}

export function pauseTimer() {
  const s = snapshot();
  timer.remaining = s.remaining;
  timer.endsAt = null;
  persist(); stop(); emit();
}

export function resetTimer(minutes = timer.minutes) {
  timer.minutes = minutes;
  timer.remaining = minutes * 60;
  timer.endsAt = null;
  persist(); stop(); emit();
}

function stop() { clearInterval(ticking); ticking = null; }

function tick() {
  stop();
  ticking = setInterval(() => {
    const s = snapshot();
    if (!s.running) { stop(); return; }
    if (s.remaining <= 0) {
      timer.endsAt = null;
      timer.remaining = timer.minutes * 60;
      persist(); stop();
      finished();
    }
    emit();
  }, 1000);
}

function finished() {
  haptic('success');
  chime();
  toast(t('timer.finished'), 'good');
  logActivity('focus', timer.label || t('timer.focus'), timer.minutes);
  if (S.prefs.reminders && 'Notification' in window && Notification.permission === 'granted') {
    new Notification('Cadence', { body: t('timer.finished') });
  }
}

function chime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine'; osc.frequency.value = 660;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.1);
    osc.start(); osc.stop(ctx.currentTime + 1.15);
    setTimeout(() => ctx.close?.(), 1400);
  } catch {}
}

// Resume ticking after a reload if it was running.
if (snapshot().running) tick();
