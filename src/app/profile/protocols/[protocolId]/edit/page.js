import Link from "next/link";

export default async function ProtocolTransitionEditPlaceholder({ params, searchParams }) {
  await params;
  const query = await searchParams;
  const returnTo = query.returnTo || "/preview/goals/transition";
  return (
    <main className="app-surface min-h-screen px-4 py-8">
      <section className="mx-auto max-w-[393px] rounded-[24px] border border-[var(--divider)] bg-[var(--surface-elevated)] p-5 shadow-sm">
        <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[var(--primary)]">Next step</p>
        <h1 className="mt-2 text-2xl font-extrabold text-[var(--text-primary)]">We’ll review your protocols after you create the goal.</h1>
        <p className="mt-3 text-sm font-semibold leading-6 text-[var(--text-secondary)]">Your current protocols remain with your completed goal. Nothing has changed yet.</p>
        <Link className="mt-5 flex min-h-12 items-center justify-center rounded-[14px] bg-[var(--primary)] px-4 text-sm font-extrabold text-white" href={returnTo}>Return to Goal Creation</Link>
      </section>
    </main>
  );
}
