-- ============================================================
-- Keeps v1 (KingdomOS) and v2 (Cadence) data completely separate.
-- v1 keeps using the "state" column. v2 uses "state_v2".
-- Run this AFTER supabase-schema-v2.sql.
-- ============================================================

alter table app_state add column if not exists state_v2 jsonb;

-- The existing "state" column is left untouched, so your original
-- KingdomOS data stays exactly where it is.
