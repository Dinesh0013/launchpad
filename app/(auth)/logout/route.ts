import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const loginUrl = new URL(
    "/login",
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  );
  try {
    const supabase = createClient();
    await supabase.auth.signOut();
  } catch {
    // Supabase may be unconfigured; redirect to login regardless
  }
  return NextResponse.redirect(loginUrl);
}
