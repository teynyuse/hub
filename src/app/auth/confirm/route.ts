import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function GET(request: NextRequest) {
  const hash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  if (hash && type === "email") {
    const db = await createClient();
    const { error } = await db.auth.verifyOtp({ token_hash: hash, type: "email" });
    if (!error) return NextResponse.redirect(new URL("/home", request.url));
  }
  return NextResponse.redirect(new URL("/login", request.url));
}
