import { NextResponse } from "next/server";

import { getRequestContext, unauthorized } from "@/lib/supabase/request";

function cell(value: unknown): string {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET() {
  const context = await getRequestContext(["admin", "organizer"]);
  if (!context) return unauthorized();
  const [reservations, ledger, walkIns, logs] = await Promise.all([
    context.supabase
      .from("reservations")
      .select("*,prs(name)")
      .eq("event_id", context.event.id),
    context.supabase
      .from("checkin_ledger")
      .select("*")
      .eq("event_id", context.event.id),
    context.supabase.from("walk_ins").select("*").eq("event_id", context.event.id),
    context.supabase
      .from("audit_logs")
      .select("*")
      .eq("event_id", context.event.id),
  ]);
  const sections: string[] = [];
  sections.push("RESERVATIONS");
  sections.push(
    [
      "id",
      "guest_name",
      "phone",
      "instagram",
      "expected",
      "source",
      "pr",
      "status",
      "created_at",
    ]
      .map(cell)
      .join(","),
  );
  for (const row of reservations.data ?? []) {
    const pr = Array.isArray(row.prs) ? row.prs[0] : row.prs;
    sections.push(
      [
        row.id,
        row.guest_name,
        row.phone,
        row.instagram_username,
        row.expected_group_size,
        row.source,
        pr?.name,
        row.status,
        row.created_at,
      ]
        .map(cell)
        .join(","),
    );
  }
  for (const [title, rows] of [
    ["CHECKIN_LEDGER", ledger.data],
    ["WALK_INS", walkIns.data],
    ["AUDIT_LOGS", logs.data],
  ] as const) {
    sections.push("", title);
    const keys = rows?.[0] ? Object.keys(rows[0]) : [];
    sections.push(keys.map(cell).join(","));
    for (const row of rows ?? []) {
      sections.push(keys.map((key) => cell(row[key])).join(","));
    }
  }
  const filename = `wave-skg-${context.event.starts_at.slice(0, 10)}.csv`;
  return new NextResponse(`\uFEFF${sections.join("\r\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
