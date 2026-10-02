"use client";
import { useActionState, useState } from "react";
import { authenticate } from "./actions";
export function AuthForm() {
  const [mode, setMode] = useState("login");
  const [state, action, pending] = useActionState(authenticate, {});
  return (
    <form action={action} className="stack">
      <input type="hidden" name="mode" value={mode} />
      {mode === "register" && (
        <label>
          Naam
          <input name="name" autoComplete="name" maxLength={80} required />
        </label>
      )}
      <label>
        E-mailadres
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        Wachtwoord
        <input
          name="password"
          type="password"
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          minLength={8}
          maxLength={128}
          required
        />
      </label>
      {state.error && (
        <p role="alert" className="error">
          {state.error}
        </p>
      )}
      {state.success && <p role="status">{state.success}</p>}
      <button className="primary" disabled={pending}>
        {pending ? "Even wachten…" : mode === "login" ? "Inloggen" : "Account maken"}
      </button>
      <button type="button" onClick={() => setMode(mode === "login" ? "register" : "login")}>
        {mode === "login" ? "Nieuw? Maak een account" : "Al een account? Log in"}
      </button>
    </form>
  );
}
