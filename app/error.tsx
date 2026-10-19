"use client";

import Link from "next/link";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="text-center max-w-sm">
        <div className="w-10 h-10 bg-zinc-900 rounded-xl flex items-center justify-center mx-auto mb-6">
          <div className="w-4 h-4 bg-white rounded-md" />
        </div>
        <h2 className="text-lg font-semibold text-zinc-900 mb-2">
          Something went wrong
        </h2>
        <p className="text-sm text-zinc-500 mb-8">
          An unexpected error occurred. You can try again or go back to the
          dashboard.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="h-10 px-5 bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Try again
          </button>
          <Link
            href="/dashboard"
            className="h-10 px-5 border border-zinc-200 hover:bg-zinc-50 text-zinc-700 text-sm font-medium rounded-lg inline-flex items-center transition-colors"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
