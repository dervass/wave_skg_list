import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

// ONE-TIME USE: Reset waveadmin and vagg passwords
// DELETE THIS FILE AFTER USE
export async function GET() {
  try {
    const service = createServiceRoleClient();

    const updates = [
      { email: "waveadmin@auth.wave-skg.internal", password: "wave1234" },
      { email: "vagg@auth.wave-skg.internal", password: "vag12345" },
    ];

    const results = [];

    for (const u of updates) {
      // Find user by email
      const { data: list } = await service.auth.admin.listUsers({ perPage: 1000 });
      const user = list?.users?.find((usr) => usr.email === u.email);

      if (!user) {
        results.push({ email: u.email, status: "not found" });
        continue;
      }

      const { error } = await service.auth.admin.updateUserById(user.id, {
        password: u.password,
        user_metadata: {
          ...user.user_metadata,
          visible_password: u.password,
        },
      });

      results.push({
        email: u.email,
        status: error ? `error: ${error.message}` : "password reset OK",
      });
    }

    return NextResponse.json({ ok: true, results });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 },
    );
  }
}
