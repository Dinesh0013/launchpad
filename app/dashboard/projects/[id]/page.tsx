import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle, XCircle, Clock, ArrowLeft, ExternalLink } from "lucide-react";
import DomainPicker from "@/components/domains/DomainPicker";
import DangerZone from "@/components/danger-zone";
import CopyUrlButton from "@/components/copy-url-button";

const STATUS_BADGE: Record<string, { label: string; classes: string }> = {
  live: { label: "Live", classes: "bg-green-50 text-green-700 border-green-200" },
  building: { label: "Building", classes: "bg-yellow-50 text-yellow-700 border-yellow-200 animate-pulse" },
  failed: { label: "Failed", classes: "bg-red-50 text-red-700 border-red-100" },
  pending: { label: "Pending", classes: "bg-zinc-100 text-zinc-500 border-zinc-200" },
};

type Deployment = {
  id: string;
  status: string;
  deployed_url: string | null;
  build_log: string | null;
  created_at: string;
};

type Project = {
  id: string;
  name: string;
  status: string;
  cloudflare_deploy_url: string | null;
  custom_domain: string | null;
  custom_domain_status: string | null;
  custom_domain_cname: string | null;
  last_deployed_at: string | null;
  created_at: string;
};

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let project: Project;
  let deployments: Deployment[] = [];

  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    const { data: proj, error: projError } = await supabase
      .from("projects")
      .select(
        "id, name, status, cloudflare_deploy_url, custom_domain, custom_domain_status, custom_domain_cname, last_deployed_at, created_at"
      )
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (projError || !proj) notFound();
    project = proj as Project;

    const { data: deps } = await supabase
      .from("deployments")
      .select("id, status, deployed_url, build_log, created_at")
      .eq("project_id", id)
      .order("created_at", { ascending: false })
      .limit(5);

    deployments = (deps as Deployment[]) ?? [];
  } catch {
    notFound();
  }

  const siteUrl = project.custom_domain
    ? `https://${project.custom_domain}`
    : project.cloudflare_deploy_url;

  const badge =
    STATUS_BADGE[project.status] ?? {
      label: project.status,
      classes: "bg-zinc-100 text-zinc-500 border-zinc-200",
    };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Back */}
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        All sites
      </Link>

      {/* Site header */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h1 className="text-xl font-semibold text-zinc-900 leading-tight">
              {project.name}
            </h1>
            {project.last_deployed_at && (
              <p className="text-xs text-zinc-400 mt-1">
                Last deployed{" "}
                {formatDistanceToNow(new Date(project.last_deployed_at), {
                  addSuffix: true,
                })}
              </p>
            )}
          </div>
          <span
            className={`shrink-0 text-xs font-medium px-2.5 py-0.5 rounded-full border ${badge.classes}`}
          >
            {badge.label}
          </span>
        </div>

        {/* Live URL */}
        {siteUrl && (
          <div className="flex items-center gap-2 p-3 bg-zinc-50 border border-zinc-100 rounded-xl">
            <a
              href={siteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 text-sm text-zinc-700 hover:text-zinc-900 truncate transition-colors"
            >
              {siteUrl.replace(/^https?:\/\//, "")}
            </a>
            <a
              href={siteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 p-1.5 rounded-md hover:bg-zinc-200 transition-colors"
              title="Open in new tab"
            >
              <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
            </a>
            <CopyUrlButton url={siteUrl} />
          </div>
        )}
      </div>

      {/* Custom domain */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-900 mb-3">
          Custom Domain
        </h2>
        <DomainPicker
          projectId={project.id}
          projectName={project.name}
          currentDomain={project.custom_domain ?? undefined}
        />
      </section>

      {/* Deployment history */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-900 mb-3">
          Deployment history
        </h2>
        {deployments.length === 0 ? (
          <div className="bg-white border border-zinc-200 rounded-xl p-6 text-center">
            <p className="text-sm text-zinc-400">No deployments yet.</p>
          </div>
        ) : (
          <div className="bg-white border border-zinc-200 rounded-xl divide-y divide-zinc-100 overflow-hidden">
            {deployments.map((d) => (
              <div
                key={d.id}
                className="flex items-center gap-3 px-4 py-3"
              >
                {d.status === "success" ? (
                  <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                ) : d.status === "failed" ? (
                  <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                ) : (
                  <Clock className="w-4 h-4 text-yellow-400 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-zinc-700 capitalize">
                    {d.status}
                  </span>
                </div>
                <span className="text-xs text-zinc-400 shrink-0">
                  {formatDistanceToNow(new Date(d.created_at), {
                    addSuffix: true,
                  })}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Danger zone */}
      <section>
        <DangerZone projectId={project.id} projectName={project.name} />
      </section>
    </div>
  );
}
