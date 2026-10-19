-- =============================================================
-- 005_public_site_lookup.sql
-- =============================================================
-- Lets the public /s/[subdomain] route find where a live site's HTML is
-- stored, without exposing the projects table (RLS keeps it owner-only).
-- Returns "<user_id>/<project_id>" for a live project, or NULL.
-- =============================================================

CREATE OR REPLACE FUNCTION public.get_site_path(p_subdomain text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id::text || '/' || id::text
  FROM public.projects
  WHERE subdomain = p_subdomain
    AND status = 'live'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_site_path(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_site_path(text) TO anon, authenticated;
