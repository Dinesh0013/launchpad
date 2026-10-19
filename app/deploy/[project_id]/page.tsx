import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DeployProgress from "@/components/deploy/DeployProgress";

export default async function DeployPage({
  params,
}: {
  params: { project_id: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: project } = await supabase
    .from("projects")
    .select("name")
    .eq("id", params.project_id)
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <DeployProgress
      projectId={params.project_id}
      projectName={project?.name ?? undefined}
    />
  );
}
