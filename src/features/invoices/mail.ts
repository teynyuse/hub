import "server-only";
import {
  classifiedMessage,
  extractMessageText,
  type GoogleMessage,
  type MessagePart,
} from "@/features/mail/message";
import { googleGet, GmailApiError } from "@/features/mail/google";
import { extractInvoice } from "./extract";
function pdfParts(part?: MessagePart): MessagePart[] {
  if (!part) return [];
  return [
    ...(part.mimeType === "application/pdf" || /\.pdf$/i.test(part.filename ?? "") ? [part] : []),
    ...(part.parts ?? []).flatMap(pdfParts),
  ];
}
export async function readPdfText(bytes: Uint8Array): Promise<string> {
  if (bytes.byteLength > 2 * 1024 * 1024) return "";
  const { getDocumentProxy } = await import("unpdf");
  const document = await getDocumentProxy(bytes);
  const texts: string[] = [];
  for (let n = 1; n <= Math.min(document.numPages, 5); n++) {
    const page = await document.getPage(n);
    const content = await page.getTextContent();
    texts.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
    page.cleanup();
  }
  return texts.join("\n").slice(0, 48000);
}
export async function invoiceMail(message: GoogleMessage, token: string) {
  const mail = classifiedMessage(message);
  if (mail.category !== "Facturen") return { ...mail, invoice: null };
  const body = extractMessageText(message.payload) || message.snippet || "";
  let invoice = extractInvoice(mail.sender, mail.subject, body, mail.received_at);
  if (invoice.needs_review) {
    const texts: string[] = [];
    for (const part of pdfParts(message.payload).slice(0, 2)) {
      if ((part.body?.size ?? 0) > 2 * 1024 * 1024) continue;
      try {
        const data =
          part.body?.data ??
          (part.body?.attachmentId
            ? (
                await googleGet<{ data: string }>(
                  `messages/${encodeURIComponent(message.id)}/attachments/${encodeURIComponent(part.body.attachmentId)}`,
                  token,
                )
              ).data
            : null);
        if (data && data.length <= 3 * 1024 * 1024)
          texts.push(await readPdfText(new Uint8Array(Buffer.from(data, "base64url"))));
      } catch (e) {
        // A quota/network failure must preserve the queue so the PDF can be retried later.
        if (e instanceof GmailApiError && e.status !== 404) throw e;
        if (e instanceof Error && (e.name === "TimeoutError" || e.message === "fetch failed"))
          throw e;
        // Scanned, encrypted or damaged documents are left for review.
      }
    }
    const pdfText = texts.filter(Boolean).join("\n");
    if (pdfText) invoice = extractInvoice(mail.sender, mail.subject, pdfText, mail.received_at);
  }
  return { ...mail, invoice };
}
