// Caches the app shell for instant boot + true offline. Data itself is
// handled by IndexedDB (js/idb.js) and Supabase — this SW only owns static
// files. CACHE_NAME bumps automatically on every deploy via the build step
// in the GitHub Action (see DEPLOY.md), so users always get the latest shell
// without a stale cache stranding them on old code.
const CACHE_NAME = 'cadence-shell-__BUILD__';
const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './css/app.css',
  './js/app.js', './js/config.js', './js/util.js', './js/idb.js', './js/net.js',
  './js/state.js', './js/i18n.js', './js/ui.js', './js/auth.js', './js/org.js',
  './js/images.js', './js/support.js', './js/timer.js', './js/sheets.js',
  './js/ics.js', './js/onboarding.js', './js/notify.js',
  './js/gamify.js', './js/ideal.js', './js/google.js',
  './js/view.today.js', './js/view.calendar.js', './js/view.tasks.js',
  './js/view.goals.js', './js/view.review.js', './js/view.team.js', './js/view.settings.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first for navigations and same-origin JS/CSS (so a deploy is live
// immediately); cache-first fallback keeps the app bootable offline.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;

  e.respondWith(
    fetch(req, { cache: 'no-store' }).then(res => {
      const copy = res.clone();
      caches.open(CACHE_NAME).then(c => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
  );
});
