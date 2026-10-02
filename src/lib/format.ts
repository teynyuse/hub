export function money(cents: number, currency = "EUR") {
  return new Intl.NumberFormat("nl-BE", { style: "currency", currency }).format(cents / 100);
}
export function dateLabel(value: string, timezone = "Europe/Brussels") {
  return new Intl.DateTimeFormat("nl-BE", {
    day: "numeric",
    month: "short",
    timeZone: timezone,
  }).format(new Date(value.length === 10 ? value + "T12:00:00Z" : value));
}
export function localDate(timezone = "Europe/Brussels", now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  return {
    start: `${month}-01`,
    end: `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`,
  };
}
