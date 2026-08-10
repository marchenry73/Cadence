// Calendar images. Local-only images would not survive a reinstall and would
// not appear on the user's other devices, which reads as data loss — so the
// original goes to Supabase Storage and a copy is cached on the device for
// instant display and offline viewing.
import { CONFIG } from './config.js';
import { sb } from './net.js';
import { S } from './state.js';
import { uid } from './util.js';
import { idb } from './idb.js';

const MAGIC = [
  { type: 'image/jpeg', bytes: [0xFF, 0xD8, 0xFF] },
  { type: 'image/png', bytes: [0x89, 0x50, 0x4E, 0x47] },
  { type: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] },        // RIFF….WEBP
  { type: 'image/heic', bytes: [0x00, 0x00, 0x00], offset: 4, ascii: 'ftyp' }
];

// Never trust the filename. Read the actual file signature.
async function sniff(file) {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const ascii = String.fromCharCode(...head.slice(4, 8));
  for (const m of MAGIC) {
    if (m.ascii) { if (ascii === m.ascii) return m.type; continue; }
    if (m.bytes.every((b, i) => head[i] === b)) {
      if (m.type === 'image/webp' && String.fromCharCode(...head.slice(8, 12)) !== 'WEBP') continue;
      return m.type;
    }
  }
  return null;
}

// Downscale and re-encode before upload: a 4 MB phone photo becomes ~200 KB.
async function normalise(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, CONFIG.imageMaxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const blob = await new Promise(res => canvas.toBlob(res, 'image/webp', 0.82))
    || await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.85));
  return blob;
}

export async function uploadImage(file) {
  if (file.size > CONFIG.maxImageBytes) throw new Error('too-big');
  const kind = await sniff(file);
  if (!kind) throw new Error('bad-type');

  const blob = await normalise(file);
  const path = `${S.user.id}/${uid()}.webp`;
  const { error } = await sb.storage.from(CONFIG.imageBucket)
    .upload(path, blob, { contentType: 'image/webp', cacheControl: '31536000', upsert: false });
  if (error) throw error;

  await idb.set('cache', 'img:' + path, blob);   // warm the local cache
  return path;
}

const urls = new Map();   // path -> object URL

export async function imageUrl(path) {
  if (!path) return null;
  if (urls.has(path)) return urls.get(path);

  const cached = await idb.get('cache', 'img:' + path).catch(() => null);
  if (cached) {
    const url = URL.createObjectURL(cached);
    urls.set(path, url);
    return url;
  }
  if (!navigator.onLine) return null;

  const { data, error } = await sb.storage.from(CONFIG.imageBucket).createSignedUrl(path, 3600);
  if (error) return null;
  try {
    const blob = await (await fetch(data.signedUrl)).blob();
    await idb.set('cache', 'img:' + path, blob);
    const url = URL.createObjectURL(blob);
    urls.set(path, url);
    return url;
  } catch {
    return data.signedUrl;
  }
}

export async function deleteImage(path) {
  if (!path) return;
  if (urls.has(path)) { URL.revokeObjectURL(urls.get(path)); urls.delete(path); }
  await idb.del('cache', 'img:' + path).catch(() => {});
  if (navigator.onLine) await sb.storage.from(CONFIG.imageBucket).remove([path]).catch(() => {});
}

export async function storageUsed() {
  try {
    const { data, error } = await sb.rpc('my_storage_bytes');
    if (error) throw error;
    return Number(data || 0);
  } catch { return null; }
}

// Fill every <img data-img="path"> that is on screen. Called after each render.
export function hydrateImages(root = document) {
  root.querySelectorAll('img[data-img]:not([data-img-done])').forEach(async node => {
    node.setAttribute('data-img-done', '1');
    const url = await imageUrl(node.dataset.img);
    if (url) { node.src = url; node.classList.add('loaded'); }
  });
}

export function pickFile({ capture = false } = {}) {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp,image/heic';
    if (capture) input.capture = 'environment';
    input.onchange = () => resolve(input.files?.[0] || null);
    input.click();
  });
}
