import type { SupabaseClient } from "@supabase/supabase-js";

export type LogStage =
  | "validating"
  | "building"
  | "uploading"
  | "provisioning"
  | "deploying"
  | "propagating"
  | "live"
  | "failed";

export type LogLevel = "info" | "warn" | "error";

interface LogBuildParams {
  supabase: SupabaseClient;
  projectId: string;
  deploymentId?: string;
  stage: LogStage | string;
  level?: LogLevel;
  message: string;
}

export async function logBuild({
  supabase,
  projectId,
  deploymentId,
  stage,
  level = "info",
  message,
}: LogBuildParams): Promise<void> {
  // Always emit to stdout/stderr so local dev and platform logs capture it
  console[level](`[${stage}] ${message}`);

  try {
    await supabase.from("build_logs").insert({
      project_id: projectId,
      deployment_id: deploymentId ?? null,
      stage,
      level,
      message,
    });
  } catch (err) {
    console.error("logBuild: failed to insert log row", err);
  }
}
