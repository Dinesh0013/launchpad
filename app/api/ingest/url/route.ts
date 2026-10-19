import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errRes, requireAuth } from "@/lib/api-auth";
import { generateSubdomain, ensureUniqueSubdomain } from "@/lib/subdomain";
import { checkRateLimit } from "@/lib/ratelimit";
import { MAX_PROJECTS_PER_USER } from "@/lib/limits";
import { detectBackendForm } from "@/lib/formcheck";
import { logBuild } from "@/lib/logger";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 60; // asset downloads can be slow

const schema = z.object({
  url: z.string().url("Invalid URL format").max(500, "URL must be 500 characters or fewer"),
  project_name: z.string().min(1, "project_name is required").max(60, "project_name must be 60 characters or fewer"),
});

function detectPlatform(url: string): string {
  const hostname = new URL(url).hostname;
  if (hostname.includes("lovable.app")) return "lovable";
  if (hostname.includes("bolt.new") || hostname.includes("stackblitz.com")) return "bolt";
  if (hostname.includes("v0.dev")) return "v0";
  return "url";
}

async function isReachable(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { method: "HEAD", signal: controller.signal, redirect: "follow" });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function storeFallbackRedirect(
  sourceUrl: string,
  userId: string,
  projectId: string,
  supabase: SupabaseClient,
): Promise<void> {
  const content = `/*  ${sourceUrl}/:splat  301\n`;
  await supabase.storage
    .from("deployments")
    .upload(`${userId}/${projectId}/_redirects`, Buffer.from(content), {
      contentType: "text/plain",
      upsert: true,
    });
  console.log(`[ingest] redirect fallback stored → ${sourceUrl}`);
}

interface BundleOutcome {
  strategy: "bundled" | "redirected";
  formRisk?: "none" | "external" | "backend";
}

async function fetchAndBundle(
  sourceUrl: string,
  userId: string,
  projectId: string,
  supabase: SupabaseClient,
): Promise<BundleOutcome> {
  const origin = new URL(sourceUrl).origin;
  const log = (stage: string, level: string, message: string) =>
    logBuild({ supabase, projectId, stage, level: level as "info" | "warn" | "error", message });

  // Fetch the root HTML document
  let html: string;
  try {
    await log("validating", "info", `Fetching HTML from ${sourceUrl}`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const htmlRes = await fetch(sourceUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    clearTimeout(timer);
    if (!htmlRes.ok) {
      await log("validating", "warn", `HTML fetch ${htmlRes.status} — redirect fallback`);
      await storeFallbackRedirect(sourceUrl, userId, projectId, supabase);
      return { strategy: "redirected" };
    }
    html = await htmlRes.text();
  } catch (err) {
    await log("validating", "warn", `HTML fetch error: ${(err as Error).message} — redirect fallback`);
    await storeFallbackRedirect(sourceUrl, userId, projectId, supabase);
    return { strategy: "redirected" };
  }

  // Extract all <script src> and <link href> references
  const rawRefs = new Set<string>();
  const scriptRe = /<script[^>]+\bsrc=["']([^"']+)["']/gi;
  const linkRe = /<link[^>]+\bhref=["']([^"']+)["']/gi;
  let rm: RegExpExecArray | null;
  while ((rm = scriptRe.exec(html)) !== null) rawRefs.add(rm[1]);
  while ((rm = linkRe.exec(html)) !== null) rawRefs.add(rm[1]);

  // Resolve each ref to a fetchable URL + relative storage path; skip external origins
  const assets: { assetUrl: string; storagePath: string }[] = [];
  for (const ref of Array.from(rawRefs)) {
    if (ref.startsWith("data:") || ref.startsWith("#") || ref.startsWith("mailto:")) continue;
    let pathname: string;
    let assetUrl: string;
    if (ref.startsWith("http://") || ref.startsWith("https://")) {
      if (!ref.startsWith(origin)) continue;
      pathname = new URL(ref).pathname.split("?")[0];
      assetUrl = `${origin}${pathname}`;
    } else if (ref.startsWith("/")) {
      pathname = ref.split("?")[0];
      assetUrl = `${origin}${pathname}`;
    } else {
      pathname = "/" + ref.split("?")[0];
      assetUrl = new URL(ref, sourceUrl).href;
    }
    assets.push({ assetUrl, storagePath: pathname.replace(/^\//, "") });
  }

  await log("building", "info", `Found ${assets.length} assets to bundle`);

  // Download all assets in parallel; collect first JS file content for form check
  const stored: string[] = [];
  const criticalFailed: string[] = [];
  const jsContentsForFormCheck: string[] = [];

  await Promise.all(
    assets.map(async ({ assetUrl, storagePath }) => {
      try {
        const res = await fetch(assetUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
        if (!res.ok) {
          if (/\.(js|css)$/.test(storagePath)) criticalFailed.push(storagePath);
          console.warn(`[ingest] ${storagePath} → ${res.status}`);
          return;
        }
        const buf = Buffer.from(await res.arrayBuffer());
        const ct = (res.headers.get("content-type") ?? "application/octet-stream").split(";")[0].trim();

        // Capture first 3 JS bundles for form analysis (100 KB cap)
        if (/\.js$/.test(storagePath) && jsContentsForFormCheck.length < 3) {
          jsContentsForFormCheck.push(buf.slice(0, 100_000).toString("utf-8"));
        }

        await supabase.storage
          .from("deployments")
          .upload(`${userId}/${projectId}/${storagePath}`, buf, {
            contentType: ct,
            upsert: true,
          });
        stored.push(storagePath);
      } catch (err) {
        if (/\.(js|css)$/.test(storagePath)) criticalFailed.push(storagePath);
        console.warn(`[ingest] fetch error ${storagePath}:`, (err as Error).message);
      }
    }),
  );

  if (criticalFailed.length > 0) {
    await log("building", "warn", `Critical asset failures [${criticalFailed.join(", ")}] — redirect fallback`);
    await storeFallbackRedirect(sourceUrl, userId, projectId, supabase);
    return { strategy: "redirected" };
  }

  // Run form check on HTML + sampled JS content
  const formResult = detectBackendForm(html, jsContentsForFormCheck);
  await log(
    "validating",
    formResult.risk === "backend" ? "warn" : "info",
    `Form check: risk=${formResult.risk} — ${formResult.details}`,
  );

  // Store rewritten HTML (strip absolute origin references)
  const rewrittenHtml = html.replace(new RegExp(escapeRegex(origin), "g"), "");
  await supabase.storage
    .from("deployments")
    .upload(`${userId}/${projectId}/index.html`, Buffer.from(rewrittenHtml), {
      contentType: "text/html",
      upsert: true,
    });

  await log("building", "info", `Bundled: ${stored.length} assets + index.html`);
  return { strategy: "bundled", formRisk: formResult.risk };
}

export async function POST(request: NextRequest) {
  try {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errRes("Invalid JSON body", "INVALID_JSON", 400);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid request";
    return errRes(msg, "VALIDATION_ERROR", 400);
  }

  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  const { allowed } = checkRateLimit(user.id, "ingest", 10, 60 * 60 * 1000);
  if (!allowed) {
    return errRes("Too many requests. Please wait a moment before trying again.", "RATE_LIMITED", 429);
  }

  const { url, project_name: projectName } = parsed.data;

  const reachable = await isReachable(url);
  if (!reachable) {
    return errRes("URL is not reachable (timeout or non-200 response)", "UNREACHABLE_URL", 400);
  }

  // Enforce per-user project cap
  const { count: projectCount } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if ((projectCount ?? 0) >= MAX_PROJECTS_PER_USER) {
    return errRes(`Project limit reached (max ${MAX_PROJECTS_PER_USER})`, "PROJECT_LIMIT", 403);
  }

  const sourceType = detectPlatform(url);
  const subdomain = generateSubdomain(projectName);
  const uniqueSubdomain = await ensureUniqueSubdomain(subdomain, supabase);

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      user_id: user.id,
      name: projectName,
      subdomain: uniqueSubdomain,
      source_type: sourceType,
      source_url: url,
      status: "building",
    })
    .select("id")
    .single();

  if (projectError || !project) {
    return errRes("Failed to create project", "DB_ERROR", 500);
  }

  let backendFormWarning: { warning: string; message: string } | undefined;

  if (sourceType === "lovable" || sourceType === "bolt" || sourceType === "v0" || sourceType === "url") {
    try {
      const outcome = await fetchAndBundle(url, user.id, project.id, supabase);
      if (outcome.strategy === "bundled") {
        await supabase
          .from("projects")
          .update({ source_type: "lovable_bundled" })
          .eq("id", project.id);

        if (outcome.formRisk === "backend") {
          backendFormWarning = {
            warning: "BACKEND_FORM",
            message:
              "Your booking form needs a backend; the page will deploy but the form may not submit. Connect a form service to fix.",
          };
        }
      }
    } catch (err) {
      console.error("[ingest] fetchAndBundle threw unexpectedly:", err);
      try {
        await storeFallbackRedirect(url, user.id, project.id, supabase);
      } catch {
        // non-fatal
      }
    }
  } else {
    // Direct HTML URL
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.endsWith(".html") || lowerUrl.endsWith(".htm")) {
      try {
        const res = await fetch(url);
        const html = await res.text();
        await supabase.storage
          .from("deployments")
          .upload(`${user.id}/${project.id}/index.html`, Buffer.from(html), {
            contentType: "text/html",
          });
      } catch {
        // non-fatal
      }
    }
  }

  return NextResponse.json({
    project_id: project.id,
    subdomain: uniqueSubdomain,
    ...(backendFormWarning ?? {}),
  });
  } catch (err) {
    console.error("ingest/url: unhandled error", err);
    return errRes("Internal server error", "SERVER_ERROR", 500);
  }
}
