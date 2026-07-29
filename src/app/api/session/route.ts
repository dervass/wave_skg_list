import { NextRequest, NextResponse } from "next/server";

import { getRequestContext, unauthorized } from "@/lib/supabase/request";

export async function GET(request: NextRequest) {
  const eventId = request.nextUrl.searchParams.get("eventId");
  const context = await getRequestContext(undefined, eventId);
  if (!context) return unauthorized();
  return NextResponse.json({
    profile: context.profile,
    event: context.event,
  });
}
