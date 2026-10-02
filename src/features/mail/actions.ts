"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { requireUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import {
  googleConfig,
  googleToken,
  googleGet,
  GMAIL_SCOPE,
  canReadMail,
  GmailApiError,
} from "./google";
import { decryptToken } from "./crypto";
import { classifiedMessage, type GoogleMessage } from "./message";
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
  const { db, user } = await requireUser();
  try {
    const admin = adminClient();
    const { data: connection, error } = await admin
      .from("gmail_connections")
      .select("*")
      .eq("user_id", user.id)
      .single();
    if (error || !connection)
      return { error: "Koppel eerst je Gmail-account en voer de mailmigratie uit." };
    if (!canReadMail(connection.granted_scope))
      return {
        error: "Koppel Gmail opnieuw om automatische sortering op mailinhoud toe te staan.",
      };
    if (
      connection.last_synced_at &&
      Date.now() - new Date(connection.last_synced_at).getTime() < 30000
    )
      return { error: "Wacht even tussen twee synchronisaties." };
    const tokens = await googleToken({
      grant_type: "refresh_token",
      refresh_token: decryptToken(connection.refresh_token_encrypted, user.id),
    });
    const ids: { id: string }[] = [];
    let pageToken: string | undefined;
    do {
      const query = new URLSearchParams({ maxResults: "100", labelIds: "INBOX" });
      if (pageToken) query.set("pageToken", pageToken);
      const list = await googleGet<{ messages?: { id: string }[]; nextPageToken?: string }>(
        `messages?${query}`,
        tokens.access_token,
      );
      ids.push(...(list.messages ?? []));
      pageToken = list.nextPageToken;
    } while (pageToken && ids.length < 200);
    ids.splice(200);
    const messages: ReturnType<typeof classifiedMessage>[] = [];
    // Read bodies on the server; only a short plain-text preview is persisted.
    // Pace full-message reads: at most two at once, with a second between batches.
    // Gmail charges quota units per read, even when no message is changed.
    for (let i = 0; i < ids.length; i += 2) {
      if (i > 0) await new Promise((resolve) => setTimeout(resolve, 1000));
      messages.push(
        ...(
          await Promise.all(
            ids.slice(i, i + 2).map(async (m) => {
              try {
                return classifiedMessage(
                  await googleGet<GoogleMessage>(
                    `messages/${encodeURIComponent(m.id)}?format=full`,
                    tokens.access_token,
                  ),
                );
              } catch (error) {
                // A mail may be deleted between listing and reading it.
                if (error instanceof GmailApiError && error.status === 404) return null;
                throw error;
              }
            }),
          )
        ).filter((message) => message !== null),
      );
    }
    if (messages.length) {
      const batch = messages;
      const { error: writeError } = await db.rpc("sync_gmail_messages", { items: batch });
      if (writeError) throw new Error("Mails opslaan lukte niet. Probeer opnieuw.");
    }
    const { error: stampError } = await admin
      .from("gmail_connections")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("user_id", user.id);
    if (stampError) throw new Error("Synchronisatie afronden lukte niet.");
    revalidatePath("/", "layout");
    return {
      success: `${messages.length} mails gecontroleerd. Alleen facturen en betalingsverzoeken voor vaste kosten worden getoond.`,
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
