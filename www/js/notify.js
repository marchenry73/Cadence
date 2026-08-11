// Reminders: vibration, system notifications, and a choice of alert tone.
// Tones are synthesised with the Web Audio API rather than shipped as audio
// files — no downloads, no licensing, and they work offline. Reminders fire
// for blocks starting soon while the app is open; true background alarms on
// Android need the Capacitor LocalNotifications plugin (see notes below).
import { S, savePrefs, occurrencesOn } from './state.js';
import { todayISO, minutesNow, fmtTime } from './util.js';
import { haptic, toast } from './ui.js';

export const TONES = {
  chime:  { label: 'Chime',  notes: [[660, 0], [880, .14]] },
  ping:   { label: 'Ping',   notes: [[1320, 0]] },
  rise:   { label: 'Rise',   notes: [[440, 0], [554, .1], [659, .2]] },
  soft:   { label: 'Soft',   notes: [[392, 0], [392, .18]] },
  alert:  { label: 'Alert',  notes: [[880, 0], [660, .12], [880, .24]] },
  none:   { label: 'Silent', notes: [] }
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
  tone.notes.forEach(([freq, at]) => {
    const osc = ac.createOscillator(), gain = ac.createGain();
    osc.connect(gain); gain.connect(ac.destination);
    osc.type = 'sine';
    osc.frequency.value = freq;
    const t0 = ac.currentTime + at;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.22, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.7);
    osc.start(t0); osc.stop(t0 + 0.75);
  });
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

export const shadeEnabled = () => localStorage.getItem(SHADE_KEY) === '1';
export function setShade(on) {
  localStorage.setItem(SHADE_KEY, on ? '1' : '0');
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
