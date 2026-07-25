import {
  Activity,
  Camera,
  ClipboardList,
  Dumbbell,
  HeartPulse,
  Salad,
  ScanLine,
  Scale,
  Zap,
} from "lucide-react";

export const EVIDENCE_ICON_PRESENTATION = Object.freeze({
  training: {
    icon: Dumbbell,
    foregroundClassName: "text-purple-700 dark:text-purple-300",
    backgroundClassName: "bg-purple-100/70 dark:bg-purple-400/15",
  },
  nutrition: {
    icon: Salad,
    foregroundClassName: "text-orange-700 dark:text-orange-300",
    backgroundClassName: "bg-orange-100/70 dark:bg-orange-400/15",
  },
  weight: {
    icon: Scale,
    foregroundClassName: "text-blue-700 dark:text-blue-300",
    backgroundClassName: "bg-blue-100/70 dark:bg-blue-400/15",
  },
  photos: {
    icon: Camera,
    foregroundClassName: "text-rose-700 dark:text-rose-300",
    backgroundClassName: "bg-rose-100/70 dark:bg-rose-400/15",
  },
  dexa: {
    icon: ScanLine,
    foregroundClassName: "text-emerald-700 dark:text-emerald-300",
    backgroundClassName: "bg-emerald-100/70 dark:bg-emerald-400/15",
  },
  activity: {
    icon: Activity,
    foregroundClassName: "text-amber-800 dark:text-amber-300",
    backgroundClassName: "bg-amber-100/70 dark:bg-amber-400/15",
  },
  energy: {
    icon: Zap,
    foregroundClassName: "text-violet-700 dark:text-violet-300",
    backgroundClassName: "bg-violet-100/70 dark:bg-violet-400/15",
  },
  recovery: {
    icon: Activity,
    foregroundClassName: "text-teal-700 dark:text-teal-300",
    backgroundClassName: "bg-teal-100/70 dark:bg-teal-400/15",
  },
  "health-metrics": {
    icon: HeartPulse,
    foregroundClassName: "text-cyan-700 dark:text-cyan-300",
    backgroundClassName: "bg-cyan-100/70 dark:bg-cyan-400/15",
  },
});

const DEFAULT_EVIDENCE_ICON_PRESENTATION = Object.freeze({
  icon: ClipboardList,
  foregroundClassName: "text-slate-700 dark:text-slate-300",
  backgroundClassName: "bg-slate-100/70 dark:bg-slate-400/15",
});

export function getEvidenceIconPresentation(evidenceId) {
  return EVIDENCE_ICON_PRESENTATION[evidenceId] ?? DEFAULT_EVIDENCE_ICON_PRESENTATION;
}

export function getEvidenceIconAppearanceClassName(evidenceId) {
  const presentation = getEvidenceIconPresentation(evidenceId);
  return `${presentation.backgroundClassName} ${presentation.foregroundClassName}`;
}
