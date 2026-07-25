"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ActionButton from "../../../../components/ui/ActionButton";
import Link from "next/link";
import { activateProductionGoalTransition } from "./actions";

export default function ProductionGoalTransitionFinalReview({ review }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(null);

  function activate() {
    setError(null);
    startTransition(async () => {
      const result = await activateProductionGoalTransition({
        transitionId: review.token.transitionId,
        finalReviewToken: review.token.id,
        founderConfirmed: true,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const query = new URLSearchParams({
        status: result.status,
        pending: String(result.pendingExternalEffectCount),
      });
      router.replace(`/goals/transition/success?${query}`);
    });
  }

  return (
    <main className="min-h-screen bg-[var(--background)] px-5 py-8 text-[var(--foreground)]">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <p className="text-sm font-semibold text-[var(--primary)]">Final review</p>
          <h1 className="mt-2 text-3xl font-bold">Activate Build Lean Mass</h1>
          <p className="mt-3 text-[var(--muted-foreground)]">
            This will complete Visible Abs and atomically activate the accepted goal,
            protocols, commitments, reminders, and coaching cadence.
          </p>
        </div>
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
          <dl className="grid gap-4 sm:grid-cols-2">
            <Summary label="Opening phase" value={review.summary.openingPhase} />
            <Summary label="Guardrail" value={review.summary.guardrail} />
            <Summary label="Coaching cadence" value={review.summary.coachingCadence} />
            <Summary label="Protocols prepared" value={review.summary.protocolsPrepared} />
            <Summary label="Commitments" value={review.summary.commitmentsToCreate} />
            <Summary label="Reminder intents" value={review.summary.reminderIntentsToCreate} />
          </dl>
        </section>
        {error && (
          <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">
            {error}
          </p>
        )}
        <ActionButton disabled={pending} endIcon={null} onClick={activate}>
          {pending ? "Activating…" : "Confirm and activate"}
        </ActionButton>
        <Link
          className="inline-flex min-h-11 items-center font-semibold text-[var(--primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
          href="/goals/transition/protocols?section=review"
        >
          Back to protocol review
        </Link>
        <p className="text-xs text-[var(--muted-foreground)]">
          The review token expires shortly and can be used only once.
        </p>
      </div>
    </main>
  );
}

function Summary({ label, value }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
        {label}
      </dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}
