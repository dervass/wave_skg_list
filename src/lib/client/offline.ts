"use client";

import { openDB, type DBSchema } from "idb";

import type {
  OfflineCheckinOperation,
  Reservation,
} from "@/lib/domain/types";

interface WaveDb extends DBSchema {
  reservations: {
    key: string;
    value: Reservation;
    indexes: { "by-event": string };
  };
  outbox: {
    key: string;
    value: OfflineCheckinOperation & {
      state: "pending" | "conflict";
      conflict?: string;
    };
    indexes: { "by-state": string };
  };
  meta: {
    key: string;
    value: { key: string; value: string | number };
  };
}

const dbPromise =
  typeof indexedDB === "undefined"
    ? null
    : openDB<WaveDb>("wave-skg-door", 1, {
        upgrade(db) {
          const reservations = db.createObjectStore("reservations", {
            keyPath: "id",
          });
          reservations.createIndex("by-event", "event_id");
          const outbox = db.createObjectStore("outbox", {
            keyPath: "idempotencyKey",
          });
          outbox.createIndex("by-state", "state");
          db.createObjectStore("meta", { keyPath: "key" });
        },
      });

export async function cacheReservations(reservations: Reservation[]) {
  if (!dbPromise || reservations.length === 0) return;
  const db = await dbPromise;
  const transaction = db.transaction("reservations", "readwrite");
  await Promise.all([
    ...reservations.map((reservation) => transaction.store.put(reservation)),
    transaction.done,
  ]);
  await db.put("meta", {
    key: "lastGuestListCache",
    value: new Date().toISOString(),
  });
}

export async function getCachedReservations(eventId: string) {
  if (!dbPromise) return [];
  const db = await dbPromise;
  return db.getAllFromIndex("reservations", "by-event", eventId);
}

export async function exportEmergencyCsvFromCache(eventId: string) {
  const reservations = await getCachedReservations(eventId);
  if (!reservations || reservations.length === 0) {
    throw new Error("No cached reservations found for offline export");
  }
  function cell(value: unknown): string {
    return `"${String(value ?? "").replaceAll('"', '""')}"`;
  }
  const rows = [
    [
      "guest_name",
      "identifier",
      "source",
      "pr",
      "expected",
      "arrived",
      "remaining",
      "status",
    ].map(cell).join(","),
    ...reservations.map((row) =>
      [
        row.guest_name,
        row.instagram_username ?? row.phone ?? "",
        row.source,
        row.pr_name ?? "",
        row.expected_group_size,
        row.arrived_count,
        Math.max(0, Number(row.expected_group_size) - Number(row.arrived_count)),
        row.status,
      ]
        .map(cell)
        .join(","),
    ),
  ];
  const blob = new Blob([`\uFEFF${rows.join("\r\n")}`], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `wave-skg-emergency-offline-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function queueOperation(operation: OfflineCheckinOperation) {
  if (!dbPromise) throw new Error("Offline storage is unavailable");
  const db = await dbPromise;
  await db.put("outbox", { ...operation, state: "pending" });
}

export async function getPendingCount() {
  if (!dbPromise) return 0;
  const db = await dbPromise;
  return db.countFromIndex("outbox", "by-state", "pending");
}

export async function syncOutbox(): Promise<{
  synced: number;
  conflicts: number;
}> {
  if (!dbPromise || !navigator.onLine) return { synced: 0, conflicts: 0 };
  const db = await dbPromise;
  const operations = await db.getAllFromIndex("outbox", "by-state", "pending");
  if (operations.length === 0) return { synced: 0, conflicts: 0 };
  const response = await fetch("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operations }),
  });
  if (!response.ok) throw new Error("Sync unavailable");
  const text = await response.text();
  let data: { results?: unknown[] } = {};
  try {
    if (text) data = JSON.parse(text);
  } catch {}
  const results = data.results ?? [];
  const transaction = db.transaction("outbox", "readwrite");
  let synced = 0;
  let conflicts = 0;
  for (const result of results as Array<{
    idempotencyKey: string;
    status: "synced" | "conflict";
    error: string | null;
  }>) {
    if (result.status === "synced") {
      await transaction.store.delete(result.idempotencyKey);
      synced += 1;
    } else {
      const operation = operations.find(
        (item) => item.idempotencyKey === result.idempotencyKey,
      );
      if (operation) {
        await transaction.store.put({
          ...operation,
          state: "conflict",
          conflict: result.error ?? "Requires organizer review",
        });
      }
      conflicts += 1;
    }
  }
  await transaction.done;
  return { synced, conflicts };
}
