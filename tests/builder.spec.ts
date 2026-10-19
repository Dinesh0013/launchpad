/**
 * Builder integration tests — no browser required.
 * Tests framework detection and real Vite build (Fixture A).
 *
 * Run: npx playwright test tests/builder.spec.ts
 * Fixture A (real npm install + vite build) allowed 180s.
 */

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import os from "os";
import { buildFromSource, detectFramework, BuildError } from "../lib/builder";

const FIXTURES = path.join(__dirname, "fixtures");

// Copy a fixture directory to a fresh temp dir so npm install doesn't
// pollute the committed fixture source.
async function copyFixture(name: string): Promise<string> {
  const src = path.join(FIXTURES, name);
  const dest = path.join(os.tmpdir(), `builder-test-${name}-${Date.now()}`);
  await fs.promises.cp(src, dest, { recursive: true });
  return dest;
}

async function rmDir(dir: string) {
  await fs.promises.rm(dir, { recursive: true, force: true });
}

// ─── Fixture B: pre-built (no package.json, has index.html) ──────────────────

test("Fixture B — prebuilt: no package.json + index.html → framework=prebuilt, no build", async () => {
  const dir = await copyFixture("prebuilt");
  try {
    const result = await detectFramework(dir);
    expect(result.framework).toBe("prebuilt");
    expect(result.outDir).toBe(dir);
  } finally {
    await rmDir(dir);
  }
});

// ─── Fixture C: TanStack SSR → SSR_UNSUPPORTED ───────────────────────────────

test("Fixture C — tanstack-app: throws SSR_UNSUPPORTED", async () => {
  const dir = await copyFixture("tanstack-app");
  try {
    let caught: unknown;
    try {
      await detectFramework(dir);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(BuildError);
    expect((caught as BuildError).code).toBe("SSR_UNSUPPORTED");
  } finally {
    await rmDir(dir);
  }
});

// ─── Fixture D: Next.js with output:'export' → next-static ───────────────────

test("Fixture D — nextjs-static: next.config.js with output:export → framework=next-static", async () => {
  const dir = await copyFixture("nextjs-static");
  try {
    const result = await detectFramework(dir);
    expect(result.framework).toBe("next-static");
    expect(result.outDir).toBe(path.join(dir, "out"));
  } finally {
    await rmDir(dir);
  }
});

// ─── Fixture A: real Vite build ───────────────────────────────────────────────

test("Fixture A — vite-app: full npm install + vite build → dist/index.html", async () => {
  test.setTimeout(180_000);

  const dir = await copyFixture("vite-app");
  const logs: string[] = [];
  const start = Date.now();

  try {
    const result = await buildFromSource({
      sourceDir: dir,
      log: (stage, level, message) => {
        logs.push(`[${stage}][${level}] ${message}`);
      },
    });

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\nFixture A build completed in ${elapsed}s`);
    console.log(`Framework: ${result.framework}`);
    console.log(`outDir: ${result.outDir}`);

    expect(result.framework).toBe("vite");
    expect(result.outDir).toBe(path.join(dir, "dist"));

    // index.html must exist in dist
    const indexPath = path.join(result.outDir, "index.html");
    const exists = await fs.promises
      .access(indexPath)
      .then(() => true)
      .catch(() => false);
    expect(exists, `dist/index.html not found — build logs:\n${logs.slice(-10).join("\n")}`).toBe(true);
  } finally {
    await rmDir(dir);
  }
});
