import { NextRequest } from "next/server";
import { errRes, requireAuth } from "@/lib/api-auth";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireAuth();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const { data: project, error } = await supabase
      .from("projects")
      .select("status, cloudflare_deploy_url, subdomain")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) return errRes("Database error", "DB_ERROR", 500);
    if (!project) return errRes("Project not found", "NOT_FOUND", 404);

    // Latest deployment stage (for finer-grained progress within a status)
    const { data: latestDeployment } = await supabase
      .from("deployments")
      .select("stage")
      .eq("project_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Last 20 build log rows for the live log panel
    const { data: buildLogs } = await supabase
      .from("build_logs")
      .select("stage, level, message, created_at")
      .eq("project_id", id)
      .order("created_at", { ascending: true })
      .limit(20);

    return Response.json({
      status: project.status,
      cloudflare_deploy_url: project.cloudflare_deploy_url,
      subdomain: project.subdomain,
      stage: latestDeployment?.stage ?? null,
      buildLogs: buildLogs ?? [],
    });
  } catch (err) {
    console.error("projects/[id]/status: unhandled error", err);
    return errRes("Internal server error", "SERVER_ERROR", 500);
  }
}
