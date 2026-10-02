import type { Widget, WidgetType } from "@/lib/types";
export const widgetNames: Record<WidgetType, string> = {
  attention: "Aandacht nodig",
  money: "Deze maand",
  payments: "Komende betalingen",
  mail: "Belangrijke mails",
  tasks: "Taken",
  calendar: "Agenda",
  pages: "Recente pagina’s",
};
export const defaultWidgets: Widget[] = [
  { id: "attention", type: "attention", wide: true },
  { id: "money", type: "money", wide: false },
  { id: "payments", type: "payments", wide: false },
  { id: "mail", type: "mail", wide: false },
  { id: "tasks", type: "tasks", wide: false },
  { id: "calendar", type: "calendar", wide: false },
  { id: "pages", type: "pages", wide: false },
];
