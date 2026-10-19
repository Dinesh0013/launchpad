-- =============================================================
-- 004_storage_setup.sql
-- =============================================================
-- Idempotent setup for the 'deployments' Supabase Storage bucket.
-- Safe to re-run. Apply in Supabase SQL Editor.
-- =============================================================

-- Ensure deployments bucket exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('deployments', 'deployments', true)
ON CONFLICT (id) DO NOTHING;

-- Ensure RLS policy exists (drop first to avoid conflicts)
DROP POLICY IF EXISTS "allow_all_deployments" ON storage.objects;
CREATE POLICY "allow_all_deployments"
ON storage.objects
FOR ALL
USING (bucket_id = 'deployments')
WITH CHECK (bucket_id = 'deployments');
