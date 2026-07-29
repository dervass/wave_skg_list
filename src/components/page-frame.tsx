"use client";

import { AppHeader } from "@/components/app-header";
import { useAppSession } from "@/lib/client/session";

export function PageFrame({ children }: { children: React.ReactNode }) {
  const { profile, event, loading } = useAppSession();
  if (loading) {
    return (
      <div className="grid min-h-svh place-items-center text-sm font-bold text-[var(--muted)]">
        Loading guest list…
      </div>
    );
  }
  if (!profile || !event) return null;
  return (
    <>
      <AppHeader profile={profile} event={event} />
      {children}
    </>
  );
}
