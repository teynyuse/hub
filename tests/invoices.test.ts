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
});
