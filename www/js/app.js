// App shell: boot sequence, auth screen, router, tab bar, global wiring.
// Everything else (views, sheets) is imported for its side effects
// (registerActions) and default-exported render/lifecycle object.
import { CONFIG } from './config.js';
import { initNet, sb, onSyncState, outboxCount } from './net.js';
import { S, onChange, loadFromCache, syncNow, startRealtime, notify, savePrefs } from './state.js';
import { setLang, currentLang, t } from './i18n.js';
import { currentSession, onAuthChange, signIn, signUp, resetPassword, usernameAvailable, ensureProfile, signInWithProvider } from './auth.js';
import { loadWorkspace } from './org.js';
import { installDelegation, installEdgeBack, installPullToRefresh, installKeyboardInset, swapScreen, toast, haptic, registerActions, readForm, $ , closeSheet} from './ui.js';
import { installErrorCapture } from './support.js';
import { logActivity } from './state.js';
import { streakNow } from './gamify.js';
import { maybeShowOnboarding } from './onboarding.js';
import { startReminderWatch } from './notify.js';
import { resetTimer } from './timer.js';
import { hydrateImages } from './images.js';
import { syncGoogleCalendar, googleSyncBlockedReason, resetGoogleSyncBlock } from './google.js';
import { requestGoogleCalendarAccess, captureGoogleRefreshToken } from './auth.js';
import { openQuickAdd } from './sheets.js';
import { debounce, esc } from './util.js';

import viewToday from './view.today.js';
import viewCalendar from './view.calendar.js';
import viewTasks from './view.tasks.js';
import viewGoals from './view.goals.js';
import viewReview from './view.review.js';
import viewTeam from './view.team.js';
import viewSettings from './view.settings.js';

installErrorCapture();

const VIEWS = { today: viewToday, calendar: viewCalendar, tasks: viewTasks, goals: viewGoals, review: viewReview, team: viewTeam, settings: viewSettings };
const NAV = [
  ['today', t('nav.today'), icon('sun')],
  ['calendar', t('nav.calendar'), icon('cal')],
  ['tasks', t('nav.tasks'), icon('check')],
  ['goals', t('nav.goals'), icon('flag')],
  ['review', 'Review', icon('chart')],
  ['settings', t('nav.settings'), icon('gear')]
];

function icon(name) {
  const paths = {
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/>',
    check: '<path d="M4 12l5 5L20 6"/>',
    flag: '<path d="M5 3v18M5 4h11l-3 4 3 4H5"/>',
    team: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15 14c2.8 0 5 2 5 5"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.2-1.6l2-1.6-2-3.4-2.4.7a7 7 0 0 0-2.8-1.6L13 2h-4l-.6 2.5a7 7 0 0 0-2.8 1.6l-2.4-.7-2 3.4 2 1.6A7 7 0 0 0 3 12c0 .5 0 1.1.2 1.6l-2 1.6 2 3.4 2.4-.7a7 7 0 0 0 2.8 1.6L9 22h4l.6-2.5a7 7 0 0 0 2.8-1.6l2.4.7 2-3.4-2-1.6c.1-.5.2-1 .2-1.6Z"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
}

// ------------------------------------------------------------------ boot

async function boot() {
  await setLang(navigator.language?.slice(0, 2) || 'en');
  initNet();
  installDelegation();
  installKeyboardInset();

  const session = await currentSession();
  if (!session) return renderAuth();

  S.user = session.user;
  await afterSignIn();
}

async function afterSignIn() {
  await loadFromCache();
  await setLang(S.prefs.lang || currentLang());
  applyTheme();
  renderShell();
  renderRoute(0);

  try {
    await ensureProfile();
    await syncNow({ full: true });
    await loadWorkspace().catch(() => {});
    startRealtime();
  } catch (e) {
    console.warn('Initial sync failed, running offline', e);
    toast(t('app.offline'), 'warn');
  }
  renderRoute(0);

  onAuthChange((event, session) => {
    if (event === 'SIGNED_OUT') { location.reload(); return; }
    // SIGNED_IN is the only moment provider_refresh_token exists — Supabase
    // never persists it, so missing this event means never getting another
    // chance without a fresh consent.
    if (event === 'SIGNED_IN' && session) {
      captureGoogleRefreshToken(session)
        .then(r => { if (r?.ok) { resetGoogleSyncBlock(); syncGoogleCalendar({ force: true }).then(renderGoogleBanner).catch(() => {}); } })
        .catch(() => {});
    }
  });
  onSyncState(updateSyncPill);
  setInterval(() => { if (navigator.onLine) syncNow().catch(() => {}); }, 45000);
  window.addEventListener('online', () => syncNow().catch(() => {}));

  // Google Calendar keeps itself current in the background: once on
  // launch, then on its own schedule and whenever the device reconnects.
  // syncGoogleCalendar() no-ops safely when the user is not signed in with
  // Google, so this costs nothing for password accounts.
  // Google issues the refresh token only on the first consent, so grab it
  // whenever a session has one before the value is gone for good.
  captureGoogleRefreshToken().catch(() => {});
  syncGoogleCalendar({ force: true }).then(renderGoogleBanner).catch(() => {});
  setInterval(() => { syncGoogleCalendar().then(renderGoogleBanner).catch(() => {}); }, 5 * 60 * 1000);
  window.addEventListener('online', () => syncGoogleCalendar().then(renderGoogleBanner).catch(() => {}));
  installEdgeBack(() => { if (S.route !== 'today') go('today'); });
  startReminderWatch();
  awardDailyLogin();
  setTimeout(() => maybeShowOnboarding(), 600);
}

// Never touches Supabase or IndexedDB — no initNet(), no loadFromCache(),
// no ensureProfile/syncNow/loadWorkspace/startRealtime. The synthetic user
// id just gives save()'s row.user_id something consistent to filter on in
// memory; state.js's guest guard is what actually stops anything from
// being written anywhere.
function guestBoot() {
  S.guest = true;
  S.user = { id: 'guest', email: null };
  S.profile = { user_id: 'guest', username: 'guest', full_name: null };
  // timer.js reads localStorage at module-init time, before this function
  // ever runs — a leftover timer from a real session on this same device
  // would otherwise bleed into a "blank slate" guest session.
  resetTimer(25);
  applyTheme();
  renderShell();
  renderRoute(0);
  installEdgeBack(() => { if (S.route !== 'today') go('today'); });
  startReminderWatch();
  awardDailyLogin();
  setTimeout(() => toast(t('guest.bannerBody'), 'warn'), 500);
  setTimeout(() => maybeShowOnboarding(), 2200);
}

// ------------------------------------------------------------------ auth screen

function renderAuth() {
  document.getElementById('app').innerHTML = `<div class="screen-scroll"><div class="auth-wrap" id="authWrap"></div></div>
    <div id="scrim"></div><div class="sheet" id="sheet"></div><div class="toast" id="toast"></div>`;
  paintAuth('signin');
}

function paintAuth(mode, error = '') {
  const host = document.getElementById('authWrap');
  const signup = mode === 'signup';
  const forgot = mode === 'forgot';
  host.innerHTML = `
    <div class="auth-logo">Cadence</div>
    <div class="auth-tag">${t('auth.tagline')}</div>
    ${error ? `<div class="auth-error">${error}</div>` : ''}
    <form id="authForm">
      ${signup ? `<div class="field"><input class="input" name="name" placeholder="${t('auth.name')}" autocomplete="name"></div>
        <div class="field"><input class="input" name="username" placeholder="${t('auth.username')}" autocomplete="off" autocapitalize="none"></div>` : ''}
      <div class="field"><input class="input" name="email" type="${signup ? 'email' : 'text'}" placeholder="${signup ? t('auth.emailOnly') : t('auth.email')}" autocomplete="email"></div>
      ${!forgot ? `<div class="field"><input class="input" name="password" type="password" placeholder="${t('auth.password')}" autocomplete="${signup ? 'new-password' : 'current-password'}"></div>` : ''}
      <button class="btn primary" type="submit" style="width:100%">${forgot ? t('auth.reset') : signup ? t('auth.signUp') : t('auth.signIn')}</button>
    </form>
    ${!forgot ? `<div class="auth-or"><span>or</span></div>
      <button type="button" class="btn google" id="authGoogle">
        <svg viewBox="0 0 18 18" width="17" height="17" aria-hidden="true"><path fill="#4285F4" d="M17.6 9.2c0-.6 0-1.2-.2-1.7H9v3.4h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.7-3.9 2.7-6.6z"/><path fill="#34A853" d="M9 18c2.4 0 4.5-.8 6-2.2l-2.9-2.2c-.8.5-1.8.9-3.1.9-2.4 0-4.4-1.6-5.1-3.8H.9v2.3A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.9 10.7a5.4 5.4 0 0 1 0-3.4V5H.9a9 9 0 0 0 0 8l3-2.3z"/><path fill="#EA4335" d="M9 3.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 0 0 .9 5l3 2.3C4.6 5.2 6.6 3.6 9 3.6z"/></svg>
        Continue with Google
      </button>
      <div class="auth-switch"><a href="#" id="authForgot">${t('auth.forgot')}</a></div>` : ''}
    <div class="auth-switch"><a href="#" id="authFlip">${signup ? t('auth.haveAccount') : t('auth.noAccount')}</a></div>
    ${!forgot ? `<div class="auth-switch"><a href="#" id="authGuest">${t('auth.continueGuest')}</a></div>` : ''}`;

  $('#authFlip', host).onclick = e => { e.preventDefault(); paintAuth(signup ? 'signin' : 'signup'); };
  $('#authForgot', host)?.addEventListener('click', e => { e.preventDefault(); paintAuth('forgot'); });
  $('#authGuest', host)?.addEventListener('click', e => { e.preventDefault(); guestBoot(); });
  $('#authGoogle', host)?.addEventListener('click', async () => {
    try { await signInWithProvider('google'); }
    catch (err) { paintAuth(mode, err.message || t('msg.somethingWrong')); }
  });
  $('#authForm', host).addEventListener('submit', async e => {
    e.preventDefault();
    const f = readForm(host);
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    try {
      if (forgot) { await resetPassword(f.email); toast('Check your email', 'good'); paintAuth('signin'); return; }
      if (signup) {
        await signUp({ email: f.email, password: f.password, username: f.username, name: f.name });
        toast('Check your email to confirm, then sign in', 'good');
        paintAuth('signin');
        return;
      }
      const user = await signIn(f.email, f.password);
      S.user = user;
      await afterSignIn();
    } catch (err) {
      paintAuth(mode, err.message || t('msg.somethingWrong'));
    } finally { btn.disabled = false; }
  });
}

// ------------------------------------------------------------------ shell + router

function renderShell() {
  document.getElementById('app').innerHTML = `
    <div class="app-shell">
      <nav class="sidebar" id="sidebar">
        <div class="sidebar-logo">Cad<b>ence</b></div>
        ${NAV.map(([id, label, svg]) => `<button class="side-link tap${S.route === id ? ' on' : ''}" data-act="goTab" data-route="${id}">${svg}<span>${label}</span></button>`).join('')}
        <div class="sidebar-spacer"></div>
        <button class="sidebar-add tap" data-act="quickAdd">＋ ${t('common.add')}</button>
      </nav>
      <div class="main-col">
        <div class="topbar">
          <h1 id="routeTitle"></h1>
          <span class="sync-pill${S.guest ? ' guest' : ''}" id="syncPill"><i class="dot"></i><span id="syncLabel">${S.guest ? t('app.guest') : t('app.synced')}</span></span>
        </div>
        <div id="gsyncBanner"></div>
        <div class="screen-scroll" id="scroller"><div class="screen" id="routeHost"></div></div>
      </div>
    </div>
    <button class="fab tap" data-act="quickAdd" aria-label="${t('common.add')}">＋</button>
    <div class="tabbar" id="tabbar">
      ${NAV.map(([id, label, svg]) => `<button class="tab tap${S.route === id ? ' on' : ''}" data-act="goTab" data-route="${id}">${svg}<span>${label}</span></button>`).join('')}
    </div>
    <div id="ptr"></div>
    <div id="scrim"></div><div class="sheet" id="sheet"></div><div class="toast" id="toast"></div>`;

  installPullToRefresh($('#scroller'), () => S.guest ? Promise.resolve() : syncNow().catch(() => {}));

  onChange(debounce(reason => {
    if (reason === 'prefs') applyTheme();
    renderRoute(0, true);
  }, 40));
}

let currentView = null;

function renderRoute(dir = 0, sameRoute = false) {
  const view = VIEWS[S.route];
  if (!view) return;
  const host = $('#routeHost');
  if (!sameRoute) currentView?.onUnmount?.();
  const html = view.render();
  if (sameRoute) host.innerHTML = html;
  else swapScreen(host, html, dir);
  currentView = view;
  $('#routeTitle').textContent = NAV.find(n => n[0] === S.route)?.[1] || '';
  $$tabsSync();
  hydrateImages(host);
  view.onMount?.(host);
}

function $$tabsSync() {
  document.querySelectorAll('.tab, .side-link').forEach(b => b.classList.toggle('on', b.dataset.route === S.route));
}

function go(route) {
  if (route === S.route) return;
  const dir = NAV.findIndex(n => n[0] === route) > NAV.findIndex(n => n[0] === S.route) ? 1 : -1;
  S.route = route;
  renderRoute(dir);
}

function applyTheme() {
  // 'system' leaves [data-theme] unset so the CSS prefers-color-scheme
  // query decides; 'light'/'dark' pin it regardless of the OS setting.
  if (S.prefs.theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = S.prefs.theme;
  document.documentElement.style.setProperty('--accent', S.prefs.accent);
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#F6EEE4';
}

// Live-follow the OS theme while S.prefs.theme is 'system'.
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (S.prefs.theme === 'system') applyTheme();
});


// ---------------------------------------------------------- sync banner
//
// Google access expires after about an hour and Supabase does not refresh
// it, so sync quietly stops. Quietly is the problem: changes still save
// locally and flush on reconnect, but with no signal people reasonably
// assume it is broken. This makes the pause visible and one tap to fix.
function renderGoogleBanner() {
  const host = $('#gsyncBanner');
  if (!host) return;
  const why = googleSyncBlockedReason();
  if (!why) { host.innerHTML = ''; return; }

  const body = why === 'expired' ? t('gsync.pausedWhy')
    : why === 'needs-calendar-consent' ? t('gsync.needsConsent')
    : t('gsync.apiDisabled');
  // Only expiry and missing consent are fixable by tapping; a disabled API
  // has to be turned on in Google Cloud, so offering a button would lie.
  const canReconnect = why === 'expired' || why === 'needs-calendar-consent';

  host.innerHTML = `<div class="gsync-banner">
    <div class="gsync-main">
      <div class="gsync-title">${esc(t('gsync.paused'))}</div>
      <div class="gsync-body">${esc(body)}</div>
    </div>
    ${canReconnect ? `<button class="btn primary sm" data-act="reconnectGoogle">${esc(t('gsync.reconnect'))}</button>` : ''}
  </div>`;
}

function updateSyncPill({ state, pending }) {
  const pill = $('#syncPill'), label = $('#syncLabel');
  if (!pill) return;
  pill.className = 'sync-pill ' + (state === 'offline' ? 'offline' : state === 'syncing' ? 'syncing' : state === 'synced' ? 'synced' : '');
  label.textContent = state === 'offline' ? t('app.offline')
    : state === 'syncing' ? t('app.syncing')
    : state === 'pending' ? t('app.pending', { n: pending })
    : t('app.synced');
}

// Showing up counts, but only once a day and only two points — the score
// has to stay something you earn by doing, not by opening the app.
function awardDailyLogin() {
  const today = new Date().toISOString().slice(0, 10);
  const already = S.activity.some(a => a.user_id === S.user?.id && a.kind === 'login'
    && String(a.at || '').slice(0, 10) === today);
  if (already) return;
  logActivity('login', today);
  const n = streakNow();
  if (n >= 2) setTimeout(() => toast(`${n} day streak — keep it alive`, 'good'), 1200);
}

// ------------------------------------------------------------------ globals used by views

window.cadenceGoRoute = go;
window.cadenceGoDay = (day, route) => { S.day = day; if (route) go(route); else renderRoute(0, true); };
window.cadenceRerender = () => renderRoute(0, true);
window.cadenceRenderGoogleBanner = renderGoogleBanner;
window.cadenceApplyAccent = c => document.documentElement.style.setProperty('--accent', c);

registerActions({
  // Re-running consent upgrades the SAME Google account rather than making
  // a second one, and clearing the latch lets the very next tick retry.
  reconnectGoogle: async () => {
    try {
      await requestGoogleCalendarAccess();
      resetGoogleSyncBlock();
      await syncGoogleCalendar({ force: true });
    } catch { toast(t('msg.somethingWrong'), 'warn'); }
    renderGoogleBanner();
  },
  goTab: d => { haptic('light'); go(d.route); },
  quickAdd: () => { haptic('light'); openQuickAdd(); }
});

document.getElementById('app') ? boot() : addEventListener('DOMContentLoaded', boot);
