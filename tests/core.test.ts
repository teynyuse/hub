import { describe, it, expect, afterEach } from "vitest";
import { parseCents, widgetSchema } from "@/lib/validation";
import { monthBounds, localDate } from "@/lib/format";
import { classifyMail } from "@/features/mail/classify";
import { encryptToken, decryptToken } from "@/features/mail/crypto";
import { randomBytes } from "node:crypto";
afterEach(() => {
  delete process.env.TOKEN_ENCRYPTION_KEY;
});
describe("money", () => {
  it("keeps currency calculations in whole cents", () => {
    expect(parseCents("12,34")).toBe(1234);
    expect(parseCents("1.1")).toBe(110);
    expect(parseCents("0.01")).toBe(1);
    expect(parseCents("999999999.99")).toBe(99999999999);
  });
  it.each(["-4", "0", "1.234", "1e6", "NaN", "1,234.00", ""])(
    "rejects ambiguous/invalid amount %s",
    (value) => {
      expect(() => parseCents(value)).toThrow();
    },
  );
  it("handles year boundaries and the user's local month", () => {
    expect(monthBounds("2026-12")).toEqual({ start: "2026-12-01", end: "2027-01-01" });
    expect(localDate("Europe/Brussels", new Date("2026-09-30T23:30:00Z"))).toBe("2026-10-01");
  });
});
describe("mail", () => {
  it("classifies bills and flags action required", () => {
    expect(classifyMail("Proximus", "Factuur oktober - actie vereist")).toEqual({
      category: "Facturen",
      important: true,
    });
  });
  it("does not make all newsletters important", () => {
    expect(classifyMail("Shop", "Newsletter oktober", ["CATEGORY_PROMOTIONS"])).toEqual({
      category: "Nieuwsbrieven",
      important: false,
    });
  });
  it("uses Gmail importance labels", () => {
    expect(classifyMail("Iemand", "Hallo", ["IMPORTANT"]).important).toBe(true);
  });
});
describe("account secrets", () => {
  it("encrypts with a random IV and binds tokens to the user", () => {
    process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    const a = encryptToken("test-refresh-token", "user-a");
    const b = encryptToken("test-refresh-token", "user-a");
    expect(a).not.toBe(b);
    expect(a).not.toContain("test-refresh-token");
    expect(decryptToken(a, "user-a")).toBe("test-refresh-token");
    expect(() => decryptToken(a, "user-b")).toThrow();
  });
  it("rejects tampered ciphertext", () => {
    process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    const bytes = Buffer.from(encryptToken("token", "a"), "base64");
    bytes[30] ^= 1;
    expect(() => decryptToken(bytes.toString("base64"), "a")).toThrow();
  });
  it("refuses an invalid encryption key", () => {
    expect(() => encryptToken("token", "a")).toThrow();
  });
});
it("rejects duplicate widget IDs and unknown widget types", () => {
  expect(
    widgetSchema.safeParse([
      { id: "x", type: "money", wide: false },
      { id: "x", type: "tasks", wide: true },
    ]).success,
  ).toBe(false);
  expect(widgetSchema.safeParse([{ id: "x", type: "admin", wide: false }]).success).toBe(false);
});
