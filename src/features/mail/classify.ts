export const CLASSIFICATION_VERSION = 1;
export const relevantCategories = ["Facturen", "School", "Werk", "Overheid"] as const;
export const mailCategories = [
  ...relevantCategories,
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
  const marketingSubject =
    /\b(nieuwsbrief|newsletter|kortingscode|promo(?:tie|ties)?|coupon|sale|black friday|flash sale)\b|\b\d+\s*%\s*(?:korting|off)|speciale aanbieding|special offer|exclusieve aanbieding/.test(
      heading,
    );
  const invoiceHeading =
    /\b(factuur|invoice|betalingsherinnering|aanmaning|afrekening)\b|payment due|billing statement|rekening (?:voor|van|over)|uw rekening|je rekening/.test(
      heading,
    );
  const invoiceBody =
    /\b(factuur|invoice|factuurnummer|invoice number)\b/.test(content) &&
    /\b(bijgevoegd|bijlage|attached|attachment|te betalen|verschuldigd|vervaldatum|due date|amount due|iban|betalingskenmerk)\b|€\s*\d|\b(?:eur|euro)\s*\d/.test(
      content,
    );
  const invoiceAttachment = attachmentNames.some((name) =>
    /\b(factuur|invoice)[\s_.-]/.test(normalize(name)),
  );
  let category = "Overig";
  // Account alerts and food orders stay out of the relevant inbox, even when starred.
  if (labels.includes("SPAM") || labels.includes("TRASH")) category = "Nieuwsbrieven";
  else if (accountNotice) category = "Accountmeldingen";
  else if (foodDelivery) category = "Bestellingen";
  else if (marketingSubject) category = "Nieuwsbrieven";
  else if (invoiceHeading || invoiceBody || invoiceAttachment) category = "Facturen";
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
