"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { requireUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { googleConfig, GMAIL_SCOPE } from "./google";
import { decryptToken } from "./crypto";
import { runInvoiceSync } from "@/features/invoices/sync";
import { validationMessage } from "@/lib/validation";
import type { ActionState } from "@/lib/types";
export async function connectGmail() {
  const { user } = await requireUser();
  const config = googleConfig();
  const state = randomBytes(32).toString("hex");
  const jar = await cookies();
  jar.set("gmail_oauth", JSON.stringify({ state, userId: user.id }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.callback,
    response_type: "code",
    scope: GMAIL_SCOPE,
    access_type: "offline",
    prompt: "consent select_account",
    state,
  }).toString();
  redirect(url.toString());
}
export async function syncGmail(): Promise<ActionState> {
  const { user } = await requireUser();
  const result = await runInvoiceSync(user.id);
  revalidatePath("/", "layout");
  return result;
}
export async function disconnectGmail(): Promise<ActionState> {
  const { db, user } = await requireUser();
  try {
    const admin = adminClient();
    const { data: connection } = await admin
      .from("gmail_connections")
      .select("refresh_token_encrypted")
      .eq("user_id", user.id)
      .maybeSingle();
    if (connection) {
      const response = await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          token: decryptToken(connection.refresh_token_encrypted, user.id),
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok && response.status !== 400)
        return { error: "Google-toegang intrekken lukte niet. Probeer opnieuw." };
    }
    const deleted = await db.from("emails").delete().eq("user_id", user.id);
    if (deleted.error) throw new Error("Mails verwijderen lukte niet.");
    const { error } = await admin.from("gmail_connections").delete().eq("user_id", user.id);
    if (error) throw new Error("Ontkoppelen lukte niet.");
    revalidatePath("/", "layout");
    return { success: "Gmail ontkoppeld. Opgeslagen mailgegevens zijn verwijderd." };
  } catch (e) {
    return { error: validationMessage(e) };
  }
}
