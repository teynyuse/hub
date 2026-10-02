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
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error("Gmail ophalen lukte niet. Probeer opnieuw of koppel je account opnieuw.");
  return response.json();
}
