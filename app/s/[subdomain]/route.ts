import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUBDOMAIN_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

function notFound(): Response {
  return new Response("Site not found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

/**
 * Serves a published site's HTML.
 *
 * The Content-Security-Policy `sandbox` header gives the page an opaque origin,
 * so user-supplied scripts cannot read this app's cookies or call its APIs as
 * the signed-in visitor.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ subdomain: string }> }
) {
  const { subdomain } = await params;
  if (!SUBDOMAIN_RE.test(subdomain)) return notFound();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: sitePath, error: lookupError } = await supabase.rpc("get_site_path", {
    p_subdomain: subdomain,
  });
  if (lookupError || typeof sitePath !== "string") return notFound();

  const { data: file, error: downloadError } = await supabase.storage
    .from("deployments")
    .download(`${sitePath}/index.html`);
  if (downloadError || !file) return notFound();

  return new Response(await file.text(), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "sandbox allow-scripts allow-forms allow-popups allow-modals",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "public, max-age=30, s-maxage=30",
    },
  });
}
