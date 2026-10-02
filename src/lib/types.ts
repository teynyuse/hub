import type { JSONContent } from "@tiptap/react";
export type ActionState = { error?: string; success?: string };
export type Profile = {
  id: string;
  display_name: string;
  currency: string;
  timezone: string;
  dashboard_layout: Widget[] | null;
};
export type WidgetType =
  "attention" | "money" | "payments" | "mail" | "tasks" | "calendar" | "pages";
export type Widget = { id: string; type: WidgetType; wide: boolean };
export type Transaction = {
  id: string;
  user_id: string;
  title: string;
  amount_cents: number;
  kind: "income" | "expense";
  category: string;
  date: string;
};
export type Payment = {
  id: string;
  title: string;
  amount_cents: number;
  due_date: string;
  status: "pending" | "paid";
};
export type Task = { id: string; title: string; due_date: string | null; done: boolean };
export type CalendarEvent = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
};
export type Page = { id: string; title: string; content: JSONContent; updated_at: string };
export type FileRecord = {
  id: string;
  name: string;
  storage_path: string;
  size_bytes: number;
  created_at: string;
};
export type Email = {
  id: string;
  gmail_id: string;
  snippet: string;
  classification_version: number;
  sender: string;
  subject: string;
  category: string;
  important: boolean;
  received_at: string;
  unread: boolean;
};
