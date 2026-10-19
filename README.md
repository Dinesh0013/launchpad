# LaunchPad

LaunchPad lets you deploy websites in under 30 seconds — drop a ZIP, paste a Lovable/Bolt/v0 link, or connect a GitHub repo, and get a live HTTPS URL instantly. It handles building, deploying to Cloudflare Pages, custom domains, and email notifications with no technical setup required.

---

## Local setup

### 1. Install dependencies

```bash
npm install
```

### 2. Set up Supabase

1. Create a free project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and paste the contents of `supabase/migrations/001_initial_schema.sql`
3. Click **Run** — this creates all tables, RLS policies, and the user trigger

### 3. Configure environment variables

Create `.env.local` in the project root:

```bash
# Supabase — from Project Settings → API
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Resend — from resend.com/api-keys
RESEND_API_KEY=re_...

# Cloudflare — from dash.cloudflare.com/profile/api-tokens
CLOUDFLARE_API_TOKEN=your_cloudflare_token
CLOUDFLARE_ACCOUNT_ID=your_account_id
# These same Cloudflare credentials also power domain search
# No separate domain API key needed

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 4. Run the development server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000).

---

## SQL migrations

Open your Supabase project → **SQL Editor** and run the files in `supabase/migrations/` **in order**:

1. `001_initial_schema.sql` — tables, row-level security, signup trigger
2. `002_logging_and_limits.sql` — build logs and per-user project limits
3. `003_custom_domains.sql` — custom domain support
4. `004_storage_setup.sql` — the `deployments` storage bucket

Core tables: `profiles`, `projects`, `deployments`, `domain_searches`. Every table has row-level security so users only see their own data.

---

## Tests and checks

```bash
npm run typecheck   # tsc --noEmit
npm run lint
npm test            # Playwright (uses Chrome; browser E2E specs skip without TEST_USER_EMAIL / TEST_USER_PASSWORD in .env.local)
```

---

## Getting API keys

### Supabase
1. [supabase.com](https://supabase.com) → create a project
2. **Project Settings → API** → copy `URL`, `anon key`, and `service_role key`
3. **Authentication → URL Configuration** → set Site URL to `http://localhost:3000` and add `http://localhost:3000/auth/callback` to Redirect URLs

### Cloudflare Pages
1. [dash.cloudflare.com](https://dash.cloudflare.com) → **My Profile → API Tokens**
2. Create a token with **Cloudflare Pages: Edit** permission scoped to your account
3. Copy your **Account ID** from the sidebar on the main dashboard

### Resend
1. [resend.com](https://resend.com) → **API Keys** → create a key
2. Add and verify your sending domain, or use sandbox mode for local testing
3. Update `FROM` in `lib/email.ts` to match your verified domain

---

## Domain Search Setup

Domain availability search uses the Cloudflare Registrar API — the same token you already configured for deployments. No additional setup required. Users can search for domains and are directed to Cloudflare Registrar to purchase, where pricing is at wholesale cost with no markup.

---

## Mock mode

**All external APIs (Cloudflare Pages deployment AND domain search) run in mock mode when placeholder env vars are present. You can test the full flow — including domain search results — without any real API keys.**

| Service | Placeholder value | Mock behaviour |
|---|---|---|
| Cloudflare Pages | `your_cloudflare_api_token` | Returns `https://mock.pages.dev` after a 2s delay |
| Cloudflare Registrar | `your_cloudflare_api_token` | Returns `.io` / `.co` / `.app` as available with prices |
| Resend | `your_resend_api_key` | Email send is skipped silently (no error) |
| Supabase | `your_supabase_project_url` | Auth redirects to `/login`; API routes return 401 |

To test the complete deploy flow end-to-end, only a **real Supabase project** is required. Cloudflare and Resend can stay as placeholders during local development.

---

## Project structure

```
app/
  page.tsx                    # Marketing homepage
  not-found.tsx               # 404 page
  error.tsx                   # Global error boundary
  dashboard/
    layout.tsx                # Dashboard shell with navbar
    page.tsx                  # Projects grid + empty state
    loading.tsx               # Skeleton loading state
    new/page.tsx              # 4-step deploy wizard
    projects/[id]/page.tsx    # Project detail + domain management
  api/
    deploy/route.ts           # POST — trigger Cloudflare deployment
    ingest/
      upload/route.ts         # POST — ZIP / HTML file upload
      url/route.ts            # POST — URL / Lovable / Bolt ingest
      github/route.ts         # POST — GitHub repo ingest
    domains/
      search/route.ts         # GET  — domain availability search
      connect/route.ts        # POST — connect custom domain
    projects/[id]/
      route.ts                # PATCH (update) / DELETE
      status/route.ts         # GET  — poll deployment status
components/
  navbar.tsx                  # Dashboard navbar (client)
  project-card.tsx            # Site card with three-dot menu
  domain-section.tsx          # Domain search + connect UI
  danger-zone.tsx             # Delete site with confirmation
  word-cycle.tsx              # Animated hero word cycling
  copy-url-button.tsx         # Clipboard copy button
  ui/skeleton.tsx             # Skeleton loading component
lib/
  cloudflare.ts               # Cloudflare Pages API + mock mode
  domains.ts                  # Cloudflare Registrar API — domain availability and pricing (same API token as deployment, no markup pricing)
  email.ts                    # Resend transactional emails
  ratelimit.ts                # In-memory LRU sliding window rate limiter
  subdomain.ts                # URL-safe slug generation + uniqueness
  api-auth.ts                 # Shared auth helper for API routes
supabase/
  migrations/
    001_initial_schema.sql    # Full DB schema — run once in Supabase SQL Editor
```

---

## Security notes

- Never commit `.env.local`; it is gitignored. Rotate any key that has ever been exposed.
- Known: `npm audit` still reports an advisory against Next.js 14.x that is only fixed by upgrading to Next 16. Plan that upgrade before running this in production.

## License

[MIT](LICENSE)
