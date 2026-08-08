import {
  PI_EDITORIAL_TRANSLATION_VERSION,
  auditPIEditorialVoice,
  composePIEditorialParagraph,
  describeMissingInformationNaturally,
} from "./PIEditorialTranslationService";
import { resolveCommittedPhaseContext } from "./FounderPhaseCorrectionService";

const PROHIBITED_MONTHLY_ANALYST_LANGUAGE = [
  /\blatest session\b/i,
  /\bone isolated workout\b/i,
  /\bmovement areas?\b/i,
  /\bprogression story\b/i,
  /\bforward signal\b/i,
  /\bvisual thread\b/i,
  /\bearned patience\b/i,
  /\bnew assignment\b/i,
  /\bobserved coverage\b/i,
  /\bpreview continuation\b/i,
  /\bactive-goal window\b/i,
  /\bPI(?:'|â€™)?s verdict\b/i,
  /\bconfirm the range\b/i,
  /\bbaseline only\b/i,
  /\bmonthly story\b/i,
  /\bobserved through\b/i,
  /\bsynthetic\b/i,
  /\bpreview days?\b/i,
  /\bcontinuation\b/i,
  /\bthe (?:briefing|report|preview|story)\b/i,
];

const NARRATIVE_PROSE_PATHS = [
  "hero.title",
  "hero.thesis",
  "hero.confidenceExplanation",
  "training.title",
  "training.summary",
  "training.interpretation",
  "training.next",
  "energy.title",
  "energy.summary",
  "energy.whyItMatters",
  "newBaseline.title",
  "newBaseline.summary",
  "newBaseline.callout",
  "changes.title",
  "moments.title",
  "strategy.title",
  "strategy.thesis",
  "monthAhead.title",
  "monthAhead.thesis",
];

const roleCandidate = (decision, storyType) => decision.candidates
  .find((candidate) => candidate.storyType === storyType && candidate.included);

const round = (value) => Math.round(Number(value) * 10) / 10;

function sentence(parts) {
  return composePIEditorialParagraph(parts);
}

function realRecords(records = []) {
  return records.filter((record) => !record?.isSynthetic && record?.source !== "preview_fixture");
}

function energyContext(evidence, phaseStartDate) {
  const records = realRecords(evidence.energyContinuations)
    .filter((record) => String(record.date).slice(0, 10) >= phaseStartDate)
    .sort((left, right) => String(left.date).localeCompare(String(right.date)));
  const averageBalance = records.length
    ? Math.round(records.reduce((total, record) => total + Number(record.balance), 0) / records.length)
    : null;
  return {
    averageBalance,
    hasMaterialCoverageGap: records.length < 3,
    recordCount: records.length,
  };
}

function positiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function performanceImprovementRatio(event) {
  const improvement = positiveNumber(event?.improvement);
  const baseline = positiveNumber(event?.previousBaselineValue);
  return improvement && baseline ? improvement / baseline : 0;
}

function trainingMovementArea(event) {
  const key = `${event?.canonicalExerciseId ?? ""} ${event?.canonicalExerciseName ?? ""}`.toLowerCase();
  if (/shoulder|front raise/.test(key)) return "shoulders";
  if (/bench|chest|fly/.test(key)) return "chest";
  if (/leg|squat|hip/.test(key)) return "lower_body";
  if (/row|pulldown|pullup|pull-up/.test(key)) return "back";
  if (/curl|pushdown|triceps|biceps|forearm/.test(key)) return "arms";
  if (/crunch|abdominal|hanging/.test(key)) return "core";
  return "other";
}

function strongestEvent(events, eventType) {
  return events
    .filter((event) => event.eventType === eventType)
    .sort((left, right) =>
      performanceImprovementRatio(right) - performanceImprovementRatio(left) ||
      String(right.workoutDate).localeCompare(String(left.workoutDate)) ||
      String(left.id).localeCompare(String(right.id))
    )[0] ?? null;
}

export function selectMonthlyTrainingPerformanceStories(events = []) {
  const byExercise = new Map();
  events
    .filter((event) =>
      ["session_volume_pr", "reps_at_load_pr"].includes(event?.eventType) &&
      positiveNumber(event?.improvement) &&
      event?.canonicalExerciseId &&
      event?.canonicalExerciseName
    )
    .forEach((event) => {
      const records = byExercise.get(event.canonicalExerciseId) ?? [];
      records.push(event);
      byExercise.set(event.canonicalExerciseId, records);
    });
  const exercises = [...byExercise.entries()].map(([exerciseId, records]) => {
    const volume = strongestEvent(records, "session_volume_pr");
    const repsAtLoad = strongestEvent(records, "reps_at_load_pr");
    return {
      id: `monthly_training_story_${exerciseId}`,
      area: trainingMovementArea(records[0]),
      date: records.map((event) => event.workoutDate).sort().at(-1),
      exerciseId,
      exerciseName: records[0].canonicalExerciseName,
      eventIds: [volume?.id, repsAtLoad?.id].filter(Boolean),
      volume: volume ? {
        currentValue: volume.currentValue,
        previousBaselineValue: volume.previousBaselineValue,
        improvement: volume.improvement,
        unit: volume.unit,
      } : null,
      repsAtLoad: repsAtLoad ? {
        reps: repsAtLoad.reps,
        load: repsAtLoad.load,
        loadUnit: repsAtLoad.loadUnit,
        previousReps: repsAtLoad.previousBaselineValue,
        improvement: repsAtLoad.improvement,
      } : null,
      strength: Math.max(
        performanceImprovementRatio(volume),
        performanceImprovementRatio(repsAtLoad),
      ),
    };
  });
  const strongestByArea = new Map();
  exercises
    .sort((left, right) =>
      right.strength - left.strength ||
      String(right.date).localeCompare(String(left.date)) ||
      left.exerciseName.localeCompare(right.exerciseName)
    )
    .forEach((story) => {
      if (!strongestByArea.has(story.area)) strongestByArea.set(story.area, story);
    });
  return Object.freeze([...strongestByArea.values()]
    .sort((left, right) =>
      right.strength - left.strength ||
      String(right.date).localeCompare(String(left.date)) ||
      left.exerciseName.localeCompare(right.exerciseName)
    )
    .slice(0, 3)
    .map((story) => Object.freeze(story)));
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
}

function formatList(values) {
  if (values.length < 2) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function performanceStat(story) {
  const volumePercent = story.volume?.previousBaselineValue
    ? Math.round((story.volume.improvement / story.volume.previousBaselineValue) * 100)
    : null;
  const repsPercent = story.repsAtLoad?.previousReps
    ? Math.round((story.repsAtLoad.improvement / story.repsAtLoad.previousReps) * 100)
    : null;
  if (volumePercent != null && story.repsAtLoad) {
    if (repsPercent > volumePercent) {
      return {
        label: story.exerciseName,
        value: `${story.repsAtLoad.reps} reps at ${formatNumber(story.repsAtLoad.load)} ${story.repsAtLoad.loadUnit}`,
        detail: `up from ${story.repsAtLoad.previousReps} reps; volume reached ${formatNumber(story.volume.currentValue)} ${story.volume.unit}`,
      };
    }
    return {
      label: story.exerciseName,
      value: `Volume +${volumePercent}%`,
      detail: `${formatNumber(story.volume.currentValue)} ${story.volume.unit} total; ${story.repsAtLoad.reps} reps at ${formatNumber(story.repsAtLoad.load)} ${story.repsAtLoad.loadUnit}, up from ${story.repsAtLoad.previousReps}`,
    };
  }
  if (story.repsAtLoad) {
    return {
      label: story.exerciseName,
      value: `${story.repsAtLoad.reps} reps at ${formatNumber(story.repsAtLoad.load)} ${story.repsAtLoad.loadUnit}`,
      detail: `up from ${story.repsAtLoad.previousReps} reps at the same load`,
    };
  }
  return {
    label: story.exerciseName,
    value: `Volume +${volumePercent}%`,
    detail: `${formatNumber(story.volume.currentValue)} ${story.volume.unit} of session volume`,
  };
}

function buildHero({ baseline, energy, training }) {
  return {
    title: baseline
      ? sentence({ observation: "July established the starting line for building muscle" })
      : sentence({ observation: "July clarified what should carry forward" }),
    thesis: baseline && energy && training
      ? sentence({
          observation: "You finished the cut, established a DEXA baseline, and created early training momentum",
          interpretation: "Those are encouraging first steps toward building muscle, but they are too early to confirm a body-composition change",
          whyItMatters: "Your calorie intake is also moving closer to supporting stronger training",
          forwardImplication: "August needs to show that performance and calorie consistency can hold across a full month",
        })
      : sentence({
          observation: "July produced enough useful evidence to keep the current plan steady",
          interpretation: "The early response is encouraging, but another month will make the conclusion more reliable",
        }),
    confidenceExplanation: baseline
      ? sentence({
          observation: "July established a measured starting point",
          interpretation: "We know where this muscle-building phase began, but it is too early to claim new muscle",
          forwardImplication: "A later DEXA will show whether the plan is producing the result we want",
        })
      : sentence({
          observation: "The current confidence reflects the evidence available at the end of the month",
          forwardImplication: "More consistent execution will make the next recommendation more reliable",
        }),
    highlights: [
      training && {
        label: "Training",
        value: "Early momentum",
        detail: "Several key lifts moved forward after the cut",
      },
      baseline && {
        label: "New baseline",
        value: `${baseline.provenance.bodyFat}% body fat`,
        detail: "Future DEXA scans can now be compared with the July 18 baseline",
      },
      energy && {
        label: "Calories",
        value: "Closer to target",
        detail: "August must show that intake can consistently support training",
      },
    ].filter(Boolean),
  };
}

function buildTraining(training, stories) {
  if (!training) return null;
  if (stories.length) {
    const stats = stories.map(performanceStat);
    const improvingCount = training.provenance?.improvingCount ?? stories.length;
    const broadProgress = improvingCount > stories.length;
    return {
      title: sentence({ observation: broadProgress
        ? "Training progressed across the program, with a few lifts standing out"
        : "Training moved forward, with a few lifts standing out" }),
      summary: sentence({
        observation: broadProgress
          ? "Progressive overload appeared across upper- and lower-body work, though some lifts advanced more than others"
          : "Progressive overload appeared in several parts of the program, though it was not perfectly even",
        interpretation: "That breadth is encouraging after finishing the cut, and the standout lifts below provide the clearest examples while other areas may need more time",
      }),
      interpretation: sentence({
        observation: "Progress appeared across the training program rather than in one isolated session",
        interpretation: "The three standout lifts provide the clearest proof of that broader pattern",
        whyItMatters: "Broad progression is encouraging for the muscle-building goal, but it does not yet prove muscle gain",
        forwardImplication: "August should show whether the pattern can continue across the program",
      }),
      stats,
      next: sentence({
        forwardImplication: "August should keep progressive overload moving across the program while the standout lifts remain strong across multiple sessions",
      }),
      selectedPerformanceStories: stories,
    };
  }
  return {
    title: sentence({ observation: "July established the first performance markers for the new phase" }),
    summary: sentence({
      observation: "The available sessions show forward movement, but no canonical movement record was available for a more specific summary",
      interpretation: "Use the next complete performance record to establish a movement-level comparison",
    }),
    interpretation: sentence({
      observation: "Performance is the earliest useful signal in this phase",
      interpretation: "It remains separate from proof of muscle gain",
      whyItMatters: "Specific repeated records will make the next Monthly more decisive",
    }),
    stats: [
      { label: "Signal", value: "Performance", detail: "the first phase indicator" },
      { label: "Limit", value: "No selected record", detail: "movement detail is not yet canonical" },
      { label: "Next test", value: "Repeatable records", detail: "specific progress in August" },
    ],
    next: sentence({
      forwardImplication: "August should produce specific records that can be repeated across a full month",
    }),
  };
}

function buildEnergy(energy, context) {
  if (!energy) return null;
  const balance = context.averageBalance;
  const trend = balance == null
    ? "Your intake is moving closer to a repeatable level for the current workload"
    : `Logged days averaged a ${Math.abs(balance)} calorie deficit, moving intake closer to a repeatable level for the current workload`;
  return {
    title: sentence({ observation: "Are calories supporting the work?" }),
    summary: context.hasMaterialCoverageGap
      ? describeMissingInformationNaturally({
          known: trend,
          missing: "Nutrition logs are still too incomplete to judge that pattern with confidence",
          consequence: "The direction is appropriate, but sustainability cannot be judged from an incomplete record",
          nextStep: "Keep intake and nutrition logging consistent through August so the next recommendation rests on a full month",
        })
      : sentence({
          observation: trend,
          interpretation: "That balance leaves room to support repeated high-quality sessions without forcing a conclusion from scale weight",
          forwardImplication: "August should confirm that the same calorie pattern is consistent enough to sustain the workload",
        }),
    whyItMatters: sentence({
      observation: "Calories are moving closer to matching the month's workload",
      whyItMatters: "A repeatable intake pattern makes workload and recovery more sustainable while weight remains a pacing signal",
      forwardImplication: "Keep intake consistent until a full month shows whether the plan needs adjustment",
    }),
  };
}

function buildBaseline(baseline) {
  if (!baseline) return null;
  return {
    title: sentence({ observation: "July established the baseline for building muscle" }),
    summary: sentence({
      observation: "The July 18 DEXA recorded where you started",
      interpretation: "It established a baseline; it did not prove that you gained muscle",
      whyItMatters: "Future scans can now be compared directly with that measurement",
    }),
    callout: sentence({
      forwardImplication: "The next DEXA will show whether lean mass is increasing while body fat stays controlled",
    }),
  };
}

function buildChanges({ training, energy, weight, energyContextValue }) {
  const themes = [
    training && {
      tone: "training",
      label: "Training",
      title: sentence({ observation: "Performance became the lead early indicator" }),
      body: sentence({
        observation: "Training is telling us more than the scale right now",
        interpretation: "Getting stronger matters more than reacting to day-to-day weight changes, while the scale and calorie pattern still add useful context",
        whyItMatters: "No single signal tells the whole story",
        forwardImplication: "Let them work together until the next DEXA shows whether stronger training is becoming muscle",
      }),
    },
    energy && {
      tone: "energy",
      label: "Calories",
      title: sentence({ observation: "Calorie balance became a sustainability check" }),
      body: energyContextValue.hasMaterialCoverageGap
        ? describeMissingInformationNaturally({
            known: "The available calorie data is moving closer to the intended range",
            missing: "Several nutrition logs are still missing",
            consequence: "That limits how confidently we can judge whether the calorie level is repeatable",
            nextStep: "Keep intake and logging consistent through August before changing the target",
          })
        : sentence({
            observation: `Logged days averaged a ${Math.abs(energyContextValue.averageBalance)} calorie deficit`,
            interpretation: "Use that balance to judge whether the workload can be repeated",
            forwardImplication: "Keep that pattern consistent through August before deciding whether calories should change",
          }),
    },
    weight && {
      tone: "weight",
      label: "Weight",
      title: sentence({ observation: "Scale weight became context, not a verdict" }),
      body: sentence({
        observation: `Weight moved from ${round(weight.provenance.startWeight)} to ${round(weight.provenance.endWeight)} pounds`,
        interpretation: "That is a reason to stay patient, not to force faster gain",
        forwardImplication: "Use the scale to monitor pace while the next DEXA owns the body-composition judgment",
      }),
    },
  ].filter(Boolean);
  return themes.length ? {
    title: sentence({ observation: "July changed how progress should be judged" }),
    themes,
  } : null;
}

function buildMoments({ completion, baseline, training, energy, photos }, trainingStories) {
  const moments = [
    completion && {
      tone: "completion",
      date: completion.provenance.completionDate,
      label: "The cut reached its finish line",
      body: sentence({
        observation: "You finished the cut at 7.7% body fat",
        whyItMatters: "That result closed the fat-loss phase and made it appropriate to shift attention toward building muscle",
      }),
    },
    baseline && {
      tone: "baseline",
      date: baseline.provenance.scanDate,
      label: "The next phase gained a clear baseline",
      body: sentence({
        observation: "The July 18 DEXA established the starting point for building muscle",
        forwardImplication: "Every future scan can now be compared with that measurement",
      }),
    },
    training && {
      tone: "training",
      date: trainingStories[0]?.date ?? training.storyWindow.endDate,
      label: trainingStories.length ? "Broad progression created useful benchmarks" : "Performance gained a concrete reference point",
      body: trainingStories.length ? sentence({
        observation: "Progressive overload became visible across the program, with a few lifts standing out",
        whyItMatters: "Those standout results created concrete benchmarks that will make August's progress easier to compare",
      }) : sentence({
        observation: "July established an early performance reference",
        forwardImplication: "August should replace it with specific repeatable movement records",
      }),
    },
    energy && {
      tone: "energy",
      date: energy.storyWindow.endDate,
      label: "The calorie pattern became sustainable enough to test",
      body: sentence({
        observation: "Intake moved closer to a repeatable level for the current workload",
        forwardImplication: "August should show whether that calorie level can stay consistent across a full month",
      }),
    },
    photos && {
      tone: "photos",
      date: photos.storyWindow.endDate,
      label: "Progress photos showed a steady physique",
      body: sentence({
        observation: "The photos do not show noticeable fat gain or muscle gain yet",
        interpretation: "That is expected this early",
        forwardImplication: "Keep the plan in place and take photos on schedule so changes become easier to judge over time",
      }),
    },
  ].filter(Boolean);
  return moments.length ? {
    title: sentence({ observation: moments.length === 5 ? "Five moments defined July" : `${moments.length} moments defined July` }),
    moments,
  } : null;
}

function buildStrategy({ training, energy }) {
  if (!training && !energy) return null;
  return {
    title: sentence({ observation: "Nothing currently warrants changing course" }),
    thesis: sentence({
      observation: "Training is responding well enough to keep the plan steady, and calories are moving closer to supporting that work",
      interpretation: "Body-composition change needs more time and another objective measurement",
      forwardImplication: "Use August for consistent execution so the next decision can be made with confidence",
    }),
    items: [
      training && {
        tone: "positive",
        label: "Training",
        value: "Keep progressing",
        detail: sentence({ forwardImplication: "Continue progressive overload across the full month" }),
      },
      energy && {
        tone: "watch",
        label: "Calories",
        value: "Keep calories consistent",
        detail: sentence({ forwardImplication: "Give training enough fuel without forcing faster weight gain" }),
      },
      {
        tone: "information",
        label: "Body composition",
        value: "Give it time",
        detail: sentence({ interpretation: "The July DEXA is a starting point, so another scan is needed before judging muscle gain" }),
      },
      {
        tone: "decision",
        label: "Plan",
        value: "Stay with the plan",
        detail: sentence({ forwardImplication: "Keep the current approach steady through August" }),
      },
    ].filter(Boolean),
  };
}

function buildMonthAhead({ training, energy, weight, photos, baseline }, trainingStories) {
  return {
    title: sentence({ observation: "Turn July's signals into repeatable evidence" }),
    thesis: sentence({
      observation: "July established the baseline",
      forwardImplication: "August must turn July's movement records and calorie pattern into results that repeat across the month",
    }),
    guidance: [
      training && {
        tone: "training",
        label: "Training",
        value: "Make progression repeatable",
        detail: sentence({ forwardImplication: trainingStories.length
          ? "Keep progressive overload moving across the program, maintain the standout lifts, and judge the pattern across the month rather than one session"
          : "Establish specific movement records across more than one August session" }),
      },
      energy && {
        tone: "energy",
        label: "Calories",
        value: "Make intake repeatable",
        detail: sentence({ forwardImplication: "Hold calorie intake consistent across logged days so workload and recovery can be judged cleanly" }),
      },
      weight && {
        tone: "weight",
        label: "Weight",
        value: "Stay patient with the scale",
        detail: sentence({ forwardImplication: "Keep weighing in without overreacting to normal fluctuations" }),
      },
      photos && {
        tone: "photos",
        label: "Photos",
        value: "Keep the visual check",
        detail: sentence({ forwardImplication: "Take progress photos on schedule so gradual changes are easier to see" }),
      },
      baseline && {
        tone: "baseline",
        label: "DEXA",
        value: "Use the next scan",
        detail: sentence({ forwardImplication: "The next DEXA will provide the strongest evidence that lean mass is increasing while body fat stays controlled" }),
      },
    ].filter(Boolean),
  };
}

const MONTHLY_SECTION_PURPOSES = Object.freeze([
  { role: "hero", question: "What did this month establish?", uniqueUnderstanding: "The month established a measured starting line and early operating momentum." },
  { role: "training", question: "What specifically improved?", uniqueUnderstanding: "Program-wide progression is the conclusion, and the standout lifts are its clearest examples." },
  { role: "energy", question: "Why can those improvements continue?", uniqueUnderstanding: "Calorie consistency determines whether the workload is sustainable." },
  { role: "newBaseline", question: "How will future success be judged?", uniqueUnderstanding: "Future DEXAs can be compared with the July 18 reference point." },
  { role: "changes", question: "How should progress now be interpreted differently?", uniqueUnderstanding: "Movement, calorie, weight, and DEXA signals now have separate jobs." },
  { role: "moments", question: "Which events will still matter months from now?", uniqueUnderstanding: "Broad progression created durable performance benchmarks for comparison." },
  { role: "monthAhead", question: "What specifically needs to happen next?", uniqueUnderstanding: "Program-wide progression and the calorie pattern must become repeatable in August." },
]);

export function auditMonthlyEditorialUniqueness(model, trainingStories = []) {
  const heroText = JSON.stringify(model.hero ?? {});
  const energyText = JSON.stringify(model.energy ?? {});
  const changesText = JSON.stringify(model.changes ?? {});
  const monthAheadText = JSON.stringify(model.monthAhead ?? {});
  const renderedText = JSON.stringify({
    hero: model.hero,
    training: model.training,
    energy: model.energy,
    newBaseline: model.newBaseline,
    changes: model.changes,
    moments: model.moments,
    monthAhead: model.monthAhead,
  });
  const issues = [
    ...trainingStories
      .filter((story) => heroText.includes(story.exerciseName))
      .map((story) => `hero_consumes_training_detail:${story.exerciseId}`),
    ...(/training (?:is improving|is responding|improved)/i.test(renderedText)
      ? ["repeated_generic_training_conclusion"] : []),
    ...(/progressive overload|training (?:is improving|is responding)/i.test(energyText)
      ? ["energy_repeats_training_conclusion"] : []),
    ...(/progressive overload|training (?:is improving|is responding)/i.test(changesText)
      ? ["changes_repeats_training_conclusion"] : []),
    ...(model.training && trainingStories.length > 0 &&
      model.training.selectedPerformanceStories?.length !== trainingStories.length
      ? ["training_selection_not_preserved"] : []),
    ...(model.training && !/repeat|across more than one/i.test(monthAheadText)
      ? ["month_ahead_not_forward_specific"] : []),
  ];
  return Object.freeze({
    passes: issues.length === 0,
    issues,
    sections: MONTHLY_SECTION_PURPOSES,
    selectedTrainingStoryIds: trainingStories.map((story) => story.id),
  });
}

export function composeMonthlyNarrativeModel({
  confidence = null,
  decision,
  evidence,
}) {
  const candidates = {
    completion: roleCandidate(decision, "goal_completion"),
    baseline: roleCandidate(decision, "new_baseline"),
    energy: roleCandidate(decision, "energy_trend"),
    training: roleCandidate(decision, "training_evolution"),
    weight: roleCandidate(decision, "weight_context"),
    photos: roleCandidate(decision, "photo_progression"),
  };
  const completionDate = evidence.goal?.completionEvent?.completedAt;
  const phaseStartDate = completionDate
    ? addCalendarDays(String(completionDate).slice(0, 10), 1)
    : String((evidence.goal ? resolveCommittedPhaseContext(evidence.goal, { asOf: evidence.previewWindow.endDate }).activePhase?.startedAt : null) ?? evidence.previewWindow.startDate).slice(0, 10);
  const energyContextValue = energyContext(evidence, phaseStartDate);
  const trainingStories = selectMonthlyTrainingPerformanceStories(
    evidence.trainingPerformanceEvents,
  );
  const model = {
    translationVersion: PI_EDITORIAL_TRANSLATION_VERSION,
    confidence,
    hero: buildHero(candidates),
    training: buildTraining(candidates.training, trainingStories),
    energy: buildEnergy(candidates.energy, energyContextValue),
    newBaseline: buildBaseline(candidates.baseline),
    changes: buildChanges({ ...candidates, energyContextValue }),
    moments: buildMoments(candidates, trainingStories),
    strategy: buildStrategy(candidates),
    monthAhead: buildMonthAhead(candidates, trainingStories),
  };
  const uniquenessAudit = auditMonthlyEditorialUniqueness(model, trainingStories);
  if (!uniquenessAudit.passes) {
    throw new Error(`Monthly narrative rejected by uniqueness audit: ${uniquenessAudit.issues.join(" | ")}`);
  }
  const auditedModel = { ...model, editorialUniquenessAudit: uniquenessAudit };
  const audit = auditMonthlyNarrativeModel(auditedModel);
  if (!audit.passes) {
    throw new Error(`Monthly narrative rejected by editorial audit: ${audit.issues.map((issue) => `${issue.path}: ${issue.text}`).join(" | ")}`);
  }
  return Object.freeze({ ...auditedModel, editorialAudit: audit });
}

export function auditMonthlyNarrativeModel(model) {
  const inspected = [
    ...NARRATIVE_PROSE_PATHS.map((path) => ({ path, text: valueAtPath(model, path) })),
    ...(model.hero?.highlights ?? []).map((item, index) => ({ path: `hero.highlights[${index}].detail`, text: item.detail })),
    ...(model.training?.stats ?? []).flatMap((item, index) => [
      { path: `training.stats[${index}].value`, text: item.value },
      { path: `training.stats[${index}].detail`, text: item.detail },
    ]),
    ...(model.changes?.themes ?? []).flatMap((item, index) => [
      { path: `changes.themes[${index}].title`, text: item.title },
      { path: `changes.themes[${index}].body`, text: item.body },
    ]),
    ...(model.moments?.moments ?? []).flatMap((item, index) => [
      { path: `moments.moments[${index}].label`, text: item.label },
      { path: `moments.moments[${index}].body`, text: item.body },
    ]),
    ...(model.strategy?.items ?? []).map((item, index) => ({ path: `strategy.items[${index}].detail`, text: item.detail })),
    ...(model.monthAhead?.guidance ?? []).map((item, index) => ({ path: `monthAhead.guidance[${index}].detail`, text: item.detail })),
  ].filter((item) => typeof item.text === "string" && item.text.trim());
  const canonical = auditPIEditorialVoice(inspected.map((item) => item.text));
  const issues = [
    ...canonical.issues.map((issue) => ({
      ...issue,
      path: inspected.find((item) => item.text === issue.text)?.path ?? "unknown",
    })),
    ...inspected.flatMap((item) => PROHIBITED_MONTHLY_ANALYST_LANGUAGE
      .filter((pattern) => pattern.test(item.text))
      .map((pattern) => ({
        category: "monthly_editorial_contract",
        path: item.path,
        pattern: pattern.source,
        text: item.text,
      }))),
  ];
  return Object.freeze({
    passes: issues.length === 0,
    issues,
    inspectedNarration: inspected,
  });
}

function valueAtPath(value, path) {
  return path.split(".").reduce((current, key) => current?.[key], value);
}

function addCalendarDays(value, days) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
