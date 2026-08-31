"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Check } from "lucide-react";

const INITIAL_STATE = Object.freeze({ ok: false, error: null });

export default function PriorityCompletionForm({
  action,
  completionContext = null,
  label,
  priorityId,
}) {
  const [state, formAction] = useActionState(action, INITIAL_STATE);

  return (
    <form action={formAction} className="shrink-0">
      <input name="priorityId" type="hidden" value={priorityId} />
      <input name="occurrenceDate" type="hidden" value={completionContext?.occurrenceDate ?? ""} />
      <input name="dose" type="hidden" value={completionContext?.dose ?? ""} />
      <input name="protocolId" type="hidden" value={completionContext?.protocolId ?? ""} />
      <PriorityCompletionSubmitButton completed={state?.ok === true} label={label} />
      {state?.error ? (
        <span className="sr-only" role="alert">{state.error}</span>
      ) : null}
    </form>
  );
}

export function PriorityCompletionSubmitButton({ completed = false, label }) {
  const { pending } = useFormStatus();
  return (
    <PriorityCompletionSubmitButtonView
      completed={completed}
      label={label}
      pending={pending}
    />
  );
}

export function PriorityCompletionSubmitButtonView({ completed = false, label, pending = false }) {
  const disabled = pending || completed;
  return (
    <button
      aria-label={completed ? `${label} completed` : pending ? `Completing ${label}` : `Mark ${label} complete`}
      className={`flex min-h-6 items-center justify-center rounded-full border transition ${
        pending
          ? "min-w-[92px] border-[var(--confidence)] bg-[var(--confidence)] px-2 text-[10px] font-extrabold text-white"
          : completed
            ? "h-6 w-6 border-[var(--confidence)] bg-[var(--confidence)] text-white"
            : "h-6 w-6 border-[var(--divider)] bg-[var(--surface)] text-transparent hover:border-[var(--confidence)] hover:text-[var(--confidence)]"
      } disabled:cursor-not-allowed disabled:opacity-80`}
      disabled={disabled}
      type="submit"
    >
      {pending ? "Completing…" : <Check size={13} strokeWidth={2.5} aria-hidden="true" />}
    </button>
  );
}
