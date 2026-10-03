import { CLASSIFICATION_VERSION, classifyMail } from "./classify";
export type MessagePart = {
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: MessagePart[];
};
export type GoogleMessage = {
  id: string;
  labelIds?: string[];
  internalDate: string;
  snippet?: string;
  payload?: MessagePart;
};
function decodeEntities(text: string) {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, code: string) => {
    if (!code.startsWith("#")) return named[code.toLowerCase()] ?? match;
    const n =
      code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : " ";
  });
}
export function htmlToText(html: string) {
  return decodeEntities(
    html
      .replace(/<!--[^]*?-->/g, " ")
      .replace(/<(script|style)\b[^>]*>[^]*?<\/\1\s*>/gi, " ")
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}
function decodeBody(part: MessagePart) {
  if (!part.body?.data) return "";
  const type = part.headers?.find((h) => h.name.toLowerCase() === "content-type")?.value ?? "";
  const charset = /charset\s*=\s*["']?([\w-]+)/i.exec(type)?.[1] ?? "utf-8";
  const bytes = Buffer.from(part.body.data, "base64url");
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return bytes.toString("utf8");
  }
}
export function extractMessageText(part?: MessagePart): string {
  if (!part || part.filename || part.body?.attachmentId || part.mimeType === "message/rfc822")
    return "";
  if (part.mimeType === "text/plain") return decodeBody(part).slice(0, 24000);
  if (part.mimeType === "text/html") return htmlToText(decodeBody(part)).slice(0, 24000);
  const children = part.parts ?? [];
  if (part.mimeType === "multipart/alternative") {
    const plain = children.find((p) => p.mimeType === "text/plain" && !p.filename);
    return (plain ? extractMessageText(plain) : children.map(extractMessageText).join(" ")).slice(
      0,
      24000,
    );
  }
  return children.map(extractMessageText).filter(Boolean).join(" ").slice(0, 24000).trim();
}
function filenames(part?: MessagePart): string[] {
  if (!part) return [];
  return [...(part.filename ? [part.filename] : []), ...(part.parts ?? []).flatMap(filenames)];
}
export function classifiedMessage(message: GoogleMessage) {
  const headers = message.payload?.headers ?? [];
  const header = (name: string) => headers.find((h) => h.name.toLowerCase() === name)?.value;
  const sender = header("from") ?? "Onbekende afzender";
  const subject = header("subject") ?? "(Geen onderwerp)";
  const text = extractMessageText(message.payload) || decodeEntities(message.snippet ?? "");
  return {
    gmail_id: message.id,
    sender,
    subject,
    unread: message.labelIds?.includes("UNREAD") ?? false,
    received_at: new Date(Number(message.internalDate)).toISOString(),
    snippet: text.replace(/\s+/g, " ").trim().slice(0, 240),
    classification_version: CLASSIFICATION_VERSION,
    ...classifyMail(sender, subject, message.labelIds, text, filenames(message.payload)),
  };
}
