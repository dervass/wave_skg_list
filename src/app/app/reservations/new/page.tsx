import type { Metadata } from "next";

import { PageFrame } from "@/components/page-frame";
import { ReservationForm } from "@/components/reservation-form";

export const metadata: Metadata = { title: "Add reservation" };

export default async function NewReservationPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string }>;
}) {
  const params = await searchParams;
  const source = params.source === "direct" ? "direct" : "pr";
  return (
    <PageFrame>
      <main className="safe-bottom mx-auto max-w-2xl px-4 py-7">
        <p className="eyebrow mb-2">
          {source === "pr" ? "PR attribution" : "Wave-SKG direct"}
        </p>
        <h1 className="mb-7 text-3xl font-black tracking-[-0.04em]">
          Add reservation
        </h1>
        <ReservationForm initialSource={source} />
      </main>
    </PageFrame>
  );
}
