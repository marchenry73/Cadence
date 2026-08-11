// Cadence — build + backend configuration.
// The anon key is a public client key by design; row-level security is what
// protects the data. Never put a service_role key in this file.
export const CONFIG = {
  version: '2.1.0',
  build: '2026-08-11',
  supabaseUrl: 'https://eznsmotrmzeryduwkuuf.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV6bnNtb3RybXplcnlkdXdrdXVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMTk4MTMsImV4cCI6MjEwMTY5NTgxM30.bdAmERDDmZwl9Pve4Jz9zjBU9dtHqUHgjzvN_wDEd5k',
  imageBucket: 'block-images',
  maxImageBytes: 5 * 1024 * 1024,
  imageMaxEdge: 1600,
  // Local cache + offline outbox live in this IndexedDB database.
  dbName: 'cadence',
  dbVersion: 1
};

export const CATEGORY_COLORS = [
  '#F2994A', '#3ECFB2', '#7C6AF0', '#6FA8FF',
  '#F0C674', '#E86AA6', '#8FD46A', '#FF6B6B'
];

// Warm, motivational accent by default — the ask was a palette that
// energizes goal-chasing rather than a cool, financial-dashboard indigo.
export const ACCENTS = ['#F2994A', '#F2622E', '#F0C674', '#3ECFB2', '#7C6AF0'];
