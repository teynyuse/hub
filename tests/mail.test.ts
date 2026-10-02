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
    ["ENGIE <facturen@engie.be>", "Je factuur staat klaar", "Bekijk je document.", true],
    ["Engie", "Je maandelijkse voorschot", "Te betalen €82 voor je energieverbruik.", true],
    [
      "Ethias",
      "Uw jaarlijkse premie",
      "Uw autoverzekering: gelieve te betalen voor 20 oktober.",
      true,
    ],
    [
      "ACV <noreply@hetacv.be>",
      "Lidgeld 2026",
      "Uw bijdrage is verschuldigd. Gelieve €25 over te schrijven.",
      true,
    ],
    [
      "service@example.com",
      "Document beschikbaar",
      "Uw verzekeringspremie. Te betalen €120 voor 20 oktober.",
      true,
    ],
    [
      "Farys",
      "Afrekening",
      "Je waterverbruik en het verschuldigde bedrag staan in de bijlage.",
      true,
    ],
    ["Helan", "Je bijdrage voor 2026", "De jaarlijkse bijdrage bedraagt €105.", true],
    ["Proximus", "Uw factuur", "Te betalen €55 voor uw abonnement.", true],
    [
      "Zalando <info@zalando.be>",
      "Je factuur",
      "Factuur kleding: te betalen €79. Verzekering van je pakket inbegrepen.",
      false,
    ],
    ["Zalando", "Laatste betalingsherinnering", "Aanmaning voor je bestelling.", false],
    ["Amazon", "Invoice October", "Insurance premium for your order. Amount due EUR 42.", false],
    [
      "Shop <contact@shop.example>",
      "Factuur",
      "Bijgevoegd uw factuur. Te betalen €42 voor je schoenen.",
      false,
    ],
    ["Engie", "Nieuwsbrief oktober", "Lees onze tips over energie en je factuur.", false],
    ["Engie", "20% korting", "Uw volgende energiefactuur wordt goedkoper. Bestel nu.", false],
    ["ACV", "Nieuws uit de vakbond", "We verdedigen je rechten op het werk.", false],
    ["AXA", "Wachtwoord gewijzigd", "Je wachtwoord voor je verzekering is gewijzigd.", false],
    ["Artevelde", "Factuur cursus", "Bijgevoegd uw factuur. Te betalen €42 voor de cursus.", false],
    ["Collega", "Teamoverleg morgen", "Vergadering over de factuur van onze klant.", false],
    ["Engie", "Welkom", "Bedankt voor je nieuwe energiecontract.", false],
  ])("shows household bill from %s / %s: %s", (sender, subject, body, expected) => {
    const result = classifyMail(sender, subject, ["IMPORTANT"], body);
    expect(isRelevantMail({ ...result, classification_version: CLASSIFICATION_VERSION })).toBe(
      expected,
    );
    expect(result.important).toBe(expected);
  });
  it("requires a household expense even when an invoice PDF is attached", () => {
    expect(classifyMail("Engie", "Document beschikbaar", [], "", ["factuur.pdf"]).category).toBe(
      "Facturen",
    );
    expect(
      classifyMail("Zalando", "Document beschikbaar", [], "", ["factuur_123.pdf"]).category,
    ).toBe("Bestellingen");
    expect(
      classifyMail("unknown@example.com", "Document beschikbaar", [], "", ["factuur_123.pdf"])
        .category,
    ).toBe("Overig");
  });
  it("does not display bills classified under the old broader rules", () => {
    expect(isRelevantMail({ category: "Facturen", classification_version: 1 })).toBe(false);
    expect(
      isRelevantMail({ category: "Facturen", classification_version: CLASSIFICATION_VERSION }),
    ).toBe(true);
    for (const category of ["School", "Werk", "Overheid", "Bestellingen"])
      expect(isRelevantMail({ category, classification_version: CLASSIFICATION_VERSION })).toBe(
        false,
      );
  });
  it.each([
    [
      "service@example.com",
      "Even dit",
      "Bijgevoegd uw factuur voor elektriciteit. Te betalen: €42 voor 20 oktober.",
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
      "Insurance premium. Amount due EUR 55. Due date 20 October.",
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
    ).toBe(false);
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
          plain(
            "Bijgevoegd uw factuur voor elektriciteit. Te betalen €42. " +
              "Private text ".repeat(100),
          ),
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
