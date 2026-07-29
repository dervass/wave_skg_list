"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import type { EventSummary, Profile } from "@/lib/domain/types";

export function useAppSession() {
  const router = useRouter();
  const [state, setState] = useState<{
    profile: Profile | null;
    event: EventSummary | null;
    loading: boolean;
  }>({ profile: null, event: null, loading: true });

  useEffect(() => {
    let active = true;
    fetch("/api/session")
      .then(async (response) => {
        if (response.status === 401) {
          router.replace("/login");
          return null;
        }
        if (!response.ok) throw new Error("Unable to load session");
        return response.json();
      })
      .then((data) => {
        if (active && data) setState({ ...data, loading: false });
      })
      .catch(() => {
        if (active) setState((current) => ({ ...current, loading: false }));
      });
    return () => {
      active = false;
    };
  }, [router]);

  return state;
}
