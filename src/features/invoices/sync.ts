import "server-only";
import { randomUUID } from "node:crypto";
import { adminClient } from "@/lib/supabase/admin";
import { canReadMail, googleGet, googleToken, GmailApiError } from "@/features/mail/google";
import { googleBatchMessages } from "@/features/mail/batch";
import { decryptToken } from "@/features/mail/crypto";
import { invoiceMail } from "./mail";
type Connection = {
  refresh_token_encrypted: string;
  granted_scope: string;
  sync_history_id: string | null;
  pending_history_id: string | null;
  sync_queue: string[];
};
type History = {
  history?: { messagesAdded?: { message: { id: string } }[] }[];
  historyId: string;
  nextPageToken?: string;
};
export async function discoverInvoiceMessages(token: string, historyId: string | null) {
  if (historyId) {
    try {
      const ids = new Set<string>();
      let page: string | undefined;
      let checkpoint = historyId;
      for (let n = 0; n < 50; n++) {
        const q = new URLSearchParams({
          startHistoryId: historyId,
          historyTypes: "messageAdded",
          labelId: "INBOX",
          maxResults: "100",
        });
        if (page) q.set("pageToken", page);
        const response = await googleGet<History>(`history?${q}`, token);
        for (const record of response.history ?? [])
          for (const added of record.messagesAdded ?? []) ids.add(added.message.id);
        checkpoint = response.historyId;
        page = response.nextPageToken;
        if (!page) return { ids: [...ids], checkpoint };
      }
      throw new Error(
        "Er zijn te veel wijzigingen voor één controle. De voortgang wordt niet overgeslagen.",
      );
    } catch (e) {
      if (!(e instanceof GmailApiError && e.status === 404)) throw e;
    }
  }
  // Take a checkpoint before listing so new mail arriving during the import is not lost.
  const profile = await googleGet<{ historyId: string }>("profile", token);
  const query = new URLSearchParams({
    maxResults: "100",
    q: 'newer_than:2y {factuur invoice rekening afrekening "te betalen" "amount due" verzekering premie lidgeld} -category:promotions -category:social',
  });
  const list = await googleGet<{ messages?: { id: string }[] }>(`messages?${query}`, token);
  return { ids: (list.messages ?? []).map((m) => m.id), checkpoint: profile.historyId };
}
export async function runInvoiceSync(userId: string) {
  const admin = adminClient();
  const lease = randomUUID();
  const claimed = await admin.rpc("claim_invoice_sync", { account_id: userId, lease_id: lease });
  if (claimed.error)
    return { error: "Facturen controleren lukte niet. Voer de nieuwe database-migratie uit." };
  if (!claimed.data)
    return {
      success:
        "Je facturen zijn al gecontroleerd of worden bijgewerkt. De volgende controle volgt automatisch.",
    };
  const connection = claimed.data as Connection;
  let queue = [...connection.sync_queue];
  let checkpoint = connection.pending_history_id ?? connection.sync_history_id;
  let processed = 0;
  const started = Date.now();
  const save = async (
    items: Awaited<ReturnType<typeof invoiceMail>>[],
    remaining: string[],
    finish = false,
    errorText: string | null = null,
  ) => {
    const result = await admin.rpc("save_invoice_sync", {
      account_id: userId,
      lease_id: lease,
      items,
      remaining,
      checkpoint,
      finish,
      error_text: errorText,
    });
    if (result.error)
      throw new Error("Voortgang opslaan lukte niet. Je betaalstatus blijft bewaard.");
  };
  try {
    if (!canReadMail(connection.granted_scope))
      throw new Error("Koppel Gmail opnieuw om facturen te kunnen lezen.");
    const tokens = await googleToken({
      grant_type: "refresh_token",
      refresh_token: decryptToken(connection.refresh_token_encrypted, userId),
    });
    if (queue.length === 0) {
      const discovered = await discoverInvoiceMessages(
        tokens.access_token,
        connection.sync_history_id,
      );
      queue = discovered.ids;
      checkpoint = discovered.checkpoint;
      await save([], queue);
    }
    while (queue.length > 0 && processed < 100 && Date.now() - started < 85000) {
      if (processed > 0) await new Promise((resolve) => setTimeout(resolve, 2000));
      const group = queue.slice(0, Math.min(5, 100 - processed));
      const results = await googleBatchMessages(group, tokens.access_token);
      const records: Awaited<ReturnType<typeof invoiceMail>>[] = [];
      const completed = new Set<string>();
      let failure: Error | undefined;
      for (const result of results) {
        if (result.error) {
          if (result.error.status === 404) completed.add(result.id);
          else failure ??= result.error;
          continue;
        }
        try {
          records.push(await invoiceMail(result.message!, tokens.access_token));
          completed.add(result.id);
        } catch (e) {
          failure ??= e instanceof Error ? e : new Error("Factuur lezen lukte niet.");
        }
      }
      const remaining = queue.filter((id) => !completed.has(id));
      await save(records, remaining);
      queue = remaining;
      processed += completed.size;
      if (failure) throw failure;
    }
    await save([], queue, true);
    return {
      success: queue.length
        ? `${processed} mails gecontroleerd. De resterende ${queue.length} worden bij de volgende controle verwerkt.`
        : `${processed} nieuwe mails gecontroleerd. Je facturenoverzicht is bijgewerkt.`,
    };
  } catch (e) {
    const reason =
      e instanceof GmailApiError
        ? e.message
        : e instanceof Error && !["TypeError", "TimeoutError"].includes(e.name)
          ? e.message
          : "Gmail is tijdelijk niet bereikbaar.";
    const message = `${reason} Reeds verwerkte facturen zijn bewaard. Hub probeert over 30 minuten opnieuw.`;
    try {
      await save([], queue, true, message);
    } catch {
      return { error: "De voortgang kon niet worden bevestigd. Hub probeert later opnieuw." };
    }
    return { error: message };
  }
}
