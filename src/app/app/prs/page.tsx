"use client";

import { Pencil, Plus, Trash2, UserRoundX } from "lucide-react";
import { useEffect, useState } from "react";

import { PageFrame } from "@/components/page-frame";
import type { Pr } from "@/lib/domain/types";

export default function PrManagementPage() {
  const [prs, setPrs] = useState<Pr[]>([]);
  const [error, setError] = useState("");

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

  async function updatePr(pr: Pr, action: "rename" | "toggle") {
    const name =
      action === "rename" ? window.prompt("PR name:", pr.name) : undefined;
    if (action === "rename" && !name) return;
    if (
      action === "toggle" &&
      pr.active &&
      !window.confirm(`Disable ${pr.name} for this event?`)
    ) {
      return;
    }
    const response = await fetch("/api/prs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prId: pr.id,
        name: action === "rename" ? name : undefined,
        active: action === "toggle" ? !pr.active : undefined,
      }),
    });
    const data = await response.json();
    if (!response.ok) setError(data.error ?? "Unable to update PR");
    else await load();
  }

  async function deletePr(pr: Pr) {
    if (
      !window.confirm(
        `Are you sure you want to PERMANENTLY delete PR "${pr.name}" from the system? This cannot be undone.`,
      )
    ) {
      return;
    }
    const response = await fetch(`/api/prs?prId=${encodeURIComponent(pr.id)}`, {
      method: "DELETE",
    });
    const data = await response.json();
    if (!response.ok) setError(data.error ?? "Unable to delete PR");
    else await load();
  }

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
                {!pr.active ? (
                  <p className="text-xs text-amber-400 font-medium">Inactive / Disabled for this event</p>
                ) : null}
              </div>
              <button
                className="grid size-11 place-items-center rounded-xl bg-[var(--panel)] cursor-pointer hover:bg-white/10"
                onClick={() => void updatePr(pr, "rename")}
                aria-label={`Rename ${pr.name}`}
                title="Rename PR"
              >
                <Pencil size={17} />
              </button>
              <button
                className={`grid size-11 place-items-center rounded-xl cursor-pointer ${
                  pr.active
                    ? "bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                    : "bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                }`}
                onClick={() => void updatePr(pr, "toggle")}
                aria-label={`${pr.active ? "Disable" : "Enable"} ${pr.name}`}
                title={pr.active ? "Disable PR" : "Enable PR"}
              >
                {pr.active ? <UserRoundX size={17} /> : <Plus size={17} />}
              </button>
              <button
                className="grid size-11 place-items-center rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 cursor-pointer"
                onClick={() => void deletePr(pr)}
                aria-label={`Permanently delete ${pr.name}`}
                title="Permanently delete PR"
              >
                <Trash2 size={17} />
              </button>
            </div>
          ))}
        </div>
      </main>
    </PageFrame>
  );
}
