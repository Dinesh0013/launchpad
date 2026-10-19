"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ShieldCheck,
  GitBranch,
  CloudUpload,
  Zap,
  Rocket,
  Globe,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import DomainPicker from "@/components/domains/DomainPicker";

interface BuildLogEntry {
  stage: string;
  level: string;
  message: string;
  created_at: string;
}

interface StatusResponse {
  status: string;
  cloudflare_deploy_url?: string;
  subdomain?: string;
  stage?: string | null;
  buildLogs?: BuildLogEntry[];
}

interface Props {
  projectId: string;
  projectName?: string;
}

const STAGES = [
  { label: "Validating repository", Icon: ShieldCheck },
  { label: "Cloning source files", Icon: GitBranch },
  { label: "Uploading to storage", Icon: CloudUpload },
  { label: "Provisioning Cloudflare", Icon: Zap },
  { label: "Deploying files", Icon: Rocket },
  { label: "Propagating globally", Icon: Globe },
  { label: "Live", Icon: CheckCircle },
] as const;

// Maps real backend status/stage to a UI stage index.
// Uses `stage` (deployment-level) when available; falls back to `status` (project-level).
function mapToStageIndex(status: string, stage: string | null | undefined): number {
  const key = stage ?? status;
  switch (key) {
    case "validating":   return 0;
    case "building":     return 1;
    case "uploading":    return 2;
    case "provisioning": return 3;
    case "deploying":    return 4;
    case "propagating":  return 5;
    case "live":         return 6;
    default:             return 0;
  }
}

export default function DeployProgress({ projectId, projectName }: Props) {
  const router = useRouter();

  const [activeStage, setActiveStage] = useState(0);
  const [domainExpanded, setDomainExpanded] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [isFailed, setIsFailed] = useState(false);
  const [liveUrl, setLiveUrl] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [pulsing, setPulsing] = useState(false);
  const [buildLogs, setBuildLogs] = useState<BuildLogEntry[]>([]);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const resolvedRef = useRef(false);
  const logPanelRef = useRef<HTMLDivElement>(null);

  // Elapsed second counter
  useEffect(() => {
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Auto-scroll log panel to bottom when new entries arrive
  useEffect(() => {
    if (logPanelRef.current) {
      logPanelRef.current.scrollTop = logPanelRef.current.scrollHeight;
    }
  }, [buildLogs]);

  // Status polling every 3s
  useEffect(() => {
    pollRef.current = setInterval(async () => {
      if (resolvedRef.current) return;
      try {
        const res = await fetch(`/api/projects/${projectId}/status`);
        if (!res.ok) return;
        const data = (await res.json()) as StatusResponse;

        if (data.buildLogs) {
          setBuildLogs(data.buildLogs);
        }

        if (data.status === "live") {
          resolvedRef.current = true;
          if (pollRef.current) clearInterval(pollRef.current);
          if (timerRef.current) clearInterval(timerRef.current);
          setActiveStage(6);
          setLiveUrl(data.cloudflare_deploy_url ?? null);
          setIsLive(true);
          setPulsing(true);
          setTimeout(() => setPulsing(false), 2000);
        } else if (data.status === "failed") {
          resolvedRef.current = true;
          if (pollRef.current) clearInterval(pollRef.current);
          setIsFailed(true);
        } else {
          const target = mapToStageIndex(data.status, data.stage);
          // Only advance forward — never jump back
          setActiveStage((prev) => Math.max(prev, target));
        }
      } catch {
        // network hiccup — keep polling
      }
    }, 3000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [projectId]);

  return (
    <div className="max-w-lg mx-auto">
      {/* Stage timeline */}
      <div className="space-y-1 mb-8">
        {STAGES.map(({ label, Icon }, i) => {
          const isActive = !isLive && !isFailed && i === activeStage;
          const isCompleted = isLive ? true : !isFailed && i < activeStage;
          const isError = isFailed && i === activeStage;
          const isPending = !isActive && !isCompleted && !isError;

          return (
            <div
              key={i}
              className={[
                "relative flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all duration-300",
                isActive ? "bg-blue-50 border-l-2 border-blue-500" : "",
                isCompleted ? "opacity-60" : "",
                isPending ? "opacity-40" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {/* Icon circle */}
              <div
                className={[
                  "relative w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors duration-300",
                  isError
                    ? "bg-red-100"
                    : isCompleted
                    ? "bg-green-100"
                    : isActive
                    ? "bg-blue-100"
                    : "bg-zinc-100",
                ].join(" ")}
              >
                {/* Pulse ring on live stage */}
                {isLive && i === 6 && pulsing && (
                  <span className="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-40" />
                )}

                {isError ? (
                  <XCircle className="w-[18px] h-[18px] text-red-500" />
                ) : isCompleted ? (
                  <CheckCircle className="w-[18px] h-[18px] text-green-600" />
                ) : (
                  <Icon
                    className={`w-[18px] h-[18px] ${
                      isActive ? "text-blue-600" : "text-zinc-400"
                    }`}
                  />
                )}
              </div>

              {/* Label */}
              <span
                className={`text-sm font-medium ${
                  isError
                    ? "text-red-600"
                    : isCompleted
                    ? "text-zinc-500"
                    : isActive
                    ? "text-zinc-900"
                    : "text-zinc-400"
                }`}
              >
                {label}
              </span>

              {/* Shimmer bar — active stage only */}
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-[2px] overflow-hidden rounded-b-xl">
                  <div
                    className="h-full w-full animate-shimmer"
                    style={{
                      background:
                        "linear-gradient(90deg, transparent 0%, #60a5fa 50%, transparent 100%)",
                      backgroundSize: "200% 100%",
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Build log panel — visible while in progress or failed */}
      {!isLive && (
        <div className="mb-6 rounded-xl overflow-hidden border border-zinc-800">
          <div className="bg-zinc-900 px-3 py-1.5 flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400">Build logs</span>
            {buildLogs.length > 0 && (
              <span className="text-xs text-zinc-500">{buildLogs.length} lines</span>
            )}
          </div>
          <div
            ref={logPanelRef}
            className="bg-zinc-950 p-3 overflow-y-auto"
            style={{ maxHeight: 200 }}
          >
            {buildLogs.length === 0 ? (
              <p className="text-xs font-mono text-zinc-500">Waiting for logs…</p>
            ) : (
              buildLogs.map((entry, idx) => (
                <p
                  key={idx}
                  className={`text-xs font-mono leading-5 ${
                    entry.level === "error"
                      ? "text-red-400"
                      : entry.level === "warn"
                      ? "text-amber-400"
                      : "text-zinc-400"
                  }`}
                >
                  [{entry.stage}] {entry.message}
                </p>
              ))
            )}
          </div>
        </div>
      )}

      {/* Error state */}
      {isFailed && (
        <div className="text-center space-y-4">
          <p className="text-sm text-red-600">
            Deployment failed. Please try again.
          </p>
          <button
            onClick={() => router.push("/dashboard/new")}
            className="h-10 px-5 bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Try again
          </button>
        </div>
      )}

      {/* Success card */}
      {isLive && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-6 text-center shadow-sm">
          <p className="text-lg font-semibold text-zinc-900 mb-1">
            Your site is live 🚀
          </p>
          {liveUrl && (
            <a
              href={liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline block mb-5 break-all"
            >
              {liveUrl}
            </a>
          )}
          <div className="flex items-center justify-center gap-3">
            {liveUrl && (
              <a
                href={liveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="h-10 px-5 bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-1.5"
              >
                Visit site <span aria-hidden="true">↗</span>
              </a>
            )}
            <Link
              href="/dashboard"
              className="h-10 px-4 border border-zinc-200 text-sm font-medium text-zinc-700 hover:bg-zinc-50 rounded-lg transition-colors inline-flex items-center"
            >
              Go to dashboard
            </Link>
          </div>

          {/* Domain upsell */}
          <div className="mt-5 pt-5 border-t border-zinc-100">
            <button
              onClick={() => setDomainExpanded((o) => !o)}
              className="w-full flex items-center justify-between text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
            >
              <span>Want a real domain? →</span>
              {domainExpanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
            {domainExpanded && (
              <div className="mt-4 text-left">
                <DomainPicker
                  projectId={projectId}
                  projectName={projectName ?? "your project"}
                  onConnected={() => setDomainExpanded(false)}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer: elapsed time + step counter */}
      {!isLive && !isFailed && (
        <div className="flex items-center justify-between text-xs text-zinc-400 mt-6 px-1">
          <span>Deploying... {elapsed}s</span>
          <span>Step {Math.min(activeStage + 1, 7)} of 7</span>
        </div>
      )}
    </div>
  );
}
