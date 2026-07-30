"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { useAppSession } from "@/lib/client/session";

export function PageFrame({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { profile, event, loading } = useAppSession();

  useEffect(() => {
    if (!loading && (!profile || !event)) {
      router.replace("/login");
    }
  }, [loading, profile, event, router]);

  if (loading) {
    return (
      <div className="min-h-svh bg-[var(--background)]">
        <header className="border-b border-[var(--line)] bg-[#0b0b0ae8] backdrop-blur-xl">
          <div className="mx-auto flex min-h-16 max-w-4xl items-center gap-3 px-4">
            <div className="size-9 rounded-full bg-[var(--panel)] animate-pulse" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="h-4 w-36 rounded bg-[var(--panel)] animate-pulse" />
              <div className="h-3 w-48 rounded bg-[var(--panel)] animate-pulse" />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-5 space-y-4">
          <div className="h-16 w-full rounded-2xl bg-[var(--panel)] animate-pulse" />
          <div className="h-12 w-full rounded-2xl bg-[var(--panel)] animate-pulse" />
          <div className="space-y-3">
            <div className="h-44 w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] animate-pulse" />
            <div className="h-44 w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] animate-pulse" />
          </div>
        </main>
      </div>
    );
  }

  if (!profile || !event) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-[var(--background)] px-4">
        <div className="text-center">
          <p className="text-sm font-bold text-[var(--muted)]">Redirecting to sign in...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <AppHeader profile={profile} event={event} />
      {children}
    </>
  );
}
