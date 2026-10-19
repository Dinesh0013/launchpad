"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, AlertTriangle } from "lucide-react";

const MAX_HTML_BYTES = 2 * 1024 * 1024; // keep in sync with /api/ingest/html

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export default function NewSitePage() {
  const router = useRouter();

  const [html, setHtml] = useState("");
  const [siteName, setSiteName] = useState("my-site");
  const [submitting, setSubmitting] = useState(false);
  const [ingestError, setIngestError] = useState<string | null>(null);

  // Backend-form warning: ingest succeeded but form may not work
  const [backendWarning, setBackendWarning] = useState<string | null>(null);
  const [pendingPid, setPendingPid] = useState<string | null>(null);

  const tooLarge = byteLength(html) > MAX_HTML_BYTES;
  const canDeploy = html.trim().length > 0 && siteName.trim().length > 0 && !tooLarge;

  function proceedToDeploy(pid: string) {
    fetch("/api/deploy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: pid }),
    }).catch(() => {});
    router.push(`/deploy/${pid}`);
  }

  async function startDeploy() {
    if (!canDeploy || submitting) return;
    setSubmitting(true);
    setIngestError(null);
    setBackendWarning(null);
    setPendingPid(null);

    try {
      const ingestRes = await fetch("/api/ingest/html", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html, project_name: siteName.trim() }),
      });

      const ingestData = (await ingestRes.json().catch(() => ({}))) as Record<string, unknown>;

      if (!ingestRes.ok || !ingestData.project_id) {
        setIngestError(
          typeof ingestData.error === "string"
            ? ingestData.error
            : "Something went wrong. Please try again.",
        );
        setSubmitting(false);
        return;
      }

      const pid = ingestData.project_id as string;

      // If the ingest detected a backend form, show warning before navigating
      if (ingestData.warning === "BACKEND_FORM" && typeof ingestData.message === "string") {
        setPendingPid(pid);
        setBackendWarning(ingestData.message);
        setSubmitting(false);
        return;
      }

      proceedToDeploy(pid);
    } catch {
      setIngestError("Failed to start deployment. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-900">Deploy a new site</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Paste the HTML (or the full page code) of your website and we&apos;ll publish it.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="site-html" className="block text-sm font-medium text-zinc-700 mb-1.5">
            Website code
          </label>
          <textarea
            id="site-html"
            value={html}
            onChange={(e) => {
              setHtml(e.target.value);
              if (ingestError) setIngestError(null);
              if (backendWarning) { setBackendWarning(null); setPendingPid(null); }
            }}
            spellCheck={false}
            placeholder={"<!DOCTYPE html>\n<html>\n  <head><title>My site</title></head>\n  <body>…</body>\n</html>"}
            rows={16}
            className={`w-full px-3 py-2.5 border rounded-lg text-sm font-mono text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition ${
              tooLarge ? "border-red-300 bg-red-50/40" : "border-zinc-200"
            }`}
          />
          <p className={`mt-1.5 text-xs ${tooLarge ? "text-red-500" : "text-zinc-400"}`}>
            {tooLarge
              ? "Too large — the limit is 2 MB."
              : "Single-page HTML, with CSS and JavaScript inline (<style> and <script> tags)."}
          </p>
        </div>

        <div>
          <label htmlFor="site-name" className="block text-sm font-medium text-zinc-700 mb-1.5">
            Site name
          </label>
          <input
            id="site-name"
            type="text"
            value={siteName}
            onChange={(e) => setSiteName(e.target.value)}
            placeholder="my-awesome-site"
            className="w-full h-10 px-3 border border-zinc-200 rounded-lg text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition"
          />
        </div>

        {ingestError && <p className="text-xs text-red-500 px-1">{ingestError}</p>}

        {backendWarning && pendingPid && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-amber-900 mb-1">Heads up</p>
              <p className="text-xs text-amber-700 mb-3">{backendWarning}</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => proceedToDeploy(pendingPid)}
                  className="h-8 px-4 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  Deploy anyway
                </button>
                <button
                  onClick={() => { setBackendWarning(null); setPendingPid(null); }}
                  className="h-8 px-3 text-xs text-zinc-500 hover:text-zinc-900 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {!backendWarning && (
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={startDeploy}
              disabled={!canDeploy || submitting}
              className="h-10 px-5 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-2"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {submitting ? "Preparing…" : "Deploy now →"}
            </button>
            <Link
              href="/dashboard"
              className="h-10 px-4 text-sm font-medium text-zinc-500 hover:text-zinc-900 transition-colors inline-flex items-center"
            >
              Cancel
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
