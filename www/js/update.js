// Update check: compares www/version.json (same origin, fetched fresh — no
// cache) against the build baked into this page. Deliberately dumb by
// design — no silent download, no auto-install. Sideloaded Android builds
// have no Play Store to push updates, so the honest move is to say "there's
// a newer build" and hand over the link, same as any desktop app checking
// for updates would. Works identically signed-in or as a guest since it's
// a plain unauthenticated fetch.
import { CONFIG } from './config.js';

function parts(v) { return String(v || '0').split('.').map(n => parseInt(n, 10) || 0); }

function isNewer(remote, local) {
  const r = parts(remote), l = parts(local);
  for (let i = 0; i < Math.max(r.length, l.length); i++) {
    const a = r[i] || 0, b = l[i] || 0;
    if (a !== b) return a > b;
  }
  return false;
}

let checked = false;
let cached = null;

export async function checkForUpdate() {
  if (checked) return cached;
  checked = true;
  try {
    const res = await fetch('./version.json', { cache: 'no-store' });
    if (!res.ok) return null;
    const info = await res.json();
    if (!info?.version || !isNewer(info.version, CONFIG.version)) return null;
    cached = info;
    return info;
  } catch {
    return null;
  }
}
