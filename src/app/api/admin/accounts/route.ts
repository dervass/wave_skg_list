import { NextResponse } from "next/server";
import { z } from "zod";

import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  badRequest,
  getRequestContext,
  unauthorized,
} from "@/lib/supabase/request";

const createSchema = z.object({
  displayName: z.string().trim().min(2, "Display name must be at least 2 characters").max(80),
  instagram: z.string().trim().max(80).optional().nullable(),
  password: z.string().min(4, "Password must be at least 4 characters").max(128),
  role: z.enum(["organizer", "door", "admin"]),
});

function slugifyName(name: string): string {
  const clean = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return clean.length >= 2 ? clean : `user_${Math.random().toString(36).substring(2, 7)}`;
}

export async function GET() {
  const context = await getRequestContext(["admin", "organizer"]);
  if (!context) return unauthorized();
  const service = createServiceRoleClient();

  if (context.profile.role === "organizer") {
    return NextResponse.json({ accounts: [context.profile] });
  }

  const [{ data, error }, { data: authData }] = await Promise.all([
    service
      .from("event_assignments")
      .select("profiles(id,username,display_name,role,is_active)")
      .eq("event_id", context.event.id),
    service.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  if (error) return badRequest(error.message);

  const metaMap = new Map(
    (authData?.users ?? []).map((u) => [u.id, u.user_metadata]),
  );

  const rawAccounts = (data ?? []).flatMap((row) =>
    Array.isArray(row.profiles) ? row.profiles : row.profiles ? [row.profiles] : [],
  );

  const accounts = rawAccounts.map((acc) => ({
    ...acc,
    password: metaMap.get(acc.id)?.visible_password ?? null,
  }));

  return NextResponse.json({ accounts });
}

export async function POST(request: Request) {
  const context = await getRequestContext(["admin"]);
  if (!context || context.profile.role !== "admin") return unauthorized();

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]?.message ?? "Invalid account details";
    return badRequest(issue);
  }
  const service = createServiceRoleClient();
  
  // Auto-generate username from Display Name
  const baseUsername = slugifyName(parsed.data.displayName);
  let username = baseUsername;
  let counter = 1;
  while (true) {
    const { data: existing } = await service
      .from("profiles")
      .select("id")
      .eq("username", username)
      .maybeSingle();
    if (!existing) break;
    username = `${baseUsername}_${counter++}`;
  }

  const { data, error } = await service.auth.admin.createUser({
    email: `${username}@auth.wave-skg.internal`,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { 
      username,
      instagram: parsed.data.instagram?.replace(/^@/, "") ?? null,
      visible_password: parsed.data.password,
    },
  });
  if (error || !data.user) return badRequest(error?.message ?? "Unable to create user account");

  const { error: profileError } = await service.from("profiles").insert({
    id: data.user.id,
    username,
    display_name: parsed.data.displayName,
    role: parsed.data.role,
    is_active: true,
  });
  if (profileError) {
    await service.auth.admin.deleteUser(data.user.id);
    return badRequest(profileError.message);
  }
  await service.from("event_assignments").insert({
    event_id: context.event.id,
    user_id: data.user.id,
  });
  return NextResponse.json({ id: data.user.id }, { status: 201 });
}

const updateSchema = z.object({
  userId: z.string().uuid(),
  displayName: z.string().trim().min(2).max(80).optional(),
  instagram: z.string().trim().max(80).optional().nullable(),
  newPassword: z.string().min(4).max(128).optional(),
});

export async function PATCH(request: Request) {
  const context = await getRequestContext(["admin", "organizer"]);
  if (!context) return unauthorized();

  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid update payload");

  // Non-admin can only update their own account
  if (context.profile.role !== "admin" && parsed.data.userId !== context.profile.id) {
    return unauthorized();
  }

  const service = createServiceRoleClient();

  if (parsed.data.displayName) {
    await service
      .from("profiles")
      .update({ display_name: parsed.data.displayName })
      .eq("id", parsed.data.userId);
  }

  if (parsed.data.newPassword || parsed.data.instagram !== undefined) {
    const { data: userData } = await service.auth.admin.getUserById(parsed.data.userId);
    const existingMeta = userData?.user?.user_metadata ?? {};
    
    const newMeta = { ...existingMeta };
    if (parsed.data.instagram !== undefined) {
      newMeta.instagram = parsed.data.instagram?.replace(/^@/, "").trim() || null;
    }
    if (parsed.data.newPassword) {
      newMeta.visible_password = parsed.data.newPassword;
    }

    const updatePayload: { password?: string; user_metadata: Record<string, unknown> } = {
      user_metadata: newMeta,
    };
    if (parsed.data.newPassword) {
      updatePayload.password = parsed.data.newPassword;
    }

    const { error } = await service.auth.admin.updateUserById(parsed.data.userId, updatePayload);
    if (error) return badRequest(error.message);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const context = await getRequestContext(["admin"]);
  if (!context || context.profile.role !== "admin") return unauthorized();

  const { userId } = await request.json().catch(() => ({}));
  if (!userId) return badRequest("User ID is required");
  if (userId === context.profile.id) return badRequest("Cannot delete your own account");

  const service = createServiceRoleClient();
  await service.from("event_assignments").delete().eq("user_id", userId);
  await service.from("profiles").delete().eq("id", userId);
  const { error } = await service.auth.admin.deleteUser(userId);
  if (error) return badRequest(error.message);

  return NextResponse.json({ ok: true });
}
