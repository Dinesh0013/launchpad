"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu, X, ChevronDown } from "lucide-react";

interface NavbarProps {
  email: string;
  avatarUrl: string | null;
}

function getInitials(email: string): string {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return local.slice(0, 2).toUpperCase();
}

function Avatar({ email, avatarUrl }: { email: string; avatarUrl: string | null }) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- avatar URLs come from arbitrary OAuth providers
      <img
        src={avatarUrl}
        alt={email}
        className="w-8 h-8 rounded-full object-cover"
      />
    );
  }
  return (
    <div className="w-8 h-8 rounded-full bg-zinc-900 flex items-center justify-center text-white text-xs font-semibold select-none">
      {getInitials(email)}
    </div>
  );
}

export default function Navbar({ email, avatarUrl }: NavbarProps) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleLogout() {
    setDropdownOpen(false);
    router.push("/logout");
  }

  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-zinc-900 rounded-lg flex items-center justify-center">
            <div className="w-3 h-3 bg-white rounded-sm" />
          </div>
          <span className="text-sm font-semibold text-zinc-900 tracking-tight">
            Launchpad
          </span>
        </Link>

        {/* Desktop: user menu */}
        <div className="hidden md:flex items-center gap-3">
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen((o) => !o)}
              className="flex items-center gap-2 h-8 px-2 rounded-lg hover:bg-zinc-50 transition-colors"
            >
              <Avatar email={email} avatarUrl={avatarUrl} />
              <span className="text-sm text-zinc-700 max-w-[180px] truncate">
                {email}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-48 bg-white border border-zinc-200 rounded-xl shadow-md py-1 z-50">
                <Link
                  href="/dashboard/account"
                  onClick={() => setDropdownOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 transition-colors"
                >
                  Account settings
                </Link>
                <div className="my-1 border-t border-zinc-100" />
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 transition-colors text-left"
                >
                  Log out
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Mobile: hamburger */}
        <button
          onClick={() => setMobileOpen((o) => !o)}
          className="md:hidden p-2 rounded-lg hover:bg-zinc-50 transition-colors"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
        >
          {mobileOpen ? (
            <X className="w-5 h-5 text-zinc-700" />
          ) : (
            <Menu className="w-5 h-5 text-zinc-700" />
          )}
        </button>
      </div>

      {/* Mobile dropdown panel */}
      {mobileOpen && (
        <div className="md:hidden border-t border-zinc-100 bg-white px-6 py-3 space-y-1">
          <div className="flex items-center gap-2.5 py-2">
            <Avatar email={email} avatarUrl={avatarUrl} />
            <span className="text-sm text-zinc-700 truncate">{email}</span>
          </div>
          <div className="border-t border-zinc-100 pt-1">
            <Link
              href="/dashboard/account"
              onClick={() => setMobileOpen(false)}
              className="block px-1 py-2 text-sm text-zinc-700 hover:text-zinc-900 transition-colors"
            >
              Account settings
            </Link>
            <button
              onClick={handleLogout}
              className="w-full text-left px-1 py-2 text-sm text-zinc-700 hover:text-zinc-900 transition-colors"
            >
              Log out
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
