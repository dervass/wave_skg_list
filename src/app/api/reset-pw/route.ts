import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

// ONE-TIME USE: Reset waveadmin and vagg passwords
// DELETE THIS FILE AFTER USE
export async function GET() {
  try {
    const service = createServiceRoleClient();

    const updates = [
      {
        id: "c900740c-da1f-4de0-b8e6-f1b3deb0d16e",
        username: "waveadmin",
        password: "wave1234",
      },
      {
        id: "58c10f8e-77f9-49ce-ad64-030a750d9b4c",
        username: "vagg",
        password: "vag12345",
      },
    ];

    const results = [];

    for (const u of updates) {
      const { data: userData, error: fetchError } = await service.auth.admin.getUserById(u.id);

      if (fetchError || !userData?.user) {
        results.push({ username: u.username, status: `fetch error: ${fetchError?.message ?? "not found"}` });
        continue;
      }

      const { error } = await service.auth.admin.updateUserById(u.id, {
        password: u.password,
        user_metadata: {
          ...userData.user.user_metadata,
          visible_password: u.password,
        },
      });

      results.push({
        username: u.username,
        email: userData.user.email,
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
