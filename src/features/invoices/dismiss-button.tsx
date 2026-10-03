"use client";
import { useActionState } from "react";
import { dismissInvoice } from "./actions";

export function DismissInvoiceButton({ id, title }: { id: string; title: string }) {
  const [state, action, pending] = useActionState(dismissInvoice, {});
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <button
        className="icon-button"
        disabled={pending}
        title="Niet in mijn overzicht tonen"
        aria-label={`${title} uit het overzicht verwijderen`}
      >
        ×
      </button>
      {state.error && <p className="error">{state.error}</p>}
    </form>
  );
}
