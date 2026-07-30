"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { PageFrame } from "@/components/page-frame";
import type { Pr } from "@/lib/domain/types";

export default function PrManagementPage() {
  const [prs, setPrs] = useState<Pr[]>([]);
  const [error, setError] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/prs?all=1");
    const data = await response.json();
    if (response.ok) setPrs(data.prs ?? []);
    else setError(data.error ?? "Unable to load PRs");
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function createPr() {
    const name = window.prompt("New PR name:");
    if (!name) return;
    const response = await fetch("/api/prs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await response.json();
    if (!response.ok) setError(data.error ?? "Unable to add PR");
    else await load();
  }

  async function renamePr(pr: Pr) {
    const name = window.prompt("PR name:", pr.name);
    if (!name) return;
    const response = await fetch("/api/prs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prId: pr.id,
        name,
      }),
    });
    const data = await response.json();
    if (!response.ok) setError(data.error ?? "Unable to update PR");
    else await load();
  }

  async function deletePr(pr: Pr) {
    const response = await fetch(`/api/prs?prId=${encodeURIComponent(pr.id)}`, {
      method: "DELETE",
    });
    const data = await response.json();
    if (!response.ok) setError(data.error ?? "Unable to delete PR");
    else await load();
  }

  const handleDeleteClick = (id: string, onDelete: () => void) => {
    if (confirmDeleteId === id) {
      setConfirmDeleteId(null);
      onDelete();
    } else {
      setConfirmDeleteId(id);
      setTimeout(() => {
        setConfirmDeleteId((curr) => (curr === id ? null : curr));
      }, 4000);
    }
  };

  return (
    <PageFrame>
      <main className="safe-bottom mx-auto max-w-2xl px-4 py-7">
        <div className="mb-6 flex items-end justify-between gap-3">
          <div>
            <p className="eyebrow mb-2">Organizer tools</p>
            <h1 className="text-3xl font-black tracking-[-0.04em]">PR names</h1>
          </div>
          <button
            className="button-primary min-h-12 px-3 cursor-pointer"
            onClick={() => void createPr()}
          >
            <Plus size={19} />
            Add
          </button>
        </div>
        {error ? (
          <p className="mb-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </p>
        ) : null}
        <div className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
          {prs.map((pr) => (
            <div className="flex min-h-16 items-center gap-3 py-2" key={pr.id}>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{pr.name}</p>
              </div>
              <button
                className="grid size-11 place-items-center rounded-xl bg-[var(--panel)] cursor-pointer hover:bg-white/10"
                onClick={() => void renamePr(pr)}
                aria-label={`Rename ${pr.name}`}
                title="Rename PR"
              >
                <Pencil size={17} />
              </button>
              <button
                className={`flex h-11 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-bold transition-all cursor-pointer ${
                  confirmDeleteId === pr.id
                    ? "bg-red-600 text-white animate-pulse shadow-lg shadow-red-500/30 scale-105"
                    : "bg-red-500/10 text-red-400 hover:bg-red-500/20"
                }`}
                onClick={() => handleDeleteClick(pr.id, () => void deletePr(pr))}
                aria-label={`Delete ${pr.name}`}
                title={confirmDeleteId === pr.id ? "Click again to confirm delete" : "Delete PR"}
              >
                <Trash2 size={17} />
                {confirmDeleteId === pr.id && <span>Confirm?</span>}
              </button>
            </div>
          ))}
        </div>
      </main>
    </PageFrame>
  );
}
