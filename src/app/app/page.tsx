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
    icon: UserPlus,
  },
  {
    href: "/app/reservations/new?source=direct",
    label: "Add Direct Reservation",
    icon: UsersRound,
  },
  {
    href: "/app/guest-list",
    label: "Guest List",
    icon: ClipboardList,
  },
  {
    href: "/app/door",
    label: "Door Check-In",
    icon: DoorOpen,
  },
  {
    href: "/app/calculator",
    label: "PR Calculator",
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
          {actions.map(({ href, label, icon: Icon }, index) => (
            <Link
              href={href}
              key={href}
              className="group flex min-h-20 items-center gap-4 py-4 transition-colors hover:bg-white/[0.025]"
              style={{ animationDelay: `${index * 45}ms` }}
            >
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[var(--panel-raised)] text-[var(--accent)] transition-transform group-active:scale-95">
                <Icon aria-hidden="true" size={24} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xl font-black tracking-[-0.025em]">
                  {label}
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
