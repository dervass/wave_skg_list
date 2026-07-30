"use client";

import { Download, LockKeyhole, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";

import { PageFrame } from "@/components/page-frame";
import { formatEuros } from "@/lib/domain/business";

interface SettlementData {
  eligible_attendees: number;
  pr_attendees: number;
  direct_attendees: number;
  non_revenue_attendees: number;
  venue_payment_cents: number;
  total_pr_commission_cents: number;
  retained_cents: number;
  pr_lines: Array<{
    pr_id: string;
    pr_name: string;
    attendees: number;
    amount_owed_cents: number;
  }>;
  event_status: string;
}

export default function SettlementPage() {
  const [data, setData] = useState<SettlementData | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function load() {
    const response = await fetch("/api/settlement");
    const result = await response.json();
    if (response.ok) setData(result);
    else setError(result.error ?? "Unable to load settlement");
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function eventAction(action: "close" | "reopen") {
    const reason =
      action === "reopen"
        ? window.prompt("Required reason for reopening this event:")
        : window.confirm(
              "Close the event? Unchecked active reservations become no-shows.",
            )
          ? null
          : undefined;
    if (reason === undefined || (action === "reopen" && !reason)) return;
    setPending(true);
    const response = await fetch("/api/settlement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reason }),
    });
    const result = await response.json();
    if (!response.ok) setError(result.error ?? "Action failed");
    else await load();
    setPending(false);
  }

  return (
    <PageFrame>
      <main className="safe-bottom mx-auto max-w-3xl px-4 py-7">
        <div className="mb-7 flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow mb-2">Organizer only</p>
            <h1 className="text-3xl font-black tracking-[-0.04em]">Settlement</h1>
          </div>
          <a
            href="/api/export"
            className="button-secondary min-h-12 px-3"
            aria-label="Download CSV"
          >
            <Download size={19} />
          </a>
        </div>
        {error ? (
          <p className="mb-4 rounded-xl bg-red-500/10 p-3 text-red-300">{error}</p>
        ) : null}
        {!data ? (
          <p className="py-12 text-center text-[var(--muted)]">Loading…</p>
        ) : (
          <>
            <dl className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
              {[
                ["Eligible checked-in attendees", data.eligible_attendees, false],
                ["PR-attributed attendees", data.pr_attendees, false],
                ["Direct and organic attendees", data.direct_attendees, false],
                ["Non-revenue attendees", data.non_revenue_attendees, false],
                ["Expected from Sunset Bay", formatEuros(data.venue_payment_cents), true],
                ["Total owed to all PRs", formatEuros(data.total_pr_commission_cents), true],
              ].map(([label, value, isMoney]) => (
                <div className="flex items-center justify-between gap-4 py-4" key={String(label)}>
                  <dt className="text-sm text-[var(--muted)]">{label}</dt>
                  <dd className={`text-xl font-black tabular-nums ${isMoney ? "text-emerald-400 font-mono" : ""}`}>
                    {value}
                  </dd>
                </div>
              ))}
            </dl>

            <section className="mt-9">
              <h2 className="text-xl font-black">PR amounts owed</h2>
              <div className="mt-3 divide-y divide-[var(--line)]">
                {data.pr_lines.map((line) => (
                  <div className="flex items-center justify-between py-3" key={line.pr_id}>
                    <div>
                      <p className="font-bold">{line.pr_name}</p>
                      <p className="text-xs text-[var(--muted)]">
                        {line.attendees} eligible checked in
                      </p>
                    </div>
                    <p className="text-lg font-black text-emerald-400 font-mono">
                      {formatEuros(line.amount_owed_cents)}
                    </p>
                  </div>
                ))}
                {!data.pr_lines.length ? (
                  <p className="py-5 text-sm text-[var(--muted)]">
                    No PR-attributed attendance yet.
                  </p>
                ) : null}
              </div>
            </section>

            <div className="mt-10">
              {data.event_status === "closed" ? (
                <button
                  className="button-secondary w-full"
                  disabled={pending}
                  onClick={() => void eventAction("reopen")}
                >
                  <RotateCcw size={18} />
                  Reopen event
                </button>
              ) : (
                <button
                  className="button-danger w-full"
                  disabled={pending}
                  onClick={() => void eventAction("close")}
                >
                  <LockKeyhole size={18} />
                  Close event and save final snapshot
                </button>
              )}
            </div>
          </>
        )}
      </main>
    </PageFrame>
  );
}
