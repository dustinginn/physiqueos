"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

const INITIAL_STATE = Object.freeze({ ok: false, error: null });

export default function PrioritySkipForm({ action, command, compact = false, label = "priority" }) {
  const [state, formAction] = useActionState(action, INITIAL_STATE);
  if (!command) return null;
  return (
    <form action={formAction} className={compact ? "shrink-0" : "w-full"}>
      <input name="commandType" type="hidden" value={command.commandType} />
      <input name="expectedVersion" type="hidden" value={command.expectedVersion} />
      <input name="priorityId" type="hidden" value={command.payload.priorityId} />
      <input name="occurrenceDate" type="hidden" value={command.payload.occurrenceDate} />
      <PrioritySkipSubmitButton compact={compact} label={label} skipped={state?.ok === true} />
      {state?.error && <p aria-live="polite" className="sr-only">{state.error}</p>}
    </form>
  );
}

export function PrioritySkipSubmitButton({ compact = false, label, skipped = false }) {
  const { pending } = useFormStatus();
  return (
    <button
      aria-label={`Mark ${label} skipped`}
      className={compact
        ? "flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-[var(--divider)] px-2 text-[10px] font-extrabold text-[var(--text-secondary)] disabled:opacity-60"
        : "min-h-12 w-full rounded-xl border border-[var(--divider)] bg-[var(--surface-elevated)] px-4 text-sm font-extrabold text-[var(--text-primary)] disabled:opacity-60"}
      disabled={pending || skipped}
      type="submit"
    >
      {skipped ? "Skipped" : pending ? "Skipping…" : compact ? "Skip" : "Mark Skipped"}
    </button>
  );
}
