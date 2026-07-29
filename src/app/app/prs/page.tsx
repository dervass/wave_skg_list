"use client";

import { Pencil, Plus, UserRoundX } from "lucide-react";
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
      !window.confirm(`Remove ${pr.name} from this event’s active PR list?`)
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

  return (
    <PageFrame>
      <main className="safe-bottom mx-auto max-w-2xl px-4 py-7">
        <div className="mb-6 flex items-end justify-between gap-3">
          <div>
            <p className="eyebrow mb-2">Organizer tools</p>
            <h1 className="text-3xl font-black tracking-[-0.04em]">PR names</h1>
          </div>
          <button
            className="button-primary min-h-12 px-3"
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
                  <p className="text-xs text-[var(--muted)]">Inactive for this event</p>
                ) : null}
              </div>
              <button
                className="grid size-11 place-items-center rounded-xl bg-[var(--panel)]"
                onClick={() => void updatePr(pr, "rename")}
                aria-label={`Rename ${pr.name}`}
              >
                <Pencil size={17} />
              </button>
              <button
                className="grid size-11 place-items-center rounded-xl bg-red-500/10 text-red-300"
                onClick={() => void updatePr(pr, "toggle")}
                aria-label={`${pr.active ? "Deactivate" : "Activate"} ${pr.name}`}
              >
                {pr.active ? <UserRoundX size={17} /> : <Plus size={17} />}
              </button>
            </div>
          ))}
        </div>
      </main>
    </PageFrame>
  );
}
