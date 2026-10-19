"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle, ExternalLink, Loader2, RotateCcw, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface Suggestion {
  domain: string;
  available: boolean;
  price_usd: number;
  confidence: "high" | "low";
  tld: string;
}

interface Props {
  projectId: string;
  projectName: string;
  currentDomain?: string;
  onConnected?: (domain: string) => void;
}

type Phase =
  | { name: "search" }
  | { name: "searching" }
  | { name: "results"; suggestions: Suggestion[]; query: string }
  | { name: "confirming"; suggestion: Suggestion }
  | { name: "connecting"; domain: string }
  | { name: "connected"; domain: string; cnameTarget: string; domainStatus: "pending" | "active" }
  | { name: "existing"; domain: string; cnameTarget: string; domainStatus: "pending" | "active" | "none" };

const MAX_POLL_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 10_000;

export default function DomainPicker({
  projectId,
  projectName,
  currentDomain,
  onConnected,
}: Props) {
  const [phase, setPhase] = useState<Phase>(
    currentDomain
      ? { name: "existing", domain: currentDomain, cnameTarget: "", domainStatus: "pending" }
      : { name: "search" }
  );
  const [query, setQuery] = useState("");
  const [queryError, setQueryError] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartRef = useRef<number>(0);

  // Fetch current status when showing existing domain
  useEffect(() => {
    if (phase.name !== "existing" || !phase.domain) return;
    fetchStatus(phase.domain, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup poll on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function fetchStatus(domain: string, isExisting = false) {
    try {
      const res = await fetch(`/api/domains/status/${encodeURIComponent(domain)}`);
      if (!res.ok) return;
      const data = await res.json() as {
        status: string;
        cname_target: string;
        verified: boolean;
      };
      const st = data.status === "active" ? "active" : "pending";
      if (isExisting) {
        setPhase({ name: "existing", domain, cnameTarget: data.cname_target, domainStatus: st });
      } else {
        setPhase({ name: "connected", domain, cnameTarget: data.cname_target, domainStatus: st });
      }
    } catch {
      // ignore
    }
  }

  function startStatusPoll(domain: string, cnameTarget: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollStartRef.current = Date.now();

    pollRef.current = setInterval(async () => {
      if (Date.now() - pollStartRef.current > MAX_POLL_MS) {
        if (pollRef.current) clearInterval(pollRef.current);
        return;
      }
      try {
        const res = await fetch(`/api/domains/status/${encodeURIComponent(domain)}`);
        if (!res.ok) return;
        const data = await res.json() as { status: string; cname_target: string };
        if (data.status === "active") {
          if (pollRef.current) clearInterval(pollRef.current);
          setPhase({ name: "connected", domain, cnameTarget: data.cname_target || cnameTarget, domainStatus: "active" });
        }
      } catch {
        // network hiccup — keep polling
      }
    }, POLL_INTERVAL_MS);
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) {
      setQueryError("Please enter a domain name");
      return;
    }
    if (q.includes(" ")) {
      setQueryError("No spaces allowed");
      return;
    }
    if (/^https?:\/\//i.test(q)) {
      setQueryError("Enter just the name, not a full URL");
      return;
    }
    setQueryError(null);
    setPhase({ name: "searching" });

    try {
      const res = await fetch("/api/domains/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        setQueryError(data.error ?? "Search failed. Please try again.");
        setPhase({ name: "search" });
        return;
      }
      const data = await res.json() as { query: string; suggestions: Suggestion[] };
      setPhase({ name: "results", suggestions: data.suggestions, query: data.query });
    } catch {
      setQueryError("Network error. Please try again.");
      setPhase({ name: "search" });
    }
  }

  async function handleConnect(suggestion: Suggestion) {
    setConnectError(null);
    setPhase({ name: "connecting", domain: suggestion.domain });

    try {
      const res = await fetch("/api/domains/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, domain: suggestion.domain }),
      });
      const data = await res.json() as {
        success?: boolean;
        error?: string;
        cname_target?: string;
      };

      if (!res.ok || !data.success) {
        setConnectError(data.error ?? "Failed to connect domain. Please try again.");
        setPhase({ name: "confirming", suggestion });
        return;
      }

      const cnameTarget = data.cname_target ?? `${projectId}.pages.dev`;
      setPhase({
        name: "connected",
        domain: suggestion.domain,
        cnameTarget,
        domainStatus: "pending",
      });
      startStatusPoll(suggestion.domain, cnameTarget);
      onConnected?.(suggestion.domain);
    } catch {
      setConnectError("Network error. Please try again.");
      setPhase({ name: "confirming", suggestion });
    }
  }

  async function handleRemoveDomain() {
    try {
      await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ custom_domain: null }),
      });
      if (pollRef.current) clearInterval(pollRef.current);
      setPhase({ name: "search" });
    } catch {
      // ignore
    }
  }

  // ─── Phase: search ────────────────────────────────────────────────────────
  if (phase.name === "search" || phase.name === "searching") {
    return (
      <div className="space-y-4">
        <form onSubmit={handleSearch} className="space-y-3">
          <div>
            <div className="flex gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (queryError) setQueryError(null);
                }}
                placeholder="mybusiness"
                disabled={phase.name === "searching"}
                className={`flex-1 h-10 px-3 border rounded-lg text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition ${
                  queryError ? "border-red-300 bg-red-50/30" : "border-zinc-200"
                } disabled:opacity-60`}
              />
              <button
                type="submit"
                disabled={phase.name === "searching"}
                className="h-10 px-4 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-2"
              >
                {phase.name === "searching" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {phase.name === "searching" ? "Searching…" : "Check availability"}
              </button>
            </div>
            {queryError && <p className="mt-1.5 text-xs text-red-500">{queryError}</p>}
            <p className="mt-1.5 text-xs text-zinc-400">
              We&apos;ll check .com, .co, .io and more
            </p>
          </div>
        </form>

        {/* Loading skeletons */}
        {phase.name === "searching" && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="bg-white border border-zinc-100 rounded-xl p-4 space-y-3">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-8 w-full rounded-lg" />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ─── Phase: results ───────────────────────────────────────────────────────
  if (phase.name === "results") {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {phase.suggestions.slice(0, 6).map((s) => (
            <div
              key={s.domain}
              className={`bg-white border rounded-xl p-4 flex flex-col gap-2 transition-opacity ${
                s.available ? "border-zinc-200" : "border-zinc-100 opacity-50"
              }`}
            >
              <div className="flex items-start justify-between gap-1">
                <span className="text-sm font-bold text-zinc-900 break-all">{s.domain}</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                    s.available
                      ? "bg-green-50 text-green-700 border-green-200"
                      : "bg-zinc-100 text-zinc-400 border-zinc-200"
                  }`}
                >
                  {s.available ? "Available" : "Taken"}
                </span>
                {s.confidence === "low" && (
                  <span className="text-xs text-zinc-400">(estimated)</span>
                )}
              </div>
              {s.available && (
                <>
                  <p className="text-xs text-zinc-500">${s.price_usd.toFixed(2)}/yr</p>
                  <button
                    onClick={() => setPhase({ name: "confirming", suggestion: s })}
                    className="mt-auto h-8 w-full bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-medium rounded-lg transition-colors"
                  >
                    Connect this domain
                  </button>
                </>
              )}
            </div>
          ))}
        </div>

        <button
          onClick={() => {
            setPhase({ name: "search" });
            setConnectError(null);
          }}
          className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
        >
          ← Search again
        </button>
      </div>
    );
  }

  // ─── Phase: confirming ────────────────────────────────────────────────────
  if (phase.name === "confirming") {
    const { suggestion } = phase;
    return (
      <div className="bg-white border border-zinc-200 rounded-xl p-5 space-y-4">
        <div>
          <p className="text-sm font-semibold text-zinc-900 mb-1">
            Connect <span className="text-blue-600">{suggestion.domain}</span> to{" "}
            <span className="text-zinc-700">{projectName}</span>?
          </p>
          <p className="text-xs text-zinc-500">
            Your site will be available at{" "}
            <strong>https://{suggestion.domain}</strong> once DNS propagates
            (usually under 5 minutes).
          </p>
        </div>
        {connectError && <p className="text-xs text-red-500">{connectError}</p>}
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleConnect(suggestion)}
            className="h-9 px-4 bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Confirm
          </button>
          <button
            onClick={() => {
              setConnectError(null);
              setPhase({ name: "results", suggestions: [], query: query });
              // Re-fetch results to go back properly
              setPhase({ name: "search" });
            }}
            className="h-9 px-3 text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ─── Phase: connecting ────────────────────────────────────────────────────
  if (phase.name === "connecting") {
    return (
      <div className="flex items-center gap-3 p-4 bg-white border border-zinc-200 rounded-xl">
        <Loader2 className="w-4 h-4 animate-spin text-zinc-500 shrink-0" />
        <p className="text-sm text-zinc-700">
          Connecting <strong>{phase.domain}</strong>…
        </p>
      </div>
    );
  }

  // ─── Phase: connected ─────────────────────────────────────────────────────
  if (phase.name === "connected") {
    const { domain, cnameTarget, domainStatus } = phase;
    const isActive = domainStatus === "active";

    return (
      <div className="space-y-3">
        <div
          className={`rounded-xl border p-4 space-y-2 ${
            isActive
              ? "border-green-200 bg-green-50"
              : "border-blue-200 bg-blue-50"
          }`}
        >
          <div className="flex items-center gap-2">
            {isActive ? (
              <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
            ) : (
              <Loader2 className="w-4 h-4 animate-spin text-blue-500 shrink-0" />
            )}
            <p
              className={`text-sm font-semibold ${
                isActive ? "text-green-800" : "text-blue-800"
              }`}
            >
              {isActive
                ? `✅ ${domain} is live!`
                : `🎉 ${domain} is being connected to your site`}
            </p>
          </div>

          {isActive ? (
            <a
              href={`https://${domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-green-700 hover:text-green-900 transition-colors"
            >
              Visit your site <ExternalLink className="w-3.5 h-3.5" />
            </a>
          ) : (
            <p className="text-xs text-blue-700">
              DNS usually propagates in under 5 minutes. Your site will be live at{" "}
              <strong>https://{domain}</strong> shortly.
            </p>
          )}

          {!isActive && (
            <button
              onClick={() => fetchStatus(domain)}
              className="h-7 px-3 border border-blue-300 text-blue-700 hover:bg-blue-100 text-xs font-medium rounded-lg transition-colors inline-flex items-center gap-1.5"
            >
              <RotateCcw className="w-3 h-3" />
              Check status
            </button>
          )}
        </div>

        {cnameTarget && !isActive && (
          <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4">
            <p className="text-xs text-zinc-600 leading-relaxed">
              <strong>Note:</strong> LaunchPad connects the domain to Cloudflare Pages. You still
              need to own the domain and point its DNS to{" "}
              <code className="font-mono bg-zinc-100 px-1 rounded">{cnameTarget}</code>. If you
              bought the domain elsewhere, update its CNAME record to point to{" "}
              <code className="font-mono bg-zinc-100 px-1 rounded">{cnameTarget}</code>.
            </p>
          </div>
        )}
      </div>
    );
  }

  // ─── Phase: existing ─────────────────────────────────────────────────────
  if (phase.name === "existing") {
    const { domain, cnameTarget, domainStatus } = phase;
    const isActive = domainStatus === "active";

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between p-4 bg-white border border-zinc-200 rounded-xl">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-sm font-medium text-zinc-900 truncate">{domain}</span>
            <span
              className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full border ${
                isActive
                  ? "bg-green-50 text-green-700 border-green-200"
                  : "bg-amber-50 text-amber-700 border-amber-200"
              }`}
            >
              {isActive ? "Active" : "Pending"}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-3">
            {isActive && (
              <a
                href={`https://${domain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-md hover:bg-zinc-100 transition-colors"
                title="Visit site"
              >
                <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
              </a>
            )}
            <button
              onClick={handleRemoveDomain}
              className="p-1.5 rounded-md hover:bg-zinc-100 transition-colors"
              title="Remove domain"
            >
              <X className="w-3.5 h-3.5 text-zinc-400 hover:text-red-500" />
            </button>
          </div>
        </div>

        {!isActive && cnameTarget && (
          <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4">
            <p className="text-xs text-zinc-600 leading-relaxed">
              <strong>CNAME target:</strong>{" "}
              <code className="font-mono bg-zinc-100 px-1 rounded">{cnameTarget}</code>
              . Point your domain&apos;s CNAME record here to activate it.
            </p>
            <button
              onClick={() => fetchStatus(domain, true)}
              className="mt-2 h-7 px-3 border border-zinc-200 text-zinc-600 hover:bg-zinc-100 text-xs font-medium rounded-lg transition-colors inline-flex items-center gap-1.5"
            >
              <RotateCcw className="w-3 h-3" />
              Check status
            </button>
          </div>
        )}
      </div>
    );
  }

  return null;
}
