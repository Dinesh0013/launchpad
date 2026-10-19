/**
 * Pure data helpers for E2E tests.
 * No network calls, no side effects (except authenticateUser which calls Supabase).
 */
import type { BrowserContext } from "@playwright/test";

// ── Response shape types ──────────────────────────────────────────────────────

export interface IngestResponse {
  project_id: string;
  subdomain: string;
  warning?: string;
  message?: string;
}

export interface BuildLogEntry {
  stage: string;
  level: string;
  message: string;
  created_at: string;
}

export interface StatusResponse {
  status: string;
  stage: string | null;
  cloudflare_deploy_url: string | null;
  subdomain: string;
  buildLogs: BuildLogEntry[];
}

// ── Ingest response mock ──────────────────────────────────────────────────────

export function mockIngestResponse({
  projectId,
  warning,
  warningMessage,
}: {
  projectId: string;
  warning?: string;
  warningMessage?: string;
}): IngestResponse {
  return {
    project_id: projectId,
    subdomain: `${projectId}-preview`,
    ...(warning ? { warning, message: warningMessage } : {}),
  };
}

// ── Status sequence mock ──────────────────────────────────────────────────────
// Returns an array of responses cycling through stages, ending with 'live'.
// Tests use a call counter to advance one response per poll.

export function mockStatusSequence(stages: string[]): StatusResponse[] {
  const all = [...stages];
  if (all[all.length - 1] !== "live") all.push("live");

  return all.map((stage, i) => ({
    status: stage === "live" ? "live" : stage,
    stage,
    cloudflare_deploy_url: stage === "live" ? "https://test-project.pages.dev" : null,
    subdomain: "test-project",
    buildLogs: all.slice(0, i + 1).map((s) => ({
      stage: s,
      level: "info",
      message: `${s.charAt(0).toUpperCase() + s.slice(1)} completed`,
      created_at: new Date().toISOString(),
    })),
  }));
}

// ── Failed status mock ────────────────────────────────────────────────────────

export function mockStatusFailed(
  atStage: string,
  errorMessage: string,
): StatusResponse {
  return {
    status: "failed",
    stage: atStage,
    cloudflare_deploy_url: null,
    subdomain: "test-project",
    buildLogs: [
      {
        stage: atStage,
        level: "error",
        message: errorMessage,
        created_at: new Date().toISOString(),
      },
    ],
  };
}

// ── Auth helper ───────────────────────────────────────────────────────────────
// Both the dashboard and deploy layouts call supabase.auth.getUser() (server-side
// JWT validation against the real Supabase API). A fake cookie bypasses the
// middleware's getSession() check but NOT the layout's getUser() check.
//
// To enable auth-gated E2E tests, set in .env.local:
//   TEST_USER_EMAIL=test@example.com
//   TEST_USER_PASSWORD=your-test-password
//
// authenticateUser() calls the real Supabase password auth API to get a valid
// session. Returns false (and tests should call test.skip()) when credentials
// are absent or the Supabase URL is a placeholder.
//
// Skipped tests do not fail the suite — they are clearly documented as
// requiring credentials.

export async function authenticateUser(
  context: BrowserContext,
): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const email = process.env.TEST_USER_EMAIL ?? "";
  const password = process.env.TEST_USER_PASSWORD ?? "";

  if (!supabaseUrl || !anonKey || !email || !password) return false;
  if (supabaseUrl.includes("placeholder") || supabaseUrl.includes("your-project")) return false;

  try {
    const res = await fetch(
      `${supabaseUrl}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey,
        },
        body: JSON.stringify({ email, password }),
      },
    );

    if (!res.ok) return false;

    const session = await res.json() as Record<string, unknown>;
    if (!session.access_token) return false;

    // Set the real session as a cookie using @supabase/ssr's base64url format
    const projectRef = supabaseUrl.replace(/^https?:\/\//, "").split(".")[0];
    const cookieName = `sb-${projectRef}-auth-token`;
    const b64 = Buffer.from(JSON.stringify(session))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");

    await context.addCookies([
      { name: cookieName, value: `base64-${b64}`, url: "http://localhost:3099" },
    ]);

    return true;
  } catch {
    return false;
  }
}
