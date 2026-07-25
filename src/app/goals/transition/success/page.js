import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function GoalTransitionSuccessPage({ searchParams }) {
  const query = await searchParams;
  const pending = Number(Array.isArray(query.pending) ? query.pending[0] : query.pending) || 0;
  return (
    <main className="min-h-screen bg-[var(--background)] px-5 py-12 text-[var(--foreground)]">
      <div className="mx-auto max-w-xl space-y-5 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
        <p className="text-sm font-semibold text-[var(--primary)]">Goal transition committed</p>
        <h1 className="text-3xl font-bold">Build Lean Mass is active</h1>
        <p className="text-[var(--muted-foreground)]">
          The accepted transition was saved as one atomic change.
        </p>
        {pending > 0 && (
          <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
            Scheduler synchronization is pending. The committed goal transition is not
            affected, and no automatic retry was started.
          </p>
        )}
        <Link className="font-semibold text-[var(--primary)]" href="/">
          Return home
        </Link>
      </div>
    </main>
  );
}
