import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { badRequest } from "@/lib/supabase/request";

const schema = z.object({
  username: z.string().trim().min(2).max(50),
  password: z.string().min(4).max(128),
  trusted: z.boolean().default(true),
});

export async function POST(request: NextRequest) {
  try {
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return badRequest("Check your username and credentials");

    const username = parsed.data.username.trim().toLowerCase().replace(/\s+/g, "_");

    let service: ReturnType<typeof createServiceRoleClient>;
    try {
      service = createServiceRoleClient();
    } catch {
      return NextResponse.json(
        { error: "Server configuration error. Contact the administrator." },
        { status: 503 },
      );
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      return NextResponse.json(
        { error: "Server configuration error. Contact the administrator." },
        { status: 503 },
      );
    }

    let response: NextResponse = NextResponse.json({ ok: true });
    const supabase = createServerClient(url, anonKey, {
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
    });

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
    if (!success) {
      if (data.session) await supabase.auth.signOut();
      response = NextResponse.json(
        { error: "Invalid username or credentials" },
        { status: 401 },
      );
    }
    return response;
  } catch (err) {
    console.error("[login] Unhandled error:", err);
    return NextResponse.json(
      { error: "An unexpected server error occurred. Please try again." },
      { status: 500 },
    );
  }
}
