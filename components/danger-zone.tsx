"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  projectId: string;
  projectName: string;
}

export default function DangerZone({ projectId, projectName }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
    } catch {
      // ignore
    }
    router.push("/dashboard");
  }

  return (
    <>
      <div className="border border-red-200 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-red-700 mb-1">Danger zone</h3>
        <p className="text-sm text-zinc-500 mb-4">
          Permanently delete this site and all its data. This cannot be undone.
        </p>
        <button
          onClick={() => setOpen(true)}
          className="h-9 px-4 border border-red-200 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors"
        >
          Delete this site
        </button>
      </div>

      {/* Confirmation dialog */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="bg-white border border-zinc-200 rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="text-base font-semibold text-zinc-900 mb-1.5">
              Delete site?
            </h3>
            <p className="text-sm text-zinc-500 mb-5">
              Are you sure? This cannot be undone.{" "}
              <strong className="text-zinc-700">{projectName}</strong> and all
              its deployments will be permanently removed.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
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
