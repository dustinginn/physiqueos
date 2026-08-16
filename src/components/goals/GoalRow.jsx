import Link from "next/link";
import { Activity, Compass, Dumbbell, ShieldCheck, Target } from "lucide-react";
import IconBadge from "../ui/IconBadge";
import ProgressBar from "../ui/ProgressBar";
import { resolvePhasePresentationToken } from "../../domain/presentation/phasePresentationTokens";

const iconMap = { activity: Activity, compass: Compass, dumbbell: Dumbbell, shield: ShieldCheck, target: Target };

export default function GoalRow({ title, current, target, unit = "", progress = 0, primary = false, icon = "target", color = "success", progressColor = "#3BC35B", presentation = { mode: "primary_goal" }, href, className = "" }) {
  const Icon = iconMap[icon] ?? Target;
  const isTerminalGoal = presentation.mode === "terminal_goal", isCalibrationGoal = presentation.mode === "calibration_goal", isPhaseTrajectoryGoal = presentation.mode === "phase_trajectory_goal";
  const isPrimaryGoal = !isTerminalGoal && !isCalibrationGoal && (primary || presentation.mode === "primary_goal");
  const Component = href ? Link : "div";
  return <Component className={`grid ${isPhaseTrajectoryGoal ? "grid-cols-1" : isPrimaryGoal ? "grid-cols-[38px_minmax(0,1fr)_64px_42px]" : isTerminalGoal || isCalibrationGoal ? "grid-cols-[38px_minmax(0,1fr)]" : "grid-cols-[38px_minmax(0,1fr)_auto]"} ${isTerminalGoal || isCalibrationGoal ? "items-start" : "items-center"} gap-2 rounded-[12px] transition hover:bg-[var(--surface-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] ${href ? "cursor-pointer" : ""} ${className}`} data-goal-layout={isPhaseTrajectoryGoal ? "phase-trajectory" : isTerminalGoal || isCalibrationGoal ? "stacked" : "compact"} href={href}>
    {isPhaseTrajectoryGoal ? <PhaseTrajectoryGoal title={title} presentation={presentation}/> : <><IconBadge icon={Icon} color={color} size="md" className={`rounded-full ${isTerminalGoal || isCalibrationGoal ? "mt-0.5" : ""}`}/><div className="min-w-0">
      {(isPrimaryGoal || isCalibrationGoal) && <p className="mb-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--primary)]">Primary Goal</p>}
      <h3 className={`${isTerminalGoal ? "" : "truncate"} text-[15px] font-semibold leading-tight text-[var(--text-primary)]`}>{title}</h3>
      {!isCalibrationGoal && <p className="mt-0.5 flex items-center gap-1.5 whitespace-nowrap text-[12px] font-medium text-[var(--text-secondary)]"><span>{current}{unit}</span><span aria-hidden>→</span><span>{target}{unit}</span></p>}
      {isCalibrationGoal && <div className="mt-1.5"><p className="text-[13px] font-bold leading-tight text-[var(--text-primary)]">{presentation.status}</p><p className="mt-0.5 text-[10px] font-semibold leading-4 text-[var(--text-secondary)]">{presentation.detail}</p>{presentation.guardrail && <p className="mt-1 text-[10px] font-medium leading-4 text-[var(--text-secondary)]">Guardrail: {presentation.guardrail}</p>}</div>}
      {isTerminalGoal && <div className="mt-1.5 border-t border-[var(--divider)] pt-1.5"><p className="text-[13px] font-bold leading-tight text-[var(--text-primary)]">{presentation.status ?? current}</p><p className="mt-0.5 text-[10px] font-semibold leading-4 text-[var(--text-secondary)]">{presentation.detail ?? presentation.label ?? "Status"}</p></div>}
    </div>{isPrimaryGoal ? <><ProgressBar value={progress} color={progressColor} label={`${title} progress`}/><div className="text-right"><p className="text-[18px] font-bold leading-none" style={{ color: progressColor }}>{progress}%</p><p className="mt-0.5 text-[7px] font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Complete</p></div></> : !isTerminalGoal && !isCalibrationGoal ? <div className="min-w-[92px] text-right"><p className="text-[13px] font-bold leading-tight text-[var(--text-primary)]">{presentation.status ?? current}</p><p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)]">{presentation.detail ?? presentation.label ?? "Status"}</p></div> : null}</>}
  </Component>;
}

function PhaseTrajectoryGoal({ title, presentation }) {
  const { trajectory } = presentation, overall = trajectory.overallGoal;
  return <div className="min-w-0"><p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--primary)]">Primary Goal</p><h3 className="mt-0.5 text-[16px] font-extrabold text-[var(--text-primary)]">{title}</h3>{overall.targetDescription && <p className="mt-2 text-[13px] font-bold leading-5 text-[var(--text-primary)]">{overall.targetDescription}{overall.overallTargetDate ? ` by ${shortDate(overall.overallTargetDate)}` : ""}</p>}<div className="mt-3 space-y-2.5">{trajectory.phases.map((phase) => <PhaseRow key={phase.phaseId} phase={phase}/>)}</div>{presentation.guardrail && <GuardrailCallout primary={presentation.guardrail}/>}</div>;
}

function PhaseRow({ phase }) {
  const outcome = phase.progress?.progressType === "outcome", unavailable = phase.progress?.progressType === "unavailable";
  const upcoming = phase.status === "upcoming" || phase.status === "planned";
  const highlightedPhase = phase.status === "active" || upcoming;
  const hasProgress = Number.isFinite(phase.progress?.clampedProgressPercentage);
  const accent = phase.presentationTone === "green" || phase.presentationTone === "neutral" || phase.presentationTone === "gold"
    ? resolvePhasePresentationToken(phase.presentationTone).hex
    : upcoming ? "var(--chart-1)" : outcome ? "var(--chart-4)" : "var(--chart-3)";
  const timing = phase.status === "active" && phase.startDate && phase.calculatedPlannedReviewDate ? `Started ${compactDate(phase.startDate)} · Planned review ${compactDate(phase.calculatedPlannedReviewDate)}` : null;
  const PhaseIcon = outcome ? Dumbbell : Compass;
  return <div className="rounded-xl border p-3" data-phase-progress={phase.progress?.progressType} style={{ borderColor: highlightedPhase ? `color-mix(in srgb, ${accent} 26%, var(--divider))` : "var(--divider)", backgroundColor: highlightedPhase ? `color-mix(in srgb, ${accent} 4%, transparent)` : undefined }}><div className="flex min-w-0 items-start gap-2.5"><span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]" style={{ backgroundColor: `color-mix(in srgb, ${accent} 16%, transparent)`, color: accent }}><PhaseIcon size={17}/></span><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="text-[9px] font-bold uppercase tracking-[0.1em]" style={{ color: accent }}>Phase {Number(phase.order ?? 0) + 1}</p><p className="break-words text-[13px] font-extrabold leading-4 text-[var(--text-primary)]">{phase.phaseName}</p></div><span className="shrink-0 rounded-full bg-[var(--surface-muted)] px-2 py-1 text-[9px] font-extrabold capitalize" style={{ color: accent }}>{phase.timelineProgressState === "review_due" ? "Review due" : phase.status}</span></div>{timing && <p className="mt-1 text-[10px] font-medium text-[var(--text-secondary)]">{timing}</p>}</div></div>{unavailable ? <p className="mt-3 text-right text-[11px] font-bold text-[var(--text-secondary)]">{phase.progress.presentationLabel}</p> : hasProgress && <div className="mt-3"><ProgressBar value={phase.progress.clampedProgressPercentage} color={accent} label={`${phase.phaseName} ${outcome ? "outcome" : "planned time"} progress`}/><p className="mt-1.5 text-right text-[10px] font-semibold text-[var(--text-secondary)]">{phase.progress.presentationLabel}</p>{outcome && <p className="mt-0.5 text-right text-[9px] font-medium text-[var(--text-muted)]">{phase.progress.status === "awaiting_follow_up" ? "Awaiting next DEXA" : "DEXA measurements anchor progress"}</p>}</div>}</div>;
}

function GuardrailCallout({ primary }) {
  return <div className="mt-3 rounded-[16px] border border-[color-mix(in_srgb,var(--primary)_22%,var(--divider))] bg-[color-mix(in_srgb,var(--primary)_7%,var(--surface-muted))] p-4"><div className="flex gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--primary)_14%,transparent)] text-[var(--primary)]"><ShieldCheck aria-hidden size={20}/></span><div><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--primary)]">Guardrail</p><p className="mt-1 text-[14px] font-extrabold leading-5 text-[var(--text-primary)]">{primary}</p><p className="mt-1 text-[10px] font-semibold text-[var(--text-secondary)]">This remains in effect throughout every phase.</p></div></div></div>;
}

function shortDate(value) { return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)); }
function compactDate(value) { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)); }
