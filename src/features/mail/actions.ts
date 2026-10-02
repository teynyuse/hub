"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { requireUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { googleConfig, googleToken, googleGet } from "./google";
import { decryptToken } from "./crypto";
import { classifyMail } from "./classify";
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
    scope: "https://www.googleapis.com/auth/gmail.metadata",
    access_type: "offline",
    prompt: "consent select_account",
    state,
  }).toString();
  redirect(url.toString());
}
type GoogleMessage = {
  id: string;
  labelIds?: string[];
  internalDate: string;
  payload?: { headers?: { name: string; value: string }[] };
};
export async function syncGmail(): Promise<ActionState> {
  const { db, user } = await requireUser();
  try {
    const admin = adminClient();
    const { data: connection, error } = await admin
      .from("gmail_connections")
      .select("*")
      .eq("user_id", user.id)
      .single();
    if (error || !connection) return { error: "Koppel eerst je Gmail-account." };
    if (
      connection.last_synced_at &&
      Date.now() - new Date(connection.last_synced_at).getTime() < 30000
    )
      return { error: "Wacht even tussen twee synchronisaties." };
    const tokens = await googleToken({
      grant_type: "refresh_token",
      refresh_token: decryptToken(connection.refresh_token_encrypted, user.id),
    });
    const list = await googleGet<{ messages?: { id: string }[] }>(
      "messages?maxResults=50&labelIds=INBOX",
      tokens.access_token,
    );
    const messages: GoogleMessage[] = [];
    const ids = list.messages ?? [];
    // Bound parallel requests to five and only retrieve headers and labels.
    for (let i = 0; i < ids.length; i += 5) {
      messages.push(
        ...(await Promise.all(
          ids
            .slice(i, i + 5)
            .map((m) =>
              googleGet<GoogleMessage>(
                `messages/${encodeURIComponent(m.id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
                tokens.access_token,
              ),
            ),
        )),
      );
    }
    if (ids.length) {
      const batch = messages.map((m) => {
        const headers = m.payload?.headers ?? [];
        const sender =
          headers.find((h) => h.name.toLowerCase() === "from")?.value ?? "Onbekende afzender";
        const subject =
          headers.find((h) => h.name.toLowerCase() === "subject")?.value ?? "(Geen onderwerp)";
        return {
          gmail_id: m.id,
          sender,
          subject,
          unread: m.labelIds?.includes("UNREAD") ?? false,
          received_at: new Date(Number(m.internalDate)).toISOString(),
          ...classifyMail(sender, subject, m.labelIds),
        };
      });
      const { error: writeError } = await db.rpc("sync_gmail_headers", { items: batch });
      if (writeError) throw new Error("Mails opslaan lukte niet. Probeer opnieuw.");
    }
    const { error: stampError } = await admin
      .from("gmail_connections")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("user_id", user.id);
    if (stampError) throw new Error("Synchronisatie afronden lukte niet.");
    revalidatePath("/", "layout");
    return {
      success: `${messages.length} mails gecontroleerd. Je eigen categorieën blijven behouden.`,
    };
  } catch (e) {
    return { error: validationMessage(e) };
  }
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
