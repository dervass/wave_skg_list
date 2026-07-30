import { NextResponse } from "next/server";
import { z } from "zod";

import {
  badRequest,
  getRequestContext,
  unauthorized,
} from "@/lib/supabase/request";

const schema = z.object({
  guestName: z.string().trim().min(2).max(120),
  count: z.number().int().min(1).max(99),
  kind: z.enum(["direct", "pr", "venue", "complimentary", "staff"]),
  prId: z.string().uuid().nullable().optional(),
  prConfirmed: z.boolean().optional(),
  note: z.string().trim().max(500).nullable().optional(),
  idempotencyKey: z.string().uuid(),
  recordedAt: z.string().datetime().optional(),
});

export async function POST(request: Request) {
  const context = await getRequestContext();
  if (!context) return unauthorized();
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest("Invalid walk-in", parsed.error.flatten());
  if (parsed.data.kind === "pr" && !parsed.data.prId) {
    return badRequest("Choose a PR for PR walk-in");
  }
  const { data, error } = await context.supabase.rpc("record_walk_in", {
    p_event_id: context.event.id,
    p_guest_name: parsed.data.guestName,
    p_count: parsed.data.count,
    p_kind: parsed.data.kind,
    p_pr_id: parsed.data.prId ?? null,
    p_pr_confirmed: parsed.data.kind === "pr" ? true : (parsed.data.prConfirmed ?? false),
    p_note: parsed.data.note ?? null,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_recorded_at: parsed.data.recordedAt ?? new Date().toISOString(),
  });
  if (error) return badRequest(error.message);
  return NextResponse.json(data);
}
