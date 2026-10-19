/**
 * Integration smoke-test for the build_logs table and logBuild logic.
 *
 * Requires:
 *   - 002_logging_and_limits.sql migration applied to Supabase
 *   - NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 *
 * Run: npx playwright test tests/logger.spec.ts
 * (playwright.config.ts loads .env.local before tests execute)
 */

import { test, expect } from "@playwright/test";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

function supabaseHeaders() {
  return {
    "Content-Type": "application/json",
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    Prefer: "return=representation",
  };
}

test.describe("build_logs table", () => {
  test.skip(
    !SUPABASE_URL ||
      !SERVICE_KEY ||
      SUPABASE_URL.includes("your-project") ||
      SERVICE_KEY.startsWith("your_"),
    "NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set (or still a placeholder) — skipping"
  );

  let projectId: string | null = null;
  let insertedLogId: string | null = null;
  // Set to true if migration 002 is confirmed applied; tests skip if false.
  let migrationApplied = true;

  test.beforeAll(async () => {
    // Check whether migration 002 (build_logs table) has been applied.
    // The table may not exist when running against a fresh local Supabase instance.
    let probe: Response;
    try {
      probe = await fetch(`${SUPABASE_URL}/rest/v1/build_logs?limit=0`, {
        headers: supabaseHeaders(),
      });
    } catch {
      // Supabase project unreachable (deleted, paused, or offline)
      migrationApplied = false;
      return;
    }
    if (probe.status === 404) {
      migrationApplied = false;
      return; // skip remaining setup
    }

    // Find a real project_id to satisfy the FK constraint
    const res = await fetch(`${SUPABASE_URL}/rest/v1/projects?select=id&limit=1`, {
      headers: supabaseHeaders(),
    });
    const rows = (await res.json()) as { id: string }[];
    projectId = rows[0]?.id ?? null;
  });

  test.afterAll(async () => {
    // Clean up the inserted test row
    if (insertedLogId) {
      await fetch(
        `${SUPABASE_URL}/rest/v1/build_logs?id=eq.${insertedLogId}`,
        { method: "DELETE", headers: supabaseHeaders() }
      );
    }
  });

  test("inserts a build_logs row and reads it back with correct fields", async () => {
    // Skip if migration 002 has not been applied to the local Supabase instance
    if (!migrationApplied) {
      test.skip(true, "migration 002 (build_logs table) not applied — run supabase/migrations/002_logging_and_limits.sql");
      return;
    }
    if (!projectId) {
      test.skip(true, "No project rows in DB — run an ingest first");
      return;
    }

    const testMessage = `logger-integration-test-${Date.now()}`;

    // Insert — mirrors what logBuild() does
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/build_logs`, {
      method: "POST",
      headers: supabaseHeaders(),
      body: JSON.stringify({
        project_id: projectId,
        stage: "validating",
        level: "info",
        message: testMessage,
      }),
    });

    expect(insertRes.status, `insert failed: ${await insertRes.text()}`).toBe(201);
    const [inserted] = (await insertRes.json()) as {
      id: string;
      project_id: string;
      deployment_id: string | null;
      stage: string;
      level: string;
      message: string;
      created_at: string;
    }[];

    insertedLogId = inserted.id;

    expect(inserted.project_id).toBe(projectId);
    expect(inserted.stage).toBe("validating");
    expect(inserted.level).toBe("info");
    expect(inserted.message).toBe(testMessage);
    expect(inserted.deployment_id).toBeNull();
    expect(inserted.created_at).toBeTruthy();

    // Read back by ID
    const selectRes = await fetch(
      `${SUPABASE_URL}/rest/v1/build_logs?id=eq.${inserted.id}&select=*`,
      { headers: supabaseHeaders() }
    );
    expect(selectRes.status).toBe(200);
    const [fetched] = (await selectRes.json()) as typeof inserted[];

    expect(fetched.id).toBe(inserted.id);
    expect(fetched.stage).toBe("validating");
    expect(fetched.message).toBe(testMessage);
  });

  test("default level is info when omitted", async () => {
    if (!migrationApplied) {
      test.skip(true, "migration 002 (build_logs table) not applied — run supabase/migrations/002_logging_and_limits.sql");
      return;
    }
    if (!projectId) {
      test.skip(true, "No project rows in DB");
      return;
    }

    const res = await fetch(`${SUPABASE_URL}/rest/v1/build_logs`, {
      method: "POST",
      headers: supabaseHeaders(),
      body: JSON.stringify({
        project_id: projectId,
        stage: "deploying",
        message: `default-level-test-${Date.now()}`,
      }),
    });

    expect(res.status).toBe(201);
    const [row] = (await res.json()) as { id: string; level: string }[];
    expect(row.level).toBe("info");

    // Cleanup
    await fetch(`${SUPABASE_URL}/rest/v1/build_logs?id=eq.${row.id}`, {
      method: "DELETE",
      headers: supabaseHeaders(),
    });
  });
});
