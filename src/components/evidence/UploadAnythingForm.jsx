"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function UploadAnythingForm({ action, children }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [error, setError] = useState(null);

  async function submit(event) {
    event.preventDefault();
    if (submitting) return;
    const formData = new FormData(event.currentTarget);
    setSelectedDate(String(formData.get("evidenceDate") ?? ""));
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(action, {
        method: "POST",
        body: formData,
        headers: { Accept: "application/json" },
      });
      const result = await response.json();
      if (!response.ok || !result.reviewUrl) throw new Error(result.error ?? "Your upload could not be prepared for review.");
      router.push(result.reviewUrl);
    } catch (failure) {
      setError(failure?.message ?? "Your upload could not be prepared for review.");
      setSubmitting(false);
    }
  }

  return <form className="space-y-3" encType="multipart/form-data" method="post" onSubmit={submit}>
    {submitting ? (
      <section aria-busy="true" aria-live="polite" className="flex min-h-64 flex-col items-center justify-center px-4 text-center" role="status">
        <span aria-hidden="true" className="h-10 w-10 animate-pulse rounded-full bg-[var(--surface-accent)] ring-8 ring-[var(--surface-muted)] motion-reduce:animate-none" />
        <h2 className="mt-7 text-2xl font-extrabold text-[var(--text-primary)]">Uploading your evidence&hellip;</h2>
        {selectedDate && <p className="mt-3 text-sm font-bold text-[var(--text-secondary)]">{formatFriendlyDate(selectedDate)}</p>}
        <p className="mt-3 max-w-xs text-sm leading-6 text-[var(--text-secondary)]">Keep this page open while your upload is prepared for review.</p>
      </section>
    ) : <>
      {children}
      {error && <p aria-live="assertive" className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700" role="alert">{error}</p>}
      <button className="flex w-full items-center justify-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-extrabold text-white disabled:opacity-50" disabled={submitting} type="submit">
        Submit evidence
      </button>
    </>}
  </form>;
}

function formatFriendlyDate(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  if (![year, month, day].every(Number.isFinite)) return value;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    day: "numeric", month: "long", weekday: "long", year: "numeric",
  });
}
