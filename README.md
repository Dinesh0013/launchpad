# LaunchPad

**Turn a web page into a real website link in under a minute. No coding tools and no hosting accounts needed.**

### 👉 Try it here: https://launchpad-dinesh0013.vercel.app

---

## What does it do?

You have a web page, which is just a bit of HTML code. Maybe you wrote it, or an AI tool like ChatGPT or Claude made it for you, or you adapted a template.

Normally, to put that page on the internet you'd need to rent hosting and learn how to upload files. LaunchPad skips all that. **You paste your code into a box, press a button, and get a link that anyone in the world can open.** That's it.

## How to use it

1. Open **https://launchpad-dinesh0013.vercel.app** and click **Sign up**.
2. Enter your email and a password (at least 8 characters). You'll get an email. Click the link inside to confirm. If you don't see it, check your spam folder.
3. Log in and click **Deploy new site**.
4. **Paste your page's HTML code** into the box on the left. A live preview of your page appears on the right as you type, so you can check it looks right.
5. Give your site a name and click **Deploy now**.
6. Wait a few seconds, then click **Visit site**. Copy that address and share it with anyone.

Your site's address will look like `https://launchpad-dinesh0013.vercel.app/s/your-site-name`.

## Good to know

- **One page at a time.** Paste a single HTML page. Put your styling and scripts inside it (inside `<style>` and `<script>` tags). You can't upload separate files such as images, so link to images using their web address (`https://...`).
- **Size limit:** up to 2 MB of code per site.
- **Up to 20 sites** per account.
- **Contact forms:** a form that needs a server behind it won't send messages by itself. LaunchPad will warn you if it spots one.
- **Your page runs in a protected box.** It can't see anyone's account or data. Because of that, some things that rely on the browser remembering data (like saved logins) may not work.
- This is a free hobby project, so there are no guarantees about uptime. Don't put anything private on a published page, because anyone with the link can see it.

---

## For developers

Everything below is technical setup for people who want to run their own copy of LaunchPad.

It is built with Next.js, Supabase (login, database, file storage) and Vercel. Published sites are served by the app itself at `/s/<site>`, inside a sandbox. Cloudflare Pages publishing is optional (see Mock mode below).

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
5. `005_public_site_lookup.sql` — lets published sites be served at `/s/<site>`

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
| Cloudflare Pages | `your_cloudflare_api_token` | Sites are served by the app itself at `/s/<site>` (sandboxed) instead of Cloudflare |
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
      html/route.ts           # POST — pasted HTML ingest
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

## Deploy to Vercel

GitHub Pages cannot host this app (it needs a Node.js server for auth, API routes and builds). Use Vercel, Railway or Fly.io instead.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FDinesh0013%2Flaunchpad&env=NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY,NEXT_PUBLIC_APP_URL&envDescription=Supabase%20keys%20and%20your%20public%20app%20URL&envLink=https%3A%2F%2Fgithub.com%2FDinesh0013%2Flaunchpad%23getting-api-keys&project-name=launchpad)

1. Create a Supabase project and run the five migrations (see **SQL migrations**).
2. Click the button, sign in to Vercel, and fill in the environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_APP_URL` — your Vercel URL, e.g. `https://launchpad.vercel.app`
   - Optional: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `RESEND_API_KEY`. Without real Cloudflare keys, published sites are served by the app itself at `/s/<site>`.
3. In Supabase → **Authentication → URL Configuration**, set Site URL to your Vercel URL and add `<your-url>/auth/callback` to Redirect URLs.

Note: the deploy route allows up to 300s per request. Check that your Vercel plan supports that duration.

---

## Security notes

- Never commit `.env.local`; it is gitignored. Rotate any key that has ever been exposed.
- `npm audit --omit=dev` reports 0 vulnerabilities. Remaining dev-only advisories come from Tailwind 3 build tooling.
- Requires Node.js 20.9 or newer (Next.js 16). React 18 still works but is deprecated by Next 16; moving to React 19 is a sensible follow-up.

## License

[MIT](LICENSE)
