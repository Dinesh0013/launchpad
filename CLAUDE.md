# LaunchPad — Claude Code context

## What this project is
LaunchPad turns Lovable / Bolt / V0 output into a live Cloudflare Pages site for
non-technical users. Users paste a GitHub repo URL or upload a ZIP and get a
deployed site in under 60 seconds. Hard cap: 20 sites per user.

## Stack
- Next.js 16 (App Router; auth guard lives in proxy.ts, formerly middleware.ts), TypeScript
- Tailwind CSS + shadcn/ui
- Supabase (auth + Postgres + Storage)
- Cloudflare Pages (deployment target — static file upload only, see below)
- Resend (transactional email on deploy success)
- Sentry (@sentry/nextjs 10.x) — error tracking, no-ops when SENTRY_DSN unset

## Host
No production host configured yet. All API routes use `export const runtime = "nodejs"`.
The app requires a Node.js host (Vercel, Railway, Fly.io, etc.) — NOT Cloudflare
Pages/Workers, because server-side routes need child_process and filesystem access
for the upcoming build engine.

## Input methods (UI)
- GitHub URL    →  POST /api/ingest/github   (downloads repo ZIP, extracts with root-strip, stores to Supabase Storage)
- ZIP upload    →  POST /api/ingest/upload   (extracts ZIP with root-strip, or stores HTML; uploads to Supabase Storage)
- Paste a link  →  POST /api/ingest/url      (fetches HTML + same-origin assets, bundles, form-checks, stores) — re-enabled in P3
  - risk='backend' form detected → 200 + { warning:'BACKEND_FORM', message } — UI shows inline amber warning, deploy still proceeds
  - falls back to Cloudflare Pages _redirects if asset fetch fails
  - source_type values: 'zip' | 'github' | 'lovable' | 'bolt' | 'v0' | 'lovable_bundled' | 'url'

## Cloudflare Pages deploy strategy
**CF Pages build-from-source is NOT used and NOT available.**
All deployments are pre-built static file uploads:
1. Ingest stores files to Supabase Storage at `{user_id}/{project_id}/`.
2. Deploy route reads those files back, creates a CF Pages project, and POSTs them
   as multipart FormData to `/pages/projects/{name}/deployments`.
3. The upcoming build engine (P2+) will run `npm install && npm run build` server-side
   in a temp directory, then upload the built `dist/` output via this same path.

## Deploy flow (current)
1. User submits GitHub URL, ZIP, or pasted link via /dashboard/new
2. Ingest API validates, enforces 20-project cap, stores files to Supabase Storage,
   creates project row (status='building')
3. Client fires POST /api/deploy (non-blocking) and navigates to /deploy/[project_id]
4. Deploy route emits all 7 intermediate statuses as it progresses (see pipeline below)
5. GET /api/projects/[id]/status polled every 3s by DeployProgress component
6. On status='live', user sees success card with live URL

## Deploy pipeline — status values (all now fully emitted, not cosmetic)
Each transition calls setStatus() which updates BOTH projects.status AND deployments.stage:

  building     → initial mark at route entry (direct supabase.update, before try block)
  validating   → before materializeFromStorage (stage 0)
  uploading    → after materialize, before buildFromSource (stage 2)
  provisioning → after build + collectFiles, before CF project check (stage 3)
  deploying    → after CF project ready, before deployToCloudflare (stage 4)
  propagating  → after deployToCloudflare returns (stage 5)
  live         → final success write (stage 6) — also sets cloudflare_deploy_url
  failed       → error catch block — stores real error message in deployments.build_log

## Status endpoint (GET /api/projects/[id]/status)
Returns: { status, cloudflare_deploy_url, subdomain, stage, buildLogs }
  - status: projects.status (coarse state)
  - stage: deployments.stage from latest deployment (fine-grained pipeline step)
  - buildLogs: last 20 rows from build_logs, ordered asc by created_at,
    each { stage, level, message, created_at }

## Progress UI (components/deploy/DeployProgress.tsx)
- Stage mapping uses BOTH status AND stage fields from the API response.
- No artificial cycling between stages — all 7 stages reflect real backend state.
- Build log panel (dark, monospace, max-height 200px) shows real log lines below the
  stage list while deploy is in progress or failed. Auto-scrolls to bottom.
- info=gray, warn=amber, error=red log line colors.

## Host requirements
The deploy route sets `export const maxDuration = 300` (5 min). The host MUST support
≥300s function duration. If the host caps lower (e.g. Vercel Hobby plan = 60s), the
build step must be moved to a background worker / queue (noted as future work, not built).
Set BUILD_TIMEOUT_MS env var to override the 180s per-command timeout.

## Logging
- build_logs table: per-project, per-deployment log rows with stage + level + message.
- lib/logger.ts: logBuild() inserts a row + emits console.{level}. Never throws.
- Sentry: captureException() in catch blocks of ingest/github, ingest/upload, deploy routes.

## Key files
- app/dashboard/new/page.tsx              → new project form (GitHub URL + Upload ZIP + Paste a link tabs)
- app/deploy/[project_id]/page.tsx        → deployment progress page
- components/deploy/DeployProgress.tsx    → 7-stage animated progress component
- app/api/ingest/github/route.ts          → GitHub URL ingestion
- app/api/ingest/upload/route.ts          → ZIP/HTML upload ingestion
- app/api/ingest/url/route.ts             → URL paste ingestion (Lovable/Bolt/v0/any URL) — active since P3
- app/api/deploy/route.ts                 → Cloudflare Pages deployment
- app/api/projects/[id]/status/route.ts   → status polling endpoint
- lib/cloudflare.ts                       → Cloudflare API wrapper (cfBase() lazy getter)
- lib/logger.ts                           → logBuild() — build log insertion
- lib/limits.ts                           → MAX_PROJECTS_PER_USER = 20
- lib/api-auth.ts                         → requireAuth() — uses getUser() (JWT-validated)
- lib/subdomain.ts                        → subdomain generation + uniqueness check
- lib/formcheck.ts                        → detectBackendForm() — classifies form risk (none/external/backend)
- lib/zip.ts                              → getCommonRoot() + stripRoot() — shared ZIP root-strip logic
- supabase/migrations/001_initial_schema.sql → profiles, projects, deployments, domain_searches
- supabase/migrations/002_logging_and_limits.sql → build_logs, deployments.stage column

## Commands
- dev:          npm run dev
- build:        npm run build
- type-check:   npx tsc --noEmit
- lint:         npm run lint
- full suite:   npx playwright test --reporter=line
- single spec:  npx playwright test tests/{name}.spec.ts --reporter=line

## Test suite
| Spec file | What it tests | Notes |
|-----------|--------------|-------|
| tests/smoke.spec.ts | Landing page renders, branding, features section, "Ship in three steps" copy | Browser, always runs |
| tests/logger.spec.ts | build_logs table insert + read-back via Supabase REST | Skips if migration 002 not applied or no Supabase credentials |
| tests/builder.spec.ts | Framework detection, real Vite build (Fixture A), SSR rejection, next-static detection | Node-based, Fixture A allowed 180s |
| tests/zip.spec.ts | getCommonRoot + stripRoot (9 cases) | Node-based, no browser |
| tests/formcheck.spec.ts | detectBackendForm risk classification (8 cases) | Node-based, no browser |
| tests/deploy-idempotency.spec.ts | CF project creation skipped on redeploy (mock Supabase) | Node-based |
| tests/progress.spec.ts | setStatus helper: projects + deployments + build_logs updates (9 cases) | Node-based, mock Supabase |
| tests/e2e-zip.spec.ts | ZIP upload flow: tab UI, file input, ingest submit, progress stages, success card, log panel | Browser E2E — skips if TEST_USER_EMAIL/PASSWORD not set |
| tests/e2e-url.spec.ts | URL paste flow: tab UI, URL input, clean submit, BACKEND_FORM warning, continue, live progress | Browser E2E — skips if TEST_USER_EMAIL/PASSWORD not set |
| tests/e2e-error.spec.ts | SSR error, deploy failure UI, Try again routing, project limit error | Browser E2E — skips if TEST_USER_EMAIL/PASSWORD not set |

E2E tests use Playwright route interception (page.route) — no real CF or Supabase API calls are made inside
the browser during E2E tests. However, both /dashboard and /deploy layouts call supabase.auth.getUser()
server-side, so real Supabase credentials and a test user are required. Set in .env.local:
  TEST_USER_EMAIL=test@example.com
  TEST_USER_PASSWORD=test-password

logger.spec.ts requires migration 002 applied to local Supabase:
  supabase/migrations/002_logging_and_limits.sql

## Known gaps remaining
- E2E tests run fully only with real Supabase credentials + test user (TEST_USER_EMAIL / TEST_USER_PASSWORD).

## Known Recurring Issues — Do Not Regress

### 1. Supabase deployments bucket
- Bucket 'deployments' must exist and be PUBLIC
- RLS policy 'allow_all_deployments' must allow ALL operations
- Migration: supabase/migrations/004_storage_setup.sql
- Symptom when missing: UNKNOWN_FRAMEWORK error on every deploy
- Fix: apply 004_storage_setup.sql in Supabase SQL Editor
- NEVER remove or modify the bucket or its policy

### 2. Supabase storage list() trailing slash
- lib/fsbuild.ts basePath must end with trailing slash
- Symptom: COUNT 0 even when files exist in storage
- Fix: ensure basePath = `${userId}/${projectId}/`
- NEVER remove the trailing slash from basePath

### 3. CF Pages manifest field
- deployToCloudflare uses Wrangler CLI (npx wrangler pages deploy)
- NEVER revert to the direct CF API multipart upload
- The direct API requires a manifest with SHA256 hashes
  which caused 400/500 errors and hours of debugging

### 4. FormData Content-Type header
- NEVER manually set Content-Type on multipart FormData fetches
- Let fetch set it automatically with the correct boundary

### 5. getSession() vs getUser()
- ALWAYS use supabase.auth.getUser() in API routes
- NEVER use getSession() — it does not verify the JWT

### 6. ZIP top-level folder stripping
- Both ingest/upload and ingest/github must use
  stripCommonRoot from lib/zip.ts
- NEVER remove stripCommonRoot from either route

## Guardrails — never do these
- Commit .env or .env.local
- Change shadcn component internals directly
- Use supabase.auth.getSession() in API routes — always use getUser() (enforced in requireAuth)
- Delete /api/ingest/url/route.ts — it is active and handles the "Paste a link" flow since P3
- Assume CF Pages build-from-source is available — it is not; all deploys are server-side builds
  uploaded as pre-built static files via the CF Pages multipart FormData API
- Deploy the Next.js app itself to Cloudflare Pages/Workers — Node.js runtime required (child_process
  and filesystem access needed for the build engine)
- Host must allow ≥300s function timeout (all three ingest routes + deploy route set maxDuration=300).
  If platform caps lower (e.g. Vercel Hobby = 60s), the build engine must move to a background worker.
  BUILD_TIMEOUT_MS env var controls the per-step build timeout (default 180s).
- Exceed MAX_PROJECTS_PER_USER = 20 — enforced in all three ingest routes (lib/limits.ts)
- BACKEND_FORM warning: URL ingest returns { warning:'BACKEND_FORM', message } when a backend-wired
  form is detected; deploy still proceeds — the warning is informational only
- source_type valid values: 'zip' | 'github' | 'lovable' | 'bolt' | 'v0' | 'lovable_bundled' | 'url'
  (lovable_bundled is set after fetchAndBundle succeeds; url is the fallback for unknown hostnames)

## Custom Domain

### API routes
- Search:  POST /api/domains/search   — { query } → { query, suggestions[] } (TLDs: .com .co .io .app .dev .net)
- Connect: POST /api/domains/connect  — { project_id, domain } → { success, domain, cname_target, status, message }
- Status:  GET  /api/domains/status/[domain] → { domain, status, verified, cname_target, project_id }

### Component
- components/domains/DomainPicker.tsx — standalone UI for search → results → confirm → connected flow
  - Props: { projectId, projectName, currentDomain?, onConnected? }
  - Used in: project detail page (app/dashboard/projects/[id]/page.tsx) and deploy success card

### DB columns added by migration 003 (on top of 001's custom_domain + custom_domain_verified)
- custom_domain_status  text DEFAULT 'none'   — 'none'|'pending'|'active'|'failed'
- custom_domain_cname   text                  — the .pages.dev target the user points DNS to
- custom_domain_added_at timestamptz

### Logic lib
- lib/domain-search.ts — domainSearchSchema, extractName, buildSuggestions, validateProjectForDomain, TLD_PRICES
  - CF Registrar check: GET /registrar/domains/{domain} (404=available, 200=taken); falls back to DNS
  - Confidence: 'high' for CF results, 'low' for DNS fallback
- lib/cloudflare.ts addCustomDomain() — POST /pages/projects/{name}/domains

### Design decisions
- LaunchPad does NOT purchase domains — it only connects existing ones to Cloudflare Pages
- User must own the domain and set a CNAME record pointing to {subdomain}.pages.dev
- connect route requires project.status='live' and cloudflare_project_id set
- Search rate limit: 10/hour per user; connect rate limit: 10/hour per user
- PATCH /api/projects/[id] with { custom_domain: null } clears all domain columns
