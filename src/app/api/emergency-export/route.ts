import { NextResponse } from "next/server";

import { getRequestContext, unauthorized } from "@/lib/supabase/request";

function cell(value: unknown): string {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export async function GET() {
  const context = await getRequestContext();
  if (!context) return unauthorized();
  const { data, error } = await context.supabase.rpc("search_reservations", {
    p_event_id: context.event.id,
    p_query: "",
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  const rows = [
    [
      "guest_name",
      "identifier",
      "source",
      "pr",
      "expected",
      "arrived",
      "remaining",
      "status",
    ].map(cell).join(","),
    ...(data ?? []).map((row: Record<string, unknown>) =>
      [
        row.guest_name,
        row.instagram_username ??
          row.phone ??
          "",
        row.source,
        row.pr_name,
        row.expected_group_size,
        row.arrived_count,
        Math.max(
          0,
          Number(row.expected_group_size) - Number(row.arrived_count),
        ),
        row.status,
      ]
        .map(cell)
        .join(","),
    ),
  ];
  return new NextResponse(`\uFEFF${rows.join("\r\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="wave-skg-emergency-${context.event.starts_at.slice(0, 10)}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
