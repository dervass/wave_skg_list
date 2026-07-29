"use client";

import {
  CloudOff,
  CloudUpload,
  Plus,
  RefreshCw,
  Search,
  UserRoundPlus,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PageFrame } from "@/components/page-frame";
import { useAppSession } from "@/lib/client/session";
import {
  cacheReservations,
  getCachedReservations,
  getPendingCount,
  queueOperation,
  syncOutbox,
} from "@/lib/client/offline";
import type {
  OfflineCheckinOperation,
  Pr,
  Reservation,
  WalkInKind,
} from "@/lib/domain/types";

interface RecentItem {
  id: string;
  guest_name: string;
  delta: number;
  created_at: string;
}

export default function DoorPage() {
  const { event } = useAppSession();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [query, setQuery] = useState("");
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [conflicts, setConflicts] = useState(0);
  const [total, setTotal] = useState(0);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [error, setError] = useState("");
  const inFlightCheckins = useRef(new Set<string>());
  const [busyReservations, setBusyReservations] = useState<Set<string>>(
    () => new Set(),
  );

  const loadLiveData = useCallback(async () => {
    if (!event || !navigator.onLine) return;
    const [listResponse, summaryResponse] = await Promise.all([
      fetch("/api/reservations?q="),
      fetch("/api/door-summary"),
    ]);
    if (listResponse.ok) {
      const listData = await listResponse.json();
      const rows = listData.reservations ?? [];
      setReservations(rows);
      await cacheReservations(rows);
    }
    if (summaryResponse.ok) {
      const summary = await summaryResponse.json();
      setTotal(summary.total_checked_in ?? 0);
      setRecent(summary.recent ?? []);
    }
  }, [event]);

  const runSync = useCallback(async () => {
    if (!navigator.onLine) return;
    setSyncing(true);
    try {
      const result = await syncOutbox();
      setConflicts((current) => current + result.conflicts);
      setPendingCount(await getPendingCount());
      if (result.synced > 0) await loadLiveData();
    } catch {
      // Remain queued; the next online event or interval will retry.
    } finally {
      setSyncing(false);
    }
  }, [loadLiveData]);

  useEffect(() => {
    if (!event) return;
    let active = true;
    getCachedReservations(event.id).then((rows) => {
      if (active && rows.length) setReservations(rows);
    });
    getPendingCount().then((count) => active && setPendingCount(count));
    const initialLoad = window.setTimeout(() => {
      void loadLiveData().catch(() => setOnline(false));
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(initialLoad);
    };
  }, [event, loadLiveData]);

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      void runSync();
    };
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    const interval = window.setInterval(() => void runSync(), 20_000);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.clearInterval(interval);
    };
  }, [runSync]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("en").replace(/^@/, "");
    const activeRows = reservations.filter(
      (reservation) =>
        !["cancelled", "duplicate", "voided", "no_show"].includes(
          reservation.status,
        ),
    );
    if (!needle) return activeRows;
    return activeRows.filter((reservation) =>
      [
        reservation.guest_name,
        reservation.phone,
        reservation.instagram_username,
      ].some((value) => value?.toLocaleLowerCase("en").includes(needle)),
    );
  }, [query, reservations]);

  async function checkIn(reservation: Reservation, requested: number) {
    if (inFlightCheckins.current.has(reservation.id)) return;
    const remaining = reservation.expected_group_size - reservation.arrived_count;
    const delta = Math.min(requested, remaining);
    if (delta <= 0 || !event) return;
    inFlightCheckins.current.add(reservation.id);
    setBusyReservations((current) => new Set(current).add(reservation.id));
    const operation: OfflineCheckinOperation = {
      idempotencyKey: crypto.randomUUID(),
      kind: "checkin",
      eventId: event.id,
      reservationId: reservation.id,
      delta,
      recordedAt: new Date().toISOString(),
    };
    setError("");
    setReservations((current) =>
      current.map((row) =>
        row.id === reservation.id
          ? {
              ...row,
              arrived_count: row.arrived_count + delta,
              status:
                row.arrived_count + delta >= row.expected_group_size
                  ? "fully_arrived"
                  : "partially_arrived",
            }
          : row,
      ),
    );
    setTotal((current) => current + delta);
    setRecent((current) =>
      [
        {
          id: operation.idempotencyKey,
          guest_name: reservation.guest_name,
          delta,
          created_at: operation.recordedAt,
        },
        ...current,
      ].slice(0, 8),
    );
    try {
      if (!navigator.onLine) throw new TypeError("Offline");
      const response = await fetch("/api/checkins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(operation),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Check-in rejected");
    } catch (caught) {
      if (!navigator.onLine || caught instanceof TypeError) {
        await queueOperation(operation);
        setPendingCount(await getPendingCount());
      } else {
        setError(caught instanceof Error ? caught.message : "Check-in rejected");
        await loadLiveData();
      }
    } finally {
      inFlightCheckins.current.delete(reservation.id);
      setBusyReservations((current) => {
        const next = new Set(current);
        next.delete(reservation.id);
        return next;
      });
    }
  }

  function checkInCustom(reservation: Reservation, remaining: number) {
    const value = window.prompt(
      `How many of the ${remaining} remaining guests arrived?`,
      "1",
    );
    if (value === null) return;
    const count = Number(value);
    if (!Number.isInteger(count) || count < 1 || count > remaining) {
      setError(`Enter a whole number between 1 and ${remaining}`);
      return;
    }
    void checkIn(reservation, count);
  }

  async function addWalkIn(operation: OfflineCheckinOperation) {
    setWalkInOpen(false);
    setTotal((current) => current + operation.delta);
    setRecent((current) =>
      [
        {
          id: operation.idempotencyKey,
          guest_name: operation.guestName ?? "Walk-in",
          delta: operation.delta,
          created_at: operation.recordedAt,
        },
        ...current,
      ].slice(0, 8),
    );
    try {
      if (!navigator.onLine) throw new TypeError("Offline");
      const response = await fetch("/api/walk-ins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guestName: operation.guestName,
          count: operation.delta,
          kind: operation.walkInKind,
          prId: operation.prId,
          prConfirmed: operation.prConfirmed,
          note: operation.note,
          idempotencyKey: operation.idempotencyKey,
          recordedAt: operation.recordedAt,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Walk-in rejected");
    } catch (caught) {
      if (!navigator.onLine || caught instanceof TypeError) {
        await queueOperation(operation);
        setPendingCount(await getPendingCount());
      } else {
        setError(caught instanceof Error ? caught.message : "Walk-in rejected");
        await loadLiveData();
      }
    }
  }

  return (
    <PageFrame>
      <div className="sticky top-0 z-30 border-b border-[var(--line)] bg-[#0b0b0af2] px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Live checked in</p>
            <p className="text-3xl font-black tabular-nums">{total}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void runSync()}
              className="flex min-h-11 items-center gap-2 rounded-full bg-[var(--panel)] px-3 text-xs font-black"
            >
              {online ? (
                <RefreshCw
                  size={16}
                  className={syncing ? "animate-spin text-[var(--accent)]" : "text-emerald-300"}
                />
              ) : (
                <CloudOff size={16} className="text-[var(--warning)]" />
              )}
              {online ? (syncing ? "Syncing" : "Online") : "Offline"}
            </button>
            {pendingCount ? (
              <span className="rounded-full bg-amber-500/15 px-2.5 py-2 text-xs font-black text-amber-300">
                {pendingCount} pending
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <main className="safe-bottom mx-auto max-w-4xl px-4 py-5">
        <label className="relative block">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]"
            size={25}
          />
          <input
            autoFocus
            className="field min-h-16 pl-14 pr-12 text-lg font-bold"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search guest…"
            autoComplete="off"
          />
          {query ? (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 grid size-11 -translate-y-1/2 place-items-center"
              aria-label="Clear search"
            >
              <X size={20} />
            </button>
          ) : null}
        </label>

        <button
          onClick={() => setWalkInOpen(true)}
          className="button-secondary my-4 w-full border-dashed"
        >
          <UserRoundPlus size={20} />
          Add Walk-In
        </button>

        {error ? (
          <p role="alert" className="mb-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </p>
        ) : null}
        {conflicts ? (
          <p className="mb-4 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-200">
            {conflicts} offline action{conflicts === 1 ? "" : "s"} need organizer review.
          </p>
        ) : null}

        <div className="space-y-3">
          {filtered.map((reservation) => {
            const remaining = Math.max(
              0,
              reservation.expected_group_size - reservation.arrived_count,
            );
            return (
              <article
                key={reservation.id}
                className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4 [content-visibility:auto]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-xl font-black tracking-[-0.02em]">
                      {reservation.guest_name}
                    </h2>
                    <p className="mt-1 text-sm font-bold text-[var(--accent)]">
                      {reservation.source === "pr"
                        ? reservation.pr_name ?? "PR"
                        : "Direct Wave-SKG"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-3xl font-black tabular-nums">{remaining}</p>
                    <p className="eyebrow">remaining</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-[var(--line)] pt-3 text-sm">
                  <span>
                    Expected <b>{reservation.expected_group_size}</b>
                  </span>
                  <span>
                    Arrived <b>{reservation.arrived_count}</b>
                  </span>
                  <span className="text-[var(--muted)]">
                    {reservation.instagram_username ??
                      reservation.phone ??
                      "No contact shown"}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-4 gap-2">
                  {[1, 2, 3].map((count) => (
                    <button
                      key={count}
                      onClick={() => void checkIn(reservation, count)}
                      disabled={
                        remaining < count || busyReservations.has(reservation.id)
                      }
                      className="grid min-h-14 place-items-center rounded-xl bg-[var(--panel-raised)] text-lg font-black disabled:opacity-25"
                    >
                      +{count}
                    </button>
                  ))}
                  <button
                    onClick={() => checkInCustom(reservation, remaining)}
                    disabled={
                      remaining === 0 || busyReservations.has(reservation.id)
                    }
                    className="min-h-14 rounded-xl bg-[var(--panel-raised)] px-2 text-sm font-black disabled:opacity-30"
                  >
                    Custom
                  </button>
                </div>
                <button
                  onClick={() => void checkIn(reservation, remaining)}
                  disabled={
                    remaining === 0 || busyReservations.has(reservation.id)
                  }
                  className="mt-2 min-h-14 w-full rounded-xl bg-[var(--accent)] px-3 text-sm font-black text-black disabled:opacity-30"
                >
                  All remaining ({remaining})
                </button>
              </article>
            );
          })}
          {filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-[var(--muted)]">
              No matching active guests
            </p>
          ) : null}
        </div>

        <section className="mt-10 border-t border-[var(--line)] pt-6">
          <h2 className="text-xl font-black">Recently checked in</h2>
          <div className="mt-3 divide-y divide-[var(--line)]">
            {recent.map((item) => (
              <div className="flex items-center justify-between py-3" key={item.id}>
                <div>
                  <p className="font-bold">{item.guest_name}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {new Date(item.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <span className="text-lg font-black text-emerald-300">
                  +{item.delta}
                </span>
              </div>
            ))}
          </div>
        </section>
        <a
          className="mt-8 flex min-h-12 items-center justify-center gap-2 text-sm font-bold text-[var(--muted)]"
          href="/api/emergency-export"
        >
          <CloudUpload size={17} />
          Emergency CSV
        </a>
      </main>

      {walkInOpen && event ? (
        <WalkInSheet
          eventId={event.id}
          onClose={() => setWalkInOpen(false)}
          onSubmit={addWalkIn}
        />
      ) : null}
    </PageFrame>
  );
}

function WalkInSheet({
  eventId,
  onClose,
  onSubmit,
}: {
  eventId: string;
  onClose: () => void;
  onSubmit: (operation: OfflineCheckinOperation) => Promise<void>;
}) {
  const [kind, setKind] = useState<WalkInKind>("direct");
  const [prs, setPrs] = useState<Pr[]>([]);
  useEffect(() => {
    fetch("/api/prs")
      .then((response) => response.json())
      .then((data) => setPrs(data.prs ?? []));
  }, []);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void onSubmit({
      idempotencyKey: crypto.randomUUID(),
      kind: "walk_in",
      eventId,
      guestName: String(data.get("guestName")),
      delta: Number(data.get("count")),
      walkInKind: kind,
      prId: kind === "pr" ? String(data.get("prId")) : undefined,
      prConfirmed: kind === "pr" ? data.get("prConfirmed") === "on" : undefined,
      note: String(data.get("note") ?? "") || undefined,
      recordedAt: new Date().toISOString(),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/80 p-2 backdrop-blur-sm sm:items-center sm:justify-center">
      <form
        onSubmit={submit}
        className="safe-bottom max-h-[94svh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-2xl font-black">Add walk-in</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid size-11 place-items-center"
            aria-label="Close"
          >
            <X size={22} />
          </button>
        </div>
        <div className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-bold">Guest or group name</span>
            <input className="field" name="guestName" required />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-bold">People</span>
            <input
              className="field"
              name="count"
              type="number"
              inputMode="numeric"
              min={1}
              max={99}
              defaultValue={1}
              required
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-bold">Type</span>
            <select
              className="field"
              value={kind}
              onChange={(event) => setKind(event.target.value as WalkInKind)}
            >
              <option value="direct">Direct / organic</option>
              <option value="pr">Referred by PR</option>
              <option value="venue">Venue guest</option>
              <option value="complimentary">Complimentary guest</option>
              <option value="staff">Staff</option>
            </select>
          </label>
          {kind === "pr" ? (
            <>
              <label className="block">
                <span className="mb-2 block text-sm font-bold">PR</span>
                <select className="field" name="prId" required>
                  <option value="">Select PR</option>
                  {prs.map((pr) => (
                    <option value={pr.id} key={pr.id}>
                      {pr.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-h-14 items-center gap-3 rounded-xl border border-[var(--line)] p-3 text-sm">
                <input
                  className="size-6 accent-[var(--accent)]"
                  type="checkbox"
                  name="prConfirmed"
                  required
                />
                Guest personally identified this PR
              </label>
            </>
          ) : null}
          <label className="block">
            <span className="mb-2 block text-sm font-bold">Note (optional)</span>
            <textarea className="field min-h-20" name="note" maxLength={500} />
          </label>
          <button className="button-primary w-full">
            <Plus size={20} />
            Check in walk-in
          </button>
        </div>
      </form>
    </div>
  );
}
