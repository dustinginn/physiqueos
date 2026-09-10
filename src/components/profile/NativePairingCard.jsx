"use client";

import { useState } from "react";
import { Copy, Smartphone } from "lucide-react";
import Card from "../ui/Card";
import IconBadge from "../ui/IconBadge";

export default function NativePairingCard() {
  const [state, setState] = useState({ status: "idle", credential: null, expiresAt: null, message: null });

  async function issueCredential() {
    setState({ status: "loading", credential: null, expiresAt: null, message: null });
    try {
      const response = await fetch("/api/v1/native/auth/pairing-credentials", {
        method: "POST",
        headers: { accept: "application/json" },
        credentials: "same-origin",
      });
      const payload = await response.json();
      if (!response.ok || !payload?.pairingCredential) {
        setState({ status: "error", credential: null, expiresAt: null, message: payload?.title ?? "A pairing code could not be created." });
        return;
      }
      setState({ status: "ready", credential: payload.pairingCredential, expiresAt: payload.expiresAt, message: null });
    } catch {
      setState({ status: "error", credential: null, expiresAt: null, message: "A pairing code could not be created." });
    }
  }

  async function copyCredential() {
    if (!state.credential) return;
    try {
      await navigator.clipboard.writeText(state.credential);
      setState((current) => ({ ...current, message: "Pairing code copied." }));
    } catch {
      setState((current) => ({ ...current, message: "Select and copy the pairing code manually." }));
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-start gap-3">
        <IconBadge className="rounded-full" color="primary" icon={Smartphone} size="sm" />
        <div className="min-w-0">
          <h2 className="text-base font-extrabold leading-tight text-[var(--text-primary)]">Pair Native Device</h2>
          <p className="mt-1 text-xs font-semibold leading-5 text-[var(--text-secondary)]">
            Create a one-time code for a trusted iPhone. It expires in 10 minutes.
          </p>
        </div>
      </div>

      {state.credential ? (
        <div className="space-y-3 rounded-[14px] bg-[var(--surface-muted)] p-3">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[var(--text-muted)]">One-time pairing code</p>
          <p className="break-all font-mono text-sm font-bold leading-6 text-[var(--text-primary)]" data-testid="native-pairing-credential">
            {state.credential}
          </p>
          <p className="text-xs font-semibold text-[var(--text-secondary)]">
            Use it now. This code disappears when you leave this page and cannot be used twice.
          </p>
          <button className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--primary)] px-4 text-sm font-extrabold text-white" onClick={copyCredential} type="button">
            <Copy size={16} /> Copy code
          </button>
        </div>
      ) : (
        <button className="min-h-11 w-full rounded-xl bg-[var(--primary)] px-4 text-sm font-extrabold text-white disabled:opacity-60" disabled={state.status === "loading"} onClick={issueCredential} type="button">
          {state.status === "loading" ? "Creating code…" : "Generate Pairing Code"}
        </button>
      )}

      {state.message ? <p aria-live="polite" className="text-xs font-semibold text-[var(--text-secondary)]">{state.message}</p> : null}
    </Card>
  );
}
