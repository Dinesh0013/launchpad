"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const schema = z
  .object({
    full_name: z.string().min(1, "Full name is required"),
    email: z.string().email("Please enter a valid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirm_password: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: "Passwords do not match",
    path: ["confirm_password"],
  });

type FormValues = z.infer<typeof schema>;

export default function SignupPage() {
  const [success, setSuccess] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormValues) {
    setServerError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: { full_name: data.full_name },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setServerError(error.message);
      return;
    }
    setSuccess(true);
  }

  if (success) {
    return (
      <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm p-8 text-center">
        <div className="flex flex-col items-center mb-6">
          <div className="w-10 h-10 bg-zinc-900 rounded-xl flex items-center justify-center mb-3">
            <div className="w-4 h-4 bg-white rounded-md" />
          </div>
        </div>
        <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg
            className="w-6 h-6 text-green-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-zinc-900 mb-2">Check your email</h2>
        <p className="text-sm text-zinc-500 mb-6">
          We&apos;ve sent a confirmation link to your email address. Click it to
          activate your account.
        </p>
        <Link
          href="/login"
          className="text-sm text-zinc-900 font-medium hover:underline"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm p-8">
      {/* Logo */}
      <div className="flex flex-col items-center mb-8">
        <div className="w-10 h-10 bg-zinc-900 rounded-xl flex items-center justify-center mb-3">
          <div className="w-4 h-4 bg-white rounded-md" />
        </div>
        <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">
          Create an account
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Start building with Launchpad today
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1.5">
            Full name
          </label>
          <input
            type="text"
            placeholder="Jane Smith"
            {...register("full_name")}
            className="w-full h-10 px-3 border border-zinc-200 rounded-lg text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition"
          />
          {errors.full_name && (
            <p className="mt-1.5 text-xs text-red-500">
              {errors.full_name.message}
            </p>
          )}
        </div>

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
          <label className="block text-sm font-medium text-zinc-700 mb-1.5">
            Password
          </label>
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

        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1.5">
            Confirm password
          </label>
          <input
            type="password"
            placeholder="••••••••"
            {...register("confirm_password")}
            className="w-full h-10 px-3 border border-zinc-200 rounded-lg text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition"
          />
          {errors.confirm_password && (
            <p className="mt-1.5 text-xs text-red-500">
              {errors.confirm_password.message}
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
            "Create account"
          )}
        </button>
      </form>

      <p className="text-center text-sm text-zinc-500 mt-6">
        Already have an account?{" "}
        <Link
          href="/login"
          className="text-zinc-900 font-medium hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
