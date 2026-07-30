import { NextResponse } from "next/server";
import { badRequest, getRequestContext, unauthorized } from "@/lib/supabase/request";
import { z } from "zod";

const ratesSchema = z.object({
  rates: z.array(z.object({
    prId: z.string().uuid(),
    name: z.string().trim().max(80).optional(),
    rateCents: z.number().int().min(0).max(100000)
  })).max(200)
});

export async function PATCH(request: Request) {
  const context = await getRequestContext(["admin", "organizer"]);
  if (!context) return unauthorized();
  if (context.event.status === "closed") return badRequest("Event is closed");

  const parsed = ratesSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest("Invalid PR rates data");

  // Process PR name updates in parallel
  const nameUpdates = parsed.data.rates
    .filter(r => r.name && r.name.length >= 2)
    .map(r => context.supabase.from("prs").update({ name: r.name }).eq("id", r.prId));
  
  await Promise.all(nameUpdates);

  const rates = parsed.data.rates.map(row => ({
    pr_id: row.prId,
    rate_cents: row.rateCents
  }));

  const { data, error } = await context.supabase.rpc("save_event_pr_rates", {
    p_event_id: context.event.id,
    p_rates: rates
  });

  if (error) return badRequest(error.message);
  return NextResponse.json(data);
}
