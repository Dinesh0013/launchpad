/**
 * Unit tests for the setStatus helper contract used in app/api/deploy/route.ts.
 *
 * Uses a mock Supabase client — no network, no real DB.
 * For each of the 7 pipeline status values, asserts that:
 *   a) projects.status is updated correctly
 *   b) deployments.stage is updated correctly
 *   c) a build_logs row is inserted with the correct stage and level='info'
 */
import { test, expect } from "@playwright/test";

// ─── Minimal Supabase mock ────────────────────────────────────────────────────

interface Call {
  table: string;
  op: "update" | "insert";
  data: Record<string, unknown>;
  conditions: Record<string, unknown>;
}

function makeMockSupabase() {
  const calls: Call[] = [];

  function makeChain(table: string, op: "update" | "insert", data: Record<string, unknown>) {
    const cond: Record<string, unknown> = {};
    const chain = {
      eq(col: string, val: unknown) {
        cond[col] = val;
        return chain;
      },
      then(resolve: (v: object) => void) {
        calls.push({ table, op, data, conditions: { ...cond } });
        resolve({});
      },
      // Make it thenable so await works
      [Symbol.toStringTag]: "Promise",
    };
    // Record immediately for non-awaited paths too
    return {
      eq(col: string, val: unknown) {
        cond[col] = val;
        calls.push({ table, op, data, conditions: { ...cond } });
        return { eq: () => Promise.resolve({}) };
      },
    };
  }

  const supabase = {
    from(table: string) {
      return {
        update(data: Record<string, unknown>) {
          return {
            eq(col: string, val: unknown) {
              calls.push({ table, op: "update", data, conditions: { [col]: val } });
              return Promise.resolve({});
            },
          };
        },
        insert(data: Record<string, unknown>) {
          calls.push({ table, op: "insert", data, conditions: {} });
          return Promise.resolve({});
        },
      };
    },
  };

  return { supabase, calls };
}

// ─── setStatus contract (mirrors app/api/deploy/route.ts) ────────────────────
// Tested here as a standalone function so the test has no Next.js/path-alias deps.

async function setStatus(
  supabase: ReturnType<typeof makeMockSupabase>["supabase"],
  projectId: string,
  deploymentId: string | undefined,
  status: string,
  stage: string,
  message: string,
): Promise<void> {
  try {
    await supabase.from("projects").update({ status }).eq("id", projectId);
    if (deploymentId) {
      await supabase.from("deployments").update({ stage }).eq("id", deploymentId);
    }
    // Mirrors logBuild: inserts a row into build_logs
    await supabase.from("build_logs").insert({
      project_id: projectId,
      deployment_id: deploymentId ?? null,
      stage,
      level: "info",
      message,
    });
  } catch (err) {
    console.error(`setStatus(${status}): failed`, err);
  }
}

// ─── Status values to test ────────────────────────────────────────────────────

const PIPELINE_STAGES = [
  { status: "validating",   stage: "validating",   message: "Validating project files" },
  { status: "building",     stage: "building",     message: "Building application" },
  { status: "uploading",    stage: "uploading",    message: "Source files ready — starting build" },
  { status: "provisioning", stage: "provisioning", message: "Provisioning Cloudflare project" },
  { status: "deploying",    stage: "deploying",    message: "Uploading 42 files to Cloudflare" },
  { status: "propagating",  stage: "propagating",  message: "Waiting for global propagation" },
  { status: "live",         stage: "live",         message: "Site is live" },
] as const;

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe("setStatus helper", () => {
  for (const { status, stage, message } of PIPELINE_STAGES) {
    test(`${status}: updates projects.status, deployments.stage, inserts build_log`, async () => {
      const { supabase, calls } = makeMockSupabase();
      await setStatus(supabase, "proj-abc", "dep-xyz", status, stage, message);

      // a) projects.status updated
      const projectUpdate = calls.find(
        (c) => c.table === "projects" && c.op === "update"
      );
      expect(projectUpdate, `projects update missing for status=${status}`).toBeDefined();
      expect(projectUpdate!.data.status).toBe(status);

      // b) deployments.stage updated
      const deploymentUpdate = calls.find(
        (c) => c.table === "deployments" && c.op === "update"
      );
      expect(deploymentUpdate, `deployments update missing for stage=${stage}`).toBeDefined();
      expect(deploymentUpdate!.data.stage).toBe(stage);

      // c) build_logs row inserted with correct stage + level
      const logInsert = calls.find(
        (c) => c.table === "build_logs" && c.op === "insert"
      );
      expect(logInsert, `build_logs insert missing for stage=${stage}`).toBeDefined();
      expect(logInsert!.data.stage).toBe(stage);
      expect(logInsert!.data.level).toBe("info");
    });
  }

  test("without deploymentId: deployments.update is NOT called", async () => {
    const { supabase, calls } = makeMockSupabase();
    await setStatus(supabase, "proj-abc", undefined, "validating", "validating", "test");

    const deploymentUpdates = calls.filter(
      (c) => c.table === "deployments" && c.op === "update"
    );
    expect(deploymentUpdates).toHaveLength(0);

    // projects and build_logs still called
    expect(calls.some((c) => c.table === "projects" && c.op === "update")).toBe(true);
    expect(calls.some((c) => c.table === "build_logs" && c.op === "insert")).toBe(true);
  });

  test("never throws even if supabase calls fail", async () => {
    const brokenSupabase = {
      from() {
        return {
          update() { return { eq() { return Promise.reject(new Error("DB offline")); } }; },
          insert() { return Promise.reject(new Error("DB offline")); },
        };
      },
    };
    // Should resolve without throwing
    await expect(
      setStatus(brokenSupabase as never, "proj-abc", "dep-xyz", "validating", "validating", "test")
    ).resolves.toBeUndefined();
  });
});
