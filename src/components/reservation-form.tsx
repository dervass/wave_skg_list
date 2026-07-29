"use client";

import { Check, ClipboardPaste, Plus, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { parseReservationLines } from "@/lib/domain/business";
import type { Pr } from "@/lib/domain/types";

export function ReservationForm({
  initialSource,
}: {
  initialSource: "direct" | "pr";
}) {
  const [prs, setPrs] = useState<Pr[]>([]);
  const [selectedPr, setSelectedPr] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [bulk, setBulk] = useState(initialSource === "pr");
  const [paste, setPaste] = useState("");
  const [duplicate, setDuplicate] = useState<Record<string, unknown> | null>(null);
  const parsedRows = useMemo(() => parseReservationLines(paste), [paste]);

  useEffect(() => {
    if (initialSource !== "pr") return;
    fetch("/api/prs")
      .then((response) => response.json())
      .then((data) => setPrs(data.prs ?? []));
  }, [initialSource]);

  async function create(payload: Record<string, unknown>) {
    const response = await fetch("/api/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (response.status === 409) {
      setDuplicate({ ...data, payload });
      return false;
    }
    if (!response.ok) throw new Error(data.error ?? "Unable to save");
    return true;
  }

  async function submitSingle(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    setMessage("");
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const ok = await create({
        guestName: data.get("guestName"),
        phone: data.get("phone") || null,
        instagramUsername: data.get("instagramUsername") || null,
        expectedGroupSize: Number(data.get("expectedGroupSize")),
        source: initialSource,
        prId: initialSource === "pr" ? selectedPr : null,
        note: data.get("note") || null,
      });
      if (ok) {
        setMessage("Reservation added");
        form.reset();
        if (initialSource === "pr") setSelectedPr((current) => current);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save");
    } finally {
      setPending(false);
    }
  }

  async function submitBulk() {
    if (!selectedPr) {
      setError("Choose a PR first");
      return;
    }
    if (parsedRows.length === 0 || parsedRows.some((row) => row.error)) {
      setError("Correct every row before adding reservations");
      return;
    }
    setPending(true);
    setError("");
    let saved = 0;
    try {
      for (const row of parsedRows) {
        const ok = await create({
          guestName: row.guestName,
          expectedGroupSize: row.expectedGroupSize,
          phone: row.phone,
          instagramUsername: row.instagramUsername,
          source: "pr",
          prId: selectedPr,
        });
        if (!ok) break;
        saved += 1;
      }
      if (saved === parsedRows.length) {
        setPaste("");
        setMessage(`${saved} reservations added`);
      } else if (saved > 0) {
        setMessage(`${saved} saved before a possible duplicate was found`);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save");
    } finally {
      setPending(false);
    }
  }

  async function resolveDuplicate(resolution: "create" | "mark_duplicate") {
    const payload = duplicate?.payload as Record<string, unknown> | undefined;
    if (!payload) return;
    const reason =
      resolution === "create"
        ? window.prompt("Reason for overriding the earliest attribution:")
        : "Marked as duplicate during review";
    if (!reason || reason.trim().length < 8) {
      setError("Enter a reason of at least 8 characters");
      return;
    }
    setPending(true);
    try {
      const ok = await create({
        ...payload,
        duplicateResolution: resolution,
        overrideReason: reason,
      });
      if (ok) {
        setDuplicate(null);
        setMessage(
          resolution === "create"
            ? "Reservation added with override recorded"
            : "Duplicate recorded",
        );
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to resolve");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      {initialSource === "pr" ? (
        <div>
          <label className="mb-2 block text-sm font-bold" htmlFor="pr">
            PR
          </label>
          <select
            id="pr"
            className="field"
            value={selectedPr}
            onChange={(event) => setSelectedPr(event.target.value)}
            required
          >
            <option value="">Select PR</option>
            {prs.map((pr) => (
              <option value={pr.id} key={pr.id}>
                {pr.name}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Selection stays active for fast repeat entry.{" "}
            <Link href="/app/prs" className="font-bold text-[var(--accent)]">
              Manage PR names
            </Link>
          </p>
        </div>
      ) : null}

      {initialSource === "pr" ? (
        <div className="grid grid-cols-2 rounded-xl bg-[var(--panel)] p-1">
          <button
            className={`min-h-11 rounded-lg text-sm font-bold ${!bulk ? "bg-[var(--panel-raised)]" : "text-[var(--muted)]"}`}
            onClick={() => setBulk(false)}
          >
            One reservation
          </button>
          <button
            className={`min-h-11 rounded-lg text-sm font-bold ${bulk ? "bg-[var(--panel-raised)]" : "text-[var(--muted)]"}`}
            onClick={() => setBulk(true)}
          >
            Paste multiple
          </button>
        </div>
      ) : null}

      {bulk ? (
        <div className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-bold">
              Paste Instagram reservations
            </span>
            <textarea
              className="field min-h-40 resize-y font-mono text-sm leading-6"
              value={paste}
              onChange={(event) => setPaste(event.target.value)}
              placeholder={
                "Elena Georgiou, 5, +30 694 555 7629\nNikos Pappas, 3, @nikosp"
              }
            />
          </label>
          {parsedRows.length ? (
            <div className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
              {parsedRows.map((row, index) => (
                <div className="flex gap-3 py-3" key={`${row.guestName}-${index}`}>
                  <span
                    className={`mt-1 grid size-6 shrink-0 place-items-center rounded-full ${
                      row.error ? "bg-red-500/15 text-red-300" : "bg-emerald-500/15 text-emerald-300"
                    }`}
                  >
                    {row.error ? <TriangleAlert size={14} /> : <Check size={14} />}
                  </span>
                  <div>
                    <p className="font-bold">
                      {row.guestName || `Row ${index + 1}`} · {row.expectedGroupSize || "?"}
                    </p>
                    <p className="text-xs text-[var(--muted)]">
                      {row.error ?? row.instagramUsername ?? row.phone}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          <button
            className="button-primary w-full"
            onClick={submitBulk}
            disabled={pending}
          >
            <ClipboardPaste size={19} />
            Add {parsedRows.length || "all"} reservations
          </button>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={submitSingle}>
          <label className="block">
            <span className="mb-2 block text-sm font-bold">Guest name</span>
            <input className="field" name="guestName" required maxLength={120} />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-bold">Expected group size</span>
            <input
              className="field"
              name="expectedGroupSize"
              type="number"
              inputMode="numeric"
              min={1}
              max={99}
              defaultValue={2}
              required
            />
          </label>
          <div>
            <p className="mb-2 text-sm font-bold">
              Secondary identifier <span className="text-[var(--accent)]">*</span>
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                className="field"
                name="phone"
                type="tel"
                placeholder="Full phone number"
              />
              <input
                className="field"
                name="instagramUsername"
                autoCapitalize="none"
                placeholder="@instagram"
              />
            </div>
            <p className="mt-2 text-xs text-[var(--muted)]">
              Enter either one; both are not required.
            </p>
          </div>
          <label className="block">
            <span className="mb-2 block text-sm font-bold">Note (optional)</span>
            <textarea className="field min-h-24 resize-y" name="note" maxLength={500} />
          </label>
          <button className="button-primary w-full" disabled={pending}>
            <Plus size={19} />
            {pending ? "Adding…" : "Add reservation"}
          </button>
        </form>
      )}

      {message ? (
        <p role="status" className="rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-300">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      {duplicate ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/75 p-3 backdrop-blur-sm sm:items-center sm:justify-center">
          <section className="safe-bottom w-full max-w-lg rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5">
            <TriangleAlert className="mb-4 text-[var(--warning)]" size={28} />
            <h2 className="text-2xl font-black">Possible duplicate</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              This was not saved. Review the earliest matching reservation before choosing.
            </p>
            <pre className="my-4 max-h-40 overflow-auto rounded-xl bg-black/30 p-3 text-xs">
              {JSON.stringify(duplicate.existing_reservation ?? duplicate, null, 2)}
            </pre>
            <div className="grid gap-3">
              <button
                className="button-primary"
                onClick={() => resolveDuplicate("create")}
                disabled={pending}
              >
                Save with reason
              </button>
              <button
                className="button-secondary"
                onClick={() => resolveDuplicate("mark_duplicate")}
                disabled={pending}
              >
                Record as duplicate
              </button>
              <button className="min-h-11 text-sm" onClick={() => setDuplicate(null)}>
                Cancel
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
