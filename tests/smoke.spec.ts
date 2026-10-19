import { test, expect } from "@playwright/test";

test("navbar renders with LaunchPad branding", async ({ page }) => {
  await page.goto("/");
  const header = page.locator("header");
  await expect(header).toBeVisible();
  // Brand name appears in both the logo and footer — first() targets the header
  await expect(header.getByText("LaunchPad")).toBeVisible();
  await expect(header.getByRole("link", { name: "Log in" })).toBeVisible();
  await expect(header.getByRole("link", { name: "Get started free" })).toBeVisible();
});

test("hero section is visible", async ({ page }) => {
  await page.goto("/");
  const hero = page.locator("section").first();
  await expect(hero).toBeVisible();
  await expect(page.getByRole("heading", { name: /your site,/i })).toBeVisible();
  await expect(
    page.getByRole("link", { name: /deploy your first site free/i }).first()
  ).toBeVisible();
});

// LaunchPad has no pricing page — features section is the value-communication equivalent
test("features section loads", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /everything you need/i })
  ).toBeVisible();
  await expect(page.getByText("Free HTTPS")).toBeVisible();
  await expect(page.getByText("Custom domains")).toBeVisible();
  await expect(page.getByText("Instant deploys")).toBeVisible();
});

test("how-it-works section loads", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /ship in three steps/i })
  ).toBeVisible();
  await expect(page.getByText("Upload or paste")).toBeVisible();
  await expect(page.getByText("Share your URL")).toBeVisible();
});

test("no console errors on load", async ({ page }) => {
  test.setTimeout(60_000);

  // Next.js dev server uses lazy compilation — chunks may not be ready on first request.
  // Trigger compilation with a first load, then poll until main-app.js returns 200
  // before running the actual assertion load.
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");

  // Poll until the App Router entry chunk is compiled (max 30s)
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const status = await page.evaluate(async () => {
      try {
        const res = await fetch("/_next/static/chunks/main-app.js");
        return res.status;
      } catch { return 0; }
    });
    if (status === 200) break;
    await page.waitForTimeout(1000);
  }

  // Set up error listeners AFTER warmup — only catch errors on the clean load
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/");
  await page.waitForLoadState("networkidle");
  expect(errors, `Console errors: ${errors.join(", ")}`).toHaveLength(0);
});
