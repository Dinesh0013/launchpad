import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { errRes, requireAuth } from "@/lib/api-auth";
import { generateSubdomain, ensureUniqueSubdomain } from "@/lib/subdomain";
import { checkRateLimit } from "@/lib/ratelimit";
import { MAX_PROJECTS_PER_USER } from "@/lib/limits";
import { detectBackendForm } from "@/lib/formcheck";

export const runtime = "nodejs";

const MAX_HTML_BYTES = 2 * 1024 * 1024; // 2 MB
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

    let body: { html?: unknown; project_name?: unknown };
    try {
      body = await request.json();
    } catch {
      return errRes("Invalid JSON body", "INVALID_JSON", 400);
    }

    const html = typeof body.html === "string" ? body.html : "";
    const projectName =
      typeof body.project_name === "string" ? body.project_name.trim() : "";

    if (!html.trim()) return errRes("html is required", "MISSING_FIELD", 400);
    if (!projectName) return errRes("project_name is required", "MISSING_FIELD", 400);
    if (projectName.length > MAX_PROJECT_NAME)
      return errRes(
        `project_name must be ${MAX_PROJECT_NAME} characters or fewer`,
        "NAME_TOO_LONG",
        400
      );

    const buffer = Buffer.from(html, "utf-8");
    if (buffer.byteLength > MAX_HTML_BYTES) {
      return errRes(
        `HTML exceeds the 2 MB limit (received ${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB)`,
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
        source_type: "html",
        status: "building",
      })
      .select("id")
      .single();

    if (projectError || !project) {
      return errRes("Failed to create project", "DB_ERROR", 500);
    }

    const projectId: string = project.id;

    try {
      const { error } = await supabase.storage
        .from("deployments")
        .upload(`${user.id}/${projectId}/index.html`, buffer, {
          contentType: "text/html",
        });
      if (error) throw error;
    } catch (err) {
      await supabase.from("projects").delete().eq("id", projectId);
      Sentry.captureException(err);
      console.error("ingest/html: storage upload error", err);
      return errRes("Failed to process HTML", "PROCESS_ERROR", 500);
    }

    const response: Record<string, unknown> = {
      project_id: projectId,
      subdomain: uniqueSubdomain,
    };

    if (detectBackendForm(html).risk === "backend") {
      response.warning = "BACKEND_FORM";
      response.message =
        "Your form needs a backend; the page will deploy but the form may not submit. Connect a form service to fix.";
    }

    return NextResponse.json(response);
  } catch (err) {
    Sentry.captureException(err);
    console.error("ingest/html: unhandled error", err);
    return errRes("Internal server error", "SERVER_ERROR", 500);
  }
}
