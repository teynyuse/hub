import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/features/mail/google", async (original) => ({
  ...(await original<typeof import("@/features/mail/google")>()),
  googleGet: mocks.get,
}));

import { discoverInvoiceMessages } from "@/features/invoices/sync";
import { GmailApiError } from "@/features/mail/google";

beforeEach(() => vi.clearAllMocks());

describe("slimme Gmail-controle", () => {
  it("neemt bij de eerste controle hoogstens 100 inboxmails", async () => {
    mocks.get.mockResolvedValueOnce({ historyId: "checkpoint-1" }).mockResolvedValueOnce({
      messages: Array.from({ length: 100 }, (_, i) => ({ id: `mail-${i}` })),
    });
    const result = await discoverInvoiceMessages("token", null);
    expect(result.ids).toHaveLength(100);
    expect(result.checkpoint).toBe("checkpoint-1");
    expect(mocks.get).toHaveBeenNthCalledWith(1, "profile", "token");
    const firstSearch = mocks.get.mock.calls[1][0] as string;
    expect(firstSearch).toContain("messages?maxResults=100");
    expect(firstSearch).toContain("q=");
    expect(decodeURIComponent(firstSearch)).toContain("newer_than:2y");
  });

  it("vraagt daarna alleen nieuwe inboxmails op via de Gmail-geschiedenis", async () => {
    mocks.get.mockResolvedValueOnce({
      historyId: "checkpoint-2",
      history: [
        { messagesAdded: [{ message: { id: "new-a" } }, { message: { id: "new-a" } }] },
        { messagesAdded: [{ message: { id: "new-b" } }] },
      ],
    });
    const result = await discoverInvoiceMessages("token", "checkpoint-1");
    expect(result).toEqual({ ids: ["new-a", "new-b"], checkpoint: "checkpoint-2" });
    expect(mocks.get.mock.calls[0][0]).toContain("startHistoryId=checkpoint-1");
    expect(mocks.get.mock.calls[0][0]).toContain("labelId=INBOX");
  });

  it("herstart veilig met maximaal 100 mails als Gmail de geschiedenis niet meer bewaart", async () => {
    mocks.get
      .mockRejectedValueOnce(new GmailApiError(404, "historyIdExpired", "history.list"))
      .mockResolvedValueOnce({ historyId: "checkpoint-new" })
      .mockResolvedValueOnce({ messages: [{ id: "recent" }] });
    await expect(discoverInvoiceMessages("token", "old")).resolves.toEqual({
      ids: ["recent"],
      checkpoint: "checkpoint-new",
    });
  });
});
