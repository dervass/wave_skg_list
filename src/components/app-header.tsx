"use client";

import { useEffect, useState } from "react";
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

  const [isOnline, setIsOnline] = useState(true);
  const [isDbOnline, setIsDbOnline] = useState(true);

  useEffect(() => {
    setIsOnline(typeof navigator !== "undefined" ? navigator.onLine : true);

    const handleOnline = () => {
      setIsOnline(true);
      void checkDbConnection();
    };
    const handleOffline = () => {
      setIsOnline(false);
      setIsDbOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    async function checkDbConnection() {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setIsDbOnline(false);
        return;
      }
      try {
        const res = await fetch("/api/session", {
          method: "GET",
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        });
        setIsDbOnline(res.ok);
      } catch {
        setIsDbOnline(false);
      }
    }

    void checkDbConnection();
    const interval = setInterval(() => void checkDbConnection(), 10000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, []);

  async function logout() {
    clearSessionCache();
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="border-b border-[var(--line)] bg-[#0b0b0ae8] backdrop-blur-xl">
      <div className="mx-auto flex min-h-16 max-w-4xl items-center gap-2.5 px-4">
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

        {/* Live Network & Database Status Badges */}
        <div className="flex items-center gap-1.5 text-[0.65rem] font-bold uppercase tracking-wider">
          <span
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 border transition-colors ${
              isOnline
                ? "bg-emerald-950/40 text-emerald-400 border-emerald-500/20"
                : "bg-red-950/40 text-red-400 border-red-500/20"
            }`}
            title={isOnline ? "Internet Connected" : "No Internet Connection"}
          >
            <span
              className={`size-1.5 rounded-full ${
                isOnline ? "bg-emerald-400 animate-pulse" : "bg-red-400"
              }`}
            />
            <span className="hidden sm:inline">Net</span> {isOnline ? "Online" : "Offline"}
          </span>

          <span
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 border transition-colors ${
              isDbOnline
                ? "bg-emerald-950/40 text-emerald-400 border-emerald-500/20"
                : "bg-red-950/40 text-red-400 border-red-500/20"
            }`}
            title={isDbOnline ? "Database Connection Active" : "Database Communication Failure"}
          >
            <span
              className={`size-1.5 rounded-full ${
                isDbOnline ? "bg-emerald-400 animate-pulse" : "bg-red-400"
              }`}
            />
            <span className="hidden sm:inline">DB</span> {isDbOnline ? "Online" : "Offline"}
          </span>
        </div>
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
