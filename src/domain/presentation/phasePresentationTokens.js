// Single source of truth for what each phase-presentation tone means visually, shared by
// every screen that renders a phase (Home's "Your Goals" and the Goal page's "Your Journey").
// Screens still apply tokens through their own rendering mechanism (inline hex vs Tailwind
// classes), but the palette itself lives here once instead of being duplicated per screen.
export const PHASE_PRESENTATION_TOKENS = Object.freeze({
  gold: {
    hex: "#C9971A",
    tailwind: Object.freeze({
      surface: "border-amber-300/40 bg-amber-50/60 dark:border-amber-300/15 dark:bg-amber-300/[.06]",
      badge: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
      text: "text-amber-700 dark:text-amber-300",
      bar: "bg-amber-500",
    }),
  },
  green: {
    hex: "#3BC35B",
    tailwind: Object.freeze({
      surface: "border-emerald-300/40 bg-emerald-50/60 dark:border-emerald-300/15 dark:bg-emerald-300/[.06]",
      badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
      text: "text-emerald-700 dark:text-emerald-300",
      bar: "bg-emerald-500",
    }),
  },
  orange: {
    hex: "var(--chart-3)",
    tailwind: Object.freeze({
      surface: "border-orange-300/40 bg-orange-50/60 dark:border-orange-300/15 dark:bg-orange-300/[.06]",
      badge: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
      text: "text-orange-700 dark:text-orange-300",
      bar: "bg-orange-500",
    }),
  },
  neutral: {
    hex: "var(--text-muted)",
    tailwind: Object.freeze({
      surface: "border-slate-300/40 bg-slate-50/60 dark:border-slate-300/15 dark:bg-slate-300/[.06]",
      badge: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
      text: "text-slate-700 dark:text-slate-300",
      bar: "bg-slate-400",
    }),
  },
});

export function resolvePhasePresentationToken(tone) {
  return PHASE_PRESENTATION_TOKENS[tone] ?? PHASE_PRESENTATION_TOKENS.neutral;
}
