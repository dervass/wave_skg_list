import { NextResponse } from "next/server";
import { z } from "zod";

import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  badRequest,
  getRequestContext,
  unauthorized,
} from "@/lib/supabase/request";

const createSchema = z.object({
  username: z.string().trim().min(2).max(50).regex(/^[a-zA-Z0-9._-]+$/),
  displayName: z.string().trim().min(2).max(80),
  password: z.string().min(8).max(128),
  role: z.enum(["organizer", "door"]),
});

export async function GET() {
  const context = await getRequestContext(["admin"]);
  if (!context) return unauthorized();
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("event_assignments")
    .select("profiles(id,username,display_name,role,is_active)")
    .eq("event_id", context.event.id);
  if (error) return badRequest(error.message);
  return NextResponse.json({
    accounts: (data ?? []).flatMap((row) =>
      Array.isArray(row.profiles) ? row.profiles : row.profiles ? [row.profiles] : [],
    ),
  });
}

export async function POST(request: Request) {
  const context = await getRequestContext(["admin"]);
  if (!context) return unauthorized();
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest("Invalid account", parsed.error.flatten());
  const service = createServiceRoleClient();
  const username = parsed.data.username.toLocaleLowerCase("en");
  const { data, error } = await service.auth.admin.createUser({
    email: `${username}@auth.wave-skg.internal`,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { username },
  });
  if (error || !data.user) return badRequest(error?.message ?? "Unable to create account");
  const { error: profileError } = await service.from("profiles").insert({
    id: data.user.id,
    username,
    display_name: parsed.data.displayName,
    role: parsed.data.role,
    is_active: true,
  });
  if (profileError) return badRequest(profileError.message);
  await service.from("event_assignments").insert({
    event_id: context.event.id,
    user_id: data.user.id,
  });
  return NextResponse.json({ id: data.user.id }, { status: 201 });
}

const updateSchema = z.object({
  userId: z.string().uuid(),
  active: z.boolean().optional(),
  newPassword: z.string().min(8).max(128).optional(),
});

export async function PATCH(request: Request) {
  const context = await getRequestContext(["admin"]);
  if (!context) return unauthorized();
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest("Invalid account update");
  const service = createServiceRoleClient();
  if (parsed.data.active != null) {
    await service
      .from("profiles")
      .update({ is_active: parsed.data.active })
      .eq("id", parsed.data.userId);
    await service.auth.admin.updateUserById(parsed.data.userId, {
      ban_duration: parsed.data.active ? "none" : "876000h",
    });
  }
  if (parsed.data.newPassword) {
    const { error } = await service.auth.admin.updateUserById(parsed.data.userId, {
      password: parsed.data.newPassword,
    });
    if (error) return badRequest(error.message);
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const context = await getRequestContext(["admin"]);
  if (!context) return unauthorized();
  const { userId } = await request.json().catch(() => ({}));
  if (!userId) return badRequest("User ID is required");
  if (userId === context.profile.id) return badRequest("Cannot delete your own admin account");

  const service = createServiceRoleClient();
  await service.from("event_assignments").delete().eq("user_id", userId);
  await service.from("profiles").delete().eq("id", userId);
  await service.auth.admin.deleteUser(userId);

  return NextResponse.json({ ok: true });
}
