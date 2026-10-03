"use client";
import { useActionState } from "react";
import { X } from "lucide-react";
import { dismissInvoice } from "./actions";

export function DismissInvoiceButton({ id, title }: { id: string; title: string }) {
  const [state, action, pending] = useActionState(dismissInvoice, {});
  return (
    <form action={action} className="dismiss-form">
      <input type="hidden" name="id" value={id} />
      <button
        className="icon-button dismiss-button"
        disabled={pending}
        title="Niet in mijn overzicht tonen"
        aria-label={`${title} uit het overzicht verwijderen`}
      >
        <X size={16} aria-hidden="true" />
      </button>
      {state.error && <p className="error">{state.error}</p>}
    </form>
  );
}
