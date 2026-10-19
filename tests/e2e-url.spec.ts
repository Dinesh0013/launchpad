/**
 * E2E tests for the "Paste a link" URL ingest path.
 * Uses Playwright route interception — no real Cloudflare calls.
 *
 * All tests require auth (deploy and dashboard layouts call getUser()).
 * Set in .env.local:  TEST_USER_EMAIL=...  TEST_USER_PASSWORD=...
 * Tests are skipped (not failed) when credentials are absent.
 */
import { test, expect } from "@playwright/test";
import {
  authenticateUser,
  mockIngestResponse,
  mockStatusSequence,
} from "./helpers/mock-deploy";

const PROJECT_CLEAN = "test-url-001";
const PROJECT_WARN = "test-url-002";
const TEST_URL = "https://myapp.lovable.app";

// ── T1: Paste a link tab visible ──────────────────────────────────────────────

test("T1 — Paste a link tab is present on /dashboard/new", async ({
  page,
  context,
}) => {
  const ok = await authenticateUser(context);
  if (!ok) {
    test.skip(true, "Auth required: set TEST_USER_EMAIL and TEST_USER_PASSWORD in .env.local");
    return;
  }
  await page.goto("/dashboard/new");
  await expect(page.getByText("Paste a link")).toBeVisible({ timeout: 10_000 });
});

// ── T2: URL input present ─────────────────────────────────────────────────────

test("T2 — Paste a link tab: URL text input with placeholder", async ({
  page,
  context,
}) => {
  const ok = await authenticateUser(context);
  if (!ok) {
    test.skip(true, "Auth required: set TEST_USER_EMAIL and TEST_USER_PASSWORD in .env.local");
    return;
  }
  await page.goto("/dashboard/new");
  await page.getByText("Paste a link").click();

  const urlInput = page.locator('input[type="url"]');
  await expect(urlInput).toBeVisible({ timeout: 10_000 });
  const placeholder = await urlInput.getAttribute("placeholder");
  expect(placeholder).toBeTruthy();
  expect(placeholder!.toLowerCase()).toMatch(/lovable|bolt|v0|url/i);
});

// ── T3: Clean submit navigates to deploy page ─────────────────────────────────

test("T3 — Clean URL submit: navigate to deploy page", async ({
  page,
  context,
}) => {
  const ok = await authenticateUser(context);
  if (!ok) {
    test.skip(true, "Auth required: set TEST_USER_EMAIL and TEST_USER_PASSWORD in .env.local");
    return;
  }

  await page.route(/\/api\/ingest\/url/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockIngestResponse({ projectId: PROJECT_CLEAN })),
    });
  });
  await page.route(/\/api\/deploy$/, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.route(/\/api\/projects\/test-url-001\/status/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockStatusSequence(["validating"])[0]),
    });
  });

  await page.goto("/dashboard/new");
  await page.getByText("Paste a link").click();

  await page.locator('input[type="url"]').fill(TEST_URL);
  await expect(
    page.getByRole("button", { name: /deploy now/i }),
  ).toBeEnabled({ timeout: 5_000 });
  await page.getByRole("button", { name: /deploy now/i }).click();

  await page.waitForURL(`**/deploy/${PROJECT_CLEAN}`, { timeout: 15_000 });
  expect(page.url()).toContain(`/deploy/${PROJECT_CLEAN}`);
});

// ── T4: BACKEND_FORM warning shown before navigation ─────────────────────────

test("T4 — BACKEND_FORM warning: amber box visible before navigating", async ({
  page,
  context,
}) => {
  const ok = await authenticateUser(context);
  if (!ok) {
    test.skip(true, "Auth required: set TEST_USER_EMAIL and TEST_USER_PASSWORD in .env.local");
    return;
  }

  await page.route(/\/api\/ingest\/url/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        mockIngestResponse({
          projectId: PROJECT_WARN,
          warning: "BACKEND_FORM",
          warningMessage: "Your booking form needs a backend connection",
        }),
      ),
    });
  });

  await page.goto("/dashboard/new");
  await page.getByText("Paste a link").click();

  await page.locator('input[type="url"]').fill(TEST_URL);
  await page.getByRole("button", { name: /deploy now/i }).click();

  // Amber warning box should appear BEFORE navigating away
  await expect(page.getByText("Heads up")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/booking form/i)).toBeVisible();
  expect(page.url()).toContain("/dashboard/new");
});

// ── T5: Continue after warning ────────────────────────────────────────────────

test("T5 — After BACKEND_FORM warning: Deploy anyway navigates to deploy page", async ({
  page,
  context,
}) => {
  const ok = await authenticateUser(context);
  if (!ok) {
    test.skip(true, "Auth required: set TEST_USER_EMAIL and TEST_USER_PASSWORD in .env.local");
    return;
  }

  await page.route(/\/api\/ingest\/url/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        mockIngestResponse({
          projectId: PROJECT_WARN,
          warning: "BACKEND_FORM",
          warningMessage: "Your booking form needs a backend connection",
        }),
      ),
    });
  });
  await page.route(/\/api\/deploy$/, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.route(/\/api\/projects\/test-url-002\/status/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockStatusSequence(["validating"])[0]),
    });
  });

  await page.goto("/dashboard/new");
  await page.getByText("Paste a link").click();
  await page.locator('input[type="url"]').fill(TEST_URL);
  await page.getByRole("button", { name: /deploy now/i }).click();

  await expect(page.getByText("Heads up")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /deploy anyway/i }).click();

  await page.waitForURL(`**/deploy/${PROJECT_WARN}`, { timeout: 15_000 });
  expect(page.url()).toContain(`/deploy/${PROJECT_WARN}`);
});

// ── T6: Progress to live ──────────────────────────────────────────────────────

test("T6 — Progress to live: success card after status sequence", async ({
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

  await page.route(/\/api\/projects\/test-url-001\/status/, async (route) => {
    const idx = Math.min(callIndex++, responses.length - 1);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(responses[idx]),
    });
  });

  await page.goto(`/deploy/${PROJECT_CLEAN}`);

  await expect(page.getByText(/your site is live/i)).toBeVisible({
    timeout: 20_000,
  });
  await expect(
    page.getByRole("link", { name: /visit site/i }),
  ).toBeVisible();
});
