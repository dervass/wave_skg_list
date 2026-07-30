import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

for (const filename of [".env.local", ".env"]) {
  try {
    const contents = readFileSync(resolve(process.cwd(), filename), "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // The file is optional.
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const temporaryPassword = process.env.SEED_DEFAULT_PASSWORD;
if (!url || !serviceKey || !temporaryPassword || temporaryPassword.length < 12) {
  throw new Error(
    "Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and a 12+ character SEED_DEFAULT_PASSWORD.",
  );
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const EVENT_ID = "10000000-0000-4000-8000-000000000001";
const accountDefinitions = [
  ["waveadmin", "Wave Administrator", "admin"],
  ["organizer1", "Dimitris Organizer", "organizer"],
  ["organizer2", "Sofia Organizer", "organizer"],
  ["door1", "Alex Door", "door"],
  ["door2", "Eleni Door", "door"],
] as const;

async function ensureUser(
  username: string,
  displayName: string,
  role: "admin" | "organizer" | "door",
) {
  const email = `${username}@auth.wave-skg.internal`;
  const { data: page, error: listError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listError) throw listError;
  let user = page.users.find((candidate) => candidate.email === email);
  if (!user) {
    const userPassword = username === "waveadmin" ? "wave1234" : temporaryPassword;
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: userPassword,
      email_confirm: true,
      user_metadata: { username, visible_password: userPassword },
    });
    if (error || !data.user) throw error ?? new Error(`Unable to create ${username}`);
    user = data.user;
  }
  const { error: profileError } = await supabase.from("profiles").upsert({
    id: user.id,
    username,
    display_name: displayName,
    role,
    is_active: true,
  });
  if (profileError) throw profileError;
  return user.id;
}

async function main() {
  const userIds = new Map<string, string>();
  for (const [username, displayName, role] of accountDefinitions) {
    userIds.set(username, await ensureUser(username, displayName, role));
  }
  const adminId = userIds.get("waveadmin")!;

  const { error: eventError } = await supabase.from("events").upsert({
    id: EVENT_ID,
    name: "Wave-SKG at Sunset Bay",
    venue_name: "Sunset Bay",
    starts_at: "2026-08-08T20:00:00+03:00",
    status: "open",
    created_by: adminId,
  });
  if (eventError) throw eventError;

  const assignments = [...userIds.values()].map((userId) => ({
    event_id: EVENT_ID,
    user_id: userId,
  }));
  const { error: assignmentError } = await supabase
    .from("event_assignments")
    .upsert(assignments);
  if (assignmentError) throw assignmentError;

  const { error: settingsError } = await supabase
    .from("event_financial_settings")
    .upsert({
      event_id: EVENT_ID,
      venue_rate_cents: 600,
      pr_rate_cents: 250,
      currency: "EUR",
      updated_by: adminId,
    });
  if (settingsError) throw settingsError;

  const prNames = [
    "Alex M.",
    "Anastasia K.",
    "Antonis V.",
    "Christina P.",
    "Dora N.",
    "Elena G.",
    "Evi T.",
    "George D.",
    "Iason L.",
    "Joanna S.",
    "Kostas R.",
    "Lena A.",
    "Maria F.",
    "Marios C.",
    "Nikos P.",
    "Panagiotis Z.",
    "Rania B.",
    "Sakis H.",
    "Thanos E.",
    "Vicky O.",
  ];
  const prIds = new Map<string, string>();
  for (const name of prNames) {
    const { data: existing } = await supabase
      .from("prs")
      .select("id")
      .eq("name", name)
      .maybeSingle();
    let id = existing?.id as string | undefined;
    if (!id) {
      const { data, error } = await supabase
        .from("prs")
        .insert({ name, created_by: adminId })
        .select("id")
        .single();
      if (error) throw error;
      id = data.id;
    }
    if (!id) throw new Error(`Unable to resolve PR ${name}`);
    prIds.set(name, id);
    const { error } = await supabase
      .from("event_prs")
      .upsert({ event_id: EVENT_ID, pr_id: id, active: true });
    if (error) throw error;
  }

  const reservationRows = [
    {
      id: "20000000-0000-4000-8000-000000000001",
      guest_name: "Elena Georgiou",
      phone: "+30 694 555 7629",
      expected_group_size: 6,
      source: "pr",
      pr_id: prIds.get("Alex M."),
      status: "partially_arrived",
      attribution_locked_at: "2026-08-08T20:35:00+03:00",
    },
    {
      id: "20000000-0000-4000-8000-000000000002",
      guest_name: "Nikos Pappas",
      instagram_username: "@nikosp",
      expected_group_size: 3,
      source: "pr",
      pr_id: prIds.get("Maria F."),
      status: "reserved",
    },
    {
      id: "20000000-0000-4000-8000-000000000003",
      guest_name: "Maria Kostaki",
      phone: "+30 697 000 8831",
      expected_group_size: 2,
      source: "direct",
      pr_id: null,
      status: "fully_arrived",
      attribution_locked_at: "2026-08-08T20:41:00+03:00",
    },
    {
      id: "20000000-0000-4000-8000-000000000004",
      guest_name: "Giorgos Manos",
      phone: "+30 694 123 4432",
      expected_group_size: 4,
      source: "direct",
      pr_id: null,
      status: "no_show",
    },
    {
      id: "20000000-0000-4000-8000-000000000005",
      guest_name: "Elena Georgiu",
      phone: "+30 694 555 7629",
      expected_group_size: 6,
      source: "pr",
      pr_id: prIds.get("Nikos P."),
      status: "duplicate",
    },
    {
      id: "20000000-0000-4000-8000-000000000006",
      guest_name: "Sofia Arvaniti",
      instagram_username: "@sofiaar",
      expected_group_size: 5,
      source: "pr",
      pr_id: prIds.get("Christina P."),
      status: "reserved",
    },
    {
      id: "20000000-0000-4000-8000-000000000007",
      guest_name: "Petros Laskaris",
      phone: "+30 698 000 1098",
      expected_group_size: 2,
      source: "direct",
      pr_id: null,
      status: "cancelled",
    },
  ].map((row) => ({
    event_id: EVENT_ID,
    normalized_guest_name: row.guest_name.toLowerCase(),
    created_by: userIds.get("organizer1"),
    ...row,
  }));
  const { error: reservationsError } = await supabase
    .from("reservations")
    .upsert(reservationRows);
  if (reservationsError) throw reservationsError;

  const walkIns = [
    {
      id: "30000000-0000-4000-8000-000000000001",
      guest_name: "Organic group",
      kind: "direct",
      person_count: 3,
      pr_id: null,
      pr_personally_confirmed: false,
    },
    {
      id: "30000000-0000-4000-8000-000000000002",
      guest_name: "PR door referral",
      kind: "pr",
      person_count: 2,
      pr_id: prIds.get("Evi T."),
      pr_personally_confirmed: true,
    },
    {
      id: "30000000-0000-4000-8000-000000000003",
      guest_name: "Sunset Bay guests",
      kind: "venue",
      person_count: 2,
      pr_id: null,
      pr_personally_confirmed: false,
    },
  ].map((row) => ({
    event_id: EVENT_ID,
    created_by: userIds.get("door1"),
    ...row,
  }));
  const { error: walkInError } = await supabase.from("walk_ins").upsert(walkIns);
  if (walkInError) throw walkInError;

  const ledger = [
    {
      id: "40000000-0000-4000-8000-000000000001",
      reservation_id: reservationRows[0].id,
      walk_in_id: null,
      attendance_delta: 3,
      revenue_eligible: true,
      pr_id_at_time: prIds.get("Alex M."),
      original_ledger_id: null,
      reason: null,
      idempotency_key: "50000000-0000-4000-8000-000000000001",
      entry_kind: "checkin",
    },
    {
      id: "40000000-0000-4000-8000-000000000002",
      reservation_id: reservationRows[2].id,
      walk_in_id: null,
      attendance_delta: 2,
      revenue_eligible: true,
      pr_id_at_time: null,
      original_ledger_id: null,
      reason: null,
      idempotency_key: "50000000-0000-4000-8000-000000000002",
      entry_kind: "checkin",
    },
    {
      id: "40000000-0000-4000-8000-000000000003",
      reservation_id: null,
      walk_in_id: walkIns[0].id,
      attendance_delta: 3,
      revenue_eligible: true,
      pr_id_at_time: null,
      original_ledger_id: null,
      reason: null,
      idempotency_key: "50000000-0000-4000-8000-000000000003",
      entry_kind: "checkin",
    },
    {
      id: "40000000-0000-4000-8000-000000000004",
      reservation_id: null,
      walk_in_id: walkIns[1].id,
      attendance_delta: 2,
      revenue_eligible: true,
      pr_id_at_time: prIds.get("Evi T."),
      original_ledger_id: null,
      reason: null,
      idempotency_key: "50000000-0000-4000-8000-000000000004",
      entry_kind: "checkin",
    },
    {
      id: "40000000-0000-4000-8000-000000000005",
      reservation_id: null,
      walk_in_id: walkIns[2].id,
      attendance_delta: 2,
      revenue_eligible: false,
      pr_id_at_time: null,
      original_ledger_id: null,
      reason: null,
      idempotency_key: "50000000-0000-4000-8000-000000000005",
      entry_kind: "checkin",
    },
    {
      id: "40000000-0000-4000-8000-000000000006",
      reservation_id: reservationRows[2].id,
      walk_in_id: null,
      attendance_delta: -1,
      revenue_eligible: true,
      pr_id_at_time: null,
      original_ledger_id: "40000000-0000-4000-8000-000000000002",
      reason: "Door operator corrected an accidental extra tap",
      idempotency_key: "50000000-0000-4000-8000-000000000006",
      entry_kind: "adjustment",
    },
    {
      id: "40000000-0000-4000-8000-000000000007",
      reservation_id: reservationRows[2].id,
      walk_in_id: null,
      attendance_delta: 1,
      revenue_eligible: true,
      pr_id_at_time: null,
      original_ledger_id: "40000000-0000-4000-8000-000000000002",
      reason: "Organizer restored the verified second arrival",
      idempotency_key: "50000000-0000-4000-8000-000000000007",
      entry_kind: "adjustment",
    },
  ].map((row, index) => ({
    event_id: EVENT_ID,
    operator_id: userIds.get(index < 5 ? "door1" : "organizer2"),
    occurred_at: new Date(Date.parse("2026-08-08T17:35:00Z") + index * 60_000).toISOString(),
    ...row,
  }));
  for (const entry of ledger) {
    const { data: existing } = await supabase
      .from("checkin_ledger")
      .select("id")
      .eq("idempotency_key", entry.idempotency_key)
      .maybeSingle();
    if (!existing) {
      const { error } = await supabase
        .from("checkin_ledger")
        .insert(entry as never);
      if (error) throw error;
    }
  }

  const { error: duplicateError } = await supabase.from("duplicate_reviews").upsert({
    id: "60000000-0000-4000-8000-000000000001",
    event_id: EVENT_ID,
    candidate_reservation_id: reservationRows[4].id,
    existing_reservation_id: reservationRows[0].id,
    match_reasons: ["phone", "similar_name"],
    resolution: "marked_duplicate",
    override_reason: "Same Instagram booking entered twice",
    reviewed_by: userIds.get("organizer1"),
  });
  if (duplicateError) throw duplicateError;

  console.log("Seed complete.");
  console.log("Event:", "Wave-SKG at Sunset Bay");
  console.log("Accounts:", accountDefinitions.map(([name]) => name).join(", "));
  console.log("Rotate the temporary seed password before production use.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
