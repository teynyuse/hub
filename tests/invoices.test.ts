import { describe, expect, it } from "vitest";
import { extractInvoice } from "@/features/invoices/extract";

describe("factuurgegevens herkennen", () => {
  it("haalt leverancier, bedrag en vervaldatum uit een energiefactuur", () => {
    expect(
      extractInvoice(
        "ENGIE <facturen@engie.be>",
        "Uw maandelijkse factuur",
        "Factuurnummer: 2026-1042. Totaal te betalen: € 82,41. Betaal uiterlijk 18/10/2026.",
        "2026-10-03T10:00:00Z",
      ),
    ).toMatchObject({
      supplier: "Engie",
      cost_category: "Energie",
      amount_cents: 8241,
      due_date: "2026-10-18",
      billing_month: "2026-10-01",
      invoice_number: "2026-1042",
      needs_review: false,
    });
  });

  it("neemt geen willekeurige prijs wanneer meerdere bedragen mogelijk zijn", () => {
    const invoice = extractInvoice(
      "service@example.be",
      "Document",
      "Bedrag zonder btw € 40,00. Bedrag met btw € 48,40.",
      "2026-10-03T10:00:00Z",
    );
    expect(invoice.amount_cents).toBeNull();
    expect(invoice.needs_review).toBe(true);
  });

  it("herkent een geplande Alma-afbetaling met een geschreven maand", () => {
    expect(
      extractInvoice(
        "Alma <payment@getalma.eu>",
        "Uw volgende betaling is binnenkort verschuldigd",
        "Wij zullen 599,66 € voor uw aankoop bij Krëfel NV op 7 oktober 2026 afschrijven.",
        "2026-10-03T10:00:00Z",
      ),
    ).toMatchObject({
      supplier: "Krëfel NV",
      cost_category: "Afbetaling",
      amount_cents: 59966,
      due_date: "2026-10-07",
      needs_review: false,
    });
  });

  it("herkent een automatische Proximus-afschrijving", () => {
    expect(
      extractInvoice(
        "Proximus <billing@proximus.be>",
        "Je aanrekening is nu beschikbaar",
        "Totaalbedrag €29,99 gaat automatisch van je rekening op 17/08/2026.",
        "2026-08-02T10:00:00Z",
      ),
    ).toMatchObject({
      supplier: "Proximus",
      cost_category: "Telecom",
      amount_cents: 2999,
      due_date: "2026-08-17",
      needs_review: false,
    });
  });

  it("bewaart een ACV-bijdrage zonder een verzonnen betaaldatum", () => {
    expect(
      extractInvoice(
        "ACV administratie <ACV-Administratie@news.acv-csc.be>",
        "Betaling van je ACV-bijdrage",
        "Totaal bedrag: 63,99 EUR. Periode van betaling: 01/10/2026 - 31/12/2026.",
        "2026-09-28T10:00:00Z",
      ),
    ).toMatchObject({
      supplier: "ACV",
      cost_category: "Vakbond",
      amount_cents: 6399,
      due_date: null,
      needs_review: true,
    });
  });
});
