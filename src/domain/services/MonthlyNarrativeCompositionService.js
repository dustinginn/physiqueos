import {
  PI_EDITORIAL_TRANSLATION_VERSION,
  auditPIEditorialVoice,
  composePIEditorialParagraph,
  describeMissingInformationNaturally,
} from "./PIEditorialTranslationService";

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

function buildHero({ baseline, energy, training }) {
  return {
    title: baseline
      ? sentence({ observation: "July established the starting line for building muscle" })
      : sentence({ observation: "July clarified what should carry forward" }),
    thesis: baseline && energy && training
      ? sentence({
          observation: "You finished the cut, established a DEXA baseline, and began seeing progressive overload across your training",
          interpretation: "Those are encouraging first steps toward building muscle, but they are too early to confirm a body-composition change",
          whyItMatters: "Your calorie intake is also moving closer to supporting stronger training",
          forwardImplication: "August needs to show that both training progress and calorie consistency can hold across a full month",
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
        value: "Progressive overload",
        detail: "Progress is appearing across the body, the most encouraging early sign after the cut",
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

function buildTraining(training) {
  if (!training) return null;
  return {
    title: sentence({ observation: "Training is giving you something useful to build on" }),
    summary: sentence({
      observation: "Progressive overload is appearing across muscle groups, even though progress is not perfectly even",
      interpretation: "That unevenness is normal and this is an encouraging place to begin after finishing a cut",
    }),
    interpretation: sentence({
      observation: "Stronger training is the first useful sign that the muscle-building plan may be working",
      interpretation: "July did not prove that you gained muscle",
      whyItMatters: "The early performance response is strong enough to keep the plan steady",
    }),
    stats: [
      { label: "Pattern", value: "Progressive overload", detail: "appearing across muscle groups" },
      { label: "Context", value: "Early response", detail: "encouraging after the cut" },
      { label: "Next test", value: "Full month", detail: "consistent progress in August" },
    ],
    next: sentence({
      forwardImplication: "August should show whether you can keep progressing consistently across a full month",
    }),
  };
}

function buildEnergy(energy, context) {
  if (!energy) return null;
  const balance = context.averageBalance;
  const trend = balance == null
    ? "Your intake is moving closer to the amount needed to support stronger training"
    : `Your intake is moving closer to supporting stronger training, with logged days averaging a ${Math.abs(balance)} calorie deficit`;
  return {
    title: sentence({ observation: "Are calories supporting the work?" }),
    summary: context.hasMaterialCoverageGap
      ? describeMissingInformationNaturally({
          known: trend,
          missing: "Nutrition logs are still too incomplete to judge that pattern with confidence",
          consequence: "The direction is appropriate for this early stage, but the plan needs a more consistent record before calories should change",
          nextStep: "Keep intake and nutrition logging consistent through August so the next recommendation rests on a full month",
        })
      : sentence({
          observation: trend,
          interpretation: "That is appropriate at this early point because training is improving without evidence that weight is rising too quickly",
          forwardImplication: "August should confirm that the same calorie pattern can support continued progress",
        }),
    whyItMatters: sentence({
      observation: "Calories are moving closer to matching the demands of training",
      whyItMatters: "Enough fuel helps progressive overload continue while patient weight gain keeps body fat controlled",
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
      title: sentence({ observation: "Progressive overload is appearing across muscle groups" }),
      body: sentence({
        interpretation: "Progress is moving at different rates, which is normal after a cut",
        whyItMatters: "Stronger training is the first useful sign that the muscle-building plan may be working, but it does not yet prove muscle gain",
      }),
    },
    energy && {
      tone: "energy",
      label: "Calories",
      title: sentence({ observation: "Calorie intake is becoming more supportive of training" }),
      body: energyContextValue.hasMaterialCoverageGap
        ? describeMissingInformationNaturally({
            known: "The available calorie data is moving closer to supporting stronger training",
            missing: "Several nutrition logs are still missing",
            consequence: "That limits how confidently we can judge whether the calorie level is repeatable",
            nextStep: "Keep intake and logging consistent through August before changing the target",
          })
        : sentence({
            observation: `Logged days averaged a ${Math.abs(energyContextValue.averageBalance)} calorie deficit`,
            interpretation: "Intake is moving closer to supporting training",
            forwardImplication: "Keep that pattern consistent through August before deciding whether calories should change",
          }),
    },
    weight && {
      tone: "weight",
      label: "Weight",
      title: sentence({ observation: "Body weight stayed controlled while training improved" }),
      body: sentence({
        observation: `Weight moved from ${round(weight.provenance.startWeight)} to ${round(weight.provenance.endWeight)} pounds`,
        interpretation: "That is a reason to stay patient, not to force faster gain",
        forwardImplication: "Use the scale as context while training and the next DEXA provide the stronger evidence",
      }),
    },
  ].filter(Boolean);
  return themes.length ? {
    title: sentence({ observation: "July changed how progress should be judged" }),
    themes,
  } : null;
}

function buildMoments({ completion, baseline, training, energy, photos }) {
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
      date: training.storyWindow.endDate,
      label: "Progressive overload began appearing",
      body: sentence({
        observation: "Training progress is appearing across muscle groups",
        interpretation: "That is the most encouraging early sign that your body is responding well after the cut",
      }),
    },
    energy && {
      tone: "energy",
      date: energy.storyWindow.endDate,
      label: "Calories moved closer to supporting training",
      body: sentence({
        observation: "Intake moved closer to the amount needed for stronger training",
        forwardImplication: "August should show whether that calorie level can stay consistent",
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

function buildMonthAhead({ training, energy, weight, photos, baseline }) {
  return {
    title: sentence({ observation: "Build on July's early response" }),
    thesis: sentence({
      observation: "July established the baseline",
      forwardImplication: "Keep training and calorie intake consistent through August so the early progress has time to become a reliable pattern",
    }),
    guidance: [
      training && {
        tone: "training",
        label: "Training",
        value: "Keep progressing",
        detail: sentence({ forwardImplication: "Build on the early response with progressive overload across the month" }),
      },
      energy && {
        tone: "energy",
        label: "Calories",
        value: "Fuel training consistently",
        detail: sentence({ forwardImplication: "Keep intake consistent enough to support stronger training" }),
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
    : String(evidence.goal?.phases?.find((phase) => phase.status === "active")?.startDate ?? evidence.previewWindow.startDate).slice(0, 10);
  const energyContextValue = energyContext(evidence, phaseStartDate);
  const model = {
    translationVersion: PI_EDITORIAL_TRANSLATION_VERSION,
    confidence,
    hero: buildHero(candidates),
    training: buildTraining(candidates.training),
    energy: buildEnergy(candidates.energy, energyContextValue),
    newBaseline: buildBaseline(candidates.baseline),
    changes: buildChanges({ ...candidates, energyContextValue }),
    moments: buildMoments(candidates),
    strategy: buildStrategy(candidates),
    monthAhead: buildMonthAhead(candidates),
  };
  const audit = auditMonthlyNarrativeModel(model);
  if (!audit.passes) {
    throw new Error(`Monthly narrative rejected by editorial audit: ${audit.issues.map((issue) => `${issue.path}: ${issue.text}`).join(" | ")}`);
  }
  return Object.freeze({ ...model, editorialAudit: audit });
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
