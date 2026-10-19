"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const schema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormValues) {
    setServerError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });
    if (error) {
      setServerError(error.message);
      return;
    }
    router.push("/dashboard");
  }

  return (
    <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm p-8">
      {/* Logo */}
      <div className="flex flex-col items-center mb-8">
        <div className="w-10 h-10 bg-zinc-900 rounded-xl flex items-center justify-center mb-3">
          <div className="w-4 h-4 bg-white rounded-md" />
        </div>
        <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">
          Welcome back
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Sign in to your Launchpad account
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1.5">
            Email
          </label>
          <input
            type="email"
            placeholder="you@example.com"
            {...register("email")}
            className="w-full h-10 px-3 border border-zinc-200 rounded-lg text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition"
          />
          {errors.email && (
            <p className="mt-1.5 text-xs text-red-500">{errors.email.message}</p>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-sm font-medium text-zinc-700">
              Password
            </label>
            <a
              href="#"
              className="text-xs text-zinc-500 hover:text-zinc-900 transition-colors"
            >
              Forgot password?
            </a>
          </div>
          <input
            type="password"
            placeholder="••••••••"
            {...register("password")}
            className="w-full h-10 px-3 border border-zinc-200 rounded-lg text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition"
          />
          {errors.password && (
            <p className="mt-1.5 text-xs text-red-500">
              {errors.password.message}
            </p>
          )}
        </div>

        {serverError && (
          <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {serverError}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full h-10 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-60 text-white text-sm font-medium rounded-lg flex items-center justify-center transition-colors"
        >
          {isSubmitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            "Sign in"
          )}
        </button>
      </form>

      <p className="text-center text-sm text-zinc-500 mt-6">
        Don&apos;t have an account?{" "}
        <Link
          href="/signup"
          className="text-zinc-900 font-medium hover:underline"
        >
          Sign up
        </Link>
      </p>
    </div>
  );
}
