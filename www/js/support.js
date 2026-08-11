// Support, feedback and bug reports: one entry point, three intents.
// A bug report silently attaches what the user cannot describe — app version,
// device, OS, screen, and the last errors the app actually threw.
import { CONFIG } from './config.js';
import { sb } from './net.js';
import { S } from './state.js';
import { outboxCount } from './net.js';

const errorLog = [];

export function installErrorCapture() {
  const push = entry => { errorLog.unshift({ at: new Date().toISOString(), ...entry }); errorLog.length = Math.min(errorLog.length, 12); };
  window.addEventListener('error', e => push({
    kind: 'error', message: String(e.message || ''),
    where: `${e.filename || ''}:${e.lineno || 0}`
  }));
  window.addEventListener('unhandledrejection', e => push({
    kind: 'promise', message: String(e.reason?.message || e.reason || '')
  }));
  const realError = console.error.bind(console);
  console.error = (...args) => {
    push({ kind: 'console', message: args.map(a => String(a?.message || a)).slice(0, 3).join(' ') });
    realError(...args);
  };
}

export function recentErrors() { return errorLog.slice(); }

export async function diagnostics() {
  const cap = window.Capacitor;
  const nav = navigator;
  return {
    app_version: CONFIG.version,
    build: CONFIG.build,
    platform: cap?.getPlatform?.() || 'web',
    native: !!cap?.isNativePlatform?.(),
    user_agent: navigator.userAgent,
    language: S.prefs.lang,
    ui_language: nav.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
    username: S.profile?.username || null,
    full_name: S.profile?.full_name || null,
    customer_no: S.profile?.customer_no || null,
    signed_in_with: S.user?.app_metadata?.provider || 'password',
    account_created: S.user?.created_at || null,
    screen: `${screen.width}x${screen.height}@${devicePixelRatio}`,
    viewport: `${innerWidth}x${innerHeight}`,
    online: nav.onLine,
    connection: nav.connection?.effectiveType || null,
    installed_pwa: matchMedia('(display-mode: standalone)').matches,
    url: location.href,
    queued_writes: await outboxCount(),
    route: S.route,
    counts: {
      events: S.events.length, tasks: S.tasks.length,
      routines: S.routines.length, goals: S.goals.length
    },
    recent_errors: recentErrors()
  };
}

export async function submitTicket({ kind, subject, body }) {
  const row = {
    user_id: S.user.id,
    email: S.user.email || null,
    kind,
    subject: subject.trim(),
    body: body.trim(),
    // Every ticket carries the full picture now — knowing who is asking and
    // what they are running matters as much for an idea as for a crash.
    diagnostics: await diagnostics()
  };
  const { error } = await sb.from('support_tickets').insert(row);
  if (error) throw error;
}

let adminCache = null;

// Am I the owner of this app? Answered by the database, not by the client.
export async function isAdmin() {
  if (adminCache !== null) return adminCache;
  const { data, error } = await sb.rpc('is_admin');
  adminCache = !error && !!data;
  return adminCache;
}

// Every ticket from every user — returns [] for anyone who is not an admin,
// because row-level security filters it server-side.
export async function allTickets() {
  const { data, error } = await sb.from('support_tickets')
    .select('*')
    .order('created_at', { ascending: false }).limit(200);
  if (error) return [];
  return data || [];
}

export async function setTicketStatus(id, status) {
  const { error } = await sb.from('support_tickets').update({ status }).eq('id', id);
  if (error) throw error;
}

export async function myTickets() {
  const { data, error } = await sb.from('support_tickets')
    .select('id, kind, subject, status, created_at')
    .order('created_at', { ascending: false }).limit(20);
  if (error) return [];
  return data || [];
}
