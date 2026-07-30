import "server-only";

import { NextResponse } from "next/server";

import type { AppRole, EventSummary, Profile } from "@/lib/domain/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export interface RequestContext {
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
  profile: Profile;
  event: EventSummary;
}

export async function getRequestContext(
  allowedRoles: AppRole[] = ["admin", "organizer", "door"],
  eventId?: string | null,
): Promise<RequestContext | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  let assignmentQuery = supabase
    .from("event_assignments")
    .select("events(id,name,venue_name,starts_at,status)")
    .eq("user_id", user.id);
  if (eventId) assignmentQuery = assignmentQuery.eq("event_id", eventId);

  const [profileResult, assignmentResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id,username,display_name,role,is_active")
      .eq("id", user.id)
      .single(),
    assignmentQuery.limit(1).maybeSingle(),
  ]);

  const profile = profileResult.data;
  if (
    !profile ||
    !profile.is_active ||
    !allowedRoles.includes(profile.role as AppRole)
  ) {
    return null;
  }

  const assignedEvent = assignmentResult.data?.events;
  const event = Array.isArray(assignedEvent)
    ? assignedEvent[0]
    : assignedEvent;
  if (!event) return null;

  return {
    supabase,
    profile: profile as Profile,
    event: event as EventSummary,
  };
}

export function unauthorized(message = "Not authorized") {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function badRequest(message: string, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status: 400 });
}
