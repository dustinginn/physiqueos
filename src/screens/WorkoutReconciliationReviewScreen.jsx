import Link from "next/link";
import Card from "../components/ui/Card";

export default function WorkoutReconciliationReviewScreen({ presentation, resolveAction, outcome = null }) {
  const pending = presentation.status === "pending";
  const resolvedNoMatch = presentation.status === "resolved_no_match";
  const resolvedConfirmed = presentation.status === "resolved_confirmed";
  const selectedId = presentation.resolution?.selectedLoggerSessionCanonicalId ?? null;
  return (
    <main className="app-surface min-h-screen">
      <div className="mx-auto max-w-[393px] px-4 pb-32 pt-8 sm:py-10">
        <Link className="inline-flex min-h-11 items-center text-sm font-bold text-[var(--primary)]" href="/log">← Back to Log</Link>
        <header className="mt-3">
          <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[var(--primary)]">Evidence Review</p>
          <h1 className="mt-2 text-3xl font-extrabold text-[var(--text-primary)]">{presentation.title}</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{presentation.summary}</p>
        </header>

        <Card className="mt-6 space-y-2">
          <h2 className="font-extrabold text-[var(--text-primary)]">Apple Health Strength workout</h2>
          <p className="text-sm text-[var(--text-secondary)]">{presentation.localDate}</p>
          <p className="text-sm text-[var(--text-secondary)]">{formatWindow(presentation.workout?.startedAt, presentation.workout?.endedAt)}</p>
        </Card>

        {outcome === "stale" && <Card className="mt-4" variant="warning"><p className="text-sm font-bold">This review changed. Check the current choices before trying again.</p></Card>}
        {resolvedNoMatch && <Card className="mt-4" variant="soft"><p className="font-bold text-[var(--text-primary)]">No match recorded</p></Card>}
        {resolvedConfirmed && <Card className="mt-4" variant="soft"><p className="font-bold text-[var(--text-primary)]">Match confirmed</p></Card>}
        {!pending && !resolvedNoMatch && !resolvedConfirmed && <Card className="mt-4" variant="warning"><p className="font-bold">This review changed without a confirmed outcome. Refresh before taking another action.</p></Card>}

        <div className="mt-6 space-y-4">
          {presentation.candidates.map((candidate, index) => (
            <Card className="space-y-3" key={candidate.loggerSessionCanonicalId} variant={selectedId === candidate.loggerSessionCanonicalId ? "accent" : "soft"}>
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-[var(--primary)]">Logger session {index + 1}</p>
                <h2 className="mt-1 text-lg font-extrabold text-[var(--text-primary)]">{candidate.loggerSession?.activityType ?? "Strength Training"}</h2>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">{formatWindow(candidate.loggerSession?.startedAt, candidate.loggerSession?.endedAt)}</p>
                <p className="mt-2 text-sm font-bold text-[var(--text-primary)]">Confidence {candidate.confidence} · {formatBasis(candidate.basis)}</p>
              </div>
              {pending && <form action={resolveAction}>
                <ResolutionFields action="confirm" candidateId={candidate.loggerSessionCanonicalId} presentation={presentation} />
                <button className="min-h-12 w-full rounded-2xl bg-[var(--primary)] px-4 text-sm font-extrabold text-white" type="submit">Use Logger session {index + 1}</button>
              </form>}
            </Card>
          ))}
        </div>

        {pending && <form action={resolveAction} className="mt-4">
          <ResolutionFields action="no_match" presentation={presentation} />
          <button className="min-h-12 w-full rounded-2xl border border-[var(--divider)] px-4 text-sm font-extrabold text-[var(--text-primary)]" type="submit">No match</button>
        </form>}
      </div>
    </main>
  );
}

function ResolutionFields({ action, candidateId = null, presentation }) {
  const idempotencyKey = ["web-workout-reconciliation", presentation.id, presentation.version, action, candidateId ?? "none"].join(":");
  return <>
    <input name="reviewId" type="hidden" value={presentation.id} />
    <input name="expectedVersion" type="hidden" value={presentation.version} />
    <input name="action" type="hidden" value={action} />
    <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
    {candidateId && <input name="loggerSessionCanonicalId" type="hidden" value={candidateId} />}
  </>;
}

function formatWindow(start, end) {
  if (!start) return "Time unavailable";
  return `${formatInstant(start)}${end ? ` – ${formatInstant(end)}` : ""}`;
}

function formatInstant(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Time unavailable" : date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function formatBasis(value) {
  if (value === "explicit_source_identity") return "explicit Apple workout identity";
  if (value === "logger_session_window") return "Logger and Apple time window";
  return "time and workout telemetry";
}
