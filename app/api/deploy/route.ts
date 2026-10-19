import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import os from "os";
import path from "path";
import fs from "fs";
import { errRes, requireAuth } from "@/lib/api-auth";
import { createCloudflareProject, deployToCloudflare, isMockMode } from "@/lib/cloudflare";
import { sendDeploySuccess, sendDeployFailed } from "@/lib/email";
import { checkRateLimit } from "@/lib/ratelimit";
import { BuildError, buildFromSource } from "@/lib/builder";
import { materializeFromStorage, collectFiles } from "@/lib/fsbuild";
import { logBuild } from "@/lib/logger";
import type { LogLevel } from "@/lib/logger";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min — npm install + build can take time

const schema = z.object({
  project_id: z.string().min(1, "project_id is required"),
});

// ─── Pipeline status helper ───────────────────────────────────────────────────
// Updates both projects.status and deployments.stage atomically, and appends a
// build log row. Never throws — logs to console on failure so the deploy continues.

async function setStatus(
  supabase: SupabaseClient,
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
    await logBuild({ supabase, projectId, deploymentId, stage, level: "info", message });
  } catch (err) {
    console.error(`setStatus(${status}): failed`, err);
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function listStorageFiles(
  supabase: SupabaseClient,
  basePath: string
): Promise<{ path: string; content: Buffer }[]> {
  const results: { path: string; content: Buffer }[] = [];

  async function recurse(dir: string) {
    const { data: items, error } = await supabase.storage
      .from("deployments")
      .list(dir, { limit: 1000 });

    if (error || !items) return;

    for (const item of items) {
      const fullPath = `${dir}/${item.name}`;
      if (item.id === null) {
        await recurse(fullPath);
      } else {
        const { data: blob } = await supabase.storage
          .from("deployments")
          .download(fullPath);
        if (blob) {
          const relativePath = fullPath.slice(basePath.length + 1);
          results.push({
            path: relativePath,
            content: Buffer.from(await blob.arrayBuffer()),
          });
        }
      }
    }
  }

  await recurse(basePath);
  return results;
}

export async function POST(request: NextRequest) {
  try {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  const { allowed } = checkRateLimit(user.id, "deploy", 5, 60 * 60 * 1000);
  if (!allowed) {
    return errRes(
      "Too many requests. Please wait a moment before trying again.",
      "RATE_LIMITED",
      429
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errRes("Invalid JSON body", "INVALID_JSON", 400);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return errRes(
      parsed.error.issues[0]?.message ?? "Invalid request",
      "VALIDATION_ERROR",
      400
    );
  }

  const { project_id } = parsed.data;

  // Fetch project and verify ownership
  const { data: project, error: projectFetchError } = await supabase
    .from("projects")
    .select("id, name, subdomain, user_id, cloudflare_project_id")
    .eq("id", project_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (projectFetchError) {
    return errRes("Database error", "DB_ERROR", 500);
  }
  if (!project) {
    return errRes("Project not found", "NOT_FOUND", 404);
  }

  // Mark as building (initial state — visible immediately before pipeline starts)
  await supabase
    .from("projects")
    .update({ status: "building" })
    .eq("id", project_id);

  const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`;

  // Create a deployment record up front so build logs have a deployment_id
  let deploymentId: string | undefined;
  try {
    const { data: dep } = await supabase
      .from("deployments")
      .insert({ project_id, status: "building", stage: "validating" })
      .select("id")
      .single();
    deploymentId = dep?.id ?? undefined;
  } catch { /* non-fatal — logging will still work without a deployment_id */ }

  const log = (stage: string, level: string, message: string) =>
    logBuild({
      supabase,
      projectId: project_id,
      deploymentId,
      stage,
      level: level as LogLevel,
      message,
    });

  const tmpDir = path.join(
    os.tmpdir(),
    `launchpad-${project_id}-${Math.random().toString(36).slice(2, 8)}`,
  );

  try {
    // ── Stage 0: validating ────────────────────────────────────────────────────
    await setStatus(supabase, project_id, deploymentId,
      "validating", "validating", "Validating project files");

    await materializeFromStorage({
      supabase,
      userId: user.id,
      projectId: project_id,
      destDir: tmpDir,
    });

    // ── Stage 2: uploading ─────────────────────────────────────────────────────
    // "uploading" here means source files have been pulled from storage and the
    // build engine is about to start — matches UI stage label order.
    await setStatus(supabase, project_id, deploymentId,
      "uploading", "uploading", "Source files ready — starting build");

    // Stage 1 ('building') is emitted internally by buildFromSource via the log callback
    const { outDir, framework } = await buildFromSource({ sourceDir: tmpDir, log });

    // Collect built files for upload
    await log("uploading", "info", `Collecting files from ${framework} output…`);
    const files = await collectFiles(outDir);

    if (files.length === 0) {
      throw new BuildError("NO_OUTPUT", "Build produced no files to deploy");
    }

    // ── Stage 3: provisioning ──────────────────────────────────────────────────
    await setStatus(supabase, project_id, deploymentId,
      "provisioning", "provisioning", "Provisioning Cloudflare project");

    let cfProjectId: string;
    if (project.cloudflare_project_id) {
      cfProjectId = project.cloudflare_project_id as string;
      await log("provisioning", "info", `Reusing existing CF project ${cfProjectId}`);
    } else {
      await log("provisioning", "info", "Creating new Cloudflare Pages project…");
      await createCloudflareProject(project.subdomain);
      cfProjectId = project.subdomain;
      // Persist immediately — idempotency on retry
      await supabase.from("projects").update({ cloudflare_project_id: cfProjectId }).eq("id", project_id);
      await log("provisioning", "info", `Created new CF project ${cfProjectId}`);
    }

    // ── Stage 4: deploying ─────────────────────────────────────────────────────
    await setStatus(supabase, project_id, deploymentId,
      "deploying", "deploying", `Uploading ${files.length} files to Cloudflare`);

    const { url: cloudflareUrl } = await deployToCloudflare(cfProjectId, files);

    // Without real Cloudflare credentials (mock mode) the site is served by this app itself.
    const deployedUrl = isMockMode()
      ? `${process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin}/s/${project.subdomain}`
      : cloudflareUrl;

    // ── Stage 5: propagating ───────────────────────────────────────────────────
    await setStatus(supabase, project_id, deploymentId,
      "propagating", "propagating", "Waiting for global propagation");

    await log("live", "info", `Live at ${deployedUrl}`);

    // ── Stage 6: live ──────────────────────────────────────────────────────────
    await supabase
      .from("projects")
      .update({
        status: "live",
        cloudflare_project_id: cfProjectId,
        cloudflare_deploy_url: deployedUrl,
        last_deployed_at: new Date().toISOString(),
      })
      .eq("id", project_id);

    if (deploymentId) {
      await supabase
        .from("deployments")
        .update({ status: "success", deployed_url: deployedUrl, stage: "live" })
        .eq("id", deploymentId);
    } else {
      await supabase.from("deployments").insert({
        project_id,
        status: "success",
        deployed_url: deployedUrl,
        stage: "live",
      });
    }

    sendDeploySuccess(user.email!, deployedUrl, project.name).catch(() => {});
    return NextResponse.json({ url: deployedUrl });
  } catch (err) {
    const isBuildError = err instanceof BuildError;
    const errMessage = err instanceof Error ? err.message : "Deployment error";
    const errCode = isBuildError ? (err as BuildError).code : "DEPLOY_ERROR";

    if (!isBuildError) Sentry.captureException(err);

    // ── Stage 7: failed ────────────────────────────────────────────────────────
    // Store the real error message so the UI and logs show what actually broke.
    await logBuild({
      supabase,
      projectId: project_id,
      deploymentId,
      stage: "failed",
      level: "error",
      message: errMessage,
    });

    console.error("deploy: error", errCode, errMessage.slice(0, 200));

    await supabase.from("projects").update({ status: "failed" }).eq("id", project_id);

    if (deploymentId) {
      await supabase
        .from("deployments")
        .update({ status: "failed", stage: "failed", build_log: errMessage })
        .eq("id", deploymentId);
    } else {
      await supabase.from("deployments").insert({
        project_id,
        status: "failed",
        stage: "failed",
        build_log: errMessage,
      });
    }

    sendDeployFailed(user.email!, project.name, dashboardUrl).catch(() => {});
    return errRes(errMessage, errCode, isBuildError ? 422 : 500);
  } finally {
    fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
  } catch (err) {
    const e = err as Error;
    console.error('DEPLOY ROUTE FAILED:', {
      error: e?.message,
      stack: e?.stack,
    });
    Sentry.captureException(err);
    console.error("deploy: unhandled error", err);
    return errRes("Internal server error", "SERVER_ERROR", 500);
  }
}
