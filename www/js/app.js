// App shell: boot sequence, auth screen, router, tab bar, global wiring.
// Everything else (views, sheets) is imported for its side effects
// (registerActions) and default-exported render/lifecycle object.
import { CONFIG } from './config.js';
import { initNet, sb, onSyncState, outboxCount } from './net.js';
import { S, onChange, loadFromCache, syncNow, startRealtime, notify, savePrefs } from './state.js';
import { setLang, currentLang, t } from './i18n.js';
import { currentSession, onAuthChange, signIn, signUp, resetPassword, usernameAvailable, ensureProfile } from './auth.js';
import { loadWorkspace } from './org.js';
import { installDelegation, installEdgeBack, installPullToRefresh, installKeyboardInset, swapScreen, toast, haptic, registerActions, readForm, $ , closeSheet} from './ui.js';
import { installErrorCapture } from './support.js';
import { hydrateImages } from './images.js';
import { openQuickAdd } from './sheets.js';
import { debounce } from './util.js';

import viewToday from './view.today.js';
import viewCalendar from './view.calendar.js';
import viewTasks from './view.tasks.js';
import viewGoals from './view.goals.js';
import viewTeam from './view.team.js';
import viewSettings from './view.settings.js';

installErrorCapture();

const VIEWS = { today: viewToday, calendar: viewCalendar, tasks: viewTasks, goals: viewGoals, team: viewTeam, settings: viewSettings };
const NAV = [
  ['today', t('nav.today'), icon('sun')],
  ['calendar', t('nav.calendar'), icon('cal')],
  ['tasks', t('nav.tasks'), icon('check')],
  ['goals', t('nav.goals'), icon('flag')],
  ['team', t('nav.team'), icon('team')],
  ['settings', t('nav.settings'), icon('gear')]
];

function icon(name) {
  const paths = {
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/>',
    check: '<path d="M4 12l5 5L20 6"/>',
    flag: '<path d="M5 3v18M5 4h11l-3 4 3 4H5"/>',
    team: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15 14c2.8 0 5 2 5 5"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.2-1.6l2-1.6-2-3.4-2.4.7a7 7 0 0 0-2.8-1.6L13 2h-4l-.6 2.5a7 7 0 0 0-2.8 1.6l-2.4-.7-2 3.4 2 1.6A7 7 0 0 0 3 12c0 .5 0 1.1.2 1.6l-2 1.6 2 3.4 2.4-.7a7 7 0 0 0 2.8 1.6L9 22h4l.6-2.5a7 7 0 0 0 2.8-1.6l2.4.7 2-3.4-2-1.6c.1-.5.2-1 .2-1.6Z"/>'
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

  onAuthChange((event) => { if (event === 'SIGNED_OUT') location.reload(); });
  onSyncState(updateSyncPill);
  setInterval(() => { if (navigator.onLine) syncNow().catch(() => {}); }, 45000);
  window.addEventListener('online', () => syncNow().catch(() => {}));
  installEdgeBack(() => { if (S.route !== 'today') go('today'); });
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
    ${!forgot ? `<div class="auth-switch"><a href="#" id="authForgot">${t('auth.forgot')}</a></div>` : ''}
    <div class="auth-switch"><a href="#" id="authFlip">${signup ? t('auth.haveAccount') : t('auth.noAccount')}</a></div>`;

  $('#authFlip', host).onclick = e => { e.preventDefault(); paintAuth(signup ? 'signin' : 'signup'); };
  $('#authForgot', host)?.addEventListener('click', e => { e.preventDefault(); paintAuth('forgot'); });
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
    <div class="topbar">
      <h1 id="routeTitle"></h1>
      <span class="sync-pill" id="syncPill"><i class="dot"></i><span id="syncLabel">${t('app.synced')}</span></span>
    </div>
    <div class="screen-scroll" id="scroller"><div class="screen" id="routeHost"></div></div>
    <button class="fab tap" data-act="quickAdd" aria-label="${t('common.add')}">＋</button>
    <div class="tabbar" id="tabbar">
      ${NAV.map(([id, label, svg]) => `<button class="tab tap${S.route === id ? ' on' : ''}" data-act="goTab" data-route="${id}">${svg}<span>${label}</span></button>`).join('')}
    </div>
    <div id="ptr"></div>
    <div id="scrim"></div><div class="sheet" id="sheet"></div><div class="toast" id="toast"></div>`;

  installPullToRefresh($('#scroller'), () => syncNow().catch(() => {}));

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
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.route === S.route));
}

function go(route) {
  if (route === S.route) return;
  const dir = NAV.findIndex(n => n[0] === route) > NAV.findIndex(n => n[0] === S.route) ? 1 : -1;
  S.route = route;
  renderRoute(dir);
}

function applyTheme() {
  document.documentElement.dataset.theme = S.prefs.theme;
  document.documentElement.style.setProperty('--accent', S.prefs.accent);
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue(S.prefs.theme === 'light' ? '--bg' : '--bg').trim() || '#0B0D14';
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

// ------------------------------------------------------------------ globals used by views

window.cadenceGoRoute = go;
window.cadenceGoDay = (day, route) => { S.day = day; if (route) go(route); else renderRoute(0, true); };
window.cadenceRerender = () => renderRoute(0, true);
window.cadenceApplyAccent = c => document.documentElement.style.setProperty('--accent', c);

registerActions({
  goTab: d => { haptic('light'); go(d.route); },
  quickAdd: () => { haptic('light'); openQuickAdd(); }
});

document.getElementById('app') ? boot() : addEventListener('DOMContentLoaded', boot);
