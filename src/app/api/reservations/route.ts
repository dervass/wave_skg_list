import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  badRequest,
  getRequestContext,
  unauthorized,
} from "@/lib/supabase/request";

export async function GET(request: NextRequest) {
  const context = await getRequestContext();
  if (!context) return unauthorized();
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const { data, error } = await context.supabase.rpc("search_reservations", {
    p_event_id: context.event.id,
    p_query: query,
  });
  if (error) return badRequest(error.message);
  return NextResponse.json({ reservations: data ?? [] });
}

const reservationSchema = z.object({
  guestName: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(30).nullable().optional(),
  instagramUsername: z.string().trim().max(50).nullable().optional(),
  expectedGroupSize: z.number().int().min(1).max(99),
  source: z.enum(["direct", "pr"]),
  prId: z.string().uuid().nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
  duplicateResolution: z.enum(["create", "mark_duplicate"]).nullable().optional(),
  overrideReason: z.string().trim().min(8).max(500).nullable().optional(),
});

export async function POST(request: Request) {
  const context = await getRequestContext(["admin", "organizer"]);
  if (!context) return unauthorized();
  if (context.event.status === "closed") return badRequest("Event is closed");
  const parsed = reservationSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return badRequest("Invalid reservation", parsed.error.flatten());
  const value = parsed.data;
  if (!value.phone && !value.instagramUsername) {
    return badRequest("Add a full phone number or Instagram username");
  }
  if (value.source === "pr" && !value.prId) {
    return badRequest("Choose a PR");
  }

  const { data, error } = await context.supabase.rpc(
    "create_reservation_v2",
    {
      p_event_id: context.event.id,
      p_guest_name: value.guestName,
      p_phone: value.phone || null,
      p_instagram_username: value.instagramUsername || null,
      p_expected_group_size: value.expectedGroupSize,
      p_source: value.source,
      p_pr_id: value.prId || null,
      p_note: value.note || null,
      p_duplicate_resolution: value.duplicateResolution || null,
      p_override_reason: value.overrideReason || null,
    },
  );
  if (error) return badRequest(error.message);
  if (data?.duplicate_found && !value.duplicateResolution) {
    return NextResponse.json(data, { status: 409 });
  }
  return NextResponse.json(data, { status: 201 });
}

const updateSchema = z.object({
  reservationId: z.string().uuid(),
  action: z.enum(["cancel", "void", "update_attribution", "edit_details"]),
  prId: z.string().uuid().nullable().optional(),
  source: z.enum(["direct", "pr"]).optional(),
  reason: z.string().trim().max(500).optional().nullable().default("Cancelled by operator"),
  guestName: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  instagramUsername: z.string().trim().max(50).nullable().optional(),
  expectedGroupSize: z.number().int().min(1).max(99).optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

export async function PATCH(request: Request) {
  const context = await getRequestContext(["admin", "organizer"]);
  if (!context) return unauthorized();
  if (context.event.status === "closed") return badRequest("Event is closed");
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest("A valid action is required");
  const reasonToUse = parsed.data.reason || "Cancelled by operator";
  if (parsed.data.action === "edit_details") {
    if (
      !parsed.data.guestName ||
      !parsed.data.expectedGroupSize ||
      (!parsed.data.phone &&
        !parsed.data.instagramUsername)
    ) {
      return badRequest("Name, group size and one secondary identifier are required");
    }
    const { data, error } = await context.supabase.rpc(
      "edit_reservation_details_v2",
      {
        p_reservation_id: parsed.data.reservationId,
        p_guest_name: parsed.data.guestName,
        p_phone: parsed.data.phone ?? null,
        p_instagram_username: parsed.data.instagramUsername ?? null,
        p_expected_group_size: parsed.data.expectedGroupSize,
        p_note: parsed.data.note ?? null,
        p_reason: reasonToUse,
      },
    );
    if (error) return badRequest(error.message);
    return NextResponse.json(data);
  }
  const { data, error } = await context.supabase.rpc("update_reservation", {
    p_reservation_id: parsed.data.reservationId,
    p_action: parsed.data.action,
    p_source: parsed.data.source ?? null,
    p_pr_id: parsed.data.prId ?? null,
    p_reason: reasonToUse,
  });
  if (error) return badRequest(error.message);
  return NextResponse.json(data);
}

export async function DELETE(request: Request) {
  const context = await getRequestContext(["admin", "organizer"]);
  if (!context) return unauthorized();
  if (context.event.status === "closed") return badRequest("Event is closed");

  const url = new URL(request.url);
  const clearAll = url.searchParams.get("clear_all") === "true";
  const reservationId = url.searchParams.get("id");

  if (clearAll) {
    const { error: ledgerErr } = await context.supabase
      .from("checkin_ledger")
      .delete()
      .eq("event_id", context.event.id);

    const { error } = await context.supabase
      .from("reservations")
      .delete()
      .eq("event_id", context.event.id);

    if (error || ledgerErr) return badRequest(error?.message || ledgerErr?.message || "Failed to clear reservations");
    return NextResponse.json({ success: true, cleared: "all" });
  }

  if (reservationId) {
    const { error } = await context.supabase
      .from("reservations")
      .delete()
      .eq("id", reservationId)
      .eq("event_id", context.event.id);

    if (error) return badRequest(error.message);
    return NextResponse.json({ success: true });
  }

  return badRequest("Specify reservation id or clear_all=true");
}
