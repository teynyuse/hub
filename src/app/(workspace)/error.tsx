"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="panel stack">
      <h1>Laden lukte niet</h1>
      <p>
        Controleer je verbinding. Heb je de app net ingesteld? Controleer dan of de
        database-migratie is uitgevoerd.
      </p>
      <button onClick={reset}>Opnieuw proberen</button>
    </div>
  );
}
