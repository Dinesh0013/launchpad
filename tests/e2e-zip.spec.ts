/**
 * E2E tests for the ZIP upload ingest path.
 * Uses Playwright route interception — no real Cloudflare calls.
 *
 * T1–T3: navigate to /dashboard/new (auth-required layout). These tests call
 * authenticateUser() which uses real Supabase credentials. Set in .env.local:
 *   TEST_USER_EMAIL=...  TEST_USER_PASSWORD=...
 * If not set, these tests are skipped (not failed).
 *
 * T4–T6: navigate to /deploy/[id] (also auth-required). Same skip behaviour.
 */
import { test, expect } from "@playwright/test";
import path from "path";
import os from "os";
import AdmZip from "adm-zip";
import fs from "fs";
import {
  authenticateUser,
  mockIngestResponse,
  mockStatusSequence,
} from "./helpers/mock-deploy";

const PROJECT_ID = "test-zip-001";
const FIXTURES = path.join(__dirname, "fixtures");

let testZipPath: string;

test.beforeAll(async () => {
  const zip = new AdmZip();
  zip.addLocalFolder(path.join(FIXTURES, "vite-app"));
  testZipPath = path.join(os.tmpdir(), `launchpad-e2e-${Date.now()}.zip`);
  zip.writeZip(testZipPath);
});

test.afterAll(async () => {
  if (testZipPath) fs.promises.unlink(testZipPath).catch(() => {});
});

// ── T1: ZIP tab visible ───────────────────────────────────────────────────────

test("T1 — Upload ZIP tab is present on /dashboard/new", async ({
  page,
  context,
}) => {
  const ok = await authenticateUser(context);
  if (!ok) {
    test.skip(true, "Auth required: set TEST_USER_EMAIL and TEST_USER_PASSWORD in .env.local");
    return;
  }
  await page.goto("/dashboard/new");
  await expect(page.getByText("Upload ZIP")).toBeVisible({ timeout: 10_000 });
});

// ── T2: File input present ────────────────────────────────────────────────────

test("T2 — ZIP tab: file input with accept=.zip is present", async ({
  page,
  context,
}) => {
  const ok = await authenticateUser(context);
  if (!ok) {
    test.skip(true, "Auth required: set TEST_USER_EMAIL and TEST_USER_PASSWORD in .env.local");
    return;
  }
  await page.goto("/dashboard/new");
  await page.getByText("Upload ZIP").click();

  const fileInput = page.locator('input[type="file"]');
  await expect(fileInput).toBeAttached({ timeout: 10_000 });
  const accept = await fileInput.getAttribute("accept");
  expect(accept).toMatch(/\.zip/);
});

// ── T3: Upload flow ───────────────────────────────────────────────────────────

test("T3 — Attach ZIP and navigate to deploy page", async ({
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
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockIngestResponse({ projectId: PROJECT_ID })),
    });
  });
  await page.route(/\/api\/deploy$/, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.route(/\/api\/projects\/test-zip-001\/status/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockStatusSequence(["validating"])[0]),
    });
  });

  await page.goto("/dashboard/new");
  await page.getByText("Upload ZIP").click();

  await page.locator('input[type="file"]').setInputFiles(testZipPath);
  await expect(
    page.getByRole("button", { name: /deploy now/i }),
  ).toBeEnabled({ timeout: 5_000 });
  await page.getByRole("button", { name: /deploy now/i }).click();

  await page.waitForURL(`**/deploy/${PROJECT_ID}`, { timeout: 15_000 });
  expect(page.url()).toContain(`/deploy/${PROJECT_ID}`);
});

// ── T4: Progress stages activate ─────────────────────────────────────────────

test("T4 — Progress stages activate as status sequence advances", async ({
  page,
  context,
}) => {
  test.setTimeout(60_000);
  const ok = await authenticateUser(context);
  if (!ok) {
    test.skip(true, "Auth required: set TEST_USER_EMAIL and TEST_USER_PASSWORD in .env.local");
    return;
  }

  const responses = mockStatusSequence([
    "validating",
    "building",
    "uploading",
    "provisioning",
    "deploying",
    "propagating",
  ]);
  let callIndex = 0;

  await page.route(/\/api\/projects\/test-zip-001\/status/, async (route) => {
    const idx = Math.min(callIndex++, responses.length - 1);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(responses[idx]),
    });
  });

  await page.goto(`/deploy/${PROJECT_ID}`);

  // After the first poll (3s), at least one stage should be active (blue highlight)
  await expect(
    page.locator('[class*="border-blue-500"]').first(),
  ).toBeVisible({ timeout: 10_000 });

  // After all stages cycle through, success card appears
  await expect(page.getByText(/your site is live/i)).toBeVisible({
    timeout: 40_000,
  });
});

// ── T5: Success state ─────────────────────────────────────────────────────────

test("T5 — Success card with live URL and Visit site button", async ({
  page,
  context,
}) => {
  test.setTimeout(30_000);
  const ok = await authenticateUser(context);
  if (!ok) {
    test.skip(true, "Auth required: set TEST_USER_EMAIL and TEST_USER_PASSWORD in .env.local");
    return;
  }

  const responses = mockStatusSequence(["validating"]);
  let callIndex = 0;

  await page.route(/\/api\/projects\/test-zip-001\/status/, async (route) => {
    const idx = Math.min(callIndex++, responses.length - 1);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(responses[idx]),
    });
  });

  await page.goto(`/deploy/${PROJECT_ID}`);

  await expect(page.getByText(/your site is live/i)).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page.getByRole("link", { name: /visit site/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /go to dashboard/i }),
  ).toBeVisible();
});

// ── T6: Build log panel ───────────────────────────────────────────────────────

test("T6 — Build log panel is visible and shows log lines", async ({
  page,
  context,
}) => {
  test.setTimeout(30_000);
  const ok = await authenticateUser(context);
  if (!ok) {
    test.skip(true, "Auth required: set TEST_USER_EMAIL and TEST_USER_PASSWORD in .env.local");
    return;
  }

  const responses = mockStatusSequence(["validating", "building"]);
  let callIndex = 0;

  await page.route(/\/api\/projects\/test-zip-001\/status/, async (route) => {
    const idx = Math.min(callIndex++, responses.length - 1);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(responses[idx]),
    });
  });

  await page.goto(`/deploy/${PROJECT_ID}`);

  // Log panel header is visible while deploy is in progress
  await expect(page.getByText("Build logs")).toBeVisible({ timeout: 10_000 });

  // After first poll, real log entries replace the placeholder
  await expect(page.locator(".bg-zinc-950")).toContainText("validating", {
    timeout: 10_000,
  });
});
