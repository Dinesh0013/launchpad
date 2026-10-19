/**
 * Unit tests for custom domain feature logic.
 *
 * Tests the validation schemas and business logic directly —
 * no browser required, no network calls, CF API is mocked.
 *
 * Run: npx playwright test tests/domains.spec.ts --reporter=line
 */

import { test, expect } from "@playwright/test";
import {
  domainSearchSchema,
  extractName,
  buildSuggestions,
  validateProjectForDomain,
  TLDs,
  TLD_PRICES,
} from "../lib/domain-search";

// ─── T1: Search returns suggestions with correct shape ────────────────────────

test.describe("domain search", () => {
  test("T1: buildSuggestions returns .com and .io entries with required fields", async () => {
    // Mock global fetch to simulate CF Registrar returning 404 (domain available)
    const originalFetch = global.fetch;
    global.fetch = async () =>
      new Response(null, { status: 404 }) as unknown as Response;

    try {
      const suggestions = await buildSuggestions("testbusiness");

      const tlds = suggestions.map((s) => s.tld);
      expect(tlds).toContain("com");
      expect(tlds).toContain("io");
      expect(suggestions.length).toBe(TLDs.length);

      for (const s of suggestions) {
        expect(typeof s.domain).toBe("string");
        expect(s.domain.startsWith("testbusiness.")).toBe(true);
        expect(typeof s.available).toBe("boolean");
        expect(typeof s.price_usd).toBe("number");
        expect(s.price_usd).toBe(TLD_PRICES[s.tld]);
        expect(["high", "low"]).toContain(s.confidence);
        expect(typeof s.tld).toBe("string");
      }
    } finally {
      global.fetch = originalFetch;
    }
  });

  test("T1b: CF 200 → domain marked taken with high confidence", async () => {
    const originalFetch = global.fetch;
    global.fetch = async () =>
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }) as unknown as Response;

    try {
      const suggestions = await buildSuggestions("taken");
      for (const s of suggestions) {
        expect(s.available).toBe(false);
        expect(s.confidence).toBe("high");
      }
    } finally {
      global.fetch = originalFetch;
    }
  });
});

// ─── T2: Invalid query — empty string ─────────────────────────────────────────

test.describe("domain search validation", () => {
  test("T2: empty string fails Zod validation", () => {
    const result = domainSearchSchema.safeParse({ query: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = result.error.issues[0]?.message ?? "";
      expect(msg.toLowerCase()).toMatch(/character|short|required/);
    }
  });

  test("T2b: single character fails validation", () => {
    const result = domainSearchSchema.safeParse({ query: "a" });
    expect(result.success).toBe(false);
  });

  // ─── T3: URL input rejected ────────────────────────────────────────────────

  test("T3: http:// prefix fails validation", () => {
    const result = domainSearchSchema.safeParse({ query: "http://bad.com" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = result.error.issues[0]?.message ?? "";
      expect(msg.toLowerCase()).toMatch(/url|http/);
    }
  });

  test("T3b: https:// prefix also rejected", () => {
    const result = domainSearchSchema.safeParse({ query: "https://mybusiness.com" });
    expect(result.success).toBe(false);
  });

  test("T3c: spaces in query rejected", () => {
    const result = domainSearchSchema.safeParse({ query: "my business" });
    expect(result.success).toBe(false);
  });

  test("valid query passes", () => {
    const result = domainSearchSchema.safeParse({ query: "mybusiness" });
    expect(result.success).toBe(true);
  });

  test("valid query with TLD passes and extractName strips it", () => {
    const result = domainSearchSchema.safeParse({ query: "mybusiness.com" });
    expect(result.success).toBe(true);
    expect(extractName("mybusiness.com")).toBe("mybusiness");
  });

  test("extractName strips http prefix", () => {
    expect(extractName("http://mybusiness.com/path")).toBe("mybusiness");
  });
});

// ─── T4: Connect requires live project ────────────────────────────────────────

test.describe("domain connect validation", () => {
  test("T4: pending project returns not-ok with NOT_LIVE code", () => {
    const result = validateProjectForDomain({
      status: "pending",
      cloudflare_project_id: "cf-project-123",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("NOT_LIVE");
    }
  });

  test("T4b: building project is rejected", () => {
    const result = validateProjectForDomain({
      status: "building",
      cloudflare_project_id: "cf-project-123",
    });
    expect(result.ok).toBe(false);
  });

  test("T4c: failed project is rejected", () => {
    const result = validateProjectForDomain({
      status: "failed",
      cloudflare_project_id: "cf-project-123",
    });
    expect(result.ok).toBe(false);
  });

  test("T4d: live project without CF ID rejected with NO_CF_PROJECT", () => {
    const result = validateProjectForDomain({
      status: "live",
      cloudflare_project_id: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("NO_CF_PROJECT");
    }
  });

  test("live project with CF ID passes", () => {
    const result = validateProjectForDomain({
      status: "live",
      cloudflare_project_id: "cf-project-abc",
    });
    expect(result.ok).toBe(true);
  });
});
