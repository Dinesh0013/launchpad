import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errRes, requireAuth } from "@/lib/api-auth";
import { addCustomDomain } from "@/lib/cloudflare";
import { checkRateLimit } from "@/lib/ratelimit";
import { logBuild } from "@/lib/logger";
import { validateProjectForDomain } from "@/lib/domain-search";

export const runtime = "nodejs";

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z]{2,})+$/;

const schema = z.object({
  project_id: z.string().min(1, "project_id is required"),
  domain: z.string().min(1, "domain is required").max(100, "domain must be 100 characters or fewer"),
});

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

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

    const { project_id, domain } = parsed.data;

    if (!DOMAIN_RE.test(domain)) {
      return errRes("Invalid domain format", "INVALID_DOMAIN", 400);
    }

    const { allowed } = checkRateLimit(user.id, "domains:connect", 10, 60 * 60 * 1000);
    if (!allowed) {
      return errRes(
        "Too many requests. Please wait a moment before trying again.",
        "RATE_LIMITED",
        429
      );
    }

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, status, cloudflare_project_id, cloudflare_deploy_url")
      .eq("id", project_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (projectError) return errRes("Database error", "DB_ERROR", 500);
    if (!project) return errRes("Project not found", "NOT_FOUND", 404);

    const validation = validateProjectForDomain(project as { status: string; cloudflare_project_id: string | null });
    if (!validation.ok) {
      return errRes(validation.error, validation.code, 400);
    }

    const cfProjectName = project.cloudflare_project_id as string;
    const cnameTarget = `${cfProjectName}.pages.dev`;

    const ok = await addCustomDomain(cfProjectName, domain);
    if (!ok) {
      return NextResponse.json({ success: false, error: "Failed to add domain to Cloudflare. Please try again." });
    }

    await supabase
      .from("projects")
      .update({
        custom_domain: domain,
        custom_domain_status: "pending",
        custom_domain_verified: false,
        custom_domain_cname: cnameTarget,
        custom_domain_added_at: new Date().toISOString(),
      })
      .eq("id", project_id);

    await logBuild({
      supabase,
      projectId: project_id,
      deploymentId: undefined,
      stage: "provisioning",
      level: "info",
      message: `Custom domain ${domain} added to CF Pages project ${cfProjectName}`,
    });

    return NextResponse.json({
      success: true,
      domain,
      cname_target: cnameTarget,
      status: "pending",
      message: "Domain connected. DNS may take up to 48 hours to propagate — but most sites are live in minutes.",
      // backward-compat: DomainSection still reads dns_records
      dns_records: [
        { type: "CNAME", name: "@", value: cnameTarget, ttl: "Auto" },
      ],
    });
  } catch (err) {
    console.error("domains/connect: unhandled error", err);
    return errRes("Internal server error", "SERVER_ERROR", 500);
  }
}
