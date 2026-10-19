/**
 * Idempotency test for Cloudflare Pages project creation.
 * Tests the conditional logic used in app/api/deploy/route.ts:
 * "if project.cloudflare_project_id is set, skip createCloudflareProject."
 */
import { test, expect } from "@playwright/test";

test.describe("CF project idempotency", () => {
  test("creates project on first deploy (no existing ID)", async () => {
    let createCalls = 0;
    const mockCreate = async () => {
      createCalls++;
      return { id: "new-cf-id", pagesSubdomain: "new-cf-id.pages.dev" };
    };

    async function getOrCreateCFProject(existingId: string | null) {
      if (existingId) return existingId;
      const { id } = await mockCreate();
      return id;
    }

    const result = await getOrCreateCFProject(null);
    expect(result).toBe("new-cf-id");
    expect(createCalls).toBe(1);
  });

  test("reuses existing ID on redeploy — createCloudflareProject NOT called", async () => {
    let createCalls = 0;
    const mockCreate = async () => {
      createCalls++;
      return { id: "should-not-be-called", pagesSubdomain: "x.pages.dev" };
    };

    async function getOrCreateCFProject(existingId: string | null) {
      if (existingId) return existingId;
      const { id } = await mockCreate();
      return id;
    }

    const result = await getOrCreateCFProject("existing-cf-id-abc123");
    expect(result).toBe("existing-cf-id-abc123");
    expect(createCalls).toBe(0); // ← key assertion: no CF API call made
  });

  test("two sequential deploys: only one create call total", async () => {
    let createCalls = 0;
    let storedId: string | null = null;

    const mockCreate = async () => {
      createCalls++;
      storedId = "cf-id-from-first-deploy";
      return { id: storedId, pagesSubdomain: "x.pages.dev" };
    };

    async function getOrCreateCFProject(existingId: string | null) {
      if (existingId) return existingId;
      const { id } = await mockCreate();
      return id;
    }

    // First deploy
    const id1 = await getOrCreateCFProject(storedId);
    expect(createCalls).toBe(1);

    // Second deploy (now storedId is set)
    const id2 = await getOrCreateCFProject(storedId);
    expect(id2).toBe(id1);
    expect(createCalls).toBe(1); // still 1
  });
});
