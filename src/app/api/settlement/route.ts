import { NextResponse } from "next/server";
import { z } from "zod";

import {
  badRequest,
  getRequestContext,
  unauthorized,
} from "@/lib/supabase/request";

export async function GET() {
  const context = await getRequestContext(["admin", "organizer"]);
  if (!context) return unauthorized();
  const { data, error } = await context.supabase.rpc("get_event_settlement", {
    p_event_id: context.event.id,
  });
  if (error) return badRequest(error.message);
  return NextResponse.json(data);
}

const actionSchema = z.object({
  action: z.enum(["close", "reopen"]),
  reason: z.string().trim().max(500).nullable().optional(),
});

export async function POST(request: Request) {
  const context = await getRequestContext(["admin", "organizer"]);
  if (!context) return unauthorized();
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest("Invalid event action");
  if (parsed.data.action === "reopen" && (parsed.data.reason?.length ?? 0) < 8) {
    return badRequest("A written reopening reason is required");
  }
  const rpc =
    parsed.data.action === "close" ? "close_event" : "reopen_event";
  const args =
    parsed.data.action === "close"
      ? { p_event_id: context.event.id }
      : { p_event_id: context.event.id, p_reason: parsed.data.reason };
  const { data, error } = await context.supabase.rpc(rpc, args);
  if (error) return badRequest(error.message);
  return NextResponse.json(data);
}
