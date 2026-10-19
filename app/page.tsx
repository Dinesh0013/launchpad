import Link from "next/link";
import {
  Upload,
  Zap,
  Globe,
  Shield,
  Link2,
  Gauge,
  Bell,
  LayoutDashboard,
} from "lucide-react";
import WordCycle from "@/components/word-cycle";

// ─── Logo mark ──────────────────────────────────────────────────────────────
function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-7 h-7 bg-zinc-900 rounded-lg flex items-center justify-center shrink-0">
        <div className="w-3 h-3 bg-white rounded-sm" />
      </div>
      <span className="text-sm font-bold text-zinc-900 tracking-tight">
        LaunchPad
      </span>
    </div>
  );
}

// ─── Feature card ────────────────────────────────────────────────────────────
function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-white border border-zinc-200 rounded-2xl p-5">
      <div className="w-9 h-9 bg-zinc-100 rounded-lg flex items-center justify-center mb-3">
        <Icon className="w-4.5 h-4.5 text-zinc-700" />
      </div>
      <h3 className="text-sm font-semibold text-zinc-900 mb-1">{title}</h3>
      <p className="text-sm text-zinc-500">{description}</p>
    </div>
  );
}

// ─── How-it-works step ───────────────────────────────────────────────────────
function Step({
  number,
  icon: Icon,
  title,
  description,
}: {
  number: number;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center text-center px-4">
      <div className="relative mb-4">
        <div className="w-12 h-12 bg-zinc-900 rounded-2xl flex items-center justify-center">
          <Icon className="w-5 h-5 text-white" />
        </div>
        <span className="absolute -top-2 -right-2 w-5 h-5 bg-white border border-zinc-200 rounded-full text-[10px] font-bold text-zinc-500 flex items-center justify-center">
          {number}
        </span>
      </div>
      <h3 className="text-sm font-semibold text-zinc-900 mb-1.5">{title}</h3>
      <p className="text-sm text-zinc-500 leading-relaxed max-w-[220px]">
        {description}
      </p>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* ══════════════════════════ NAVBAR ══════════════════════════ */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-zinc-100">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/">
            <Logo />
          </Link>
          <nav className="flex items-center gap-3">
            <Link
              href="/login"
              className="h-9 px-4 text-sm font-medium text-zinc-600 hover:text-zinc-900 transition-colors"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="h-9 px-4 bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-medium rounded-lg inline-flex items-center transition-colors"
            >
              Get started free
            </Link>
          </nav>
        </div>
      </header>

      {/* ══════════════════════════ HERO ════════════════════════════ */}
      <section className="max-w-5xl mx-auto px-6 pt-24 pb-20 text-center">
        {/* Pill badge */}
        <div className="inline-flex items-center gap-1.5 bg-zinc-100 border border-zinc-200 rounded-full px-3 py-1 mb-8">
          <Zap className="w-3 h-3 text-zinc-500" />
          <span className="text-xs font-medium text-zinc-600">
            Live in 30 seconds
          </span>
        </div>

        <h1 className="text-5xl sm:text-6xl font-bold text-zinc-900 tracking-tight leading-[1.08] mb-6">
          Your site,
          <br />
          live in 30 seconds
        </h1>

        <p className="text-lg text-zinc-500 max-w-xl mx-auto leading-relaxed mb-10">
          Built something on <WordCycle />? Drop it here and we make it live —
          with a real URL, HTTPS, and your own domain.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/signup"
            className="h-11 px-6 bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-semibold rounded-xl inline-flex items-center transition-colors"
          >
            Deploy your first site free →
          </Link>
          <a
            href="#how-it-works"
            className="h-11 px-6 border border-zinc-200 hover:border-zinc-300 text-zinc-700 hover:bg-zinc-50 text-sm font-medium rounded-xl inline-flex items-center transition-colors"
          >
            See how it works
          </a>
        </div>

        {/* Social proof strip */}
        <p className="mt-8 text-xs text-zinc-400">
          No credit card required &nbsp;·&nbsp; Free forever on starter plan
        </p>
      </section>

      {/* ══════════════════════════ HOW IT WORKS ════════════════════ */}
      <section
        id="how-it-works"
        className="bg-zinc-50 border-y border-zinc-100 py-20"
      >
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-zinc-900 tracking-tight mb-3">
              Ship in three steps
            </h2>
            <p className="text-sm text-zinc-500">
              From file to live site in under a minute.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-10">
            <Step
              number={1}
              icon={Upload}
              title="Upload or paste"
              description="Paste your website code and press deploy"
            />
            <Step
              number={2}
              icon={Zap}
              title="We make it live"
              description="We build, deploy, and secure your site automatically"
            />
            <Step
              number={3}
              icon={Globe}
              title="Share your URL"
              description="Get a live link instantly. Add your own domain anytime."
            />
          </div>
        </div>
      </section>

      {/* ══════════════════════════ FEATURES ════════════════════════ */}
      <section className="max-w-5xl mx-auto px-6 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-zinc-900 tracking-tight mb-3">
            Everything you need
          </h2>
          <p className="text-sm text-zinc-500">
            Not just hosting — a complete launch platform.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <FeatureCard
            icon={Shield}
            title="Free HTTPS"
            description="Every site gets SSL automatically"
          />
          <FeatureCard
            icon={Link2}
            title="Custom domains"
            description="Connect your own domain in one click"
          />
          <FeatureCard
            icon={Gauge}
            title="Instant deploys"
            description="Live in under 60 seconds"
          />
          <FeatureCard
            icon={Globe}
            title="Global CDN"
            description="Fast everywhere in the world"
          />
          <FeatureCard
            icon={Bell}
            title="Email alerts"
            description="Know the moment your site goes live"
          />
          <FeatureCard
            icon={LayoutDashboard}
            title="Simple dashboard"
            description="No technical knowledge needed"
          />
        </div>
      </section>

      {/* ══════════════════════════ CTA BANNER ══════════════════════ */}
      <section className="bg-zinc-900 py-16">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-white tracking-tight mb-3">
            Ready to go live?
          </h2>
          <p className="text-zinc-400 text-sm mb-8">
            Join thousands of builders shipping faster with LaunchPad.
          </p>
          <Link
            href="/signup"
            className="h-11 px-6 bg-white hover:bg-zinc-100 text-zinc-900 text-sm font-semibold rounded-xl inline-flex items-center transition-colors"
          >
            Deploy your first site free →
          </Link>
        </div>
      </section>

      {/* ══════════════════════════ FOOTER ══════════════════════════ */}
      <footer className="border-t border-zinc-100 py-8">
        <div className="max-w-5xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Logo />
          <p className="text-xs text-zinc-400 order-last sm:order-none">
            © 2025 LaunchPad. All rights reserved.
          </p>
          <nav className="flex items-center gap-5">
            <Link
              href="/login"
              className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
            >
              Login
            </Link>
            <Link
              href="/signup"
              className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
            >
              Sign up
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
