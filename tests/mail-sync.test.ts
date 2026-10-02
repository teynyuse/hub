import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  token: vi.fn(),
  rpc: vi.fn(),
  stamp: vi.fn(),
  revalidate: vi.fn(),
  connection: {
    granted_scope: "https://www.googleapis.com/auth/gmail.readonly",
    refresh_token_encrypted: "token",
    last_synced_at: null as string | null,
  },
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/auth", () => ({
  requireUser: async () => ({ user: { id: "account-a" }, db: { rpc: mocks.rpc } }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  adminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: mocks.connection, error: null }) }),
      }),
      update: () => ({ eq: mocks.stamp }),
    }),
  }),
}));
vi.mock("@/features/mail/crypto", () => ({ decryptToken: () => "decrypted" }));
vi.mock("@/features/mail/google", async (original) => ({
  ...(await original<typeof import("@/features/mail/google")>()),
  googleGet: mocks.get,
  googleToken: mocks.token,
}));
import { syncGmail } from "@/features/mail/actions";
import { GmailApiError } from "@/features/mail/google";
const body = (text: string) => ({
  mimeType: "text/plain",
  body: { data: Buffer.from(text).toString("base64url") },
});
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.connection.granted_scope = "https://www.googleapis.com/auth/gmail.readonly";
  mocks.connection.last_synced_at = null;
  mocks.token.mockResolvedValue({ access_token: "access-token" });
  mocks.rpc.mockResolvedValue({ error: null });
  mocks.stamp.mockResolvedValue({ error: null });
});
afterEach(() => vi.useRealTimers());
async function runSync() {
  const result = syncGmail();
  await vi.runAllTimersAsync();
  return result;
}
describe("Gmail content sync", () => {
  it("limits simultaneous reads and leaves a pause before the next batch", async () => {
    const starts: number[] = [];
    let active = 0;
    let maximum = 0;
    mocks.get.mockImplementation(async (path: string) => {
      if (path.startsWith("messages?"))
        return { messages: ["a", "b", "c", "d", "e"].map((id) => ({ id })) };
      starts.push(Date.now());
      active++;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 100));
      active--;
      return {
        id: path.split("/")[1].split("?")[0],
        internalDate: "1790985600000",
        payload: body("Uw factuur. Te betalen €42."),
      };
    });
    expect((await runSync()).success).toContain("5 mails");
    expect(maximum).toBe(2);
    expect(starts[2] - starts[0]).toBeGreaterThanOrEqual(1100);
    expect(starts[4] - starts[2]).toBeGreaterThanOrEqual(1100);
    expect(mocks.rpc.mock.calls[0][1].items).toHaveLength(5);
  });
  it("continues when a mail was deleted after listing it", async () => {
    mocks.get.mockImplementation(async (path: string) => {
      if (path.startsWith("messages?")) return { messages: [{ id: "gone" }, { id: "bill" }] };
      if (path.includes("/gone?")) throw new GmailApiError(404, "notFound", "messages.get");
      return {
        id: "bill",
        internalDate: "1790985600000",
        labelIds: ["INBOX"],
        payload: {
          ...body("Uw factuur. Te betalen €42."),
          headers: [{ name: "Subject", value: "Factuur" }],
        },
      };
    });
    expect((await runSync()).success).toContain("1 mails");
    expect(mocks.rpc.mock.calls[0][1].items).toHaveLength(1);
    expect(mocks.stamp).toHaveBeenCalledTimes(1);
  });
  it("requires renewed body access before requesting any mails", async () => {
    mocks.connection.granted_scope = "https://www.googleapis.com/auth/gmail.metadata";
    expect((await runSync()).error).toContain("opnieuw");
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.token).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("checks the next result page so promotions do not hide an older bill", async () => {
    mocks.get.mockImplementation(async (path: string) => {
      if (path.startsWith("messages?")) {
        const query = new URLSearchParams(path.split("?")[1]);
        expect(query.get("labelIds")).toBe("INBOX");
        return query.has("pageToken")
          ? { messages: [{ id: "bill" }] }
          : {
              messages: Array.from({ length: 100 }, (_, i) => ({ id: `promo${i}` })),
              nextPageToken: "page 2",
            };
      }
      expect(path).toContain("format=full");
      const id = path.includes("/bill?") ? "bill" : path.split("/")[1].split("?")[0];
      return {
        id,
        internalDate: "1790985600000",
        labelIds: id === "bill" ? ["INBOX"] : ["INBOX", "CATEGORY_PROMOTIONS"],
        payload: {
          ...body(id === "bill" ? "Bijgevoegd uw factuur. Te betalen €42." : "Shop now"),
          headers: [
            { name: "Subject", value: "Document" },
            { name: "From", value: "service@example.com" },
          ],
        },
      };
    });
    const result = await runSync();
    expect(result.success).toContain("101");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    const [name, args] = mocks.rpc.mock.calls[0];
    expect(name).toBe("sync_gmail_messages");
    expect(args.items).toHaveLength(101);
    expect(args.items.at(-1)).toMatchObject({
      gmail_id: "bill",
      category: "Facturen",
      classification_version: 1,
    });
    expect(args.items[0].category).toBe("Nieuwsbrieven");
    expect(args.items[0]).not.toHaveProperty("body");
    expect(args.items[0]).not.toHaveProperty("user_id");
    expect(mocks.stamp).toHaveBeenCalledWith("user_id", "account-a");
  });
  it("does not save a partial classification batch when fetching fails", async () => {
    mocks.get
      .mockResolvedValueOnce({ messages: [{ id: "mail" }] })
      .mockRejectedValueOnce(new Error("Fetch failed"));
    expect((await runSync()).error).toBeTruthy();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.stamp).not.toHaveBeenCalled();
  });
});
