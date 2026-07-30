import { NextResponse } from "next/server";
import { badRequest, getRequestContext, unauthorized } from "@/lib/supabase/request";

export async function GET() {
  const context = await getRequestContext(["admin", "organizer"]);
  if (!context) return unauthorized();

  const { data: actuals, error } = await context.supabase.rpc("get_event_calculator_actuals", {
    p_event_id: context.event.id,
  });

  if (error) return badRequest(error.message);

  const { data: reservations } = await context.supabase
    .from("reservations")
    .select("source, expected_group_size")
    .eq("event_id", context.event.id)
    .in("status", ["reserved", "partially_arrived", "fully_arrived"]);

  let bookedPrGuests = 0;
  let bookedDirectGuests = 0;

  if (reservations) {
    for (const r of reservations) {
      if (r.source === "pr") {
        bookedPrGuests += r.expected_group_size || 0;
      } else {
        bookedDirectGuests += r.expected_group_size || 0;
      }
    }
  }

  return NextResponse.json({
    ...(actuals || {}),
    booked_pr_guests: bookedPrGuests,
    booked_direct_guests: bookedDirectGuests,
    booked_total_guests: bookedPrGuests + bookedDirectGuests,
  });
}
