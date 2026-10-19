-- =============================================================
-- 002_logging_and_limits.sql
-- =============================================================

-- ------------------------------------------------------------
-- 1. build_logs
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.build_logs (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  deployment_id  uuid        REFERENCES public.deployments(id) ON DELETE CASCADE,
  stage          text        NOT NULL,  -- validating|building|uploading|provisioning|deploying|propagating|live|failed
  level          text        NOT NULL DEFAULT 'info',  -- info|warn|error
  message        text        NOT NULL,
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS build_logs_project_created_idx
  ON public.build_logs (project_id, created_at);

ALTER TABLE public.build_logs ENABLE ROW LEVEL SECURITY;

-- Users can read logs for projects they own
CREATE POLICY "build_logs: select via own projects"
  ON public.build_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = build_logs.project_id
        AND projects.user_id = auth.uid()
    )
  );

-- Server-side API routes write logs on behalf of the authenticated user;
-- the Supabase client in requireAuth() runs as the logged-in user, so we
-- need an INSERT policy that checks project ownership.
CREATE POLICY "build_logs: insert via own projects"
  ON public.build_logs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = build_logs.project_id
        AND projects.user_id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- 2. Add stage column to deployments
-- ------------------------------------------------------------
ALTER TABLE public.deployments
  ADD COLUMN IF NOT EXISTS stage text;

-- =============================================================
-- SELF-TEST VALIDATION QUERIES
-- Run in Supabase SQL editor after applying.
-- =============================================================

-- [ ] build_logs table exists with correct columns
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'build_logs'
-- ORDER BY ordinal_position;

-- [ ] Index exists
-- SELECT indexname FROM pg_indexes
-- WHERE tablename = 'build_logs' AND indexname = 'build_logs_project_created_idx';

-- [ ] deployments.stage column exists
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'deployments' AND column_name = 'stage';

-- [ ] RLS enabled on build_logs
-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE schemaname = 'public' AND tablename = 'build_logs';
