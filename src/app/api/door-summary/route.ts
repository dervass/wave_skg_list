import { NextResponse } from "next/server";

import {
  badRequest,
  getRequestContext,
  unauthorized,
} from "@/lib/supabase/request";

export async function GET() {
  const context = await getRequestContext();
  if (!context) return unauthorized();
  const { data, error } = await context.supabase.rpc("get_door_summary", {
    p_event_id: context.event.id,
  });
  if (error) return badRequest(error.message);
  return NextResponse.json(data);
}
