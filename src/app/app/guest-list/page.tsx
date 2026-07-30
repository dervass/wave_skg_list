"use client";

import {
  Clock3,
  Download,
  Pencil,
  SlidersHorizontal,
  Trash2,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { PageFrame } from "@/components/page-frame";
import { useAppSession } from "@/lib/client/session";
import type { Reservation } from "@/lib/domain/types";

export default function GuestListPage() {
  const { profile } = useAppSession();
  const [query, setQuery] = useState("");
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);

  async function clearAllReservations() {
    const confirm1 = window.confirm("Are you sure you want to DELETE ALL RESERVATIONS for this event?");
    if (!confirm1) return;
    const confirm2 = window.confirm("CONFIRM CLEAR ALL: Are you 100% sure you want to PERMANENTLY REMOVE ALL RESERVATIONS?");
    if (!confirm2) return;

    setLoading(true);
    const response = await fetch("/api/reservations?clear_all=true", {
      method: "DELETE",
    });
    const data = await response.json();
    if (!response.ok) {
      window.alert(data.error ?? "Failed to clear reservations");
    } else {
      setReservations([]);
    }
    setLoading(false);
  }

  async function mutateReservation(
    reservation: Reservation,
    action: "cancel" | "edit_details",
  ) {
    if (action === "cancel") {
      const confirm1 = window.confirm(`Cancel reservation for "${reservation.guest_name}"?`);
      if (!confirm1) return;
      const confirm2 = window.confirm(`CONFIRM CANCELLATION: Are you 100% sure you want to cancel "${reservation.guest_name}"?`);
      if (!confirm2) return;

      const response = await fetch("/api/reservations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationId: reservation.id,
          action: "cancel",
        }),
      });
      const data = await response.json();
      if (!response.ok) window.alert(data.error ?? "Cancellation rejected");
      else {
        const refreshed = await fetch(
          `/api/reservations?q=${encodeURIComponent(query)}`,
        ).then((result) => result.json());
        setReservations(refreshed.reservations ?? []);
      }
      return;
    }

    const reason = window.prompt("Required reason for editing this reservation (at least 8 characters):");
    if (!reason || reason.trim().length < 8) {
      window.alert("Action cancelled: A valid reason of at least 8 characters is required for audit history.");
      return;
    }

    let payload: Record<string, unknown> = {
      reservationId: reservation.id,
      action,
      reason,
    };
    if (action === "edit_details") {
      const guestName = window.prompt("Guest name:", reservation.guest_name);
      const expected = window.prompt(
        "Expected group size:",
        String(reservation.expected_group_size),
      );
      const identifier = window.prompt(
        "Full phone number or @Instagram:",
        reservation.instagram_username ??
          reservation.phone ??
          "",
      );
      if (!guestName || !expected || !identifier) return;
      payload = {
        ...payload,
        guestName,
        expectedGroupSize: Number(expected),
        phone: identifier.startsWith("@") ? null : identifier,
        instagramUsername: identifier.startsWith("@") ? identifier : null,
        note: reservation.note,
      };
    }
    const response = await fetch("/api/reservations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) window.alert(data.error ?? "Update rejected");
    else {
      const refreshed = await fetch(
        `/api/reservations?q=${encodeURIComponent(query)}`,
      ).then((result) => result.json());
      setReservations(refreshed.reservations ?? []);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/reservations?q=${encodeURIComponent(query)}`, {
        signal: controller.signal,
      })
        .then((response) => response.json())
        .then((data) => setReservations(data.reservations ?? []))
        .finally(() => setLoading(false));
    }, query ? 180 : 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return (
    <PageFrame>
      <main className="safe-bottom mx-auto max-w-4xl px-4 py-6">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow mb-2">All reservations</p>
            <h1 className="text-3xl font-black tracking-[-0.04em]">Guest List</h1>
          </div>
          {profile?.role !== "door" ? (
            <div className="flex gap-2">
              <Link
                href="/app/history"
                className="grid size-12 place-items-center rounded-xl bg-[var(--panel)]"
                aria-label="Attendance history and corrections"
              >
                <Clock3 size={20} />
              </Link>
              <Link
                href="/app/settlement"
                className="grid size-12 place-items-center rounded-xl bg-[var(--panel)]"
                aria-label="Settlement"
              >
                <SlidersHorizontal size={20} />
              </Link>
              <a
                href="/api/export"
                className="grid size-12 place-items-center rounded-xl bg-[var(--panel)]"
                aria-label="Export event CSV"
              >
                <Download size={20} />
              </a>
              <button
                onClick={clearAllReservations}
                className="grid size-12 place-items-center rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                aria-label="Remove all reservations"
                title="Remove all reservations (2-stage confirm)"
              >
                <Trash2 size={20} />
              </button>
            </div>
          ) : null}
        </div>
        <label className="mb-5 block">
          <input
            className="field"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, phone or @Instagram"
          />
        </label>
        <div className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
          {loading && reservations.length === 0 ? (
            <div className="space-y-4 py-4">
              <div className="h-20 w-full rounded-2xl bg-[var(--panel)] animate-pulse" />
              <div className="h-20 w-full rounded-2xl bg-[var(--panel)] animate-pulse" />
              <div className="h-20 w-full rounded-2xl bg-[var(--panel)] animate-pulse" />
            </div>
          ) : (
            reservations.map((reservation) => (
              <article className="py-4" key={reservation.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-black">
                      {reservation.guest_name}
                    </h2>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      {reservation.instagram_username ??
                        reservation.phone ??
                        "No contact shown"}
                    </p>
                  </div>
                  <span className="rounded-full bg-[var(--panel)] px-2.5 py-1 text-xs font-black uppercase">
                    {reservation.status.replaceAll("_", " ")}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                  <span>
                    <b>{reservation.arrived_count}</b> / {reservation.expected_group_size} arrived
                  </span>
                  <span className="font-bold text-[var(--accent)]">
                    {reservation.source === "pr"
                      ? reservation.pr_name ?? "PR"
                      : "Direct Wave-SKG"}
                  </span>
                  <span className="text-[var(--muted)]">
                    {new Date(reservation.created_at).toLocaleString()}
                  </span>
                </div>
                {profile?.role !== "door" &&
                !["cancelled", "duplicate", "voided", "no_show"].includes(
                  reservation.status,
                ) ? (
                  <div className="mt-3 flex gap-2">
                    <button
                      className="flex min-h-11 items-center gap-2 rounded-xl bg-[var(--panel)] px-3 text-xs font-bold"
                      onClick={() => void mutateReservation(reservation, "edit_details")}
                    >
                      <Pencil size={15} />
                      Edit
                    </button>
                    <button
                      className="flex min-h-11 items-center gap-2 rounded-xl bg-red-500/10 px-3 text-xs font-bold text-red-300"
                      onClick={() => void mutateReservation(reservation, "cancel")}
                    >
                      <XCircle size={15} />
                      Cancel
                    </button>
                  </div>
                ) : null}
              </article>
            ))
          )}
          {!loading && reservations.length === 0 ? (
            <p className="py-12 text-center text-sm text-[var(--muted)]">
              No matching reservations
            </p>
          ) : null}
        </div>
      </main>
    </PageFrame>
  );
}
