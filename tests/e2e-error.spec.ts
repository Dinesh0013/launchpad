/**
 * E2E tests for error states and recovery flows.
 * Uses Playwright route interception — no real Cloudflare calls.
 *
 * All tests require auth (deploy and dashboard layouts call getUser()).
 * Set in .env.local:  TEST_USER_EMAIL=...  TEST_USER_PASSWORD=...
 * Tests are skipped (not failed) when credentials are absent.
 */
import { test, expect } from "@playwright/test";
import { authenticateUser, mockStatusFailed } from "./helpers/mock-deploy";

const FAIL_PROJECT_ID = "test-fail-001";

// ── T1: SSR_UNSUPPORTED error displayed inline ────────────────────────────────

test("T1 — SSR_UNSUPPORTED error shown inline on new project page", async ({
  page,
  context,
}) => {
  const ok = await authenticateUser(context);
  if (!ok) {
    test.skip(true, "Auth required: set TEST_USER_EMAIL and TEST_USER_PASSWORD in .env.local");
    return;
  }

  await page.route(/\/api\/ingest\/upload/, async (route) => {
    await route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({
        error: "This app needs a server; static hosting coming soon",
        code: "SSR_UNSUPPORTED",
      }),
    });
  });

  await page.goto("/dashboard/new");
  await page.getByText("Upload ZIP").click();

  await page.locator('input[type="file"]').setInputFiles({
    name: "test-app.zip",
    mimeType: "application/zip",
    buffer: Buffer.from("PK\x05\x06" + "\x00".repeat(18)),
  });

  await expect(
    page.getByRole("button", { name: /deploy now/i }),
  ).toBeEnabled({ timeout: 5_000 });
  await page.getByRole("button", { name: /deploy now/i }).click();

  await expect(page.getByText(/needs a server/i)).toBeVisible({
    timeout: 10_000,
  });
  expect(page.url()).toContain("/dashboard/new");
});

// ── T2: Deploy failure shown in progress page ─────────────────────────────────

test("T2 — Deploy failure: failed state, error in log panel, Try again button", async ({
  page,
  context,
}) => {
  test.setTimeout(30_000);
  const ok = await authenticateUser(context);
  if (!ok) {
    test.skip(true, "Auth required: set TEST_USER_EMAIL and TEST_USER_PASSWORD in .env.local");
    return;
  }

  const failedResponse = mockStatusFailed(
    "building",
    "Build failed: vite not found",
  );

  await page.route(
    /\/api\/projects\/test-fail-001\/status/,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(failedResponse),
      });
    },
  );

  await page.goto(`/deploy/${FAIL_PROJECT_ID}`);

  // Failed stage should turn red (XCircle icon color class)
  await expect(page.locator(".text-red-500").first()).toBeVisible({
    timeout: 10_000,
  });

  // Error message visible in build log panel
  await expect(page.getByText(/vite not found/i)).toBeVisible({
    timeout: 10_000,
  });

  await expect(
    page.getByRole("button", { name: /try again/i }),
  ).toBeVisible();
});

// ── T3: Try again routes back to new project page ─────────────────────────────

test("T3 — Try again button routes to /dashboard/new", async ({
  page,
  context,
}) => {
  test.setTimeout(30_000);
  const ok = await authenticateUser(context);
  if (!ok) {
    test.skip(true, "Auth required: set TEST_USER_EMAIL and TEST_USER_PASSWORD in .env.local");
    return;
  }

  const failedResponse = mockStatusFailed("building", "Build failed: out of memory");

  await page.route(
    /\/api\/projects\/test-fail-001\/status/,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(failedResponse),
      });
    },
  );

  await page.goto(`/deploy/${FAIL_PROJECT_ID}`);

  await expect(
    page.getByRole("button", { name: /try again/i }),
  ).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: /try again/i }).click();

  await page.waitForURL("**/dashboard/new", { timeout: 15_000 });
  expect(page.url()).toContain("/dashboard/new");
});

// ── T4: Project limit error ───────────────────────────────────────────────────

test("T4 — Project limit error shown inline on new project page", async ({
  page,
  context,
}) => {
  const ok = await authenticateUser(context);
  if (!ok) {
    test.skip(true, "Auth required: set TEST_USER_EMAIL and TEST_USER_PASSWORD in .env.local");
    return;
  }

  await page.route(/\/api\/ingest\/upload/, async (route) => {
    await route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({
        error: "Project limit reached (max 20)",
        code: "PROJECT_LIMIT",
      }),
    });
  });

  await page.goto("/dashboard/new");
  await page.getByText("Upload ZIP").click();

  await page.locator('input[type="file"]').setInputFiles({
    name: "test-app.zip",
    mimeType: "application/zip",
    buffer: Buffer.from("PK\x05\x06" + "\x00".repeat(18)),
  });

  await expect(
    page.getByRole("button", { name: /deploy now/i }),
  ).toBeEnabled({ timeout: 5_000 });
  await page.getByRole("button", { name: /deploy now/i }).click();

  await expect(page.getByText(/limit/i)).toBeVisible({ timeout: 10_000 });
  expect(page.url()).toContain("/dashboard/new");
});
