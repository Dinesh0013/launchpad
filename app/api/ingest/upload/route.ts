import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import AdmZip from "adm-zip";
import { errRes, requireAuth } from "@/lib/api-auth";
import { generateSubdomain, ensureUniqueSubdomain } from "@/lib/subdomain";
import { checkRateLimit } from "@/lib/ratelimit";
import { MAX_PROJECTS_PER_USER } from "@/lib/limits";
import { getCommonRoot, stripRoot } from "@/lib/zip";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_FILE_BYTES = 50 * 1024 * 1024;       // 50 MB
const MAX_EXTRACTED_BYTES = 200 * 1024 * 1024;  // 200 MB
const MAX_FILES = 500;
const MAX_PROJECT_NAME = 60;

export async function POST(request: NextRequest) {
  try {
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

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errRes("Invalid form data", "INVALID_FORM", 400);
  }

  const file = formData.get("file") as File | null;
  const projectName = (formData.get("project_name") as string | null)?.trim();

  if (!file) return errRes("No file provided", "NO_FILE", 400);
  if (!projectName) return errRes("project_name is required", "MISSING_FIELD", 400);
  if (projectName.length > MAX_PROJECT_NAME)
    return errRes(`project_name must be ${MAX_PROJECT_NAME} characters or fewer`, "NAME_TOO_LONG", 400);

  const filename = file.name.toLowerCase();
  const isZip = filename.endsWith(".zip");
  const isHtml = filename.endsWith(".html") || filename.endsWith(".htm");

  if (!isZip && !isHtml) {
    return errRes("File must be .zip or .html", "INVALID_FILE_TYPE", 400);
  }

  if (file.size > MAX_FILE_BYTES) {
    return errRes(
      `File exceeds the 50 MB limit (received ${(file.size / 1024 / 1024).toFixed(1)} MB)`,
      "FILE_TOO_LARGE",
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
      source_type: "zip",
      status: "building",
    })
    .select("id")
    .single();

  if (projectError || !project) {
    return errRes("Failed to create project", "DB_ERROR", 500);
  }

  const projectId: string = project.id;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const basePath = `${user.id}/${projectId}`;

    if (isHtml) {
      const { error } = await supabase.storage
        .from("deployments")
        .upload(`${basePath}/index.html`, buffer, { contentType: "text/html" });
      if (error) throw error;
    } else {
      const zip = new AdmZip(buffer);
      const entries = zip.getEntries().filter((e) => !e.isDirectory);

      if (entries.length > MAX_FILES) {
        await supabase.from("projects").delete().eq("id", projectId);
        return errRes(
          `ZIP contains ${entries.length} files — max ${MAX_FILES} allowed`,
          "TOO_MANY_FILES",
          400
        );
      }

      // Strip common top-level folder (e.g. "my-project/") so index.html lands at root
      const commonRoot = getCommonRoot(entries);

      let totalExtracted = 0;

      for (const entry of entries) {
        const entryPath = commonRoot ? stripRoot(entry.entryName, commonRoot) : entry.entryName;

        if (entryPath.includes("..") || entryPath.startsWith("/")) {
          console.warn(`blocked path traversal attempt: "${entryPath}" in upload by user ${user.id}`);
          await supabase.from("projects").delete().eq("id", projectId);
          return errRes("Unsafe path detected in ZIP", "PATH_TRAVERSAL", 400);
        }

        if (!entryPath) continue; // was the root directory entry itself

        totalExtracted += entry.header.size;
        if (totalExtracted > MAX_EXTRACTED_BYTES) {
          await supabase.from("projects").delete().eq("id", projectId);
          return errRes(
            "Extracted content exceeds the 200 MB limit",
            "EXTRACTED_TOO_LARGE",
            400
          );
        }

        await supabase.storage
          .from("deployments")
          .upload(`${basePath}/${entryPath}`, entry.getData());
      }
    }
  } catch (err) {
    await supabase.from("projects").delete().eq("id", projectId);
    Sentry.captureException(err);
    console.error("upload: file processing error", err);
    return errRes("Failed to process file", "PROCESS_ERROR", 500);
  }

  return NextResponse.json({ project_id: projectId, subdomain: uniqueSubdomain });
  } catch (err) {
    Sentry.captureException(err);
    console.error("upload: unhandled error", err);
    return errRes("Internal server error", "SERVER_ERROR", 500);
  }
}
