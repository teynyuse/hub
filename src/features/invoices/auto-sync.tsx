"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { syncGmail } from "@/features/mail/actions";
export function InvoiceAutoSync({
  enabled,
  nextSyncAt,
}: {
  enabled: boolean;
  nextSyncAt: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let running = false;
    let next = nextSyncAt ? new Date(nextSyncAt).getTime() : 0;
    const check = async () => {
      if (stopped || running || document.visibilityState !== "visible" || Date.now() < next) return;
      running = true;
      setBusy(true);
      next = Date.now() + 30 * 60 * 1000;
      try {
        const result = await syncGmail();
        if (!stopped) {
          setError(result.error);
          router.refresh();
        }
      } catch {
        if (!stopped)
          setError("Automatisch controleren lukte niet. Hub probeert het later opnieuw.");
      } finally {
        running = false;
        if (!stopped) setBusy(false);
      }
    };
    void check();
    const timer = setInterval(() => void check(), 60000);
    const visible = () => void check();
    document.addEventListener("visibilitychange", visible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [enabled, nextSyncAt, router]);
  return (
    <>
      {busy && (
        <p role="status" className="muted">
          Facturen controleren… Je kunt het overzicht blijven gebruiken.
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </>
  );
}
