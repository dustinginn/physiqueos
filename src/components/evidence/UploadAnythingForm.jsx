"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Scale } from "lucide-react";

export default function UploadAnythingForm({
  action,
  children,
  defaultDate,
  directWeighInAction,
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [uploadingDate, setUploadingDate] = useState(null);
  const [selectedDate, setSelectedDate] = useState(defaultDate);
  const [error, setError] = useState(null);
  const [showWeighIn, setShowWeighIn] = useState(false);
  const [weight, setWeight] = useState("");
  const [weighInError, setWeighInError] = useState(null);
  const [weighInResult, setWeighInResult] = useState(null);
  const [weighInPending, startWeighInTransition] = useTransition();

  async function submit(event) {
    event.preventDefault();
    if (submitting) return;
    const formData = new FormData(event.currentTarget);
    setUploadingDate(String(formData.get("evidenceDate") ?? ""));
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

  function saveWeighIn() {
    if (weighInPending) return;
    setWeighInError(null);
    setWeighInResult(null);
    startWeighInTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("evidenceDate", selectedDate);
        formData.set("weight", weight);
        const result = await directWeighInAction(formData);
        if (!result?.ok) {
          setWeighInError(result?.error ?? "Your weigh-in could not be saved.");
          return;
        }
        setWeighInResult(result);
        router.refresh();
      } catch (failure) {
        setWeighInError(failure?.message ?? "Your weigh-in could not be saved.");
      }
    });
  }

  return <form className="space-y-3" encType="multipart/form-data" method="post" onSubmit={submit}>
    {submitting ? (
      <section aria-busy="true" aria-live="polite" className="flex min-h-64 flex-col items-center justify-center px-4 text-center" role="status">
        <span aria-hidden="true" className="h-10 w-10 animate-pulse rounded-full bg-[var(--surface-accent)] ring-8 ring-[var(--surface-muted)] motion-reduce:animate-none" />
        <h2 className="mt-7 text-2xl font-extrabold text-[var(--text-primary)]">Uploading your evidence&hellip;</h2>
        {uploadingDate && <p className="mt-3 text-sm font-bold text-[var(--text-secondary)]">{formatFriendlyDate(uploadingDate)}</p>}
        <p className="mt-3 max-w-xs text-sm leading-6 text-[var(--text-secondary)]">Keep this page open while your upload is prepared for review.</p>
      </section>
    ) : <>
      {children}
      <label className="block space-y-2 rounded-[16px] border border-[#E5E7EB] bg-[#F8FAFC] p-4">
        <span className="text-sm font-extrabold text-slate-950">When did this happen?</span>
        <span className="block text-xs font-medium leading-5 text-slate-500">Use the date the weigh-in, workout, meal, scan, or activity happened.</span>
        <input
          className="w-full rounded-[12px] border border-[#E5E7EB] bg-white px-3 py-2 text-sm font-bold text-slate-950 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
          max={defaultDate}
          name="evidenceDate"
          onChange={(event) => {
            setSelectedDate(event.target.value);
            setWeighInError(null);
            setWeighInResult(null);
          }}
          type="date"
          value={selectedDate}
        />
      </label>

      <section className="rounded-[16px] border border-[#C7D2FE] bg-indigo-50/50 p-4">
        <button
          aria-expanded={showWeighIn}
          className="flex min-h-11 w-full items-center gap-3 text-left"
          onClick={() => setShowWeighIn((value) => !value)}
          type="button"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-indigo-600"><Scale aria-hidden="true" size={18} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-extrabold text-slate-950">Log weigh-in</span>
            <span className="mt-0.5 block text-xs font-medium leading-5 text-slate-500">Save a structured weight directly. No upload or review required.</span>
          </span>
          <span aria-hidden="true" className="text-lg font-black text-indigo-600">{showWeighIn ? "−" : "+"}</span>
        </button>
        {showWeighIn && (
          <div className="mt-4 space-y-3 border-t border-indigo-100 pt-4">
            <label className="block space-y-2">
              <span className="text-sm font-extrabold text-slate-950">Weight</span>
              <span className="flex items-center gap-3">
                <input
                  className="min-h-12 w-full rounded-[12px] border border-[#E5E7EB] bg-white px-3 text-lg font-black text-slate-950 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                  disabled={weighInPending}
                  inputMode="decimal"
                  max="1000"
                  min="50"
                  onChange={(event) => {
                    setWeight(event.target.value);
                    setWeighInError(null);
                    setWeighInResult(null);
                  }}
                  placeholder="165.2"
                  step="0.1"
                  type="number"
                  value={weight}
                />
                <span className="text-sm font-extrabold text-slate-500">lb</span>
              </span>
            </label>
            <p className="text-xs font-semibold text-slate-600">Date: {formatFriendlyDate(selectedDate)}</p>
            {weighInError && <p aria-live="assertive" className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700" role="alert">{weighInError}</p>}
            {weighInResult && <p aria-live="polite" className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700" role="status">{weighInResult.message}</p>}
            <button
              className="flex min-h-12 w-full items-center justify-center rounded-full bg-indigo-600 px-5 py-3 text-sm font-extrabold text-white disabled:opacity-50"
              disabled={weighInPending}
              onClick={saveWeighIn}
              type="button"
            >
              {weighInPending ? "Saving weigh-in…" : "Save weigh-in"}
            </button>
          </div>
        )}
      </section>
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
