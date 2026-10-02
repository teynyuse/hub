import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { googleConfig, googleGet, googleToken } from "@/features/mail/google";
import { encryptToken } from "@/features/mail/crypto";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const { db, user } = await requireUser();
  const jar = await cookies();
  const saved = jar.get("gmail_oauth")?.value;
  jar.delete("gmail_oauth");
  const target = new URL("/mail", googleConfig().callback);
  try {
    const pending = JSON.parse(saved ?? "{}");
    const state = request.nextUrl.searchParams.get("state");
    const code = request.nextUrl.searchParams.get("code");
    if (!state || pending.state !== state || pending.userId !== user.id || !code)
      throw new Error("Invalid OAuth callback");
    const tokens = await googleToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: googleConfig().callback,
    });
    if (!tokens.refresh_token) throw new Error("Missing refresh token");
    const profile = await googleGet<{ emailAddress: string }>("profile", tokens.access_token);
    const admin = adminClient();
    const { data: previous } = await admin
      .from("gmail_connections")
      .select("email_address")
      .eq("user_id", user.id)
      .maybeSingle();
    if (previous && previous.email_address !== profile.emailAddress) {
      const { error } = await db.from("emails").delete().eq("user_id", user.id);
      if (error) throw error;
    }
    const { error } = await admin.from("gmail_connections").upsert(
      {
        user_id: user.id,
        email_address: profile.emailAddress,
        refresh_token_encrypted: encryptToken(tokens.refresh_token, user.id),
        last_synced_at: null,
      },
      { onConflict: "user_id" },
    );
    if (error) throw error;
    target.searchParams.set("connected", "1");
  } catch {
    target.searchParams.set("error", "connect");
  }
  return NextResponse.redirect(target);
}
