"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, Copy, Check, ChevronDown, ChevronUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { DomainResult } from "@/lib/domains";

interface DnsRecord {
  type: string;
  name: string;
  value: string;
  ttl: string;
}

interface Props {
  projectId: string;
  initialDomain: string | null;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button
      onClick={copy}
      className="p-1.5 rounded-md hover:bg-zinc-100 transition-colors"
      title="Copy"
    >
      {copied ? (
        <Check className="w-3.5 h-3.5 text-green-600" />
      ) : (
        <Copy className="w-3.5 h-3.5 text-zinc-400" />
      )}
    </button>
  );
}

export default function DomainSection({ projectId, initialDomain }: Props) {
  const [connectedDomain, setConnectedDomain] = useState<string | null>(
    initialDomain
  );

  // ── STATE A: search ──────────────────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DomainResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── STATE A: connect own domain ──────────────────────────────────────────
  const [showConnect, setShowConnect] = useState(false);
  const [connectInput, setConnectInput] = useState("");
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [dnsRecords, setDnsRecords] = useState<DnsRecord[] | null>(null);

  // ── Debounced search ─────────────────────────────────────────────────────
  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults(null);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(
        `/api/domains/search?q=${encodeURIComponent(q)}`
      );
      if (res.ok) {
        const data: DomainResult[] = await res.json();
        setResults(data);
      }
    } finally {
      setSearching(false);
    }
  }, []);

  function handleQueryChange(val: string) {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 600);
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // ── Connect own domain ───────────────────────────────────────────────────
  async function handleConnect() {
    setConnectError(null);
    const domain = connectInput.trim().toLowerCase();
    if (!domain) {
      setConnectError("Please enter a domain name");
      return;
    }
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z]{2,})+$/.test(domain)) {
      setConnectError("Please enter a valid domain (e.g. mysite.com)");
      return;
    }
    setConnecting(true);
    try {
      const res = await fetch(`/api/domains/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, domain }),
      });
      const data = await res.json();
      if (!res.ok) {
        setConnectError(data.error ?? "Failed to connect domain");
        return;
      }
      setDnsRecords(data.dns_records ?? []);
      setConnectedDomain(domain);
    } catch {
      setConnectError("Network error. Please try again.");
    } finally {
      setConnecting(false);
    }
  }

  // ── Remove domain ────────────────────────────────────────────────────────
  async function handleRemoveDomain() {
    try {
      await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ custom_domain: null }),
      });
      setConnectedDomain(null);
      setDnsRecords(null);
      setConnectInput("");
      setShowConnect(false);
    } catch {
      // ignore
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // STATE B — Domain connected
  // ════════════════════════════════════════════════════════════════════════
  if (connectedDomain) {
    return (
      <div>
        <div className="flex items-center justify-between p-4 bg-white border border-zinc-200 rounded-xl">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-zinc-900">
              {connectedDomain}
            </span>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200">
              Pending verification
            </span>
          </div>
          <button
            onClick={handleRemoveDomain}
            className="text-xs text-zinc-400 hover:text-red-500 transition-colors"
          >
            Remove domain
          </button>
        </div>

        {dnsRecords && dnsRecords.length > 0 && (
          <div className="mt-4 bg-white border border-zinc-200 rounded-xl p-4">
            <p className="text-sm font-medium text-zinc-900 mb-3">
              Add this DNS record to your domain registrar
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-zinc-400 border-b border-zinc-100">
                    <th className="text-left pb-2 font-medium">Type</th>
                    <th className="text-left pb-2 font-medium">Name</th>
                    <th className="text-left pb-2 font-medium">Value</th>
                    <th className="text-left pb-2 font-medium">TTL</th>
                  </tr>
                </thead>
                <tbody>
                  {dnsRecords.map((r, i) => (
                    <tr key={i} className="border-b border-zinc-50 last:border-0">
                      <td className="py-2 pr-4 font-mono text-xs text-zinc-700">
                        {r.type}
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs text-zinc-700">
                        {r.name}
                      </td>
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-xs text-zinc-700 break-all">
                            {r.value}
                          </span>
                          <CopyButton text={r.value} />
                        </div>
                      </td>
                      <td className="py-2 font-mono text-xs text-zinc-400">
                        {r.ttl}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-zinc-400">
              DNS changes can take up to 24 hours to propagate.
            </p>
          </div>
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // STATE A — No domain connected
  // ════════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Search for a domain (e.g. mycoolapp)"
          className="w-full h-10 pl-9 pr-3 border border-zinc-200 rounded-lg text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition bg-white"
        />
      </div>

      {/* Loading skeletons */}
      {searching && (
        <div className="bg-white border border-zinc-200 rounded-xl divide-y divide-zinc-100">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center justify-between px-4 py-3">
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="h-8 w-28 rounded-lg" />
            </div>
          ))}
        </div>
      )}

      {/* Results */}
      {!searching && results && results.length > 0 && (
        <div className="bg-white border border-zinc-200 rounded-xl divide-y divide-zinc-100 overflow-hidden">
          {results.map((r) => (
            <div
              key={r.domain}
              className="flex items-center justify-between px-4 py-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-sm font-medium text-zinc-900 truncate">
                  {r.domain}
                </span>
                <span
                  className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full border ${
                    r.available
                      ? "bg-green-50 text-green-700 border-green-200"
                      : "bg-zinc-100 text-zinc-400 border-zinc-200"
                  }`}
                >
                  {r.available ? "Available" : "Taken"}
                </span>
              </div>

              <div className="flex items-center gap-3 shrink-0 ml-3">
                {r.available && r.price_usd !== null && (
                  <span className="text-sm text-zinc-500">
                    £{r.price_usd.toFixed(2)}/yr
                  </span>
                )}
                {r.available && (
                  <a
                    href={r.buy_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="h-8 px-3 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-medium rounded-lg inline-flex items-center transition-colors whitespace-nowrap"
                  >
                    Buy on Namecheap →
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Already own a domain */}
      <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowConnect((o) => !o)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors"
        >
          <span>Already own a domain? Connect it</span>
          {showConnect ? (
            <ChevronUp className="w-4 h-4 text-zinc-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-zinc-400" />
          )}
        </button>

        {showConnect && (
          <div className="px-4 pb-4 space-y-3 border-t border-zinc-100">
            <div className="pt-3">
              <input
                type="text"
                value={connectInput}
                onChange={(e) => {
                  setConnectInput(e.target.value);
                  if (connectError) setConnectError(null);
                }}
                placeholder="yourdomain.com"
                className={`w-full h-10 px-3 border rounded-lg text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition ${
                  connectError ? "border-red-300 bg-red-50/30" : "border-zinc-200"
                }`}
              />
              {connectError && (
                <p className="mt-1.5 text-xs text-red-500">{connectError}</p>
              )}
            </div>
            <button
              onClick={handleConnect}
              disabled={connecting || !connectInput.trim()}
              className="h-9 px-4 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              {connecting ? "Connecting..." : "Connect"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
