import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errRes, requireAuth } from "@/lib/api-auth";

export const runtime = "nodejs";

const patchSchema = z.object({
  custom_domain: z.string().max(100, "domain must be 100 characters or fewer").nullable(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireAuth();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errRes("Invalid JSON body", "INVALID_JSON", 400);
    }

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return errRes(
        parsed.error.issues[0]?.message ?? "Invalid request",
        "VALIDATION_ERROR",
        400
      );
    }

    const { data: project, error: fetchError } = await supabase
      .from("projects")
      .select("id")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (fetchError) return errRes("Database error", "DB_ERROR", 500);
    if (!project) return errRes("Project not found", "NOT_FOUND", 404);

    const clearing = parsed.data.custom_domain === null;
    const { error: updateError } = await supabase
      .from("projects")
      .update({
        custom_domain: parsed.data.custom_domain,
        custom_domain_verified: false,
        ...(clearing && {
          custom_domain_status: "none",
          custom_domain_cname: null,
          custom_domain_added_at: null,
        }),
      })
      .eq("id", id);

    if (updateError) return errRes("Failed to update project", "DB_ERROR", 500);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("projects/[id] PATCH: unhandled error", err);
    return errRes("Internal server error", "SERVER_ERROR", 500);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireAuth();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const { data: project, error: fetchError } = await supabase
      .from("projects")
      .select("id")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (fetchError) return errRes("Database error", "DB_ERROR", 500);
    if (!project) return errRes("Project not found", "NOT_FOUND", 404);

    const { error: deleteError } = await supabase
      .from("projects")
      .delete()
      .eq("id", id);

    if (deleteError) return errRes("Failed to delete project", "DB_ERROR", 500);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("projects/[id] DELETE: unhandled error", err);
    return errRes("Internal server error", "SERVER_ERROR", 500);
  }
}
