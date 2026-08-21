// Cadence — build + backend configuration.
// The anon key is a public client key by design; row-level security is what
// protects the data. Never put a service_role key in this file.
export const CONFIG = {
  version: '2.4.0',
  build: '2026-08-20',
  supabaseUrl: 'https://eznsmotrmzeryduwkuuf.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV6bnNtb3RybXplcnlkdXdrdXVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMTk4MTMsImV4cCI6MjEwMTY5NTgxM30.bdAmERDDmZwl9Pve4Jz9zjBU9dtHqUHgjzvN_wDEd5k',
  imageBucket: 'block-images',
  maxImageBytes: 5 * 1024 * 1024,
  imageMaxEdge: 1600,
  // Local cache + offline outbox live in this IndexedDB database.
  dbName: 'cadence',
  dbVersion: 1
};

// Chosen to read clearly on both dawn (paper) and dusk (deep plum)
// surfaces, since a category keeps one color across both themes.
export const CATEGORY_COLORS = [
  '#E8604A', '#3E8E7E', '#8670B3', '#4F86C6',
  '#C97A3A', '#C15B7C', '#8FA84E', '#B54A42'
];

// Daybreak's accent family: coral by default, warmed toward its
// dawn/dusk neighbors rather than unrelated hues.
export const ACCENTS = ['#E8604A', '#C97A3A', '#6E5A8C', '#5E8563', '#B0473F'];
