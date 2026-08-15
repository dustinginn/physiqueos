"use client";

export default function ApplicationError({ reset }) {
  return (
    <main className="mx-auto min-h-screen max-w-[393px] bg-[var(--background)] px-4 py-12 text-[var(--text-primary)]">
      <section className="rounded-2xl border border-[var(--divider)] bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow-card)]">
        <h1 className="text-lg font-semibold">That change was not confirmed</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
          PhysiqueOS could not finish the request. Review the current page before trying again because part of the request may already have completed. If system status shows maintenance, wait until it completes.
        </p>
        <button
          className="mt-5 min-h-11 w-full rounded-2xl bg-[var(--primary)] px-4 py-3 text-sm font-semibold text-white"
          onClick={() => reset()}
          type="button"
        >
          Try again
        </button>
      </section>
    </main>
  );
}
