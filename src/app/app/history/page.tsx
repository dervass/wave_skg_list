"use client";

import { RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";

import { PageFrame } from "@/components/page-frame";

interface LedgerEntry {
  id: string;
  reservation_id: string | null;
  walk_in_id: string | null;
  entry_kind: "checkin" | "adjustment";
  attendance_delta: number;
  revenue_eligible: boolean;
  reason: string | null;
  occurred_at: string;
  reservations: { guest_name: string } | null;
  walk_ins: { guest_name: string } | null;
  prs: { name: string } | null;
  profiles: { display_name: string } | null;
}

function relatedName(value: { guest_name: string } | { guest_name: string }[] | null) {
  return Array.isArray(value) ? value[0]?.guest_name : value?.guest_name;
}

export default function HistoryPage() {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [error, setError] = useState("");

  async function load() {
    const response = await fetch("/api/history");
    const data = await response.json();
    if (response.ok) setEntries(data.entries ?? []);
    else setError(data.error ?? "Unable to load attendance");
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function correct(entry: LedgerEntry) {
    const amount = window.prompt(
      "Adjustment amount (negative removes attendance, positive restores it):",
      entry.attendance_delta > 0 ? "-1" : "1",
    );
    if (!amount || !Number.isInteger(Number(amount)) || Number(amount) === 0) return;
    const reason = window.prompt("Required correction reason:");
    if (!reason || reason.trim().length < 8) {
      setError("Correction reason must be at least 8 characters");
      return;
    }
    const response = await fetch("/api/corrections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservationId: entry.reservation_id,
        walkInId: entry.walk_in_id,
        delta: Number(amount),
        reason,
        idempotencyKey: crypto.randomUUID(),
      }),
    });
    const data = await response.json();
    if (!response.ok) setError(data.error ?? "Correction rejected");
    else await load();
  }

  return (
    <PageFrame>
      <main className="safe-bottom mx-auto max-w-3xl px-4 py-7">
        <p className="eyebrow mb-2">Immutable ledger</p>
        <h1 className="text-3xl font-black tracking-[-0.04em]">
          Attendance history
        </h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          Corrections add a new adjustment. Original check-ins never change.
        </p>
        {error ? (
          <p className="mt-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </p>
        ) : null}
        <div className="mt-6 divide-y divide-[var(--line)] border-y border-[var(--line)]">
          {entries.map((entry) => (
            <article className="flex items-center gap-3 py-4" key={entry.id}>
              <div className="min-w-0 flex-1">
                <p className="truncate font-black">
                  {relatedName(entry.reservations) ??
                    relatedName(entry.walk_ins) ??
                    "Attendance"}
                </p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {new Date(entry.occurred_at).toLocaleString()} ·{" "}
                  {entry.entry_kind === "adjustment"
                    ? entry.reason
                    : entry.revenue_eligible
                      ? entry.prs?.name ?? "Direct"
                      : "Non-revenue"}
                </p>
              </div>
              <span
                className={`text-xl font-black ${
                  entry.attendance_delta > 0 ? "text-emerald-300" : "text-red-300"
                }`}
              >
                {entry.attendance_delta > 0 ? "+" : ""}
                {entry.attendance_delta}
              </span>
              <button
                onClick={() => void correct(entry)}
                className="grid size-11 place-items-center rounded-xl bg-[var(--panel)]"
                aria-label="Correct this attendance"
              >
                <RotateCcw size={17} />
              </button>
            </article>
          ))}
        </div>
      </main>
    </PageFrame>
  );
}
