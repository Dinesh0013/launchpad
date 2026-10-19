import type { SupabaseClient } from "@supabase/supabase-js";

const RESERVED = new Set([
  "www", "api", "app", "admin", "mail", "blog",
  "static", "assets", "cdn", "launchpad",
]);

export function generateSubdomain(name: string): string {
  let slug = name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);

  if (!slug) slug = "project";

  if (RESERVED.has(slug)) {
    const num = Math.floor(1000 + Math.random() * 9000);
    slug = `${slug.slice(0, 25)}${num}`;
  }

  return slug;
}

export async function ensureUniqueSubdomain(
  slug: string,
  supabase: SupabaseClient
): Promise<string> {
  let candidate = slug;
  let counter = 1;

  while (true) {
    const { data } = await supabase
      .from("projects")
      .select("id")
      .eq("subdomain", candidate)
      .maybeSingle();

    if (!data) return candidate;

    candidate = `${slug.slice(0, 28)}-${counter}`;
    counter++;
  }
}
