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
  const includeInactive =
    request.nextUrl.searchParams.get("all") === "1" &&
    context.profile.role !== "door";
  let query = context.supabase
    .from("event_prs")
    .select("pr_id,active,prs(id,name)")
    .eq("event_id", context.event.id)
    .order("created_at");
  if (!includeInactive) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) return badRequest(error.message);
  return NextResponse.json({
    prs: (data ?? []).map((row) => {
      const pr = Array.isArray(row.prs) ? row.prs[0] : row.prs;
      return { id: pr?.id ?? row.pr_id, name: pr?.name ?? "Unknown", active: row.active };
    }),
  });
}

const createSchema = z.object({ name: z.string().trim().min(2).max(80) });

export async function POST(request: Request) {
  const context = await getRequestContext(["admin", "organizer"]);
  if (!context) return unauthorized();
  if (context.event.status === "closed") return badRequest("Event is closed");
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest("PR name is required");
  const { data: pr, error } = await context.supabase
    .from("prs")
    .insert({ name: parsed.data.name, created_by: context.profile.id })
    .select("id,name")
    .single();
  if (error) return badRequest(error.message);
  const { error: linkError } = await context.supabase.from("event_prs").insert({
    event_id: context.event.id,
    pr_id: pr.id,
  });
  if (linkError) return badRequest(linkError.message);
  return NextResponse.json({ pr }, { status: 201 });
}

const updateSchema = z.object({
  prId: z.string().uuid(),
  name: z.string().trim().min(2).max(80).optional(),
  active: z.boolean().optional(),
});

export async function PATCH(request: Request) {
  const context = await getRequestContext(["admin", "organizer"]);
  if (!context) return unauthorized();
  if (context.event.status === "closed") return badRequest("Event is closed");
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest("Invalid PR update");
  if (parsed.data.name) {
    const { error } = await context.supabase
      .from("prs")
      .update({ name: parsed.data.name })
      .eq("id", parsed.data.prId);
    if (error) return badRequest(error.message);
  }
  if (parsed.data.active != null) {
    const { error } = await context.supabase
      .from("event_prs")
      .update({ active: parsed.data.active })
      .eq("event_id", context.event.id)
      .eq("pr_id", parsed.data.prId);
    if (error) return badRequest(error.message);
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const context = await getRequestContext(["admin", "organizer"]);
  if (!context) return unauthorized();
  if (context.event.status === "closed") return badRequest("Event is closed");

  const prId = request.nextUrl.searchParams.get("prId");
  if (!prId) return badRequest("PR ID is required");

  // Remove assignment for this event
  await context.supabase
    .from("event_prs")
    .delete()
    .eq("event_id", context.event.id)
    .eq("pr_id", prId);

  // Permanently delete PR entry if not referenced in ledger/reservations
  await context.supabase
    .from("prs")
    .delete()
    .eq("id", prId);

  return NextResponse.json({ ok: true });
}
