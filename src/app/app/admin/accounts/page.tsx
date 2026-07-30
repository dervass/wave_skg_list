"use client";

import { KeyRound, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { PageFrame } from "@/components/page-frame";
import type { Profile } from "@/lib/domain/types";

export default function AccountManagementPage() {
  const [accounts, setAccounts] = useState<Profile[]>([]);
  const [error, setError] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/admin/accounts");
    const data = await response.json();
    if (response.ok) setAccounts(data.accounts ?? []);
    else setError(data.error ?? "Administrator access required");
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function createAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const response = await fetch("/api/admin/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: data.get("username"),
        displayName: data.get("displayName"),
        password: data.get("password"),
        role: data.get("role"),
      }),
    });
    const result = await response.json();
    if (!response.ok) setError(result.error ?? "Unable to create account");
    else {
      form.reset();
      await load();
    }
  }

  async function updateAccount(
    account: Profile,
    update: { active?: boolean; newPassword?: string },
  ) {
    const response = await fetch("/api/admin/accounts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: account.id, ...update }),
    });
    const data = await response.json();
    if (!response.ok) setError(data.error ?? "Unable to update account");
    else await load();
  }

  async function deleteAccount(account: Profile) {
    const response = await fetch("/api/admin/accounts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: account.id }),
    });
    const data = await response.json();
    if (!response.ok) setError(data.error ?? "Unable to delete account");
    else await load();
  }

  function resetPassword(account: Profile) {
    const password = window.prompt(
      `New temporary password for ${account.username} (8+ characters):`,
    );
    if (password) void updateAccount(account, { newPassword: password });
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
      <main className="safe-bottom mx-auto max-w-3xl px-4 py-7">
        <p className="eyebrow mb-2">Main administrator only</p>
        <h1 className="text-3xl font-black tracking-[-0.04em]">Staff accounts</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          PRs and guests never receive accounts.
        </p>
        {error ? (
          <p className="mt-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </p>
        ) : null}
        <form
          className="my-7 grid gap-3 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4 sm:grid-cols-2"
          onSubmit={createAccount}
        >
          <input className="field" name="username" placeholder="Username" required />
          <input className="field" name="displayName" placeholder="Display name" required />
          <input
            className="field"
            name="password"
            type="password"
            minLength={4}
            placeholder="Temporary password (4+ chars)"
            required
          />
          <select className="field" name="role" defaultValue="door">
            <option value="door">Door staff</option>
            <option value="organizer">Organizer</option>
          </select>
          <button className="button-primary sm:col-span-2">
            <Plus size={18} />
            Create account
          </button>
        </form>
        <div className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
          {accounts.map((account) => (
            <article className="flex min-h-20 items-center gap-3 py-3" key={account.id}>
              <div className="min-w-0 flex-1">
                <p className="truncate font-black">{account.display_name}</p>
                <p className="text-xs text-[var(--muted)]">
                  @{account.username} · <span className="capitalize">{account.role}</span>
                </p>
              </div>
              <button
                className="grid size-11 place-items-center rounded-xl bg-[var(--panel)] cursor-pointer hover:bg-white/10"
                onClick={() => resetPassword(account)}
                aria-label={`Reset password for ${account.username}`}
                title="Reset password"
              >
                <KeyRound size={17} />
              </button>

              <button
                className={`flex h-11 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-bold transition-all cursor-pointer ${
                  confirmDeleteId === account.id
                    ? "bg-red-600 text-white animate-pulse shadow-lg shadow-red-500/30 scale-105"
                    : "bg-red-500/10 text-red-400 hover:bg-red-500/20"
                }`}
                onClick={() => handleDeleteClick(account.id, () => void deleteAccount(account))}
                aria-label={`Delete ${account.username}`}
                title={confirmDeleteId === account.id ? "Click again to confirm delete" : "Delete account"}
              >
                <Trash2 size={17} />
                {confirmDeleteId === account.id && <span>Confirm?</span>}
              </button>
            </article>
          ))}
        </div>
      </main>
    </PageFrame>
  );
}
