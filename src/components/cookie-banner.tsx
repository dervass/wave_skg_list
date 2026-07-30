"use client";

import { useState, useSyncExternalStore } from "react";
import { Cookie, Check } from "lucide-react";

const CONSENT_KEY = "wave_cookie_consent_v1";

function subscribe() {
  return () => {};
}

function getSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return !window.localStorage.getItem(CONSENT_KEY);
  } catch {
    return false;
  }
}

function getServerSnapshot(): boolean {
  return false;
}

export function CookieBanner() {
  const needsConsent = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [dismissed, setDismissed] = useState(false);

  const handleAccept = () => {
    try {
      window.localStorage.setItem(CONSENT_KEY, "accepted");
      document.cookie = `wave_cookie_consent=accepted; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
    } catch {
      // Ignore storage restrictions
    }
    setDismissed(true);
  };

  if (!needsConsent || dismissed) return null;

  return (
    <aside
      aria-label="Cookie consent banner"
      className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-lg rounded-2xl border border-[var(--line)] bg-[#151514ef] p-4.5 shadow-2xl backdrop-blur-2xl transition-all duration-300 animate-in fade-in slide-in-from-bottom-5"
    >
      <div className="flex items-start gap-3.5">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--panel-raised)] text-[var(--accent)]">
          <Cookie size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-black tracking-tight text-[var(--ink)]">
            Essential Cookies & Storage
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
            Wave-SKG uses essential cookies and local storage to keep your auth session active, save offline door check-ins securely, and maintain high performance.
          </p>
          <div className="mt-3.5 flex items-center justify-end gap-2">
            <button
              onClick={handleAccept}
              className="button-primary min-h-10 px-4 text-xs font-black"
            >
              <Check size={16} />
              Accept Essential Cookies
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
