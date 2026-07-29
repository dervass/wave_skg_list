import { NextResponse } from "next/server";

import {
  badRequest,
  getRequestContext,
  unauthorized,
} from "@/lib/supabase/request";

export async function GET() {
  const context = await getRequestContext(["admin", "organizer"]);
  if (!context) return unauthorized();
  const { data, error } = await context.supabase
    .from("checkin_ledger")
    .select(
      "id,reservation_id,walk_in_id,entry_kind,attendance_delta,revenue_eligible,reason,occurred_at,operator_id,reservations(guest_name),walk_ins(guest_name),prs!checkin_ledger_pr_id_at_time_fkey(name),profiles!checkin_ledger_operator_id_fkey(display_name)",
    )
    .eq("event_id", context.event.id)
    .order("occurred_at", { ascending: false });
  if (error) return badRequest(error.message);
  return NextResponse.json({ entries: data ?? [] });
}
