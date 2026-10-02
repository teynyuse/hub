export function classifyMail(sender: string, subject: string, labels: string[] = []) {
  const text = `${sender} ${subject}`.toLowerCase();
  let category = "Overig";
  if (/factuur|invoice|payment due|betalingsherinnering|rekening/.test(text)) category = "Facturen";
  else if (/bestelling|order confirm|verzonden|shipment|delivery/.test(text))
    category = "Bestellingen";
  else if (/artevelde|universiteit|hogeschool|opleiding|examen/.test(text)) category = "School";
  else if (/myminfin|belgium\.be|overheid|belasting|gemeente/.test(text)) category = "Overheid";
  else if (
    /newsletter|nieuwsbrief|unsubscribe/.test(text) ||
    labels.includes("CATEGORY_PROMOTIONS")
  )
    category = "Nieuwsbrieven";
  const important =
    labels.includes("IMPORTANT") ||
    labels.includes("STARRED") ||
    /actie vereist|action required|deadline|betalingsherinnering|laatste herinnering/.test(text);
  return { category, important };
}
