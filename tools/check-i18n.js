#!/usr/bin/env node
// Report which translation keys are missing from each language pack.
//
// t() falls back to English before falling back to the raw key, so a missing
// translation is invisible: the string renders, in English, forever. That is
// the right runtime behaviour and the wrong development one - it means a key
// added today is silently untranslated in nine languages and nothing ever
// says so.
//
//   node tools/check-i18n.js          list the gaps
//   node tools/check-i18n.js --strict exit 1 if any pack is incomplete
//
// Run it after adding a key. Exit code is 0 unless --strict is passed, so it
// can be wired into a build without blocking one.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const I18N = path.join(ROOT, 'www', 'js', 'i18n.js');
const LANG_DIR = path.join(ROOT, 'www', 'js', 'lang');

// Keys are quoted and followed by a colon. Good enough for these files, which
// are flat string maps, and it avoids importing ES modules from CommonJS.
const keysIn = (src) =>
  new Set([...src.matchAll(/['"]([a-zA-Z0-9_.]+)['"]\s*:/g)].map(m => m[1]));

function englishKeys() {
  const src = fs.readFileSync(I18N, 'utf8');
  const start = src.indexOf('export const EN = {');
  if (start < 0) throw new Error('EN dictionary not found in i18n.js');
  let depth = 0, end = start;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  return keysIn(src.slice(start, end));
}

const en = englishKeys();
const packs = fs.readdirSync(LANG_DIR).filter(f => f.endsWith('.js')).sort();

let incomplete = 0;
const missingEverywhere = new Map();

console.log(`English defines ${en.size} keys across ${packs.length} packs.\n`);
for (const file of packs) {
  const code = file.replace(/\.js$/, '');
  const have = keysIn(fs.readFileSync(path.join(LANG_DIR, file), 'utf8'));
  const missing = [...en].filter(k => !have.has(k));
  const extra = [...have].filter(k => !en.has(k));
  if (missing.length) incomplete++;
  for (const k of missing) missingEverywhere.set(k, (missingEverywhere.get(k) || 0) + 1);
  const pct = Math.round((en.size - missing.length) / en.size * 100);
  console.log(`${code}  ${String(pct).padStart(3)}%  missing ${String(missing.length).padStart(3)}`
    + (extra.length ? `  (${extra.length} keys not in English)` : ''));
}

const everywhere = [...missingEverywhere.entries()]
  .filter(([, n]) => n === packs.length)
  .map(([k]) => k);

if (everywhere.length) {
  console.log(`\nMissing from ALL ${packs.length} packs — these render in English for every user:`);
  for (const k of everywhere) console.log('  ' + k);
}

if (process.argv.includes('--strict') && incomplete) {
  console.error(`\n${incomplete} pack(s) incomplete.`);
  process.exit(1);
}
