export const costCategories = [
  "Elektriciteit",
  "Gas",
  "Energie",
  "Water",
  "Telecom",
  "Verzekering",
  "Vakbond",
  "Ziekenfonds",
  "Wonen",
  "Afbetaling",
  "Overig",
] as const;
function normalized(text: string) {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
const providers: [RegExp, string, string][] = [
  [/\b(engie|electrabel)\b/i, "Engie", "Energie"],
  [/\bluminus\b/i, "Luminus", "Energie"],
  [/\beneco\b/i, "Eneco", "Energie"],
  [/\bfarys\b/i, "Farys", "Water"],
  [/\bde watergroep\b/i, "De Watergroep", "Water"],
  [/\bproximus\b/i, "Proximus", "Telecom"],
  [/\btelenet\b/i, "Telenet", "Telecom"],
  [/\b(acv|hetacv)\b/i, "ACV", "Vakbond"],
  [/\babvv\b/i, "ABVV", "Vakbond"],
  [/\b(ethias|dvv|axa|allianz|ag insurance)\b/i, "", "Verzekering"],
  [/\b(helan|solidaris|partenamut)\b/i, "", "Ziekenfonds"],
  [/\b(alma|getalma)\b/i, "Alma", "Afbetaling"],
  [/\b(klarna|riverty)\b/i, "", "Afbetaling"],
];
export function providerKey(value: string) {
  const text = normalized(value);
  for (const [pattern, name] of providers) {
    const match = pattern.exec(text);
    if (match) return normalized(name || match[0]).replace(/[^a-z0-9]/g, "");
  }
  const email = /<([^>]+)>/.exec(text)?.[1] ?? text;
  const domain = /@([a-z0-9.-]+)/.exec(email)?.[1];
  return domain
    ? domain.replace(/^(?:noreply|mail|email|news|billing)\./, "")
    : text.replace(/[^a-z0-9]/g, "").slice(0, 100);
}
export function currencyCents(value: string): number | null {
  let s = value.replace(/\s/g, "");
  if (/^-/.test(s)) return null;
  if (s.includes(",") && s.includes("."))
    s =
      s.lastIndexOf(",") > s.lastIndexOf(".")
        ? s.replace(/\./g, "").replace(",", ".")
        : s.replace(/,/g, "");
  else if (s.includes(",")) s = s.replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(s)) return null;
  const [whole, decimal = ""] = s.split(".");
  const cents = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
  return cents > 0 && cents <= 99999999999 ? cents : null;
}
function validDate(day: string, month: string, year: string) {
  const s = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const d = new Date(s + "T12:00:00Z");
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : null;
}
export function extractInvoice(sender: string, subject: string, body: string, receivedAt: string) {
  const raw = `${subject}\n${body.slice(0, 48000)}`;
  const text = normalized(raw);
  const matches = [
    ...raw.matchAll(
      /(?:te betalen(?: bedrag)?|totaal(?:bedrag| te betalen| inclusief btw)?|verschuldigd(?: bedrag)?|amount due|total due|montant a payer)\s*[:=]?\s*(?:€|EUR)?\s*([0-9][0-9 .]*(?:,[0-9]{1,2})?)\s*(?:€|EUR)?/gi,
    ),
    ...raw.matchAll(
      /(?:wij zullen|we will)\s*(?:€|EUR)?\s*([0-9][0-9 .]*(?:,[0-9]{1,2})?)\s*(?:€|EUR)?/gi,
    ),
  ]
    .map((m) => currencyCents(m[1]))
    .filter((n): n is number => n !== null);
  const explicit = [...new Set(matches)];
  const currencies = [
    ...raw.matchAll(
      /(?:€|EUR)\s*(-?\d[\d .]*(?:,\d{1,2})?)|(-?\d[\d .]*(?:,\d{1,2})?)\s*(?:€|EUR)/gi,
    ),
  ]
    .map((m) => currencyCents(m[1] ?? m[2]))
    .filter((n): n is number => n !== null);
  const unique = [...new Set(currencies)];
  const amount =
    explicit.length === 1
      ? explicit[0]
      : explicit.length === 0 && unique.length === 1
        ? unique[0]
        : null;
  const dateMatches = [
    ...text.matchAll(
      /(?:vervaldatum|betaal(?:baar)? (?:voor|uiterlijk)|te betalen (?:voor|tegen)|uiterlijk|due date|pay by|echeance)\s*:?\s*(\d{1,2})[\/.\-](\d{1,2})[\/.\-](20\d{2})/g,
    ),
  ]
    .map((m) => validDate(m[1], m[2], m[3]))
    .filter((s): s is string => s !== null);
  const debitDates = [
    ...text.matchAll(
      /(?:afschrijven|afgeschreven|automatisch van (?:je|uw) rekening(?: halen)?|gaat automatisch van (?:je|uw) rekening)(?:[^\d]{0,35})(\d{1,2})[\/.\-](\d{1,2})[\/.\-](20\d{2})/g,
    ),
  ]
    .map((m) => validDate(m[1], m[2], m[3]))
    .filter((s): s is string => s !== null);
  const monthNames: Record<string, string> = {
    januari: "01",
    februari: "02",
    maart: "03",
    april: "04",
    mei: "05",
    juni: "06",
    juli: "07",
    augustus: "08",
    september: "09",
    oktober: "10",
    november: "11",
    december: "12",
  };
  for (const match of text.matchAll(
    /(?:op|tegen|uiterlijk)\s+(\d{1,2})\s+(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+(20\d{2})/g,
  )) {
    const parsed = validDate(match[1], monthNames[match[2]], match[3]);
    if (parsed) debitDates.push(parsed);
  }
  const dates = [...new Set([...dateMatches, ...debitDates])];
  const due = dates.length === 1 ? dates[0] : null;
  const reference =
    /(?:factuurnummer|factuur(?:\s*(?:nr\.?|nummer|#))|invoice (?:number|no\.?))\s*[:#]?\s*([a-z0-9][a-z0-9\/-]{2,59})/i.exec(
      raw,
    )?.[1];
  const invoiceNumber = reference && /\d/.test(reference) ? reference.toUpperCase() : null;
  let supplier = sender
    .replace(/<[^>]*>/g, "")
    .replace(/["']/g, "")
    .trim()
    .slice(0, 100);
  if (!supplier || supplier.includes("@"))
    supplier = sender.match(/@([a-z0-9.-]+)/i)?.[1] ?? "Onbekend";
  let category = "Overig";
  for (const [pattern, name, cost] of providers) {
    const match = pattern.exec(normalized(sender));
    if (match) {
      supplier = name || match[0].toUpperCase();
      category = cost;
      break;
    }
  }
  const purchaseSupplier =
    /(?:aankoop|bestelling) bij\s+([\p{L}0-9][\p{L}0-9 .&'’_-]{1,60}?)(?:\s+op\s+\d|\s+zal|[,.])/iu
      .exec(raw)?.[1]
      ?.trim();
  if (purchaseSupplier) supplier = purchaseSupplier;
  if (/\belektriciteit|electricity/.test(text) && !/\bgas(?:verbruik|factuur)?\b/.test(text))
    category = "Elektriciteit";
  else if (/\bgas(?:verbruik|factuur)?\b/.test(text) && !/elektriciteit|electricity/.test(text))
    category = "Gas";
  else if (/verzekering|insurance|polisnummer/.test(text)) category = "Verzekering";
  else if (/vakbond|lidgeld|syndicale/.test(text)) category = "Vakbond";
  else if (/waterfactuur|waterverbruik/.test(text)) category = "Water";
  else if (/internetabonnement|telecom/.test(text)) category = "Telecom";
  else if (/huur|hypotheek|syndicus|\bvme\b/.test(text)) category = "Wonen";
  else if (/volgende betaling|aankoop.*afschrijven|betaling.*plaatsvinden/.test(text))
    category = "Afbetaling";
  return {
    title: `${category} · ${supplier}`.slice(0, 200),
    supplier,
    provider_key: providerKey(sender),
    cost_category: category,
    amount_cents: amount,
    due_date: due,
    billing_month: (due ?? receivedAt).slice(0, 7) + "-01",
    invoice_number: invoiceNumber,
    needs_review: amount === null || due === null || explicit.length !== 1,
  };
}
