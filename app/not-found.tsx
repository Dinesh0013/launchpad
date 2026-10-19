import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="text-center max-w-sm">
        <div className="w-10 h-10 bg-zinc-900 rounded-xl flex items-center justify-center mx-auto mb-6">
          <div className="w-4 h-4 bg-white rounded-md" />
        </div>
        <h1 className="text-4xl font-bold text-zinc-900 mb-2">404</h1>
        <h2 className="text-lg font-semibold text-zinc-900 mb-2">
          Page not found
        </h2>
        <p className="text-sm text-zinc-500 mb-8">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/dashboard"
          className="h-10 px-5 bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-medium rounded-lg inline-flex items-center transition-colors"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
