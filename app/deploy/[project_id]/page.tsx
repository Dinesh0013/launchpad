import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DeployProgress from "@/components/deploy/DeployProgress";

export default async function DeployPage({
  params,
}: {
  params: Promise<{ project_id: string }>;
}) {
  const { project_id } = await params;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: project } = await supabase
    .from("projects")
    .select("name")
    .eq("id", project_id)
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <DeployProgress
      projectId={project_id}
      projectName={project?.name ?? undefined}
    />
  );
}
