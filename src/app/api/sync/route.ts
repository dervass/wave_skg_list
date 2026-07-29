import { NextResponse } from "next/server";
import { z } from "zod";

import {
  badRequest,
  getRequestContext,
  unauthorized,
} from "@/lib/supabase/request";

const operationSchema = z.object({
  idempotencyKey: z.string().uuid(),
  kind: z.enum(["checkin", "walk_in", "adjustment"]),
  eventId: z.string().uuid(),
  reservationId: z.string().uuid().optional(),
  walkInId: z.string().uuid().optional(),
  delta: z.number().int().min(-99).max(99),
  walkInKind: z
    .enum(["direct", "pr", "venue", "complimentary", "staff"])
    .optional(),
  guestName: z.string().max(120).optional(),
  prId: z.string().uuid().optional(),
  prConfirmed: z.boolean().optional(),
  note: z.string().max(500).optional(),
  reason: z.string().max(500).optional(),
  recordedAt: z.string().datetime(),
});

export async function POST(request: Request) {
  const context = await getRequestContext();
  if (!context) return unauthorized();
  const parsed = z
    .object({ operations: z.array(operationSchema).min(1).max(100) })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest("Invalid offline operation batch");
  if (parsed.data.operations.some((op) => op.eventId !== context.event.id)) {
    return badRequest("Operations must belong to the assigned event");
  }

  const results = [];
  for (const operation of parsed.data.operations) {
    const { data, error } = await context.supabase.rpc(
      "process_offline_operation",
      { p_operation: operation },
    );
    results.push({
      idempotencyKey: operation.idempotencyKey,
      status: error || data?.status === "conflict" ? "conflict" : "synced",
      result: data ?? null,
      error: error?.message ?? data?.error ?? null,
    });
  }
  return NextResponse.json({ results });
}
