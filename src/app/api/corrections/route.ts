import { NextResponse } from "next/server";
import { z } from "zod";

import {
  badRequest,
  getRequestContext,
  unauthorized,
} from "@/lib/supabase/request";

const schema = z.object({
  reservationId: z.string().uuid().nullable().optional(),
  walkInId: z.string().uuid().nullable().optional(),
  delta: z.number().int().min(-99).max(99).refine((value) => value !== 0),
  reason: z.string().trim().min(8).max(500),
  idempotencyKey: z.string().uuid(),
});

export async function POST(request: Request) {
  const context = await getRequestContext();
  if (!context) return unauthorized();
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest("A non-zero correction and reason are required");
  if (!parsed.data.reservationId && !parsed.data.walkInId) {
    return badRequest("Correction must reference a reservation or walk-in");
  }
  const { data, error } = await context.supabase.rpc("record_correction", {
    p_event_id: context.event.id,
    p_reservation_id: parsed.data.reservationId ?? null,
    p_walk_in_id: parsed.data.walkInId ?? null,
    p_delta: parsed.data.delta,
    p_reason: parsed.data.reason,
    p_idempotency_key: parsed.data.idempotencyKey,
  });
  if (error) return badRequest(error.message);
  return NextResponse.json(data);
}
