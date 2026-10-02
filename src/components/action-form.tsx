"use client";
import { useActionState, type ReactNode } from "react";
import type { ActionState } from "@/lib/types";
export function ActionForm({
  action,
  children,
  submit = "Bewaren",
  className = "stack",
}: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  children?: ReactNode;
  submit?: string;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className={className}>
      {children}
      <button className="primary" disabled={pending}>
        {pending ? "Even wachten…" : submit}
      </button>
      {state.error && (
        <p role="alert" className="error">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="muted">
          {state.success}
        </p>
      )}
    </form>
  );
}
