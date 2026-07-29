import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { badRequest } from "@/lib/supabase/request";

const schema = z.object({
  username: z.string().trim().min(2).max(50).regex(/^[a-zA-Z0-9._-]+$/),
  password: z.string().min(4).max(128),
  trusted: z.boolean().default(true),
});

export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest("Check your username and credentials");

  const username = parsed.data.username.toLocaleLowerCase("en");
  const service = createServiceRoleClient();
  const { data: allowed, error: limitError } = await service.rpc(
    "check_login_rate_limit",
    { p_username: username },
  );
  if (limitError || allowed !== true) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in 15 minutes." },
      { status: 429 },
    );
  }

  let response: NextResponse = NextResponse.json({ ok: true });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: parsed.data.trusted
        ? { maxAge: 60 * 60 * 24 * 30 }
        : undefined,
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const email = `${username}@auth.wave-skg.internal`;
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: parsed.data.password,
  });
  const profile = data.user
    ? await service
        .from("profiles")
        .select("is_active")
        .eq("id", data.user.id)
        .maybeSingle()
    : null;
  const success = !error && profile?.data?.is_active === true;
  await service.rpc("record_login_attempt", {
    p_username: username,
    p_success: success,
  });
  if (!success) {
    if (data.session) await supabase.auth.signOut();
    response = NextResponse.json(
      { error: "Invalid username or credentials" },
      { status: 401 },
    );
  }
  return response;
}
