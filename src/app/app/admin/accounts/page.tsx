"use client";

import { Eye, EyeOff, KeyRound, Plus, Trash2, Check, LockKeyhole, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";

import { PageFrame } from "@/components/page-frame";
import { useAppSession } from "@/lib/client/session";
import type { Profile } from "@/lib/domain/types";

export default function AccountManagementPage() {
  const session = useAppSession();
  const [accounts, setAccounts] = useState<Profile[]>([]);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});

  function togglePasswordVisibility(id: string) {
    setVisiblePasswords((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  // Organizer personal state
  const [myDisplayName, setMyDisplayName] = useState("");
  const [myInstagram, setMyInstagram] = useState("");
  const [myPassword, setMyPassword] = useState("");
  const [savingSelf, setSavingSelf] = useState(false);
  const [eventStatus, setEventStatus] = useState<string | null>(null);
  const [eventPending, setEventPending] = useState(false);

  async function load() {
    const response = await fetch("/api/admin/accounts");
    const data = await response.json();
    if (response.ok) {
      const accList = data.accounts ?? [];
      setAccounts(accList);
      if (session?.profile) {
        const userProfile = session.profile;
        const me = accList.find((a: Profile) => a.id === userProfile.id) || userProfile;
        setMyDisplayName(me.display_name || "");
      }
    } else {
      setError(data.error ?? "Access required");
    }

    const setRes = await fetch("/api/settlement");
    if (setRes.ok) {
      const setData = await setRes.json();
      setEventStatus(setData.event_status);
    }
  }

  async function toggleEventAction(action: "close" | "reopen") {
    const reason =
      action === "reopen"
        ? window.prompt("Required reason for reopening this event:")
        : window.confirm(
              "Close the event? Unchecked active reservations become no-shows.",
            )
          ? null
          : undefined;
    if (reason === undefined || (action === "reopen" && !reason)) return;
    setEventPending(true);
    setError("");
    setSuccessMsg("");
    const response = await fetch("/api/settlement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reason }),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error ?? "Action failed");
    } else {
      setSuccessMsg(`Event successfully ${action === "close" ? "closed" : "reopened"}`);
      await load();
    }
    setEventPending(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccessMsg("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const response = await fetch("/api/admin/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: data.get("displayName"),
        instagram: data.get("instagram"),
        password: data.get("password"),
        role: data.get("role"),
      }),
    });
    const result = await response.json();
    if (!response.ok) setError(result.error ?? "Unable to create account");
    else {
      form.reset();
      setSuccessMsg("Account created successfully!");
      await load();
    }
  }

  async function updateSelf(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session?.profile) return;
    setError("");
    setSuccessMsg("");
    setSavingSelf(true);

    const payload: { userId: string; displayName?: string; instagram?: string; newPassword?: string } = {
      userId: session.profile.id,
      displayName: myDisplayName,
      instagram: myInstagram,
    };
    if (myPassword.trim()) {
      payload.newPassword = myPassword;
    }

    const response = await fetch("/api/admin/accounts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error ?? "Unable to update account settings");
    } else {
      setSuccessMsg("Account settings updated successfully!");
      setMyPassword("");
      await load();
    }
    setSavingSelf(false);
  }

  async function updateAccount(
    account: Profile,
    update: { newPassword?: string },
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
      `New password for ${account.display_name} (4+ characters):`,
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

  const isOrganizer = session?.profile?.role === "organizer";

  return (
    <PageFrame>
      <main className="safe-bottom mx-auto max-w-3xl px-4 py-7">
        <p className="eyebrow mb-2">
          {isOrganizer ? "Personal Account" : "Main administrator"}
        </p>
        <h1 className="text-3xl font-black tracking-[-0.04em]">
          {isOrganizer ? "Account Settings" : "Staff Accounts & Settings"}
        </h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          {isOrganizer
            ? "Manage your password and profile settings."
            : "Create staff accounts and manage organizer access."}
        </p>

        {error ? (
          <p className="mt-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </p>
        ) : null}

        {successMsg ? (
          <p className="mt-4 rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-300 flex items-center gap-2">
            <Check size={18} />
            {successMsg}
          </p>
        ) : null}

        {/* --- Organizer Self-Service Form --- */}
        {isOrganizer ? (
          <form
            className="my-7 grid gap-4 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5"
            onSubmit={updateSelf}
            autoComplete="off"
          >
            <div>
              <label className="mb-1.5 block text-xs font-bold text-[var(--muted)] uppercase tracking-wider">
                Display Name
              </label>
              <input
                className="field"
                value={myDisplayName}
                onChange={(e) => setMyDisplayName(e.target.value)}
                placeholder="Your Name"
                autoComplete="off"
                required
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold text-[var(--muted)] uppercase tracking-wider">
                Instagram (@handle)
              </label>
              <input
                className="field"
                value={myInstagram}
                onChange={(e) => setMyInstagram(e.target.value)}
                placeholder="@your_instagram"
                autoComplete="off"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold text-[var(--muted)] uppercase tracking-wider">
                Change Password (leave blank to keep current)
              </label>
              <input
                className="field"
                type="password"
                value={myPassword}
                onChange={(e) => setMyPassword(e.target.value)}
                placeholder="New password (4+ chars)"
                minLength={4}
                autoComplete="new-password"
              />
            </div>

            <button className="button-primary mt-2" disabled={savingSelf}>
              {savingSelf ? "Saving..." : "Save Settings"}
            </button>
          </form>
        ) : (
          /* --- Admin View: Event Controls, Create Accounts & Staff List --- */
          <>
            <form
              className="my-7 grid gap-3 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4 sm:grid-cols-2"
              onSubmit={createAccount}
              autoComplete="off"
            >
              <input
                className="field"
                name="displayName"
                placeholder="Display Name (e.g. Alex Karas)"
                autoComplete="off"
                required
              />
              <input
                className="field"
                name="instagram"
                placeholder="Instagram @handle (optional)"
                autoComplete="off"
              />
              <input
                className="field"
                name="password"
                type="password"
                minLength={4}
                placeholder="Password (4+ chars)"
                autoComplete="new-password"
                required
              />
              <select className="field" name="role" defaultValue="door">
                <option value="door">Door staff</option>
                <option value="organizer">Organizer</option>
              </select>
              <button className="button-primary sm:col-span-2">
                <Plus size={18} />
                Create Account
              </button>
            </form>

            <div className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
              {accounts.map((account) => {
                const isPasswordVisible = visiblePasswords[account.id] ?? false;
                return (
                  <article className="flex min-h-20 items-center gap-3 py-3" key={account.id}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-black">{account.display_name}</p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)] mt-0.5">
                        <span className="capitalize">{account.role}</span>
                      </div>
                    </div>

                    <button
                      className="flex h-11 items-center gap-1.5 rounded-xl bg-[var(--panel)] px-3 text-xs font-bold cursor-pointer hover:bg-white/10 text-[var(--ink)]"
                      onClick={() => togglePasswordVisibility(account.id)}
                      aria-label={`Read password for ${account.display_name}`}
                      title={isPasswordVisible ? "Hide password" : "Read password"}
                    >
                      {isPasswordVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                      <span className="font-mono text-xs">
                        {isPasswordVisible
                          ? (account.password || "(Not stored)")
                          : "••••••••"}
                      </span>
                    </button>

                    <button
                      className="flex h-11 size-11 items-center justify-center rounded-xl bg-[var(--panel)] text-xs font-bold cursor-pointer hover:bg-white/10 text-[var(--ink)]"
                      onClick={() => resetPassword(account)}
                      aria-label={`Change password for ${account.display_name}`}
                      title="Change user password"
                    >
                      <KeyRound size={16} />
                    </button>

                    {session?.profile?.id !== account.id ? (
                      <button
                        className={`flex h-11 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-bold transition-all cursor-pointer ${
                          confirmDeleteId === account.id
                            ? "bg-red-600 text-white animate-pulse shadow-lg shadow-red-500/30 scale-105"
                            : "bg-red-500/10 text-red-400 hover:bg-red-500/20"
                        }`}
                        onClick={() => handleDeleteClick(account.id, () => void deleteAccount(account))}
                        aria-label={`Delete ${account.display_name}`}
                        title={confirmDeleteId === account.id ? "Click again to confirm delete" : "Delete account"}
                      >
                        <Trash2 size={17} />
                        {confirmDeleteId === account.id && <span>Confirm?</span>}
                      </button>
                    ) : null}
                  </article>
                );
              })}
            </div>

            <section className="my-7 rounded-2xl border border-red-500/20 bg-red-950/10 p-5">
              <h2 className="text-lg font-black text-red-200 mb-1">Event Status Controls</h2>
              <p className="text-xs text-[var(--muted)] mb-4">
                Exclusive admin controls to close the active event or reopen a closed event.
              </p>
              {eventStatus === "closed" ? (
                <button
                  className="button-secondary w-full"
                  disabled={eventPending}
                  onClick={() => void toggleEventAction("reopen")}
                >
                  <RotateCcw size={18} />
                  Reopen event
                </button>
              ) : (
                <button
                  className="button-danger w-full"
                  disabled={eventPending}
                  onClick={() => void toggleEventAction("close")}
                >
                  <LockKeyhole size={18} />
                  Close event and save final snapshot
                </button>
              )}
            </section>
          </>
        )}
      </main>
    </PageFrame>
  );
}
