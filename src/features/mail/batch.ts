import "server-only";
import { randomUUID } from "node:crypto";
import { GmailApiError, gmailErrorReason } from "./google";
import type { GoogleMessage } from "./message";
export type BatchResult = { id: string; message?: GoogleMessage; error?: GmailApiError };
export function parseMessageBatch(text: string, contentType: string, ids: string[]): BatchResult[] {
  const boundary = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
  if (!boundary) throw new Error("Het antwoord van Gmail kon niet worden gelezen.");
  const parts = text.split("--" + (boundary[1] ?? boundary[2])).filter((p) => /HTTP\/\d/.test(p));
  if (parts.length !== ids.length)
    throw new Error("Gmail gaf een onvolledig antwoord. De voortgang is bewaard.");
  const results = new Map<number, BatchResult>();
  for (let position = 0; position < parts.length; position++) {
    const part = parts[position];
    const match = /Content-ID:\s*<response-hub-(\d+)>/i.exec(part);
    const index = match ? Number(match[1]) : position;
    if (index >= ids.length || results.has(index)) throw new Error("Ongeldig Gmail-antwoord.");
    const status = /HTTP\/\d(?:\.\d)?\s+(\d{3})[^\r\n]*\r?\n/.exec(part);
    if (!status) throw new Error("Ongeldig Gmail-antwoord.");
    const http = part.slice(status.index);
    const offset = /\r?\n\r?\n/.exec(http);
    if (!offset) throw new Error("Ongeldig Gmail-antwoord.");
    const body: unknown = JSON.parse(http.slice(offset.index + offset[0].length).trim());
    if (Number(status[1]) !== 200)
      results.set(index, {
        id: ids[index],
        error: new GmailApiError(Number(status[1]), gmailErrorReason(body), "messages.get"),
      });
    else {
      const message = body as GoogleMessage;
      if (message.id !== ids[index]) throw new Error("Gmail gaf een verkeerd bericht terug.");
      results.set(index, { id: ids[index], message });
    }
  }
  return ids.map((_, i) => results.get(i)!);
}
export async function googleBatchMessages(ids: string[], token: string): Promise<BatchResult[]> {
  if (ids.length === 0 || ids.length > 5) throw new Error("Ongeldige groep mails.");
  const boundary = "hub_" + randomUUID().replaceAll("-", "");
  const parts = ids.map(
    (id, i) =>
      `--${boundary}\r\nContent-Type: application/http\r\nContent-ID: <hub-${i}>\r\n\r\nGET /gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full HTTP/1.1\r\n\r\n`,
  );
  const response = await fetch("https://gmail.googleapis.com/batch/gmail/v1", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/mixed; boundary=${boundary}`,
    },
    body: parts.join("") + `--${boundary}--\r\n`,
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok)
    throw new GmailApiError(
      response.status,
      gmailErrorReason(await response.json().catch(() => null)),
      "messages.batch",
    );
  return parseMessageBatch(await response.text(), response.headers.get("content-type") ?? "", ids);
}
