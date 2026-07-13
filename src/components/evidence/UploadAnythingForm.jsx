"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function UploadAnythingForm({ action, children }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function submit(event) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(action, {
        method: "POST",
        body: new FormData(event.currentTarget),
        headers: { Accept: "application/json" },
      });
      const result = await response.json();
      if (!response.ok || !result.reviewUrl) throw new Error(result.error ?? "Evidence upload failed.");
      router.push(result.reviewUrl);
    } catch (failure) {
      setError(failure?.message ?? "Evidence upload failed.");
      setSubmitting(false);
    }
  }

  return <form className="space-y-3" encType="multipart/form-data" method="post" onSubmit={submit}>
    {children}
    {error && <p className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}
    <button className="flex w-full items-center justify-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-extrabold text-white disabled:opacity-50" disabled={submitting} type="submit">
      {submitting ? "Processing evidence…" : "Submit evidence"}
    </button>
  </form>;
}
