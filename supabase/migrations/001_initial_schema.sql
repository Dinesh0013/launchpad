-- =============================================================
-- 001_initial_schema.sql
-- =============================================================

-- ------------------------------------------------------------
-- 1. profiles
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id          uuid        PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email       text        NOT NULL,
  full_name   text,
  avatar_url  text,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles: select own"
  ON public.profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "profiles: update own"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid());

-- ------------------------------------------------------------
-- 2. projects
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.projects (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name                    text        NOT NULL,
  subdomain               text        UNIQUE NOT NULL,
  source_type             text        NOT NULL,   -- 'zip' | 'github' | 'url' | 'drag_drop'
  source_url              text,
  cloudflare_project_id   text,
  cloudflare_deploy_url   text,
  custom_domain           text,
  custom_domain_verified  boolean     DEFAULT false,
  status                  text        DEFAULT 'pending',  -- 'pending' | 'building' | 'live' | 'failed'
  last_deployed_at        timestamptz,
  created_at              timestamptz DEFAULT now()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "projects: select own"
  ON public.projects FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "projects: insert own"
  ON public.projects FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "projects: update own"
  ON public.projects FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "projects: delete own"
  ON public.projects FOR DELETE
  USING (user_id = auth.uid());

-- ------------------------------------------------------------
-- 3. deployments
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.deployments (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  status       text        NOT NULL,  -- 'building' | 'success' | 'failed'
  build_log    text,
  deployed_url text,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE public.deployments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deployments: select via own projects"
  ON public.deployments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = deployments.project_id
        AND projects.user_id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- 4. domain_searches
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.domain_searches (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  query      text        NOT NULL,
  results    jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.domain_searches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "domain_searches: select own"
  ON public.domain_searches FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "domain_searches: insert own"
  ON public.domain_searches FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- ------------------------------------------------------------
-- 5. Trigger: auto-create profile on new auth user
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();


-- =============================================================
-- SELF-TEST VALIDATION QUERIES
-- Run these in the Supabase SQL editor after applying the migration.
-- =============================================================

-- [ ] All 4 tables exist
-- SELECT table_name
-- FROM information_schema.tables
-- WHERE table_schema = 'public'
-- ORDER BY table_name;
-- Expected rows: deployments, domain_searches, profiles, projects

-- [ ] RLS is enabled on all 4 tables
-- SELECT tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
-- ORDER BY tablename;
-- Expected: rowsecurity = true for all four tables

-- [ ] Trigger on_auth_user_created exists
-- SELECT trigger_name
-- FROM information_schema.triggers
-- WHERE trigger_name = 'on_auth_user_created';
-- Expected: 1 row returned

-- [ ] Foreign key from projects.user_id → profiles.id exists
-- SELECT
--   tc.constraint_name,
--   kcu.column_name,
--   ccu.table_name  AS foreign_table,
--   ccu.column_name AS foreign_column
-- FROM information_schema.table_constraints AS tc
-- JOIN information_schema.key_column_usage  AS kcu
--   ON tc.constraint_name = kcu.constraint_name
-- JOIN information_schema.constraint_column_usage AS ccu
--   ON ccu.constraint_name = tc.constraint_name
-- WHERE tc.constraint_type = 'FOREIGN KEY'
--   AND tc.table_name = 'projects'
--   AND kcu.column_name = 'user_id';
-- Expected: 1 row with foreign_table = 'profiles', foreign_column = 'id'
