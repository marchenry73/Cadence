// App shell: boot sequence, auth screen, router, tab bar, global wiring.
// Everything else (views, sheets) is imported for its side effects
// (registerActions) and default-exported render/lifecycle object.
import { CONFIG } from './config.js';
import { initNet, sb, onSyncState, outboxCount, droppedWrites, ackDropped } from './net.js';
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
import { syncGoogleCalendar, googleSyncBlockedReason, resetGoogleSyncBlock, googleSyncInFlight, verifyGoogleRefreshToken } from './google.js';
import { requestGoogleCalendarAccess, captureGoogleRefreshToken } from './auth.js';
import { openQuickAdd } from './sheets.js';
import './search.js';
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
// Route id, translation KEY, icon - not the translated label. Resolving t()
// here would run it at import time, before setLang() has fetched a pack, and
// freeze all six at English for every language. navItems() resolves them at
// render instead.
const NAV = [
  ['today', 'nav.today', icon('sun')],
  ['calendar', 'nav.calendar', icon('cal')],
  ['tasks', 'nav.tasks', icon('check')],
  ['goals', 'nav.goals', icon('flag')],
  ['review', 'nav.review', icon('chart')],
  ['settings', 'nav.settings', icon('gear')]
];
const navItems = () => NAV.map(([id, key, svg]) => [id, t(key), svg]);

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

  // Registered IMMEDIATELY after the client exists, and deliberately before
  // any await. detectSessionInUrl means supabase-js starts consuming the
  // OAuth callback the moment it is constructed and fires SIGNED_IN from
  // that work — the previous version registered this inside afterSignIn(),
  // several awaits later, so the event had already come and gone and the
  // refresh token was lost with it. This is the only shot at capturing it.
  onAuthChange((event, session) => {
    if (event !== 'SIGNED_IN' || !session) return;
    captureGoogleRefreshToken(session).then(r => {
      recordGoogleCapture(r);
      if (r?.ok) {
        resetGoogleSyncBlock();
        syncGoogleCalendar({ force: true }).then(renderGoogleBanner).catch(() => {});
      }
    }).catch(() => {});
  });

  installDelegation();
  installKeyboardInset();

  const session = await currentSession();
  if (!session) return renderAuth();

  S.user = session.user;
  await afterSignIn(session);
}

// Why the last capture attempt succeeded or failed. Kept in localStorage
// because the whole problem with the first two attempts was that failure
// was invisible — this makes it answerable without another blind round.
function recordGoogleCapture(result) {
  try {
    localStorage.setItem('cadence.googleCapture', JSON.stringify({
      at: new Date().toISOString(),
      ok: !!result?.ok,
      reason: result?.reason || 'unknown',
      detail: result?.detail || null
    }));
  } catch { /* private mode — not worth failing over */ }
}
window.cadenceGoogleCaptureStatus = () => {
  try { return JSON.parse(localStorage.getItem('cadence.googleCapture') || 'null'); }
  catch { return null; }
};

async function afterSignIn(bootSession = null) {
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

  onAuthChange((event) => { if (event === 'SIGNED_OUT') location.reload(); });
  // Belt and braces: if SIGNED_IN somehow still slipped past, the boot
  // session may carry the token. Costs one no-op call when it does not.
  captureGoogleRefreshToken(bootSession).then(r => {
    if (r?.ok) { recordGoogleCapture(r); resetGoogleSyncBlock(); }
  }).catch(() => {});
  onSyncState(updateSyncPill);
  setInterval(() => { if (navigator.onLine) syncNow().catch(() => {}); }, 45000);
  window.addEventListener('online', () => syncNow().catch(() => {}));

  // Google Calendar keeps itself current on its own. syncGoogleCalendar()
  // no-ops safely when the user is not signed in with Google, so all of
  // this costs a password account nothing.
  startGoogleAutoSync();
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
    <div id="scrim"></div><div class="sheet" id="sheet"></div><div class="sheet sheet-alt" id="sheet2" inert></div><div class="toast" id="toast"></div>`;
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
    <a class="skip-link" href="#routeHost">Skip to content</a>
    <div class="app-shell">
      <nav class="sidebar" id="sidebar">
        <div class="sidebar-logo">Cad<b>ence</b></div>
        ${navItems().map(([id, label, svg]) => `<button class="side-link tap${S.route === id ? ' on' : ''}" data-act="goTab" data-route="${id}" aria-current="${S.route === id ? 'page' : 'false'}">${svg}<span>${label}</span></button>`).join('')}
        <div class="sidebar-spacer"></div>
        <button class="sidebar-add tap" data-act="quickAdd">＋ ${t('common.add')}</button>
      </nav>
      <div class="main-col">
        <div class="topbar">
          <h1 id="routeTitle"></h1>
          <button class="icon-btn topbar-search" data-act="openSearch" aria-label="Search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg></button>
          <span class="sync-pill${S.guest ? ' guest' : ''}" id="syncPill"><i class="dot"></i><span id="syncLabel">${S.guest ? t('app.guest') : t('app.synced')}</span></span>
        </div>
        <div id="gsyncBanner"></div>
        <main class="screen-scroll" id="scroller" tabindex="-1"><div class="screen" id="routeHost" aria-live="polite"></div></main>
      </div>
    </div>
    <button class="fab tap" data-act="quickAdd" aria-label="${t('common.add')}">＋</button>
    <nav class="tabbar" id="tabbar" aria-label="Main">
      ${navItems().map(([id, label, svg]) => `<button class="tab tap${S.route === id ? ' on' : ''}" data-act="goTab" data-route="${id}" aria-current="${S.route === id ? 'page' : 'false'}">${svg}<span>${label}</span></button>`).join('')}
    </nav>
    <div id="ptr"></div>
    <div id="scrim"></div><div class="sheet" id="sheet"></div><div class="sheet sheet-alt" id="sheet2" inert></div><div class="toast" id="toast"></div>`;

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
  $('#routeTitle').textContent = navItems().find(n => n[0] === S.route)?.[1] || '';
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
  // Writes --accent-user, NOT --accent. Setting --accent inline beat the
  // dark-theme token at every specificity, so dusk silently kept the dawn
  // coral and the 'brighter after dark' half of the palette never shipped.
  // The themes now derive --accent from this, so a chosen accent still wins
  // and still lifts in the dark.
  document.documentElement.style.setProperty('--accent-user', S.prefs.accent);
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

  // needs-refresh-token is a WARNING, not a pause: sync is working right
  // now and will keep working for about an hour. Calling that "paused"
  // would be false, and the user would reasonably ignore it next time.
  const soon = why === 'needs-refresh-token';
  const title = soon ? t('gsync.willPause') : t('gsync.paused');
  const body = soon ? t('gsync.needsRefresh')
    : why === 'expired' ? t('gsync.pausedWhy')
    : why === 'needs-calendar-consent' ? t('gsync.needsConsent')
    : t('gsync.apiDisabled');
  // Only these are fixable by tapping; a disabled API has to be turned on
  // in Google Cloud, so offering a button there would lie.
  const canReconnect = soon || why === 'expired' || why === 'needs-calendar-consent';

  host.innerHTML = `<div class="gsync-banner">
    <div class="gsync-main">
      <div class="gsync-title">${esc(title)}</div>
      <div class="gsync-body">${esc(body)}</div>
    </div>
    ${canReconnect ? `<button class="btn primary sm" data-act="reconnectGoogle">${esc(t('gsync.reconnect'))}</button>` : ''}
  </div>`;
}

// net.js announces six states. This used to render three and let the other
// three - 'rejected', 'error' and anything unrecognised - fall through to
// the final else, which said "Synced". A permanently discarded write and a
// successful one looked identical.
let lastSyncState = null;
// Every trigger goes through here so the banner is refreshed on all of them
// and a failure can never escape into an unhandled rejection that would
// stop the loop.
const googleTick = (force = false) =>
  syncGoogleCalendar({ force }).then(renderGoogleBanner).catch(() => {});

function startGoogleAutoSync() {
  googleTick(true);
  // Answer "will this still be syncing in an hour?" now, rather than
  // letting the user discover the answer in an hour.
  verifyGoogleRefreshToken().then(renderGoogleBanner).catch(() => {});

  // The baseline. On a phone this is the least reliable of the four: a
  // backgrounded WebView has its timers frozen, and a hidden tab throttles
  // them to about once a minute.
  setInterval(() => googleTick(), 5 * 60 * 1000);
  window.addEventListener('online', () => googleTick());

  // Coming back to the app is the trigger that actually carries a phone.
  // syncGoogleCalendar rate-limits itself, so returning after twenty
  // seconds costs nothing while returning after three hours syncs at once.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') googleTick();
  });
  // Capacitor does not reliably fire visibilitychange in the Android
  // wrapper, which is the build where backgrounding is most aggressive.
  try {
    window.Capacitor?.Plugins?.App?.addListener?.(
      'appStateChange', ({ isActive }) => { if (isActive) googleTick(); });
  } catch { /* web build, or plugin not installed */ }

  // And push a local edit up promptly rather than on the next tick. NOT
  // armed while a sync is running: a pull saves every event it imports,
  // each save notifies, and arming on those would make the sync retrigger
  // itself forever.
  let nudge = null;
  onChange(reason => {
    if (!String(reason || '').startsWith('save:')) return;
    if (googleSyncInFlight()) return;
    clearTimeout(nudge);
    nudge = setTimeout(() => googleTick(true), 15000);
  });
}

function updateSyncPill({ state, pending, dropped }) {
  const pill = $('#syncPill'), label = $('#syncLabel');
  if (!pill) return;
  const failed = state === 'rejected' || state === 'error';
  pill.className = 'sync-pill ' + (state === 'offline' ? 'offline'
    : state === 'syncing' ? 'syncing'
    : failed ? 'failed'
    : state === 'synced' ? 'synced' : '');
  label.textContent = state === 'offline' ? t('app.offline')
    : state === 'syncing' ? t('app.syncing')
    : state === 'rejected' ? t('app.dropped', { n: dropped })
    : state === 'error' ? t('app.syncError')
    : state === 'pending' ? t('app.pending', { n: pending })
    : t('app.synced');
  // The pill is on screen at 390px too (measured: 136x31, top right), but it
  // is a 12px label that changes colour - easy to miss, and what it reports
  // here is permanent data loss. Toast once on the transition into a failure
  // state, not on every flush that finds the same unacknowledged drop.
  if (failed && lastSyncState !== state) toast(t('app.dropped', { n: dropped || 1 }), 'warn');
  lastSyncState = state;
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
// go() returns early when the route is already current, so passing a route
// you are already on used to set S.day and then never repaint — tapping a
// search result for another day while already on Today changed nothing on
// screen. Only delegate to go() for an actual route change.
window.cadenceGoDay = (day, route) => {
  S.day = day;
  if (route && route !== S.route) go(route);
  else renderRoute(0, true);
};
window.cadenceRerender = () => renderRoute(0, true);
// A language change has to re-render the SHELL too. The tab bar, the sidebar
// and the screen title all live there, so re-rendering only the route left the
// entire chrome in the previous language until the app was reloaded - which is
// why the tab bar still read English under Arabic even after the labels were
// made to resolve lazily.
window.cadenceRelocalise = () => { renderShell(); renderRoute(0, true); };
window.cadenceRenderGoogleBanner = renderGoogleBanner;
window.cadenceApplyAccent = c => document.documentElement.style.setProperty('--accent-user', c);

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
