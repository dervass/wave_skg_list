"use client";

import {
  ClipboardList,
  DoorOpen,
  UserPlus,
  UsersRound,
  Calculator
} from "lucide-react";
import Link from "next/link";

import { PageFrame } from "@/components/page-frame";
import { useAppSession } from "@/lib/client/session";

const organizerActions = [
  {
    href: "/app/reservations/new?source=pr",
    label: "Add PR Reservation",
    detail: "Keep the selected PR active",
    icon: UserPlus,
  },
  {
    href: "/app/reservations/new?source=direct",
    label: "Add Direct Reservation",
    detail: "Wave-SKG booking",
    icon: UsersRound,
  },
  {
    href: "/app/guest-list",
    label: "Guest List",
    detail: "Review, resolve and export",
    icon: ClipboardList,
  },
  {
    href: "/app/door",
    label: "Door Check-In",
    detail: "Open entrance mode",
    icon: DoorOpen,
  },
  {
    href: "/app/calculator",
    label: "PR Calculator",
    detail: "Cost projections & setup",
    icon: Calculator,
  },
];

export default function AppHome() {
  const { profile } = useAppSession();
  const actions =
    profile?.role === "door" ? [organizerActions[3]] : organizerActions;
  return (
    <PageFrame>
      <main className="safe-bottom mx-auto max-w-4xl px-4 py-7">
        <div className="mb-7">
          <p className="eyebrow mb-2">Choose an action</p>
          <h1 className="text-3xl font-black tracking-[-0.04em]">
            Tonight&apos;s list
          </h1>
        </div>
        <nav className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
          {actions.map(({ href, label, detail, icon: Icon }, index) => (
            <Link
              href={href}
              key={href}
              className="group flex min-h-28 items-center gap-4 py-5 transition-colors hover:bg-white/[0.025]"
              style={{ animationDelay: `${index * 45}ms` }}
            >
              <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-[var(--panel-raised)] text-[var(--accent)] transition-transform group-active:scale-95">
                <Icon aria-hidden="true" size={27} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xl font-black tracking-[-0.025em]">
                  {label}
                </span>
                <span className="mt-1 block text-sm text-[var(--muted)]">
                  {detail}
                </span>
              </span>
              <span aria-hidden="true" className="text-2xl text-[var(--muted)]">
                →
              </span>
            </Link>
          ))}
        </nav>
      </main>
    </PageFrame>
  );
}
