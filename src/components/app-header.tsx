"use client";

import { ArrowLeft, LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import type { EventSummary, Profile } from "@/lib/domain/types";

import { clearSessionCache } from "@/lib/client/session";

export function AppHeader({
  profile,
  event,
}: {
  profile: Profile;
  event: EventSummary;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isHome = pathname === "/app";

  async function logout() {
    clearSessionCache();
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="border-b border-[var(--line)] bg-[#0b0b0ae8] backdrop-blur-xl">
      <div className="mx-auto flex min-h-16 max-w-4xl items-center gap-3 px-4">
        {!isHome && (
          <Link
            href="/app"
            className="grid size-11 cursor-pointer place-items-center rounded-full bg-[var(--panel)] text-[var(--ink)] hover:bg-[var(--panel-raised)] transition-colors"
            aria-label="Back to home"
          >
            <ArrowLeft aria-hidden="true" size={21} />
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black">{event.name}</p>
          <p className="truncate text-xs text-[var(--muted)]">
            {event.venue_name} · {profile.display_name}
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[0.68rem] font-black uppercase tracking-wider ${
            event.status === "closed"
              ? "bg-red-500/15 text-red-300"
              : "bg-emerald-500/15 text-emerald-300"
          }`}
        >
          {event.status}
        </span>
        {profile.role === "admin" || profile.role === "organizer" ? (
          <Link
            href="/app/admin/accounts"
            className="grid size-11 cursor-pointer place-items-center rounded-full text-[var(--muted)] hover:bg-[var(--panel)] hover:text-[var(--ink)] transition-colors"
            aria-label="Settings"
            title="Settings & Account"
          >
            <Settings aria-hidden="true" size={19} />
          </Link>
        ) : null}
        <button
          onClick={logout}
          className="grid size-11 cursor-pointer place-items-center rounded-full text-[var(--muted)] hover:bg-[var(--panel)] hover:text-[var(--ink)] transition-colors"
          aria-label="Sign out"
          title="Leave / Sign out"
        >
          <LogOut aria-hidden="true" size={19} />
        </button>
      </div>
    </header>
  );
}
