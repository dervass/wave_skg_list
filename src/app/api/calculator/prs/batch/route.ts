import { NextResponse } from "next/server";
import { badRequest, getRequestContext, unauthorized } from "@/lib/supabase/request";
import { z } from "zod";

const batchSchema = z.object({
  rows: z.array(z.object({
    name: z.string().trim().min(2).max(80),
    rateCents: z.number().int().min(0).max(100000)
  })).max(200)
});

export async function POST(request: Request) {
  const context = await getRequestContext(["admin", "organizer"]);
  if (!context) return unauthorized();
  if (context.event.status === "closed") return badRequest("Event is closed");

  const parsed = batchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest("Invalid PR batch data");

  const rows = parsed.data.rows.map(row => ({
    name: row.name,
    rate_cents: row.rateCents
  }));

  const { data, error } = await context.supabase.rpc("batch_upsert_event_prs", {
    p_event_id: context.event.id,
    p_rows: rows
  });

  if (error) return badRequest(error.message);
  return NextResponse.json(data);
}
