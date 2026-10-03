"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  sortableKeyboardCoordinates,
  arrayMove,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "lucide-react";
import type { Widget, WidgetType } from "@/lib/types";
import type { DashboardData } from "@/features/data/queries";
import { money, dateLabel } from "@/lib/format";
import { defaultWidgets, widgetNames } from "./config";
import { saveLayout } from "./actions";
function SortableWidget({
  widget,
  editing,
  onRemove,
  onResize,
  children,
}: {
  widget: Widget;
  editing: boolean;
  onRemove: () => void;
  onResize: () => void;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: widget.id,
    disabled: !editing,
  });
  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`widget panel ${widget.wide ? "wide" : ""}`}
    >
      <div className="widget-heading">
        <h2>{widgetNames[widget.type]}</h2>
        {editing && (
          <div className="row">
            <button
              {...attributes}
              {...listeners}
              className="icon-button drag-handle"
              aria-label={`Verplaats ${widgetNames[widget.type]}`}
            >
              <GripVertical size={18} />
            </button>
            <button onClick={onResize}>{widget.wide ? "Smal" : "Breed"}</button>
            <button onClick={onRemove} className="icon-button" aria-label="Widget verwijderen">
              <X size={18} />
            </button>
          </div>
        )}
      </div>
      {children}
    </section>
  );
}
function WidgetContent({ type, data }: { type: WidgetType; data: DashboardData }) {
  const { profile, transactions, payments, invoices, tasks, pages, events, today } = data;
  const pending = payments.filter((p) => p.status === "pending");
  const openTasks = tasks.filter((t) => !t.done);
  const relevant = invoices.filter(
    (i) => i.status === "pending" && i.billing_month <= today.slice(0, 7) + "-01",
  );
  const future = events.filter((e) => e.starts_at > new Date().toISOString());
  const empty = <p className="muted">Er staat nog niets.</p>;
  if (type === "attention")
    return (
      <div className="attention-links">
        <Link href="/mail">
          <strong>{relevant.filter((i) => i.needs_review).length}</strong> facturen te controleren
        </Link>
        <Link href="/mail">
          <strong>{pending.filter((p) => p.due_date <= today).length}</strong> betalingen vandaag of
          te laat
        </Link>
        <Link href="/tasks">
          <strong>{openTasks.filter((t) => t.due_date && t.due_date < today).length}</strong> taken
          te laat
        </Link>
      </div>
    );
  if (type === "money") {
    const income = transactions
      .filter((t) => t.kind === "income")
      .reduce((s, t) => s + t.amount_cents, 0);
    const expense = transactions
      .filter((t) => t.kind === "expense")
      .reduce((s, t) => s + t.amount_cents, 0);
    return (
      <>
        <dl className="totals">
          <div>
            <dt>Inkomsten</dt>
            <dd>{money(income, profile.currency)}</dd>
          </div>
          <div>
            <dt>Uitgaven</dt>
            <dd>{money(expense, profile.currency)}</dd>
          </div>
          <div>
            <dt>Verschil</dt>
            <dd>{money(income - expense, profile.currency)}</dd>
          </div>
        </dl>
        <Link className="text-link" href="/money">
          Open Money
        </Link>
      </>
    );
  }
  if (type === "payments")
    return (
      <>
        {pending.length ? (
          <ul className="item-list">
            {pending.slice(0, 4).map((p) => (
              <li key={p.id}>
                <Link href="/money">{p.title}</Link>
                <span>
                  {dateLabel(p.due_date, profile.timezone)} ·{" "}
                  {money(p.amount_cents, profile.currency)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          empty
        )}
        <Link className="text-link" href="/money">
          Alle betalingen
        </Link>
      </>
    );
  if (type === "mail")
    return (
      <>
        {relevant.length ? (
          <ul className="item-list">
            {relevant.slice(0, 4).map((e) => (
              <li key={e.id}>
                <Link href="/mail">{e.title}</Link>
                <span className="truncate">
                  {e.amount_cents === null ? "Bedrag nakijken" : money(e.amount_cents, "EUR")} ·{" "}
                  {e.supplier}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Geen open facturen.</p>
        )}
        <Link className="text-link" href="/mail">
          Open facturen
        </Link>
      </>
    );
  if (type === "tasks")
    return (
      <>
        {openTasks.length ? (
          <ul className="item-list">
            {openTasks.slice(0, 4).map((t) => (
              <li key={t.id}>
                <Link href="/tasks">{t.title}</Link>
                {t.due_date && <span>{dateLabel(t.due_date, profile.timezone)}</span>}
              </li>
            ))}
          </ul>
        ) : (
          empty
        )}
        <Link className="text-link" href="/tasks">
          Alle taken
        </Link>
      </>
    );
  if (type === "calendar")
    return (
      <>
        {future.length ? (
          <ul className="item-list">
            {future.slice(0, 4).map((e) => (
              <li key={e.id}>
                <Link href="/calendar">{e.title}</Link>
                <span>
                  {dateLabel(e.starts_at, profile.timezone)} ·{" "}
                  {new Intl.DateTimeFormat("nl-BE", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: profile.timezone,
                  }).format(new Date(e.starts_at))}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          empty
        )}
        <Link className="text-link" href="/calendar">
          Open Calendar
        </Link>
      </>
    );
  return (
    <>
      {pages.length ? (
        <ul className="item-list">
          {pages.slice(0, 4).map((p) => (
            <li key={p.id}>
              <Link href={`/space/${p.id}`}>{p.title}</Link>
              <span>{dateLabel(p.updated_at, profile.timezone)}</span>
            </li>
          ))}
        </ul>
      ) : (
        empty
      )}
      <Link className="text-link" href="/space">
        Open Space
      </Link>
    </>
  );
}
export function Dashboard({ data }: { data: DashboardData }) {
  const initial = data.profile.dashboard_layout ?? defaultWidgets;
  const [layout, setLayout] = useState<Widget[]>(initial);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  function onDragEnd(event: DragEndEvent) {
    if (event.over && event.active.id !== event.over.id)
      setLayout((items) =>
        arrayMove(
          items,
          items.findIndex((i) => i.id === event.active.id),
          items.findIndex((i) => i.id === event.over!.id),
        ),
      );
  }
  async function save() {
    setSaving(true);
    setError("");
    try {
      const result = await saveLayout(layout);
      if (result.error) setError(result.error);
      else setEditing(false);
    } catch {
      setError("Indeling bewaren lukte niet. Probeer opnieuw.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Hallo {data.profile.display_name || "daar"}</h1>
          <p className="muted">
            {new Intl.DateTimeFormat("nl-BE", {
              dateStyle: "full",
              timeZone: data.profile.timezone,
            }).format(new Date())}
          </p>
        </div>
        {editing ? (
          <div className="row">
            <button
              disabled={saving}
              onClick={() => {
                setLayout(initial);
                setEditing(false);
                setError("");
              }}
            >
              Annuleren
            </button>
            <button className="primary" disabled={saving} onClick={save}>
              {saving ? "Bewaren…" : "Bewaar indeling"}
            </button>
          </div>
        ) : (
          <button onClick={() => setEditing(true)}>Home aanpassen</button>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {editing && (
        <div className="panel widget-picker">
          <span>Widget toevoegen</span>
          {(Object.keys(widgetNames) as WidgetType[]).map((type) => (
            <button
              key={type}
              disabled={saving || layout.some((w) => w.type === type)}
              onClick={() => setLayout([...layout, { id: crypto.randomUUID(), type, wide: false }])}
            >
              {widgetNames[type]}
            </button>
          ))}
        </div>
      )}
      <DndContext
        id="home-widgets"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={layout.map((w) => w.id)} strategy={rectSortingStrategy}>
          <div className="widget-grid">
            {layout.map((w) => (
              <SortableWidget
                key={w.id}
                widget={w}
                editing={editing && !saving}
                onRemove={() => setLayout(layout.filter((i) => i.id !== w.id))}
                onResize={() =>
                  setLayout(layout.map((i) => (i.id === w.id ? { ...i, wide: !i.wide } : i)))
                }
              >
                <WidgetContent type={w.type} data={data} />
              </SortableWidget>
            ))}
          </div>
        </SortableContext>
      </DndContext>
      {!layout.length && (
        <div className="empty">Je Home is leeg. Voeg een widget toe via Home aanpassen.</div>
      )}
    </>
  );
}
