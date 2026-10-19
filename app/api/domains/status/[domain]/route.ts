import { NextRequest, NextResponse } from "next/server";
import { errRes, requireAuth } from "@/lib/api-auth";

export const runtime = "nodejs";

function cfPagesBase(): string {
  return `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/pages/projects`;
}

function cfHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` };
}

function isMockMode(): boolean {
  return process.env.CLOUDFLARE_API_TOKEN === "your_cloudflare_api_token";
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { domain: string } }
) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const domain = decodeURIComponent(params.domain);

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, cloudflare_project_id, custom_domain_status, custom_domain_cname, custom_domain_verified")
      .eq("custom_domain", domain)
      .eq("user_id", user.id)
      .maybeSingle();

    if (projectError) return errRes("Database error", "DB_ERROR", 500);
    if (!project) return errRes("No project found with that domain", "NOT_FOUND", 404);

    let status: string = (project.custom_domain_status as string) ?? "pending";
    let verified: boolean = (project.custom_domain_verified as boolean) ?? false;
    const cnameTarget: string = (project.custom_domain_cname as string) ?? "";

    if (!isMockMode() && project.cloudflare_project_id) {
      try {
        const res = await fetch(
          `${cfPagesBase()}/${project.cloudflare_project_id}/domains/${encodeURIComponent(domain)}`,
          { headers: cfHeaders(), signal: AbortSignal.timeout(8000) }
        );
        if (res.ok) {
          const json = (await res.json()) as {
            result?: { status?: string };
            success?: boolean;
          };
          const cfStatus = json.result?.status ?? "";
          if (cfStatus === "active") {
            status = "active";
            verified = true;
            await supabase
              .from("projects")
              .update({ custom_domain_status: "active", custom_domain_verified: true })
              .eq("id", project.id);
          } else if (cfStatus) {
            status = cfStatus;
          }
        }
      } catch {
        // CF unreachable — return DB state
      }
    }

    return NextResponse.json({
      domain,
      status,
      verified,
      cname_target: cnameTarget,
      project_id: project.id,
    });
  } catch (err) {
    console.error("domains/status: unhandled error", err);
    return errRes("Internal server error", "SERVER_ERROR", 500);
  }
}
