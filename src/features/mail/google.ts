import "server-only";
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export function canReadMail(scope: string | null | undefined) {
  return scope?.split(/\s+/).includes(GMAIL_SCOPE) ?? false;
}
export function gmailConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.TOKEN_ENCRYPTION_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    process.env.APP_URL,
  );
}
export function googleConfig() {
  if (!gmailConfigured()) throw new Error("Gmail is nog niet ingesteld.");
  const base = new URL(process.env.APP_URL!);
  if (base.protocol !== "https:" && base.hostname !== "localhost")
    throw new Error("Gebruik HTTPS voor APP_URL.");
  return {
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    callback: new URL("/api/gmail/callback", base).toString(),
  };
}
export type Tokens = { access_token: string; refresh_token?: string; scope?: string };
export async function googleToken(params: Record<string, string>): Promise<Tokens> {
  const config = googleConfig();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      ...params,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("Google-toegang is verlopen. Koppel Gmail opnieuw.");
  return response.json();
}
export async function googleGet<T>(path: string, token: string): Promise<T> {
  const operation = path.startsWith("messages?")
    ? "messages.list"
    : path.startsWith("messages/")
      ? "messages.get"
      : "profile";
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (response.ok) return response.json();
    const detail: unknown = await response.json().catch(() => null);
    const error = new GmailApiError(response.status, gmailErrorReason(detail), operation);
    if (error.retryable && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
      continue;
    }
    // Fixed identifiers only: never log a token, message ID, or Google's raw error body.
    console.error("Gmail API error", {
      status: error.status,
      reason: error.reason,
      operation,
    });
    throw error;
  }
}

const reasons = new Set([
  "authError",
  "insufficientPermissions",
  "forbidden",
  "badRequest",
  "notFound",
  "accessNotConfigured",
  "dailyLimitExceeded",
  "rateLimitExceeded",
  "userRateLimitExceeded",
  "domainPolicy",
  "backendError",
  "SERVICE_DISABLED",
  "ACCESS_TOKEN_SCOPE_INSUFFICIENT",
  "PERMISSION_DENIED",
]);
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}
function gmailErrorReason(value: unknown): string {
  const error = record(record(value).error);
  // The legacy metadata grant can block full-message reads even after adding readonly.
  if (typeof error.message === "string" && /metadata scope/i.test(error.message))
    return "METADATA_SCOPE";
  const candidates = [
    ...(Array.isArray(error.details) ? error.details : []),
    ...(Array.isArray(error.errors) ? error.errors : []),
  ];
  for (const candidate of candidates) {
    const reason = record(candidate).reason;
    if (typeof reason === "string" && reasons.has(reason)) return reason;
  }
  return "UNKNOWN";
}
export class GmailApiError extends Error {
  readonly retryable: boolean;
  constructor(
    readonly status: number,
    readonly reason: string,
    operation: string,
  ) {
    let help = "Gmail ophalen lukte niet.";
    if (reason === "METADATA_SCOPE")
      help =
        "Google gebruikt nog de oude mailtoegang. Verwijder de toegang van Hub bij je Google-account en koppel Gmail opnieuw.";
    else if (reason === "SERVICE_DISABLED" || reason === "accessNotConfigured")
      help =
        "De Gmail API staat uit in het Google Cloud-project van je OAuth-client. Schakel die API in.";
    else if (
      status === 401 ||
      reason === "insufficientPermissions" ||
      reason === "ACCESS_TOKEN_SCOPE_INSUFFICIENT"
    )
      help =
        "Google geeft onvoldoende mailtoegang. Koppel Gmail opnieuw en sta het lezen van mails toe.";
    else if (reason === "domainPolicy")
      help = "De beheerder van je Google-account blokkeert deze Gmail-koppeling.";
    else if (
      status === 429 ||
      reason === "rateLimitExceeded" ||
      reason === "userRateLimitExceeded" ||
      reason === "dailyLimitExceeded"
    )
      help = "De Gmail API-limiet is bereikt. Probeer later opnieuw.";
    else if (status >= 500) help = "Gmail is tijdelijk niet bereikbaar. Probeer later opnieuw.";
    super(`${help} [${status} / ${reason} / ${operation}]`);
    this.name = "GmailApiError";
    this.retryable =
      status === 429 ||
      status >= 500 ||
      reason === "rateLimitExceeded" ||
      reason === "userRateLimitExceeded";
  }
}
