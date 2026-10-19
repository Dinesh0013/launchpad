import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Navbar from "@/components/navbar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let email = "";
  let avatarUrl: string | null = null;

  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    email = user.email ?? "";
    avatarUrl = (user.user_metadata?.avatar_url as string | undefined) ?? null;
  } catch {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <Navbar email={email} avatarUrl={avatarUrl} />
      <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
