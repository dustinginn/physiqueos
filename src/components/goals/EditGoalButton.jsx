import { Pencil } from "lucide-react";

export default function EditGoalButton({ goalTitle }) {
  return (
    <details className="relative z-20 shrink-0">
      <summary
        className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1 rounded-full bg-[#F8FAFC] px-2.5 text-xs font-extrabold text-[#4F46E5] transition marker:hidden hover:bg-[#EEF2FF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4F46E5] [&::-webkit-details-marker]:hidden"
        role="button"
      >
        <Pencil aria-hidden="true" size={12} strokeWidth={2.4} />
        Edit
      </summary>
      <div
        className="pointer-events-none absolute right-0 top-10 z-30 w-[260px] rounded-[16px] bg-white p-4 text-left shadow-[0_18px_40px_rgba(15,23,42,0.18)] ring-1 ring-slate-900/10"
        role="status"
      >
        <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#4F46E5]">
          {goalTitle}
        </p>
        <p className="mt-2 text-base font-extrabold leading-tight text-slate-950">
          Goal editing will be powered by onboarding.
        </p>
        <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
          This entry point is ready, but the full refinement flow is not built
          yet.
        </p>
      </div>
    </details>
  );
}
