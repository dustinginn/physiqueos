const roleCandidate = (decision, storyType) => decision.candidates
  .find((candidate) => candidate.storyType === storyType && candidate.included);

const dateOf = (record) => String(record.date ?? record.measuredAt ?? record.capturedAt ?? "").slice(0, 10);

function addDays(value, days) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatShortDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function activeGoalWindow(fixture) {
  const completionDate = fixture.goal?.completionEvent?.completedAt;
  const activePhase = fixture.goal?.phases?.find((phase) => phase.status === "active");
  const startDate = completionDate
    ? addDays(String(completionDate).slice(0, 10), 1)
    : String(activePhase?.startDate ?? fixture.previewWindow.startDate).slice(0, 10);
  return {
    label: `${activePhase?.name ?? "Active Goal"} · Phase 1`,
    startDate,
    endDate: fixture.previewWindow.endDate,
  };
}

function energyRecords(fixture, window = fixture.previewWindow) {
  const observed = (fixture.energyContinuations ?? []).map((record) => ({ ...record, synthetic: false }));
  const synthetic = (fixture.syntheticContinuation?.energyContinuations ?? []).map((record) => ({ ...record, synthetic: true }));
  return [...observed, ...synthetic]
    .filter((record) => dateOf(record) >= window.startDate && dateOf(record) <= window.endDate)
    .sort((left, right) => dateOf(left).localeCompare(dateOf(right)));
}

function weeklyEnergy(records, window) {
  const start = new Date(`${window.startDate}T12:00:00Z`);
  const end = new Date(`${window.endDate}T12:00:00Z`);
  const weekCount = Math.ceil(((end - start) / 86400000 + 1) / 7);
  return Array.from({ length: weekCount }, (_, index) => {
    const weekStart = addDays(window.startDate, index * 7);
    const weekEnd = addDays(weekStart, 6) > window.endDate ? window.endDate : addDays(weekStart, 6);
    const items = records.filter((record) => dateOf(record) >= weekStart && dateOf(record) <= weekEnd);
    const base = {
      id: `week-${index + 1}`,
      label: `${formatShortDate(weekStart)}–${formatShortDate(weekEnd)}`,
    };
    if (!items.length) return { ...base, missing: true };
    const average = (field) => Math.round(items.reduce((total, item) => total + Number(item[field]), 0) / items.length);
    return {
      ...base,
      intake: average("estimatedIntake"),
      expenditure: average("estimatedExpenditure"),
      balance: average("balance"),
      synthetic: items.some((item) => item.synthetic),
      observedCount: items.filter((item) => !item.synthetic).length,
      previewCount: items.filter((item) => item.synthetic).length,
      missing: false,
    };
  });
}

function dailyEnergy(records, window) {
  const start = new Date(`${window.startDate}T12:00:00Z`);
  const end = new Date(`${window.endDate}T12:00:00Z`);
  const byDate = new Map(records.map((record) => [dateOf(record), record]));
  const days = [];
  for (const date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
    const key = date.toISOString().slice(0, 10);
    const record = byDate.get(key);
    days.push(record ? {
      id: record.id,
      date: key,
      day: Number(key.slice(-2)),
      intake: Number(record.estimatedIntake),
      expenditure: Number(record.estimatedExpenditure),
      balance: Number(record.balance),
      synthetic: Boolean(record.synthetic),
      missing: false,
    } : {
      id: `missing-${key}`,
      date: key,
      day: Number(key.slice(-2)),
      missing: true,
      synthetic: false,
    });
  }
  return Array.from({ length: Math.ceil(days.length / 7) }, (_, index) => ({
    label: `Week ${index + 1}`,
    days: days.slice(index * 7, index * 7 + 7),
  }));
}

function summarizeEnergy(records, window) {
  const average = (field) => records.length
    ? Math.round(records.reduce((total, record) => total + Number(record[field]), 0) / records.length)
    : null;
  const observedDays = records.filter((record) => !record.synthetic).length;
  const previewDays = records.filter((record) => record.synthetic).length;
  const possibleDays = Math.round(
    (new Date(`${window.endDate}T12:00:00Z`) - new Date(`${window.startDate}T12:00:00Z`)) / 86400000,
  ) + 1;
  const balance = average("balance");
  return {
    metrics: [
      { label: "Avg intake", value: average("estimatedIntake"), suffix: "kcal", tone: "intake" },
      { label: "Avg expenditure", value: average("estimatedExpenditure"), suffix: "kcal", tone: "expenditure" },
      { label: "Avg balance", value: balance, suffix: "kcal", tone: "balance" },
      { label: "Balance magnitude", value: balance == null ? null : Math.abs(balance), suffix: "kcal", tone: "coverage" },
    ],
    observedDays,
    previewDays,
    possibleDays,
  };
}

export function buildMonthlyEnergySeries(fixture) {
  const window = { ...activeGoalWindow(fixture), observedCutoff: fixture.observedCutoff };
  const records = energyRecords(fixture, window);
  return {
    window,
    summary: summarizeEnergy(records, window),
    weekly: weeklyEnergy(records, window),
    dailyWeeks: dailyEnergy(records, window),
  };
}

export function buildConfidence(confidence) {
  if (!Number.isInteger(confidence?.score) ||
      !confidence.band ||
      !confidence.movementDirection ||
      !confidence.assessmentId ||
      confidence.source !== "canonical_pi_snapshot") return null;
  return {
    score: confidence.score,
    band: confidence.band,
    priorScore: confidence.priorScore,
    delta: confidence.delta,
    movementDirection: confidence.movementDirection,
    movementMagnitude: confidence.movementMagnitude,
    primaryReason: confidence.primaryReason,
    supportingReasons: confidence.supportingReasons,
    limitingReasons: confidence.limitingReasons,
    unresolvedUncertainty: confidence.unresolvedUncertainty,
    presentationExplanation: confidence.presentationExplanation ?? null,
    assessmentId: confidence.assessmentId,
    assessmentDate: confidence.assessmentTimestamp,
    evidenceCutoff: confidence.evidenceCutoff,
    goalId: confidence.assessmentContext?.goalId ?? null,
    phaseId: confidence.assessmentContext?.phaseId ?? null,
    source: confidence.source,
    modelVersion: confidence.modelVersion,
    piVersion: confidence.piVersion,
    historyRecordId: confidence.historyRecordId,
    selectionSource: confidence.selectionSource,
    temporalCutoff: confidence.temporalCutoff,
  };
}

function buildHero(fixture, coaching, confidence) {
  const visualRoles = {
    Calories: { icon: "energy", tone: "finish" },
    "New baseline": { icon: "baseline", tone: "confirmation" },
    Training: { icon: "training", tone: "transformation" },
  };
  return {
    eyebrow: "Monthly Briefing",
    period: "July 1–31 · Delivered August 1",
    goal: fixture.goal?.phases?.find((phase) => phase.status === "active")?.name ?? "Build Lean Mass",
    title: coaching.title,
    thesis: coaching.thesis,
    confidence: buildConfidence(confidence),
    highlights: coaching.highlights.map((item) => ({
      ...item,
      ...visualRoles[item.label],
    })),
  };
}

export function composeMonthlyBriefingPresentation({ narrative, decision, fixture }) {
  const coaching = narrative.monthlyNarrative;
  if (!coaching) {
    throw new Error("Monthly presentation requires a canonical Monthly narrative model.");
  }
  const types = ["goal_completion", "new_baseline", "phase_transition", "energy_trend", "training_evolution", "weight_context", "photo_progression"];
  const candidates = Object.fromEntries(types.map((type) => [type, roleCandidate(decision, type)]));
  const baseline = candidates.new_baseline;
  const completion = candidates.goal_completion;
  const energy = candidates.energy_trend;
  const training = candidates.training_evolution;
  const energySeries = buildMonthlyEnergySeries(fixture);

  const milestone = completion ? {
    eyebrow: "Milestone",
    label: "Goal Completed",
    goalName: fixture.goal.completionEvent?.displayName ?? fixture.goal.title,
    date: completion.provenance.completionDate,
    result: baseline?.provenance.bodyFat == null ? null : `${baseline.provenance.bodyFat}%`,
    href: "/goals/completed/preview",
  } : null;

  const newBaseline = baseline ? {
    eyebrow: "New Baseline",
    ...coaching.newBaseline,
    facts: [
      { label: "Body fat", value: `${baseline.provenance.bodyFat}%` },
      { label: "Lean mass", value: `${baseline.provenance.leanMass} lb` },
      { label: "Fat mass", value: `${baseline.provenance.fatMass} lb` },
      { label: "Reference date", value: "July 18, 2026" },
    ],
  } : null;

  return {
    preview: {
      synthetic: decision.synthetic.active,
      cutoff: decision.synthetic.realEvidenceCutoff,
      disclosure: decision.synthetic.active
        ? `Developer preview: records after ${formatShortDate(decision.synthetic.realEvidenceCutoff)} are simulated.`
        : null,
      inspectorHref: "/briefings/monthly/preview/2026-07-01/inspect?fixture=julyContinuation",
    },
    hero: buildHero(fixture, coaching.hero, coaching.confidence),
    milestone,
    training: training ? {
      eyebrow: "Training Progress",
      ...coaching.training,
      callout: "Why it matters",
    } : null,
    energy: energy ? {
      eyebrow: "Energy Evolution",
      ...coaching.energy,
      phaseLabel: energySeries.window.label,
      phaseDates: `${formatShortDate(energySeries.window.startDate)}–${formatShortDate(energySeries.window.endDate)}`,
      summaryMetrics: energySeries.summary.metrics,
      weekly: energySeries.weekly,
      dailyWeeks: energySeries.dailyWeeks,
    } : null,
    newBaseline,
    changes: coaching.changes ? {
      eyebrow: "What Changed",
      ...coaching.changes,
    } : null,
    moments: coaching.moments ? {
      eyebrow: "Defining Moments",
      ...coaching.moments,
    } : null,
    monthAhead: {
      eyebrow: "Month Ahead",
      ...coaching.monthAhead,
    },
    source: {
      narrativeId: narrative.id,
      selectedStoryIds: decision.selectedStoryIds,
      boundedMilestoneIds: decision.boundedMilestoneCandidateIds,
      translationVersion: coaching.translationVersion,
    },
  };
}
