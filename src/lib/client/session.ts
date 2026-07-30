"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

import type { EventSummary, Profile } from "@/lib/domain/types";

const CACHE_KEY = "wave_session_cache_v1";

let cachedSession: { profile: Profile; event: EventSummary } | null = null;
let rawCacheString: string | null = null;
let pendingSessionPromise: Promise<{ profile: Profile; event: EventSummary } | null> | null = null;

function readLocalCache(): { profile: Profile; event: EventSummary } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) {
      cachedSession = null;
      rawCacheString = null;
      return null;
    }
    if (raw === rawCacheString && cachedSession) {
      return cachedSession;
    }
    rawCacheString = raw;
    cachedSession = JSON.parse(raw);
    return cachedSession;
  } catch {
    cachedSession = null;
    rawCacheString = null;
    return null;
  }
}

function writeLocalCache(session: { profile: Profile; event: EventSummary } | null) {
  if (typeof window === "undefined") return;
  try {
    if (session) {
      const raw = JSON.stringify(session);
      window.localStorage.setItem(CACHE_KEY, raw);
      rawCacheString = raw;
      cachedSession = session;
    } else {
      window.localStorage.removeItem(CACHE_KEY);
      rawCacheString = null;
      cachedSession = null;
    }
  } catch {
    // Ignore storage quota or access errors
  }
}

export function clearSessionCache() {
  cachedSession = null;
  rawCacheString = null;
  pendingSessionPromise = null;
  writeLocalCache(null);
}

function subscribe() {
  return () => {};
}

function getSnapshot() {
  return cachedSession ?? readLocalCache();
}

function getServerSnapshot() {
  return null;
}

export function useAppSession() {
  const router = useRouter();
  const clientSession = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [sessionData, setSessionData] = useState<{
    profile: Profile | null;
    event: EventSummary | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const activeSession = sessionData ?? clientSession;

  useEffect(() => {
    let active = true;

    if (!pendingSessionPromise) {
      pendingSessionPromise = fetch("/api/session")
        .then(async (response) => {
          if (response.status === 401) {
            clearSessionCache();
            router.replace("/login");
            return null;
          }
          if (!response.ok) throw new Error("Unable to load session");
          const data = await response.json();
          cachedSession = data;
          writeLocalCache(data);
          return data;
        })
        .catch((err) => {
          pendingSessionPromise = null;
          throw err;
        });
    }

    pendingSessionPromise
      .then((data) => {
        if (active) {
          if (data) {
            setSessionData(data);
          } else {
            clearSessionCache();
            router.replace("/login");
          }
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          clearSessionCache();
          setLoading(false);
          router.replace("/login");
        }
      });

    return () => {
      active = false;
    };
  }, [router]);

  return useMemo(
    () => ({
      profile: activeSession?.profile ?? null,
      event: activeSession?.event ?? null,
      loading: loading && !activeSession,
    }),
    [activeSession, loading],
  );
}
