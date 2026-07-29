import { NextResponse } from "next/server";
import { z } from "zod";

import {
  badRequest,
  getRequestContext,
  unauthorized,
} from "@/lib/supabase/request";

const schema = z.object({
  reservationId: z.string().uuid(),
  delta: z.number().int().min(1).max(99),
  idempotencyKey: z.string().uuid(),
  recordedAt: z.string().datetime().optional(),
});

export async function POST(request: Request) {
  const context = await getRequestContext();
  if (!context) return unauthorized();
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest("Invalid check-in");
  const { data, error } = await context.supabase.rpc("record_checkin", {
    p_event_id: context.event.id,
    p_reservation_id: parsed.data.reservationId,
    p_delta: parsed.data.delta,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_recorded_at: parsed.data.recordedAt ?? new Date().toISOString(),
  });
  if (error) return badRequest(error.message);
  return NextResponse.json(data);
}
