-- =============================================================
-- 003_custom_domains.sql
-- =============================================================
-- NOTE: custom_domain and custom_domain_verified already exist
-- from 001_initial_schema.sql. This migration adds the three
-- additional columns needed for the domain connection flow.
-- =============================================================

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS custom_domain_status  text        DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS custom_domain_cname   text,
  ADD COLUMN IF NOT EXISTS custom_domain_added_at timestamptz;

-- custom_domain_status values:
-- 'none'    → no custom domain set
-- 'pending' → domain added to CF Pages, DNS not yet verified
-- 'active'  → domain verified and serving traffic
-- 'failed'  → CF rejected the domain

-- =============================================================
-- SELF-TEST VALIDATION QUERIES
-- Run in Supabase SQL editor after applying.
-- =============================================================

-- [ ] New columns exist
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name = 'projects'
--   AND column_name IN (
--     'custom_domain', 'custom_domain_status',
--     'custom_domain_cname', 'custom_domain_added_at',
--     'custom_domain_verified'
--   )
-- ORDER BY column_name;
-- Expected: 5 rows
