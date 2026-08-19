// Reminders: vibration, system notifications, and a choice of alert tone.
// Tones are synthesised with the Web Audio API rather than shipped as audio
// files — no downloads, no licensing, and they work offline. Reminders fire
// for blocks starting soon while the app is open; true background alarms on
// Android need the Capacitor LocalNotifications plugin (see notes below).
import { S, savePrefs, occurrencesOn } from './state.js';
import { todayISO, minutesNow, fmtTime } from './util.js';
import { haptic, toast } from './ui.js';

// Notes are [frequency, startSeconds, options]:
//   w  wave shape (sine | square | triangle | sawtooth)
//   d  duration in seconds     g  peak gain     s  slide to this frequency
export const TONES = {
  chime:   { label: 'Chime',      notes: [[660, 0], [880, .14]] },
  ping:    { label: 'Ping',       notes: [[1320, 0]] },
  rise:    { label: 'Rise',       notes: [[440, 0], [554, .1], [659, .2]] },
  soft:    { label: 'Soft',       notes: [[392, 0], [392, .18]] },

  arcade:  { label: 'Arcade ⭐',   notes: [
    [523, 0, { w: 'square', d: .09 }], [659, .08, { w: 'square', d: .09 }],
    [784, .16, { w: 'square', d: .09 }], [1047, .24, { w: 'square', d: .22 }]] },

  coin:    { label: 'Coin 🪙',     notes: [
    [988, 0, { w: 'square', d: .07 }], [1319, .07, { w: 'square', d: .3 }]] },

  levelup: { label: 'Level up 🎉', notes: [
    [523, 0, { w: 'triangle', d: .1 }], [659, .09, { w: 'triangle', d: .1 }],
    [784, .18, { w: 'triangle', d: .1 }], [1047, .27, { w: 'triangle', d: .12 }],
    [1319, .36, { w: 'triangle', d: .35, g: .26 }]] },

  fanfare: { label: 'Fanfare 🎺',  notes: [
    [392, 0, { w: 'sawtooth', d: .14, g: .16 }], [392, .16, { w: 'sawtooth', d: .12, g: .16 }],
    [523, .3, { w: 'sawtooth', d: .18, g: .18 }], [659, .5, { w: 'sawtooth', d: .45, g: .2 }]] },

  bloop:   { label: 'Bloop 💧',    notes: [[300, 0, { w: 'sine', d: .28, s: 900, g: .3 }]] },

  wobble:  { label: 'Wobble 🛸',   notes: [
    [220, 0, { w: 'sawtooth', d: .18, s: 660 }], [660, .16, { w: 'sawtooth', d: .18, s: 220 }],
    [220, .32, { w: 'sawtooth', d: .24, s: 880 }]] },

  marimba: { label: 'Marimba 🪘',  notes: [
    [523, 0, { w: 'triangle', d: .22 }], [784, .1, { w: 'triangle', d: .22 }],
    [1047, .2, { w: 'triangle', d: .4 }]] },

  drumroll:{ label: 'Drum roll 🥁', notes: [
    [160, 0, { w: 'square', d: .05, g: .18 }], [160, .07, { w: 'square', d: .05, g: .18 }],
    [160, .14, { w: 'square', d: .05, g: .2 }], [160, .21, { w: 'square', d: .05, g: .22 }],
    [220, .3, { w: 'square', d: .35, g: .26 }]] },

  alert:   { label: 'Alert',      notes: [[880, 0], [660, .12], [880, .24]] },
  none:    { label: 'Silent',     notes: [] }
};

let ctx = null;
function audio() {
  if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
  if (ctx.state === 'suspended') ctx.resume?.();
  return ctx;
}

export function playTone(name = S.prefs.tone || 'chime') {
  const tone = TONES[name] || TONES.chime;
  if (!tone.notes.length) return;
  const ac = audio();
  if (!ac) return;
  tone.notes.forEach(([freq, at, o = {}]) => {
    const dur = o.d ?? 0.7, peak = o.g ?? 0.22;
    const osc = ac.createOscillator(), gain = ac.createGain();
    osc.connect(gain); gain.connect(ac.destination);
    osc.type = o.w || 'sine';
    const t0 = ac.currentTime + at;
    osc.frequency.setValueAtTime(freq, t0);
    if (o.s) osc.frequency.exponentialRampToValueAtTime(o.s, t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  });
}

// Little celebration cues the app plays itself — never the reminder tone,
// so a win never sounds like a nag.
export function playCue(kind = 'done') {
  const map = { done: 'coin', badge: 'levelup', level: 'fanfare', streak: 'arcade' };
  if (S.prefs.tone === 'none') return;
  playTone(map[kind] || 'coin');
}

export async function requestNotifications() {
  const cap = window.Capacitor?.Plugins?.LocalNotifications;
  if (cap) {
    try { const r = await cap.requestPermissions(); return r?.display === 'granted'; } catch { return false; }
  }
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  const res = await Notification.requestPermission();
  return res === 'granted';
}

export function notificationsAllowed() {
  const cap = window.Capacitor?.Plugins?.LocalNotifications;
  if (cap) return true;
  return 'Notification' in window && Notification.permission === 'granted';
}

export function fireNotification(title, body) {
  if (S.prefs.haptics) haptic('success');
  playTone();
  const cap = window.Capacitor?.Plugins?.LocalNotifications;
  if (cap) {
    cap.schedule({ notifications: [{ id: Date.now() % 100000, title, body, schedule: { at: new Date(Date.now() + 500) } }] }).catch(() => {});
    return;
  }
  if ('Notification' in window && Notification.permission === 'granted') {
    try { new Notification(title, { body, tag: 'cadence' }); return; } catch {}
  }
  toast(`${title} — ${body}`, 'good');
}

// Watch today's schedule and alert once, `lead` minutes before each block.
const fired = new Set();
let watching = null;

export function startReminderWatch() {
  clearInterval(watching);
  watching = setInterval(() => {
    if (!S.prefs.reminders) return;
    const lead = Number(S.prefs.remind_lead ?? 5);
    const now = minutesNow();
    occurrencesOn(todayISO()).forEach(o => {
      const key = todayISO() + ':' + o.key;
      const due = o.start - lead;
      if (fired.has(key)) return;
      if (now >= due && now < o.start + 1) {
        fired.add(key);
        fireNotification(o.title, `Starts at ${fmtTime(o.start, S.prefs.clock24)}`);
      }
    });
  }, 30000);
}

export function stopReminderWatch() { clearInterval(watching); watching = null; }

// ---------------------------------------------------------------- task shade
// A persistent "here's what's left today" notification, the way Google
// Calendar keeps your next thing visible. Device-local by design: whether
// this phone shows a shade notification is a property of the phone, not the
// account, so it lives in localStorage rather than synced prefs.
const SHADE_KEY = 'cadence.taskShade';

export const shadeEnabled = () => !S.guest && localStorage.getItem(SHADE_KEY) === '1';
export function setShade(on) {
  if (!S.guest) localStorage.setItem(SHADE_KEY, on ? '1' : '0');
  if (on) postTaskSummary(); else clearTaskSummary();
}

export function postTaskSummary(tasks = []) {
  if (!shadeEnabled()) return;
  const cap = window.Capacitor?.Plugins?.LocalNotifications;
  const top = tasks.slice(0, 5);
  const body = top.length ? top.map(t => '• ' + t.title).join('\n') : 'Nothing left today';
  if (cap) {
    cap.schedule({
      notifications: [{
        id: 9001,
        title: `${tasks.length} task${tasks.length === 1 ? '' : 's'} today`,
        body,
        ongoing: true,
        autoCancel: false,
        schedule: { at: new Date(Date.now() + 400) }
      }]
    }).catch(() => {});
    return;
  }
  if ('Notification' in window && Notification.permission === 'granted') {
    try { new Notification(`${tasks.length} tasks today`, { body, tag: 'cadence-tasks' }); } catch {}
  }
}

export function clearTaskSummary() {
  const cap = window.Capacitor?.Plugins?.LocalNotifications;
  if (cap) cap.cancel({ notifications: [{ id: 9001 }] }).catch(() => {});
}

export const isNative = () => !!window.Capacitor?.isNativePlatform?.();
