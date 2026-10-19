import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import AdmZip from "adm-zip";
import { errRes, requireAuth } from "@/lib/api-auth";
import { generateSubdomain, ensureUniqueSubdomain } from "@/lib/subdomain";
import { checkRateLimit } from "@/lib/ratelimit";
import { MAX_PROJECTS_PER_USER } from "@/lib/limits";
import { getCommonRoot, stripRoot } from "@/lib/zip";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_EXTRACTED_BYTES = 200 * 1024 * 1024;
const MAX_FILES = 500;

const schema = z.object({
  repo_url: z.string().url("repo_url must be a valid URL").max(500, "repo_url must be 500 characters or fewer"),
  project_name: z.string().min(1, "project_name is required").max(60, "project_name must be 60 characters or fewer"),
});

const GITHUB_RE = /github\.com\/([^/]+)\/([^/#?]+)/;

async function downloadZip(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errRes("Invalid JSON body", "INVALID_JSON", 400);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid request";
    return errRes(msg, "VALIDATION_ERROR", 400);
  }

  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  const { allowed } = checkRateLimit(user.id, "ingest", 10, 60 * 60 * 1000);
  if (!allowed) {
    return errRes(
      "Too many requests. Please wait a moment before trying again.",
      "RATE_LIMITED",
      429
    );
  }

  const { repo_url: repoUrl, project_name: projectName } = parsed.data;

  const match = repoUrl.match(GITHUB_RE);
  if (!match) {
    return errRes("Could not parse owner/repo from GitHub URL", "INVALID_GITHUB_URL", 400);
  }
  const [, owner, repo] = match;

  // Try main then master
  const zipBuffer =
    await downloadZip(
      `https://github.com/${owner}/${repo}/archive/refs/heads/main.zip`
    ) ??
    await downloadZip(
      `https://github.com/${owner}/${repo}/archive/refs/heads/master.zip`
    );

  if (!zipBuffer) {
    return errRes(
      "Could not download repository (tried main and master branches)",
      "GITHUB_DOWNLOAD_FAILED",
      400
    );
  }

  // Enforce per-user project cap
  const { count: projectCount } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if ((projectCount ?? 0) >= MAX_PROJECTS_PER_USER) {
    return errRes(
      `Project limit reached (max ${MAX_PROJECTS_PER_USER})`,
      "PROJECT_LIMIT",
      403
    );
  }

  const subdomain = generateSubdomain(projectName);
  const uniqueSubdomain = await ensureUniqueSubdomain(subdomain, supabase);

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      user_id: user.id,
      name: projectName,
      subdomain: uniqueSubdomain,
      source_type: "github",
      source_url: repoUrl,
      status: "building",
    })
    .select("id")
    .single();

  if (projectError || !project) {
    return errRes("Failed to create project", "DB_ERROR", 500);
  }

  const projectId: string = project.id;

  try {
    const zip = new AdmZip(zipBuffer);
    const entries = zip.getEntries().filter((e) => !e.isDirectory);

    if (entries.length > MAX_FILES) {
      await supabase.from("projects").delete().eq("id", projectId);
      return errRes(
        `Repository contains ${entries.length} files — max ${MAX_FILES} allowed`,
        "TOO_MANY_FILES",
        400
      );
    }

    // GitHub archives wrap everything in a top-level `{repo}-{branch}/` folder — strip it
    const commonRoot = getCommonRoot(entries);

    let totalExtracted = 0;
    const basePath = `${user.id}/${projectId}`;

    for (const entry of entries) {
      const filePath = commonRoot ? stripRoot(entry.entryName, commonRoot) : entry.entryName;

      if (filePath.includes("..") || filePath.startsWith("/")) {
        await supabase.from("projects").delete().eq("id", projectId);
        return errRes(`Unsafe path in archive: "${filePath}"`, "PATH_TRAVERSAL", 400);
      }

      if (!filePath) continue;

      totalExtracted += entry.header.size;
      if (totalExtracted > MAX_EXTRACTED_BYTES) {
        await supabase.from("projects").delete().eq("id", projectId);
        return errRes("Extracted content exceeds the 200 MB limit", "EXTRACTED_TOO_LARGE", 400);
      }

      await supabase.storage
        .from("deployments")
        .upload(`${basePath}/${filePath}`, entry.getData());
    }
  } catch (err) {
    await supabase.from("projects").delete().eq("id", projectId);
    Sentry.captureException(err);
    console.error("ingest/github: processing error", err);
    return errRes("Failed to process repository", "PROCESS_ERROR", 500);
  }

  return NextResponse.json({ project_id: projectId, subdomain: uniqueSubdomain });
  } catch (err) {
    Sentry.captureException(err);
    console.error("ingest/github: unhandled error", err);
    return errRes("Internal server error", "SERVER_ERROR", 500);
  }
}
