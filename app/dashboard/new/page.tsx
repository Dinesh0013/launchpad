"use client";

export const dynamic = "force-dynamic";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Upload, GitFork, Link as LinkIcon, ArrowLeft, Loader2, AlertTriangle } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type MethodId = "github" | "drop_file" | "paste_url";

const METHODS: {
  id: MethodId;
  label: string;
  subtitle: string;
  Icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    id: "github",
    label: "GitHub repo",
    subtitle: "Public repositories only",
    Icon: GitFork,
  },
  {
    id: "drop_file",
    label: "Upload ZIP",
    subtitle: "Upload a ZIP or HTML file",
    Icon: Upload,
  },
  {
    id: "paste_url",
    label: "Paste a link",
    subtitle: "Lovable, Bolt, v0, or any URL",
    Icon: LinkIcon,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nameFromFile(filename: string): string {
  const base = filename
    .replace(/\.(zip|html?|htm)$/i, "")
    .replace(/[-_]+/g, " ")
    .trim();
  return base || "my-site";
}

function nameFromUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const segs = u.pathname.split("/").filter(Boolean);
    const last = segs[segs.length - 1] ?? u.hostname.split(".")[0];
    return last.replace(/[-_]+/g, " ").trim() || "my-site";
  } catch {
    return "my-site";
  }
}

function isGithubUrl(v: string): boolean {
  return v.startsWith("https://github.com/");
}

function isValidUrl(v: string): boolean {
  try {
    new URL(v);
    return true;
  } catch {
    return false;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function NewSitePage() {
  const router = useRouter();

  const [step, setStep] = useState<1 | 2>(1);
  const [method, setMethod] = useState<MethodId | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [urlValue, setUrlValue] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [siteName, setSiteName] = useState("my-site");
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [ingestError, setIngestError] = useState<string | null>(null);

  // Backend-form warning: ingest succeeded but form may not work
  const [backendWarning, setBackendWarning] = useState<string | null>(null);
  const [pendingPid, setPendingPid] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Step-1 action ──────────────────────────────────────────────────────────
  function selectMethod(id: MethodId) {
    setMethod(id);
    setFile(null);
    setUrlValue("");
    setUrlError(null);
    setIngestError(null);
    setBackendWarning(null);
    setPendingPid(null);
    setSiteName("my-site");
    setStep(2);
  }

  // ─── File handling ──────────────────────────────────────────────────────────
  function pickFile(f: File | null) {
    if (!f) return;
    const name = f.name.toLowerCase();
    if (!name.endsWith(".zip") && !name.endsWith(".html") && !name.endsWith(".htm")) return;
    setFile(f);
    setSiteName(nameFromFile(f.name));
  }

  // ─── URL handling ───────────────────────────────────────────────────────────
  function handleUrlChange(val: string) {
    setUrlValue(val);
    if (urlError) setUrlError(null);
    if (ingestError) setIngestError(null);
    if (backendWarning) { setBackendWarning(null); setPendingPid(null); }
    const valid = method === "github" ? isGithubUrl(val) : isValidUrl(val);
    if (valid) setSiteName(nameFromUrl(val));
  }

  function validateUrlOnBlur() {
    if (!urlValue) return;
    if (method === "github" && !isGithubUrl(urlValue)) {
      setUrlError("Please enter a GitHub URL (e.g. https://github.com/user/repo)");
    } else if (method === "paste_url" && !isValidUrl(urlValue)) {
      setUrlError("Please enter a valid URL");
    }
  }

  // ─── Input validity ─────────────────────────────────────────────────────────
  function isInputValid(): boolean {
    if (method === "drop_file") return file !== null;
    if (method === "github") return isGithubUrl(urlValue);
    if (method === "paste_url") return isValidUrl(urlValue);
    return false;
  }

  // ─── Navigate to deploy page ─────────────────────────────────────────────────
  function proceedToDeploy(pid: string) {
    fetch("/api/deploy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: pid }),
    }).catch(() => {});
    router.push(`/deploy/${pid}`);
  }

  // ─── Deploy ─────────────────────────────────────────────────────────────────
  async function startDeploy() {
    if (!method || submitting) return;
    setSubmitting(true);
    setIngestError(null);
    setBackendWarning(null);
    setPendingPid(null);

    try {
      let ingestRes: Response;

      if (method === "drop_file") {
        const fd = new FormData();
        fd.append("file", file!);
        fd.append("project_name", siteName);
        ingestRes = await fetch("/api/ingest/upload", { method: "POST", body: fd });
      } else if (method === "github") {
        ingestRes = await fetch("/api/ingest/github", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repo_url: urlValue, project_name: siteName }),
        });
      } else {
        ingestRes = await fetch("/api/ingest/url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: urlValue, project_name: siteName }),
        });
      }

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

  // ════════════════════════════════════════════════════════════════════════════
  // STEP 1 — Choose method
  // ════════════════════════════════════════════════════════════════════════════
  if (step === 1) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-xl font-semibold text-zinc-900">Deploy a new site</h1>
          <p className="text-sm text-zinc-500 mt-1">Choose how you want to bring your site in</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {METHODS.map(({ id, label, subtitle, Icon }) => (
            <button
              key={id}
              onClick={() => selectMethod(id)}
              className={`group flex flex-col items-start gap-3 p-5 bg-white border-2 rounded-2xl text-left transition-all hover:shadow-sm active:scale-[0.99] ${
                method === id
                  ? "border-zinc-900 shadow-sm"
                  : "border-zinc-200 hover:border-zinc-400"
              }`}
            >
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                  method === id ? "bg-zinc-900" : "bg-zinc-100 group-hover:bg-zinc-200"
                }`}
              >
                <Icon className={`w-5 h-5 ${method === id ? "text-white" : "text-zinc-700"}`} />
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-900">{label}</p>
                <p className="text-xs text-zinc-500 mt-0.5">{subtitle}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // STEP 2 — Input
  // ════════════════════════════════════════════════════════════════════════════
  const stepTitle =
    method === "drop_file"
      ? "Upload your project"
      : method === "github"
        ? "Connect a GitHub repo"
        : "Paste your site link";

  const urlPlaceholder =
    method === "github"
      ? "https://github.com/username/repo-name"
      : "https://preview--xxx.lovable.app, bolt.new/..., or v0.dev/...";

  return (
    <div className="max-w-xl mx-auto">
      {/* Back */}
      <button
        onClick={() => {
          setStep(1);
          setIngestError(null);
          setBackendWarning(null);
          setPendingPid(null);
        }}
        className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 transition-colors mb-6"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back
      </button>

      <h1 className="text-xl font-semibold text-zinc-900 mb-6">{stepTitle}</h1>

      <div className="space-y-4">
        {/* ── File drop zone ── */}
        {method === "drop_file" && (
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pickFile(e.dataTransfer.files[0] ?? null);
            }}
            className={`cursor-pointer rounded-2xl border-2 border-dashed p-10 flex flex-col items-center justify-center gap-2.5 text-center transition-colors ${
              dragging
                ? "border-zinc-500 bg-zinc-50"
                : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50"
            }`}
          >
            <Upload className="w-7 h-7 text-zinc-300" />
            {file ? (
              <div>
                <p className="text-sm font-semibold text-zinc-900">{file.name}</p>
                <p className="text-xs text-zinc-400 mt-0.5">Click to replace</p>
              </div>
            ) : (
              <>
                <p className="text-sm font-medium text-zinc-700">Drop your file here or click to browse</p>
                <p className="text-xs text-zinc-400">Accepts ZIP, HTML files</p>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip,.html,.htm"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
          </div>
        )}

        {/* ── URL input (GitHub or paste_url) ── */}
        {(method === "github" || method === "paste_url") && (
          <div>
            <input
              type="url"
              value={urlValue}
              onChange={(e) => handleUrlChange(e.target.value)}
              onBlur={validateUrlOnBlur}
              placeholder={urlPlaceholder}
              className={`w-full h-10 px-3 border rounded-lg text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition ${
                urlError ? "border-red-300 bg-red-50/40" : "border-zinc-200"
              }`}
            />
            {urlError && <p className="mt-1.5 text-xs text-red-500">{urlError}</p>}
          </div>
        )}

        {/* ── Site name ── */}
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1.5">Site name</label>
          <input
            type="text"
            value={siteName}
            onChange={(e) => setSiteName(e.target.value)}
            placeholder="my-awesome-site"
            className="w-full h-10 px-3 border border-zinc-200 rounded-lg text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition"
          />
        </div>

        {/* ── Ingest error ── */}
        {ingestError && <p className="text-xs text-red-500 px-1">{ingestError}</p>}

        {/* ── Backend form warning ── */}
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

        {/* ── Actions (hidden while showing warning) ── */}
        {!backendWarning && (
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={startDeploy}
              disabled={!isInputValid() || !siteName.trim() || submitting}
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
