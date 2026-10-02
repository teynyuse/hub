import { z } from "zod";
export const title = z.string().trim().min(1, "Vul een titel in.").max(200, "De titel is te lang.");
export const id = z.uuid();
export const date = z.iso.date();
export const categories = [
  "Facturen",
  "Bestellingen",
  "Werk",
  "School",
  "Overheid",
  "Nieuwsbrieven",
  "Persoonlijk",
  "Overig",
] as const;
export const widgetSchema = z
  .array(
    z.object({
      id: z.string().min(1).max(100),
      type: z.enum(["attention", "money", "payments", "mail", "tasks", "calendar", "pages"]),
      wide: z.boolean(),
    }),
  )
  .max(20)
  .refine((items) => new Set(items.map((w) => w.id)).size === items.length, "Dubbele widget.");
export function parseCents(value: unknown) {
  const s = String(value ?? "")
    .trim()
    .replace(",", ".");
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(s))
    throw new Error("Vul een positief bedrag in, met maximaal twee decimalen.");
  const [euros, decimals = ""] = s.split(".");
  const cents = Number(euros) * 100 + Number(decimals.padEnd(2, "0"));
  if (cents <= 0) throw new Error("Het bedrag moet groter zijn dan nul.");
  return cents;
}
export function validationMessage(error: unknown) {
  if (error instanceof z.ZodError) return error.issues[0].message;
  return error instanceof Error ? error.message : "Er ging iets mis. Probeer opnieuw.";
}
