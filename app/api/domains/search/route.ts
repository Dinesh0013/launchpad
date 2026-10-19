import { NextRequest, NextResponse } from "next/server";
import { errRes, requireAuth } from "@/lib/api-auth";
import { searchDomains } from "@/lib/domains";
import { checkRateLimit } from "@/lib/ratelimit";
import {
  domainSearchSchema,
  extractName,
  buildSuggestions,
} from "@/lib/domain-search";

export const runtime = "nodejs";

// POST handler: structured availability check for .com/.co/.io/.app/.dev/.net
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.response;
    const { user } = auth;

    const { allowed } = checkRateLimit(user.id, "domains:search:post", 10, 60 * 60 * 1000);
    if (!allowed) {
      return errRes(
        "Too many requests. Please wait a moment before trying again.",
        "RATE_LIMITED",
        429
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errRes("Invalid JSON body", "INVALID_JSON", 400);
    }

    const parsed = domainSearchSchema.safeParse(body);
    if (!parsed.success) {
      return errRes(
        parsed.error.issues[0]?.message ?? "Invalid request",
        "VALIDATION_ERROR",
        400
      );
    }

    const name = extractName(parsed.data.query);
    if (name.length < 2) {
      return errRes("query is too short after stripping TLD", "VALIDATION_ERROR", 400);
    }

    const suggestions = await buildSuggestions(name);

    return NextResponse.json({ query: parsed.data.query, suggestions });
  } catch (err) {
    console.error("domains/search POST: unhandled error", err);
    return errRes("Internal server error", "SERVER_ERROR", 500);
  }
}

// GET handler (legacy — used by existing DomainSection component)
export async function GET(request: NextRequest) {
  try {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  const { allowed } = checkRateLimit(user.id, "domains:search", 30, 60 * 60 * 1000);
  if (!allowed) {
    return errRes(
      "Too many requests. Please wait a moment before trying again.",
      "RATE_LIMITED",
      429
    );
  }

  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 50);
  if (!q) {
    return errRes("Query parameter 'q' is required", "VALIDATION_ERROR", 400);
  }

  const results = await searchDomains(q);

  // Save search — non-fatal
  supabase
    .from("domain_searches")
    .insert({ user_id: user.id, query: q, results: JSON.stringify(results) })
    .then(() => {});

  return NextResponse.json(results);
  } catch (err) {
    console.error("domains/search: unhandled error", err);
    return errRes("Internal server error", "SERVER_ERROR", 500);
  }
}
