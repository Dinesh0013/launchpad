import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ProjectCard, { type Project } from "@/components/project-card";

export default async function DashboardPage() {
  let projects: Project[] = [];

  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    const { data } = await supabase
      .from("projects")
      .select(
        "id, name, status, cloudflare_deploy_url, custom_domain, last_deployed_at, created_at"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    projects = (data as Project[]) ?? [];
  } catch {
    redirect("/login");
  }

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-zinc-900">Your Sites</h1>
        <Link
          href="/dashboard/new"
          className="h-9 px-4 bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-medium rounded-lg inline-flex items-center transition-colors"
        >
          Deploy new site →
        </Link>
      </div>

      {projects.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <h2 className="text-lg font-semibold text-zinc-900 mb-2">
            No sites yet
          </h2>
          <p className="text-sm text-zinc-500 mb-6">
            Deploy your first site in under a minute
          </p>
          <Link
            href="/dashboard/new"
            className="h-9 px-4 bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-medium rounded-lg inline-flex items-center transition-colors"
          >
            Deploy now →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}
