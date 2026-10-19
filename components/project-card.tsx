"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export type Project = {
  id: string;
  name: string;
  status: string;
  cloudflare_deploy_url: string | null;
  custom_domain: string | null;
  last_deployed_at: string | null;
  created_at: string;
};

const STATUS_BADGE: Record<string, { label: string; classes: string }> = {
  live: {
    label: "Live",
    classes: "bg-green-50 text-green-700 border-green-200",
  },
  building: {
    label: "Building",
    classes: "bg-yellow-50 text-yellow-700 border-yellow-200 animate-pulse",
  },
  failed: {
    label: "Failed",
    classes: "bg-red-50 text-red-700 border-red-100",
  },
  pending: {
    label: "Pending",
    classes: "bg-zinc-100 text-zinc-500 border-zinc-200",
  },
};

export default function ProjectCard({ project }: { project: Project }) {
  const [deleted, setDeleted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  if (deleted) return null;

  const siteUrl = project.custom_domain
    ? `https://${project.custom_domain}`
    : project.cloudflare_deploy_url;

  const badge =
    STATUS_BADGE[project.status] ?? {
      label: project.status,
      classes: "bg-zinc-100 text-zinc-500 border-zinc-200",
    };

  async function handleDelete() {
    setDeleting(true);
    setDeleted(true);
    setConfirmOpen(false);
    try {
      await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
    } catch {
      // optimistic removal — already gone from UI
    }
  }

  return (
    <>
      <div className="bg-white border border-zinc-200 rounded-2xl p-5 flex flex-col gap-3">
        {/* Top row: name + badge + menu */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-zinc-900 leading-snug truncate">
              {project.name}
            </h2>
            {siteUrl ? (
              <a
                href={siteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors mt-0.5 inline-block max-w-[220px] truncate"
              >
                {siteUrl.replace(/^https?:\/\//, "")}
              </a>
            ) : (
              <span className="text-xs text-zinc-300 mt-0.5 inline-block">
                No URL yet
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span
              className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${badge.classes}`}
            >
              {badge.label}
            </span>

            {/* Three-dot menu */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-zinc-100 transition-colors"
                aria-label="More options"
              >
                <MoreHorizontal className="w-4 h-4 text-zinc-400" />
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-44 bg-white border border-zinc-200 rounded-xl shadow-md py-1 z-20">
                  {siteUrl && (
                    <a
                      href={siteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 transition-colors"
                    >
                      Visit site
                    </a>
                  )}
                  <Link
                    href={`/dashboard/projects/${project.id}`}
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 transition-colors"
                  >
                    Manage domain
                  </Link>
                  <div className="my-1 border-t border-zinc-100" />
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      setConfirmOpen(true);
                    }}
                    className="w-full text-left flex items-center px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    Delete site
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Last deployed */}
        {project.last_deployed_at && (
          <p className="text-xs text-zinc-400">
            Deployed{" "}
            {formatDistanceToNow(new Date(project.last_deployed_at), {
              addSuffix: true,
            })}
          </p>
        )}
      </div>

      {/* Delete confirmation dialog */}
      {confirmOpen && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmOpen(false);
          }}
        >
          <div className="bg-white border border-zinc-200 rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="text-base font-semibold text-zinc-900 mb-1.5">
              Delete site?
            </h3>
            <p className="text-sm text-zinc-500 mb-5">
              Are you sure? This cannot be undone.{" "}
              <strong className="text-zinc-700">{project.name}</strong> and all
              its deployments will be permanently removed.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmOpen(false)}
                className="h-9 px-4 border border-zinc-200 rounded-lg text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="h-9 px-4 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
