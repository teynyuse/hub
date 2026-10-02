export const CLASSIFICATION_VERSION = 2;
export const relevantCategories = ["Facturen"] as const;
export const mailCategories = [
  ...relevantCategories,
  "School",
  "Werk",
  "Overheid",
  "Accountmeldingen",
  "Nieuwsbrieven",
  "Bestellingen",
  "Overig",
] as const;
export function isRelevantMail(mail: { category: string; classification_version?: number }) {
  return (
    mail.classification_version === CLASSIFICATION_VERSION &&
    relevantCategories.some((category) => category === mail.category)
  );
}
function normalize(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
/** Local rules: message text never goes to an external AI service. */
export function classifyMail(
  sender: string,
  subject: string,
  labels: string[] = [],
  body = "",
  attachmentNames: string[] = [],
) {
  const heading = normalize(subject);
  const content = normalize(body.slice(0, 24000));
  const from = normalize(sender);
  const text = `${heading} ${content}`;
  const accountNotice =
    /wachtwoord (?:is |werd |succesvol )?(?:gewijzigd|veranderd|hersteld)|wachtwoord(?:herstel|reset)|(?:reset|change|changed|update|updated) (?:your )?password|password (?:reset|changed|change|updated)|verificatiecode|verification code|one.time (?:password|code)|bevestig (?:je|uw) (?:e.mail|account)|verify (?:your )?(?:email|account)|nieuwe (?:login|aanmelding)|new sign.in/.test(
      `${heading} ${content.slice(0, 800)}`,
    );
  const foodDelivery =
    /\b(takeaway|thuisbezorgd|ubereats|uber eats|deliveroo)\b/.test(from) ||
    /@(.*\.)?(takeaway\.com|thuisbezorgd\.nl|deliveroo\.[a-z.]+)\b/.test(from);
  const shopSender =
    /\b(zalando|amazon|bol\.com|coolblue|mediamarkt|media markt|temu|shein|vinted|aliexpress|ebay|ikea|h&m)\b/.test(
      from,
    ) || /@(?:[a-z0-9-]+\.)*(?:zara|hm|bol)\.[a-z.]+\b/.test(from);
  const householdProvider =
    /\b(engie|electrabel|luminus|eneco|totalenergies|fluvius|farys|de watergroep|pidpa|vivaqua|proximus|telenet|scarlet|mobile vikings|ethias|dvv|axa|allianz|ag insurance|acv|abvv|aclvb|helan|solidaris|partenamut)\b/.test(
      from,
    ) ||
    /@(?:[a-z0-9-]+\.)*(?:hetacv\.be|acv-online\.be|cm\.be|lm\.be|mega\.be|orange\.be|kbc\.be|belfius\.be)\b/.test(
      from,
    );
  // An unknown sender can still qualify from a clear household expense in the text.
  // Do not treat a generic webshop invoice as a household bill.
  const householdExpense =
    /\b(energiefactuur|elektriciteit|elektriciteitsfactuur|gasfactuur|waterfactuur|waterverbruik|energieverbruik|energiecontract|gasverbruik|verzekeringspremie|verzekering|verzekeringen|polisnummer|hospitalisatie|autoverzekering|brandverzekering|familiale|mutualiteit|ziekenfonds|vakbond|vakbondsbijdrage|syndicale bijdrage|lidgeld|lidmaatschapsbijdrage|ledenbijdrage|internetabonnement|telecom|huur|huurgeld|huurbetaling|hypotheek|vme|syndicus|electricity|utility bill|insurance premium|insurance policy|membership fee)\b/.test(
      `${heading} ${content.slice(0, 4000)}`,
    );
  const marketingSubject =
    /\b(nieuwsbrief|newsletter|kortingscode|promo(?:tie|ties)?|coupon|sale|black friday|flash sale)\b|\b\d+\s*%\s*(?:korting|off)|speciale aanbieding|special offer|exclusieve aanbieding/.test(
      heading,
    );
  const invoiceHeading =
    /\b(factuur|invoice|betalingsherinnering|aanmaning|afrekening|betalingsuitnodiging|betaalverzoek|voorschotfactuur|premienota|lidgeld|lidmaatschapsbijdrage|ledenbijdrage|vakbondsbijdrage)\b|payment due|billing statement|rekening (?:voor|van|over)|uw rekening|je rekening|(?:maandelijkse|jaarlijkse) (?:premie|bijdrage|voorschot)|(?:premie|bijdrage|voorschot) (?:voor|\d{4})/.test(
      heading,
    );
  const invoiceBody =
    /\b(factuur|invoice|factuurnummer|invoice number)\b/.test(content) &&
    /\b(bijgevoegd|bijlage|attached|attachment|te betalen|verschuldigd|vervaldatum|due date|amount due|iban|betalingskenmerk)\b|€\s*\d|\b(?:eur|euro)\s*\d/.test(
      content,
    );
  const invoiceAttachment = attachmentNames.some((name) =>
    /\b(factuur|invoice)(?:[\s_.-]|\d|$)/.test(normalize(name)),
  );
  const paymentRequest =
    /\b(te betalen|verschuldigd|gelieve te betalen|gelieve.*(?:storten|overschrijven)|betaal (?:je|uw|voor)|betaling.*(?:vervaldatum|uiterlijk)|premie.*(?:vervaldatum|domiciliering)|amount due|payment due|please pay)\b/.test(
      text,
    );
  const householdBill =
    (householdProvider || householdExpense) &&
    (invoiceHeading || invoiceBody || invoiceAttachment || paymentRequest);
  let category = "Overig";
  // Account alerts and food orders stay out of the relevant inbox, even when starred.
  if (labels.includes("SPAM") || labels.includes("TRASH")) category = "Nieuwsbrieven";
  else if (accountNotice) category = "Accountmeldingen";
  else if (foodDelivery || shopSender) category = "Bestellingen";
  else if (marketingSubject) category = "Nieuwsbrieven";
  else if (householdBill) category = "Facturen";
  else if (
    labels.includes("CATEGORY_PROMOTIONS") ||
    labels.includes("CATEGORY_SOCIAL") ||
    /\b(nieuwsbrief|newsletter|kortingscode|limited.time offer|shop now|bestel nu|sale ends)\b/.test(
      content,
    )
  )
    category = "Nieuwsbrieven";
  else if (
    /\b(artevelde|hogeschool|universiteit|university|campus|examen|examens|tentamen|syllabus|studiepunten|lesrooster|studentenportaal|cursus|docent|professor|assignment|homework)\b/.test(
      `${from} ${text}`,
    ) ||
    /@[a-z0-9.-]+\.(?:edu|ac\.uk)\b/.test(from)
  )
    category = "School";
  else if (
    /\b(teamoverleg|werkoverleg|vergadering|meeting|collega|colleagues|salaris|loonfiche|loonstrook|payslip|payroll|arbeidscontract|employment contract|sollicitatie|vacature|recruitment|projectplanning|sprint|standup|pull request|code review|jira|confluence|telewerk|verlofaanvraag)\b/.test(
      text,
    ) ||
    /\b(fod financien|first accounting|epic37|stiron)\b/.test(text)
  )
    category = "Werk";
  else if (
    /\b(myminfin|overheid|belasting|tax return|gemeente|aanslagbiljet)\b/.test(`${from} ${text}`) ||
    /@[a-z0-9.-]+\.belgium\.be\b/.test(from)
  )
    category = "Overheid";
  else if (
    /\b(bestelling|order confirmation|order confirm|verzonden|shipment|delivery)\b/.test(text)
  )
    category = "Bestellingen";
  const relevant = relevantCategories.some((value) => value === category);
  const important =
    relevant &&
    (labels.includes("IMPORTANT") ||
      labels.includes("STARRED") ||
      /actie vereist|action required|deadline|betalingsherinnering|laatste herinnering|aanmaning/.test(
        text,
      ));
  return { category, important };
}
