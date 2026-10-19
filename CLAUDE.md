# LaunchPad — Claude Code context

Last updated: 2026-10-19. Read this first; it is the project walkthrough plus the rules that keep it working.

## What this project is
LaunchPad turns pasted HTML into a public website link in under a minute. A user signs up with
email + password, pastes one HTML page into a box (with a live preview), clicks Deploy, and gets a
shareable URL. Hard cap: 20 sites per user.

The plain-English description for end users lives in README.md (top section). Keep the two consistent.

## Live deployment (as of 2026-10-19)
| Thing | Value |
|-------|-------|
| App | https://launchpad-dinesh0013.vercel.app |
| Published site URL pattern | `https://launchpad-dinesh0013.vercel.app/s/<subdomain>` |
| GitHub | https://github.com/Dinesh0013/launchpad (public, branch `main`) |
| Vercel project | `launchpad` (personal Hobby account, project id `prj_5OeyJWXCFOWGDqAC1VSgLa3vjMnj`) |
| Supabase project | ref `pokjylilmjvklpvmizvg` (eu-west-1, org "Dinesh0013's Org") |
| Cloudflare | MOCK MODE (placeholder token). Sites are served by this app, not Cloudflare. |

**Vercel is NOT linked to GitHub**, so pushing to `main` does not deploy. Redeploy manually, either with
the Vercel MCP `create_deployment` tool (`gitSource` = github, org `Dinesh0013`, repo `launchpad`, ref `main`,
optional `sha`, `target: "production"`, `forceNew: "1"`) or by connecting the repo under Vercel → Settings → Git.
A production build takes about 60–90 s. Env vars changed in Vercel only apply to the next deployment.

Vercel env vars on the project: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`NEXT_PUBLIC_APP_URL`, `SUPABASE_SERVICE_ROLE_KEY` (production, sensitive; currently unused by app code),
and placeholder `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` / `RESEND_API_KEY` that switch on mock mode.
Never write real keys into the repo or into chat; the user adds secrets in the Vercel/Supabase dashboards.

## Walkthrough: what happens end to end
1. **Sign up / log in** — `app/(auth)/signup` and `login` use Supabase email + password (`lib/supabase/client.ts`).
   Email confirmation is required. Google/GitHub sign-in was REMOVED on purpose (and is disabled in Supabase).
   Signing up with an already-confirmed email sends no email (Supabase hides account existence).
   The "Forgot password?" link on the login page is a dead `href="#"` — there is no reset flow yet.
2. **Auth guard** — `proxy.ts` (Next 16 name for middleware) redirects unauthenticated visitors from
   `/dashboard/*` to `/login`. `/deploy/*` pages and all `/api/*` routes also call `supabase.auth.getUser()`.
3. **Dashboard** — `app/dashboard/page.tsx` lists the user's sites (`components/project-card.tsx`);
   `app/dashboard/projects/[id]/page.tsx` shows one site, domain tools and delete (`danger-zone.tsx`).
4. **New site** — `app/dashboard/new/page.tsx`: textarea ("Website code") on the left, `components/site-preview.tsx`
   on the right, site-name input, "Deploy now →" button. The preview renders the pasted code via `srcDoc` in an
   `<iframe sandbox="allow-scripts allow-forms allow-popups allow-modals">` (no `allow-same-origin`), debounced 300 ms,
   with empty / over-2 MB / "doesn't look like HTML" states. It never loads external pages.
5. **Ingest** — the page POSTs `{ html, project_name }` to `app/api/ingest/html/route.ts`: requires login, rate limit
   (10/hour), 2 MB cap, 20-site cap, creates a `projects` row (`source_type='html'`, `status='building'`, unique
   `subdomain`), stores the HTML as `index.html` in Supabase Storage bucket `deployments` at
   `{user_id}/{project_id}/index.html`, and returns `{ project_id, subdomain }`. If `lib/formcheck.ts` detects a
   backend-wired form it also returns `warning: "BACKEND_FORM"`; the UI shows an amber "Deploy anyway" box.
6. **Deploy** — the client fires `POST /api/deploy` (not awaited) and navigates to `/deploy/[project_id]`.
   `app/api/deploy/route.ts` pulls the files back from storage (`lib/fsbuild.ts`), runs `lib/builder.ts`
   (a lone `index.html` is treated as pre-built static), creates/reuses a Cloudflare project and "deploys"
   (`lib/cloudflare.ts`). In mock mode the live URL is `${NEXT_PUBLIC_APP_URL}/s/${subdomain}` instead of Cloudflare's.
7. **Progress** — `components/deploy/DeployProgress.tsx` polls `GET /api/projects/[id]/status` every 3 s and shows
   7 stages plus a build-log panel. On `live` it shows the URL, "Visit site", and the domain picker.
8. **Published site** — `app/s/[subdomain]/route.ts` is public. It calls the SQL function `get_site_path()` (anon-callable,
   `SECURITY DEFINER`, returns `user_id/project_id` only for `status='live'` projects), downloads `index.html` from the
   public bucket, and returns it with `Content-Security-Policy: sandbox allow-scripts allow-forms allow-popups allow-modals`.
   The sandbox gives user HTML an opaque origin so pasted scripts cannot read app cookies or call APIs as the visitor.
   Side effect: pages that use `localStorage`/cookies will not work.

## Stack
- Next.js 16 (App Router, Turbopack), React 18 (deprecated by Next 16 — upgrade to 19 is a sensible follow-up), TypeScript
- Tailwind CSS 3 + a small amount of shadcn/ui
- Supabase: auth, Postgres (RLS on every table), Storage
- Cloudflare Pages via Wrangler (only when real credentials are set), Resend (email, mocked), Sentry (no-op without DSN)
- Node ≥ 20.9 required (`engines.node` in package.json)

## Repo map
```
app/
  page.tsx, layout.tsx, error.tsx, not-found.tsx   marketing homepage + shell
  (auth)/login, signup, logout                     email+password auth pages / sign-out route
  auth/callback/route.ts                           email-confirmation code exchange
  dashboard/                                       site list, new-site wizard, project detail
  deploy/[project_id]/                             deploy progress page
  s/[subdomain]/route.ts                           PUBLIC published-site server (sandboxed)
  api/ingest/html/route.ts                         the only ingest route
  api/deploy/route.ts                              build + publish pipeline
  api/projects/[id]/(route|status)                 PATCH/DELETE project; status polling
  api/domains/(search|connect|status/[domain])     custom-domain tooling (needs real Cloudflare)
components/  site-preview, navbar, project-card, danger-zone, domain-section, domains/DomainPicker,
             deploy/DeployProgress, copy-url-button, word-cycle, ui/skeleton
lib/         api-auth (requireAuth), supabase/(client|server), builder, fsbuild, cloudflare, logger, ratelimit,
             subdomain, limits, formcheck, email, domains, domain-search, utils
proxy.ts                         auth guard for /dashboard
supabase/migrations/001..005     database + storage setup (run in order)
tests/                           Playwright specs (see Tests)
eslint.config.mjs                ESLint 9 flat config (replaces .eslintrc.json; `next lint` no longer exists)
```

## Database and migrations (run in order in the Supabase SQL editor, or via the Supabase MCP)
1. `001_initial_schema.sql` — profiles, projects, deployments, domain_searches, RLS, signup trigger `handle_new_user`
2. `002_logging_and_limits.sql` — build_logs, deployments.stage
3. `003_custom_domains.sql` — custom_domain_status/cname/added_at
4. `004_storage_setup.sql` — public bucket `deployments` + policy `allow_all_deployments`
5. `005_public_site_lookup.sql` — `get_site_path(text)` for the public `/s/[subdomain]` route

All five are applied to Supabase project `pokjylilmjvklpvmizvg`. A freshly restored Supabase project may need a few
minutes before `storage.buckets` exists; migration 004 fails until Storage has initialised.

## Commands
- dev: `npm run dev` (Next 16 allows only ONE dev server per folder; a second errors with "Another next dev server is already running")
- build: `npm run build`
- type-check: `npm run typecheck` (after deleting routes, stale `.next/types` cause errors: delete `.next/types` or rebuild)
- lint: `npm run lint` (`eslint .`)
- tests: `npm test` (`playwright test`; uses installed Chrome)
- If a dev server already owns port 3000, test against a production server: `npm run build` then `npx next start -p 3099`.

## Tests
| Spec | What it covers | Notes |
|------|----------------|-------|
| smoke.spec.ts | landing page renders, no console errors | browser |
| formcheck.spec.ts | `detectBackendForm` classification | node |
| builder.spec.ts | framework detection, real Vite build, SSR rejection | node, slow (npm install) |
| deploy-idempotency.spec.ts, redeploy.spec.ts | Cloudflare project not re-created on redeploy | node, mock Supabase |
| progress.spec.ts | `setStatus` updates projects/deployments/build_logs | node, mock Supabase |
| domains.spec.ts | domain connect validation | node |
| logger.spec.ts | build_logs round trip against real Supabase | skips on placeholder/unreachable Supabase |
| e2e-error.spec.ts | paste-HTML flow error states, failed-deploy UI | browser; skips without TEST_USER_EMAIL/PASSWORD |

Last full run: 47 passed, 6 skipped (auth-required E2E). The paste/preview UI and `/s/<site>` were verified manually in a
browser against real data; there is no automated test for them yet (the wizard sits behind login).

## Deploy pipeline — status values
`setStatus()` updates both `projects.status` and `deployments.stage`:
building → validating → uploading → provisioning → deploying → propagating → live (or failed, with the real error stored in
`deployments.build_log`). `GET /api/projects/[id]/status` returns `{ status, cloudflare_deploy_url, subdomain, stage, buildLogs }`
(last 20 `build_logs` rows). `lib/logger.ts` `logBuild()` inserts a row and never throws. The deploy route sets `maxDuration = 300`;
the host must allow ≥ 300 s. `BUILD_TIMEOUT_MS` overrides the 180 s per-step build timeout.

## Custom domains
Routes `api/domains/search|connect|status` and `components/domains/DomainPicker.tsx` exist but only do real work with a real Cloudflare
token. In mock mode they return placeholder data. The app never buys domains; users point a CNAME at their Pages hostname.

## History: what changed and why (so nobody "restores" removed things by accident)
- Exported from Lovable, then published to GitHub with an MIT license (commits use the GitHub noreply email).
- Dependencies: Next 14 → 16.4, ESLint 8 → 9 (flat config), `middleware.ts` → `proxy.ts`, async `params` everywhere,
  async cookie adapter in `lib/supabase/server.ts`, `adm-zip` removed. `npm audit --omit=dev` reports 0 vulnerabilities.
- REMOVED on purpose (user request): Google and GitHub sign-in; ZIP upload; GitHub-repo ingest; "paste a link" ingest
  (`/api/ingest/github|url|upload`, `lib/zip.ts`, their E2E specs). The only input is pasted HTML via `/api/ingest/html`.
  Do not re-add them without asking. (The old guardrail "never delete /api/ingest/url" is obsolete.)
- ADDED: live preview (`site-preview.tsx`), in-app hosting (`/s/[subdomain]` + migration 005), Vercel deployment, plain-English README.
- Bug found and fixed: "Visit site" opened `https://mock.pages.dev` because mock mode returned a hardcoded URL.
  Existing mock rows were backfilled to the `/s/<subdomain>` URL.

## Open risks / follow-ups (not done yet)
1. **Storage bucket is world-writable.** Policy `allow_all_deployments` (migration 004) lets anyone with the public anon key
   read, overwrite or delete any object in `deployments`, and published sites depend on that bucket. Fix: keep public SELECT,
   restrict INSERT/UPDATE/DELETE to `authenticated` users whose first path segment equals `auth.uid()`; then re-test a deploy.
2. No password-reset flow ("Forgot password?" is a dead link).
3. No automated test for the paste/preview wizard or `/s/<site>`.
4. Real Cloudflare publishing is off. Turning it on for a public app needs abuse controls (captcha on signup, lower site cap, approval/allowlist).
5. Vercel is not git-linked (manual redeploys). `SUPABASE_SERVICE_ROLE_KEY` on Vercel is unused and can be deleted.
6. Supabase email uses the built-in mailer (low hourly limit); add custom SMTP before real traffic.
7. React 18 is deprecated by Next 16; a stray `package-lock.json` in the parent folder triggers a Next warning locally only.

## Known recurring issues — do not regress
1. Supabase `deployments` bucket must exist and be PUBLIC (migration 004). A missing bucket shows as `UNKNOWN_FRAMEWORK` on every deploy.
   (If you tighten the policy, keep public read and re-test a full deploy.)
2. `lib/fsbuild.ts` base path must end with a trailing slash (`${userId}/${projectId}/`) or storage `list()` returns 0 files.
3. Real Cloudflare deploys use the Wrangler CLI (`npx wrangler pages deploy`); never go back to the raw multipart API (needs a SHA256 manifest).
4. Never set `Content-Type` manually on multipart `FormData` fetches.
5. In API routes always use `supabase.auth.getUser()`, never `getSession()` (it does not verify the JWT).
6. The `/s/[subdomain]` response must keep the CSP `sandbox` header: it serves user-controlled HTML on the app's own origin.

## Guardrails — never do these
- Commit `.env` / `.env.local`, or put real keys in code, docs or chat.
- Edit shadcn component internals directly.
- Deploy the app itself to Cloudflare Pages/Workers (it needs Node.js: child_process and filesystem access).
- Exceed `MAX_PROJECTS_PER_USER = 20` (`lib/limits.ts`, enforced in the ingest route).
- Remove the iframe `sandbox` on the preview, or add `allow-same-origin` to it or to the `/s/` CSP.
- Re-introduce OAuth sign-in or ZIP/GitHub/URL ingest, or publish to a real Cloudflare account, without being asked.
