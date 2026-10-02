import { describe, it, expect } from "vitest";
import { classifyMail, isRelevantMail, CLASSIFICATION_VERSION } from "@/features/mail/classify";
import {
  classifiedMessage,
  extractMessageText,
  htmlToText,
  type MessagePart,
} from "@/features/mail/message";
const encoded = (text: string) => Buffer.from(text).toString("base64url");
const plain = (text: string): MessagePart => ({
  mimeType: "text/plain",
  body: { data: encoded(text) },
});
describe("automatic sorting from message content", () => {
  it.each([
    [
      "service@example.com",
      "Even dit",
      "Bijgevoegd uw factuur. Te betalen: €42 voor 20 oktober.",
      [],
      "Facturen",
    ],
    [
      "teacher@example.com",
      "Morgen",
      "Het examen gaat door op campus. Breng je syllabus mee.",
      [],
      "School",
    ],
    [
      "colleague@example.com",
      "Even bekijken",
      "Voor de vergadering wil ik je code review van deze pull request.",
      [],
      "Werk",
    ],
    [
      "noreply@example.com",
      "Document beschikbaar",
      "Je aanslagbiljet staat op MyMinfin.",
      [],
      "Overheid",
    ],
    [
      "Microsoft",
      "Wachtwoord gewijzigd",
      "Je wachtwoord is gewijzigd.",
      ["IMPORTANT"],
      "Accountmeldingen",
    ],
    [
      "Artevelde",
      "Reset your password",
      "Your password reset link for the studentenportaal.",
      [],
      "Accountmeldingen",
    ],
    [
      "noreply@takeaway.com",
      "Je factuur",
      "Bijgevoegd uw factuur voor je bestelling: €25 te betalen.",
      ["IMPORTANT"],
      "Bestellingen",
    ],
    [
      "Shop",
      "20% korting op je volgende factuur",
      "Bestel nu en ontvang een invoice.",
      [],
      "Nieuwsbrieven",
    ],
    ["Shop", "Deze week", "Shop now, limited-time offer", ["CATEGORY_PROMOTIONS"], "Nieuwsbrieven"],
    [
      "School",
      "Nieuwsbrief oktober",
      "Kom naar onze campus, informatie over examens",
      [],
      "Nieuwsbrieven",
    ],
    ["Iemand", "Hallo", "Hoe gaat het met je?", [], "Overig"],
    [
      "Provider",
      "Invoice October",
      "Amount due EUR 55. Due date 20 October.",
      ["CATEGORY_PROMOTIONS"],
      "Facturen",
    ],
    ["Spam", "Factuur", "Bijgevoegd factuur. Te betalen €42.", ["SPAM"], "Nieuwsbrieven"],
    ["Teacher", "Lesrooster", "Campus planning voor het examen. Unsubscribe.", [], "School"],
    ["Collega", "Dag", "De loonfiche staat klaar op payroll.", [], "Werk"],
  ])("sorts %s / %s", (sender, subject, body, labels, category) => {
    const result = classifyMail(
      sender as string,
      subject as string,
      labels as string[],
      body as string,
    );
    expect(result.category).toBe(category);
    if (
      ["Nieuwsbrieven", "Accountmeldingen", "Bestellingen", "Overig"].includes(category as string)
    )
      expect(result.important).toBe(false);
  });
  it("keeps unanalysed headers out of the relevant view", () => {
    expect(isRelevantMail({ category: "Facturen", classification_version: 0 })).toBe(false);
    expect(
      isRelevantMail({ category: "School", classification_version: CLASSIFICATION_VERSION }),
    ).toBe(true);
    expect(
      isRelevantMail({ category: "Nieuwsbrieven", classification_version: CLASSIFICATION_VERSION }),
    ).toBe(false);
  });
});
describe("Gmail MIME extraction", () => {
  it("prefers plain text over an alternative HTML copy", () => {
    const message: MessagePart = {
      mimeType: "multipart/alternative",
      parts: [
        plain("Examen morgen"),
        { mimeType: "text/html", body: { data: encoded("<p>Newsletter sale</p>") } },
      ],
    };
    expect(extractMessageText(message)).toBe("Examen morgen");
  });
  it("reads nested HTML-only messages and strips executable and style content", () => {
    const message: MessagePart = {
      mimeType: "multipart/mixed",
      parts: [
        {
          mimeType: "multipart/related",
          parts: [
            {
              mimeType: "text/html",
              body: {
                data: encoded(
                  "<style>newsletter</style><script>sale</script><p>Factuur &amp; bedrag &#8364;42</p>",
                ),
              },
            },
            {
              mimeType: "text/plain",
              filename: "attachment.txt",
              body: { data: encoded("Password changed") },
            },
          ],
        },
      ],
    };
    expect(extractMessageText(message)).toBe("Factuur & bedrag €42");
  });
  it("supports advertised character sets", () => {
    expect(
      extractMessageText({
        mimeType: "text/plain",
        headers: [{ name: "Content-Type", value: 'text/plain; charset="iso-8859-1"' }],
        body: { data: Buffer.from([99, 97, 102, 233]).toString("base64url") },
      }),
    ).toBe("café");
  });
  it("does not parse downloaded attachments or forwarded message attachments", () => {
    expect(extractMessageText({ mimeType: "message/rfc822", parts: [plain("Newsletter")] })).toBe(
      "",
    );
    expect(extractMessageText({ mimeType: "text/plain", body: { attachmentId: "id" } })).toBe("");
    expect(htmlToText("<p>&#x1F600; &#99999999;</p>")).toBe("😀");
  });
  it("turns a real Gmail-shaped payload into a body-classified record without persisting the full body", () => {
    const result = classifiedMessage({
      id: "gmail-a",
      internalDate: "1790985600000",
      labelIds: ["INBOX", "UNREAD"],
      payload: {
        mimeType: "multipart/mixed",
        headers: [
          { name: "From", value: "service@example.com" },
          { name: "Subject", value: "Document beschikbaar" },
        ],
        parts: [
          plain("Bijgevoegd uw factuur. Te betalen €42. " + "Private text ".repeat(100)),
          {
            mimeType: "application/pdf",
            filename: "factuur_123.pdf",
            body: { attachmentId: "pdf-id" },
          },
        ],
      },
    });
    expect(result.category).toBe("Facturen");
    expect(result.unread).toBe(true);
    expect(result.snippet).toHaveLength(240);
    expect(result).not.toHaveProperty("body");
    expect(result).not.toHaveProperty("payload");
  });
});
