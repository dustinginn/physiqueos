"use client";

import { useMemo, useState, useTransition } from "react";
import Card from "../ui/Card";
import {
  PHASE_REVIEW_RECOMMENDATIONS,
  projectPhaseReviewSelection,
} from "../../domain/services/PhaseReviewPresentationService";

const DURATION_LABELS = Object.freeze({ 7: "1 week", 14: "2 weeks", 21: "3 weeks" });

export default function PhaseReviewCard({ review, submitDecision = null, readOnly = false }) {
  const [selectedOutcome, setSelectedOutcome] = useState(review.recommendation);
  const [durationDays, setDurationDays] = useState(review.recommendedDurationDays);
  const [customReviewDate, setCustomReviewDate] = useState("");
  const [previewed, setPreviewed] = useState(false);
  const [result, setResult] = useState(null);
  const [pending, startTransition] = useTransition();
  const projection = useMemo(() => {
    try {
      return projectPhaseReviewSelection(review, {
        selectedOutcome,
        durationDays,
        customReviewDate,
      });
    } catch {
      return null;
    }
  }, [customReviewDate, durationDays, review, selectedOutcome]);
  const extending = selectedOutcome === PHASE_REVIEW_RECOMMENDATIONS.CONTINUE_CURRENT_PHASE;
  const submit = () => {
    if (!submitDecision) {
      setPreviewed(true);
      return;
    }
    setResult(null);
    startTransition(async () => {
      const response = await submitDecision(createDecisionRequest({
        review, projection, selectedOutcome, durationDays,
      }));
      setResult(response);
    });
  };

  return <Card className="border-indigo-200/80 bg-gradient-to-br from-indigo-50/80 via-white to-violet-50/70 dark:border-indigo-300/15 dark:from-indigo-300/[.07] dark:via-white/[.04] dark:to-violet-300/[.05]" data-testid="phase-review-card">
    <p className="text-[10px] font-extrabold uppercase tracking-[.1em] text-indigo-700 dark:text-indigo-300">Phase Review</p>
    <p className="mt-4 text-[10px] font-black uppercase tracking-[.1em] text-slate-400">Recommendation</p>
    <h2 className="mt-1 text-xl font-black leading-7 text-slate-950" data-testid="phase-review-recommendation">{review.recommendationLabel}</h2>
    <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{review.explanation}</p>

    <fieldset className="mt-5 border-t border-indigo-100 pt-4" data-testid="phase-review-decisions">
      <legend className="text-xs font-black text-slate-900">Decision</legend>
      <div className="mt-2 space-y-1">
        <DecisionOption disabled={readOnly} label={`Begin ${review.nextPhase.shortName}`} onSelect={() => { setSelectedOutcome(PHASE_REVIEW_RECOMMENDATIONS.BEGIN_NEXT_PHASE); setPreviewed(false); }} recommended={review.recommendation === PHASE_REVIEW_RECOMMENDATIONS.BEGIN_NEXT_PHASE} selected={selectedOutcome === PHASE_REVIEW_RECOMMENDATIONS.BEGIN_NEXT_PHASE} value={PHASE_REVIEW_RECOMMENDATIONS.BEGIN_NEXT_PHASE}/>
        <DecisionOption disabled={readOnly} label={`Continue ${review.currentPhase.name}`} onSelect={() => { setSelectedOutcome(PHASE_REVIEW_RECOMMENDATIONS.CONTINUE_CURRENT_PHASE); setPreviewed(false); }} recommended={review.recommendation === PHASE_REVIEW_RECOMMENDATIONS.CONTINUE_CURRENT_PHASE} selected={selectedOutcome === PHASE_REVIEW_RECOMMENDATIONS.CONTINUE_CURRENT_PHASE} value={PHASE_REVIEW_RECOMMENDATIONS.CONTINUE_CURRENT_PHASE}/>
      </div>
    </fieldset>

    {extending && <fieldset className="mt-5 border-t border-indigo-100 pt-4" data-testid="phase-review-duration">
      <legend className="text-xs font-black text-slate-900">Extension Duration</legend>
      <div className="mt-2 space-y-1">
        {review.durationOptions.map((duration) => <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-2 text-sm font-bold text-slate-700 hover:bg-white/70" key={duration}>
          <input checked={durationDays === duration} name="phase-review-duration" onChange={() => { setDurationDays(duration); setPreviewed(false); }} type="radio" value={duration}/>
          <span>{duration === "custom" ? "Custom…" : DURATION_LABELS[duration]}</span>
          {duration === review.recommendedDurationDays && <span className="ml-auto text-[10px] font-black uppercase tracking-wide text-indigo-600">Recommended</span>}
        </label>)}
      </div>
      {durationDays === "custom" && <label className="mt-3 block text-xs font-black text-slate-700">Selected review
        <input className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800" data-testid="phase-review-custom-date" min={nextDate(review.originalReviewDate)} onChange={(event) => { setCustomReviewDate(event.target.value); setPreviewed(false); }} type="date" value={customReviewDate}/>
      </label>}
    </fieldset>}

    {extending && projection && <dl className="mt-4 grid gap-2 rounded-2xl bg-white/75 p-3 text-xs dark:bg-white/[.05]" data-testid="phase-review-projection">
      <ProjectedDate label="Recommended review" value={projection.recommendedReviewDate}/>
      <ProjectedDate label="Selected review" value={projection.selectedReviewDate}/>
      <ProjectedDate label={`Projected ${review.nextPhase?.name ?? "next phase"} start`} value={projection.projectedNextPhaseStart}/>
    </dl>}

    {!extending && projection && <dl className="mt-4 grid gap-2 rounded-2xl bg-white/75 p-3 text-xs dark:bg-white/[.05]" data-testid="phase-review-next-phase-projection">
      <ProjectedDate label={`Projected ${review.nextPhase.shortName} Start`} value={projection.projectedNextPhaseStart}/>
      <ProjectedDate label={`Projected ${review.nextPhase.shortName} Review`} value={projection.projectedNextPhaseReview}/>
    </dl>}

    {!readOnly && <button className="mt-5 min-h-12 w-full rounded-2xl bg-indigo-600 px-4 text-sm font-black text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50" data-testid="phase-review-primary-action" disabled={!projection || pending || result?.ok === true} onClick={submit} type="button">
      {extending ? `Continue ${review.currentPhase.shortName}` : `Begin ${review.nextPhase.shortName}`}
    </button>}
    {readOnly && <p className="mt-4 text-xs font-bold text-slate-600" data-testid="phase-review-read-only">This Phase Review decision has been recorded.</p>}
    {previewed && <p className="mt-3 text-center text-xs font-bold text-indigo-700" data-testid="phase-review-preview-notice">Preview only — no phase dates or Goal state were changed.</p>}
    {result && <p className={`mt-3 text-center text-xs font-bold ${result.ok ? "text-emerald-700" : "text-rose-700"}`} data-testid="phase-review-action-message" role="status">{result.message}</p>}
  </Card>;
}

function createDecisionRequest({ review, projection, selectedOutcome, durationDays }) {
  const action = review.actionRequest ?? {};
  const identity = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`;
  return {
    ...action,
    decisionId: `phase-review-decision|${action.originatingArtifactId}|${identity}`,
    idempotencyKey: `phase-review|${action.originatingArtifactId}|${identity}`,
    selectedOutcome: selectedOutcome === PHASE_REVIEW_RECOMMENDATIONS.CONTINUE_CURRENT_PHASE
      ? "extend_current_phase" : selectedOutcome,
    selectedDuration: selectedOutcome === PHASE_REVIEW_RECOMMENDATIONS.CONTINUE_CURRENT_PHASE
      ? durationValue(durationDays) : null,
    selectedReviewAt: selectedOutcome === PHASE_REVIEW_RECOMMENDATIONS.CONTINUE_CURRENT_PHASE
      ? projection?.selectedReviewDate ?? null : null,
  };
}

function durationValue(value) {
  return value === 7 ? "1_week" : value === 14 ? "2_weeks" : value === 21 ? "3_weeks" : "custom";
}

function DecisionOption({ disabled = false, label, onSelect, recommended, selected, value }) {
  return <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-2 text-sm font-bold text-slate-700 hover:bg-white/70">
    <input checked={selected} disabled={disabled} name="phase-review-decision" onChange={onSelect} type="radio" value={value}/>
    <span>{label}</span>
    {recommended && <span className="ml-auto text-[10px] font-black uppercase tracking-wide text-indigo-600">Recommended</span>}
  </label>;
}

function ProjectedDate({ label, value }) {
  return <div className="flex items-center justify-between gap-3"><dt className="font-bold text-slate-500">{label}</dt><dd className="font-black text-slate-900">{formatDate(value)}</dd></div>;
}

function nextDate(value) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}
