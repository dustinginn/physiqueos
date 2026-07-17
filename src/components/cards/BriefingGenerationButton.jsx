"use client";

import { useFormStatus } from "react-dom";

export default function BriefingGenerationButton({ label = "Prepare Briefing" }) {
  const { pending } = useFormStatus();

  return (
    <button
      className="mt-3 min-h-11 w-full rounded-2xl bg-[var(--primary)] px-4 text-sm font-extrabold text-white disabled:cursor-wait disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      {pending ? "Preparing…" : label}
    </button>
  );
}
