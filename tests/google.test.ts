import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { googleGet, GmailApiError } from "@/features/mail/google";
const fetchMock = vi.fn();
let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  log = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
const failure = (status: number, error: unknown) => Response.json({ error }, { status });
describe("Gmail API failure handling", () => {
  it("identifies a disabled API without exposing Google's raw response", async () => {
    fetchMock.mockResolvedValue(
      failure(403, {
        message: "Secret project and email details",
        details: [{ reason: "SERVICE_DISABLED", metadata: { secret: "private" } }],
      }),
    );
    const error = await googleGet<never>("messages?labelIds=INBOX", "secret-token").catch(
      (e: unknown) => {
        if (e instanceof GmailApiError) return e;
        throw e;
      },
    );
    expect(error).toBeInstanceOf(GmailApiError);
    expect(error.message).toContain("403 / SERVICE_DISABLED / messages.list");
    expect(error.message).not.toContain("Secret");
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/secret-token|private|Secret/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("recognizes a stale metadata grant at the full-message read", async () => {
    fetchMock.mockResolvedValue(
      failure(403, {
        message: "Metadata scope doesn't allow format FULL; private mail ID",
        errors: [{ reason: "forbidden" }],
      }),
    );
    const error = await googleGet<never>("messages/private-id?format=full", "token").catch(
      (e: unknown) => {
        if (e instanceof GmailApiError) return e;
        throw e;
      },
    );
    expect(error.message).toContain("403 / METADATA_SCOPE / messages.get");
    expect(JSON.stringify(log.mock.calls)).not.toContain("private-id");
  });
  it("uses a safe fallback for unrecognized or malformed errors", async () => {
    fetchMock.mockResolvedValue(new Response("not JSON; secret", { status: 400 }));
    await expect(googleGet("profile", "token")).rejects.toThrow("400 / UNKNOWN / profile");
    fetchMock.mockResolvedValue(failure(403, { errors: [{ reason: "user@example.com" }] }));
    await expect(googleGet("profile", "token")).rejects.toThrow("403 / UNKNOWN / profile");
    expect(JSON.stringify(log.mock.calls)).not.toContain("user@example.com");
  });
  it("retries rate limits with backoff and then returns the successful response", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(failure(429, {}))
      .mockResolvedValueOnce(failure(503, {}))
      .mockResolvedValueOnce(Response.json({ messages: [] }));
    const result = googleGet("messages?maxResults=100", "token");
    await vi.runAllTimersAsync();
    expect(await result).toEqual({ messages: [] });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(log).not.toHaveBeenCalled();
  });
  it("stops after five requests when a transient error persists", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(() =>
      Promise.resolve(failure(403, { errors: [{ reason: "userRateLimitExceeded" }] })),
    );
    const result = googleGet<never>("messages?maxResults=100", "token").catch((e: unknown) => {
      if (e instanceof GmailApiError) return e;
      throw e;
    });
    await vi.runAllTimersAsync();
    expect((await result).message).toContain("403 / userRateLimitExceeded / messages.list");
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});
