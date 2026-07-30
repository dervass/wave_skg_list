"use client";

import { LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: form.get("username"),
        password: form.get("password"),
        trusted: form.get("trusted") === "on",
      }),
    });
    const text = await response.text();
    let data: { error?: string } = {};
    try {
      if (text) data = JSON.parse(text);
    } catch {}
    if (!response.ok) {
      setError(data.error ?? "Unable to sign in");
      setPending(false);
      return;
    }
    router.replace("/app");
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-between px-5 py-8 sm:py-12">
      <div className="flex items-center gap-3">
        <div className="grid size-12 place-items-center rounded-2xl bg-black border border-purple-500/30 p-1.5 shadow-lg shadow-purple-900/30">
          <img src="/logo-inverted.png" alt="WAVE SKG" className="size-full object-contain" />
        </div>
        <div>
          <p className="text-xl font-black tracking-[-0.03em]">WAVE-SKG</p>
          <p className="eyebrow">Guest list</p>
        </div>
      </div>

      <form className="my-12 space-y-5" onSubmit={submit}>
        <div>
          <p className="eyebrow mb-3">Private staff access</p>
          <h1 className="text-4xl font-black tracking-[-0.045em]">
            Ready for doors.
          </h1>
        </div>
        <label className="block">
          <span className="mb-2 block text-sm font-bold">Username</span>
          <input
            className="field"
            name="username"
            autoCapitalize="none"
            autoComplete="username"
            required
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-bold">Password or secure PIN</span>
          <input
            className="field"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm text-[var(--muted)]">
          <input
            type="checkbox"
            name="trusted"
            defaultChecked
            className="size-5 accent-[var(--accent)]"
          />
          Keep this trusted device signed in
        </label>
        {error ? (
          <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </p>
        ) : null}
        <button className="button-primary w-full" disabled={pending}>
          <LockKeyhole aria-hidden="true" size={19} />
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="text-xs leading-5 text-[var(--muted)]">
        Organizer and entrance staff only. Guest bookings remain on Instagram.
      </p>
    </main>
  );
}
