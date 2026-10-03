"use client";
import { useActionState, useRef } from "react";
import { setInvoicePaid } from "./actions";
export function PaidCheckbox({ id, paid, title }: { id: string; paid: boolean; title: string }) {
  const [state, action, pending] = useActionState(setInvoicePaid, {});
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="paid" value={String(!paid)} />
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={paid}
          disabled={pending}
          aria-label={`${title}: betaald`}
          onChange={() => form.current?.requestSubmit()}
        />
        {pending ? "Opslaan…" : "Betaald"}
      </label>
      {state.error && (
        <p className="error" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
