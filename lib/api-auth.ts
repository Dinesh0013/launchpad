import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";

export function errRes(error: string, code: string, status: number) {
  return NextResponse.json({ error, code }, { status });
}

export async function requireAuth(): Promise<
  | { ok: true; user: User; supabase: SupabaseClient }
  | { ok: false; response: NextResponse }
> {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return {
        ok: false,
        response: errRes("Unauthorized", "UNAUTHORIZED", 401),
      };
    }

    return { ok: true, user, supabase };
  } catch {
    return {
      ok: false,
      response: errRes("Unauthorized", "UNAUTHORIZED", 401),
    };
  }
}
