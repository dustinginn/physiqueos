import Link from "next/link";
import {
  ArrowLeft,
  Activity,
  Camera,
  Dumbbell,
  ShieldCheck,
  Sparkles,
  Syringe,
  Target,
  TrendingDown,
} from "lucide-react";
import Card from "../components/ui/Card";
import IconBadge from "../components/ui/IconBadge";
import { FounderRepositories } from "../data/repositories/founderRepositories";
import { GoalEvaluationService } from "../domain/services/GoalEvaluationService";

const GOAL_IDS = {
  maintenance: "goal_maintain_8_9_body_fat",
  leanMass: "goal_preserve_lean_mass",
};

const configs = {
  maintenance: {
    id: GOAL_IDS.maintenance,
    title: "Maintain 8-9% Body Fat",
    statusFallback: "Entering Target Range",
    icon: ShieldCheck,
    color: "success",
    explanation:
      "This objective supports the primary visible-abs goal by ensuring the end state is maintainable, not just temporarily achieved.",
    objectives: [
      "Reach estimated 8-9% body-fat range",
      "Avoid over-cutting",
      "Stabilize weight after the cut",
      "Preserve performance and recovery",
    ],
    coach:
      "Maintenance is about transitioning from fat loss to stability once the primary goal is achieved. The evidence supports continued progress toward the range, but this should not become a second aggressive cut. The next phase is about arriving lean, then proving the result can be held.",
  },
  leanMass: {
    id: GOAL_IDS.leanMass,
    title: "Preserve Lean Mass",
    statusFallback: "Stable",
    icon: Dumbbell,
    color: "effort",
    explanation:
      "This objective protects the quality of the cut. Fat loss is only successful if lean mass, strength, and visual muscularity are preserved as much as possible.",
    objectives: [
      "Preserve DEXA lean mass as much as possible",
      "Maintain resistance training quality",
      "Maintain high protein intake",
      "Watch recovery and excessive fatigue",
    ],
    coach:
      "DEXA remains the highest-confidence lean-mass evidence. Progress photos can support confidence when muscularity and fullness appear preserved, but they do not replace scan evidence. The current picture supports preservation, while the next DEXA remains the cleanest confirmation point.",
  },
};

export default async function SupportingGoalScreen({ from, goalKey }) {
  const config = configs[goalKey] ?? configs.maintenance;
  const data = await getSupportingGoalData(config, goalKey);
  const fromYou = from === "you";

  return (
    <main className="app-surface min-h-screen">
      <div className="mx-auto max-w-[393px] px-4 pt-10 pb-12">
        <Link
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-500"
          href={fromYou ? "/goals?from=you" : "/goals"}
        >
          <ArrowLeft size={18} />
          Goals
        </Link>

        <div className="space-y-4">
          <Hero config={config} data={data} />
          <GoalExplanation config={config} />
          <Objectives objectives={config.objectives} />
          <EvidenceSection evidence={data.evidence} />
          <SupportingProtocols protocols={data.protocols} />
          <CoachPerspective coach={config.coach} />
        </div>
      </div>
    </main>
  );
}

async function getSupportingGoalData(config, goalKey) {
  const user = await FounderRepositories.users.getCurrentUser();
  const userId = user?.id;
  const [
    goals,
    dexaScans,
    weightEntries,
    progressPhotos,
    protocols,
    nutritionContext,
  ] = await Promise.all([
    FounderRepositories.goals.listGoals(userId),
    FounderRepositories.dexaScans.listDEXAScans(userId),
    FounderRepositories.weights.listWeightEntries(userId),
    FounderRepositories.progressPhotos.listPhotos(userId),
    FounderRepositories.protocols.listActiveProtocols(userId),
    FounderRepositories.nutritionContext.getNutritionContext(userId),
  ]);
  const sortedDEXA = sortByDate(dexaScans, "measuredAt");
  const sortedWeights = sortByDate(weightEntries, "measuredAt");
  const evaluations = GoalEvaluationService.getGoalEvaluations({
    goals,
    dexaScans: sortedDEXA,
    weightEntries: sortedWeights,
    progressPhotos,
    protocols,
    nutritionContext,
  });
  const evaluation = evaluations.find((item) => item.goalId === config.id);

  return {
    status: evaluation?.presentation?.status ?? evaluation?.current ?? config.statusFallback,
    confidence: evaluation?.confidence ?? 0,
    confidenceLabel: getConfidenceLabel(evaluation?.confidence ?? 0),
    evidence:
      goalKey === "leanMass"
        ? getLeanMassEvidence({ sortedDEXA, progressPhotos, nutritionContext })
        : getMaintenanceEvidence({ sortedDEXA, sortedWeights, progressPhotos }),
    protocols:
      goalKey === "leanMass"
        ? getLeanMassProtocols({ protocols, nutritionContext })
        : getMaintenanceProtocols({ protocols, nutritionContext }),
  };
}

function Hero({ config, data }) {
  return (
    <Card className="border-[var(--divider)] bg-gradient-to-br from-[color-mix(in_srgb,var(--primary)_10%,var(--surface-elevated))] via-[var(--surface-elevated)] to-[var(--surface-muted)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <span className="inline-flex rounded-full bg-[#EEF2FF] px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#4F46E5]">
            Supporting Goal
          </span>
          <h1 className="mt-3 text-3xl font-extrabold leading-tight text-slate-950">
            {config.title}
          </h1>
          <p className="mt-2 text-sm font-semibold leading-5 text-slate-600">
            {data.status}
          </p>
        </div>
        <div className="w-[92px] shrink-0 text-right">
          <IconBadge icon={config.icon} color={config.color} size="lg" className="ml-auto rounded-full" />
          <p className="mt-3 text-2xl font-extrabold leading-none text-slate-950">
            {data.confidence}%
          </p>
          <p className="mt-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400">
            {data.confidenceLabel}
          </p>
        </div>
      </div>
    </Card>
  );
}

function GoalExplanation({ config }) {
  return (
    <Card className="space-y-2">
      <SectionHeading icon={Target} title="Goal" />
      <p className="text-sm font-medium leading-6 text-slate-600">
        {config.explanation}
      </p>
    </Card>
  );
}

function Objectives({ objectives }) {
  return (
    <Card className="space-y-3">
      <SectionHeading icon={ShieldCheck} title="Objectives" />
      <div className="space-y-2">
        {objectives.map((objective) => (
          <div key={objective} className="rounded-[12px] bg-[var(--surface-muted)] p-3 text-sm font-bold text-slate-800">
            {objective}
          </div>
        ))}
      </div>
    </Card>
  );
}

function EvidenceSection({ evidence }) {
  return (
    <Card className="space-y-3">
      <SectionHeading icon={TrendingDown} title="Evidence" />
      <div className="space-y-2">
        {evidence.map((item) => (
          <div key={item.title} className="rounded-[14px] border border-[var(--divider)] bg-[var(--surface-muted)] p-3">
            <div className="flex items-center gap-2">
              <IconBadge icon={item.icon} color={item.color} size="xs" className="rounded-full" />
              <h2 className="text-base font-extrabold text-slate-950">{item.title}</h2>
            </div>
            <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
              {item.detail}
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function SupportingProtocols({ protocols }) {
  return (
    <Card className="space-y-3">
      <SectionHeading icon={Syringe} title="Supporting Protocols" />
      <div className="space-y-2">
        {protocols.map((protocol) => (
          <div key={protocol.title} className="rounded-[12px] bg-[var(--surface-muted)] p-3">
            <p className="text-sm font-extrabold text-slate-950">{protocol.title}</p>
            <p className="mt-1 text-sm font-medium leading-5 text-slate-600">
              {protocol.detail}
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function CoachPerspective({ coach }) {
  return (
    <Card className="space-y-3 border-[#C7D2FE] bg-[#F8FAFF]">
      <SectionHeading icon={Sparkles} title="Coach's Perspective" />
      <p className="text-sm font-medium leading-6 text-slate-600">{coach}</p>
    </Card>
  );
}

function SectionHeading({ icon, title }) {
  return (
    <div className="flex items-center gap-2">
      <IconBadge icon={icon} color="primary" size="xs" className="rounded-full" />
      <h2 className="text-lg font-bold text-slate-950">{title}</h2>
    </div>
  );
}

function getMaintenanceEvidence({ sortedDEXA, sortedWeights, progressPhotos }) {
  const latestDEXA = sortedDEXA.at(-1);
  const previousDEXA = sortedDEXA.at(-2);
  const latestWeight = sortedWeights.at(-1);
  const firstWeight = sortedWeights[0];
  const bodyFatChange =
    latestDEXA && previousDEXA
      ? Number((latestDEXA.bodyFatPercentage - previousDEXA.bodyFatPercentage).toFixed(1))
      : null;

  return [
    {
      icon: ShieldCheck,
      color: "evidence",
      title: "DEXA trend",
      detail:
        bodyFatChange !== null
          ? `Latest DEXA is ${latestDEXA.bodyFatPercentage.toFixed(1)}%, down ${Math.abs(bodyFatChange).toFixed(1)} points from the prior scan.`
          : "DEXA remains the calibration source for body-fat range.",
    },
    {
      icon: TrendingDown,
      color: "success",
      title: "Weight trend",
      detail:
        latestWeight && firstWeight
          ? `Weight has moved from ${firstWeight.weight.value.toFixed(1)} to ${latestWeight.weight.value.toFixed(1)} ${latestWeight.weight.unit}, supporting movement toward the target range.`
          : "Weight trend is still building.",
    },
    {
      icon: Camera,
      color: "effort",
      title: "Visual trend",
      detail:
        progressPhotos.length > 0
          ? "Progress photos support visible definition and help confirm whether the range is becoming visually maintainable."
          : "Progress photos will add visual validation when available.",
    },
    {
      icon: Activity,
      color: "primary",
      title: "Estimated current range",
      detail:
        "Current body fat between scans remains estimated from DEXA and weight trend, so the goal is progress toward the range rather than claiming maintenance yet.",
    },
  ];
}

function getLeanMassEvidence({ sortedDEXA, progressPhotos, nutritionContext }) {
  const latestDEXA = sortedDEXA.at(-1);
  const previousDEXA = sortedDEXA.at(-2);
  const leanMassChange =
    latestDEXA?.leanMass?.value && previousDEXA?.leanMass?.value
      ? Number((latestDEXA.leanMass.value - previousDEXA.leanMass.value).toFixed(1))
      : null;
  const protein = nutritionContext?.proteinTarget;

  return [
    {
      icon: ShieldCheck,
      color: "evidence",
      title: "DEXA lean-mass trend",
      detail:
        leanMassChange !== null
          ? `Latest DEXA shows ${latestDEXA.leanMass.value.toFixed(1)} ${latestDEXA.leanMass.unit} lean mass, ${leanMassChange.toFixed(1)} ${latestDEXA.leanMass.unit} from the prior scan.`
          : "DEXA is the highest-confidence lean-mass evidence.",
    },
    {
      icon: Camera,
      color: "effort",
      title: "Visual retention",
      detail:
        progressPhotos.length > 0
          ? "Progress photos suggest a strong muscle-retention appearance, especially through V-taper, shoulders, and back definition."
          : "Progress photos will support visual retention assessment when available.",
    },
    {
      icon: Dumbbell,
      color: "success",
      title: "Training consistency",
      detail:
        "Resistance training quality remains an important supporting signal, but it should not replace DEXA confirmation.",
    },
    {
      icon: Activity,
      color: "primary",
      title: "Protein and recovery",
      detail:
        protein?.value
          ? `Protein target is ${protein.value}${protein.unit ?? "g"}, with recovery monitored for excessive fatigue.`
          : "Protein intake and recovery context support interpretation when logged.",
    },
  ];
}

function getMaintenanceProtocols({ protocols, nutritionContext }) {
  return [
    nutritionContext?.estimatedDailyCaloricIntake && {
      title: "Nutrition plan",
      detail: "Current intake range supports the planned deficit without turning maintenance into a second aggressive cut.",
    },
    protocols.find((protocol) => protocol.name === "Retatrutide") && {
      title: "Retatrutide",
      detail: "Relevant as appetite and adherence context, but not treated as direct body-fat evidence.",
    },
    {
      title: "Training consistency",
      detail: "Training and daily activity support the transition from fat loss to stability.",
    },
  ].filter(Boolean);
}

function getLeanMassProtocols({ protocols, nutritionContext }) {
  return [
    protocols.find((protocol) => protocol.name === "Tesamorelin") && {
      title: "Tesamorelin",
      detail: "Relevant lean-mass preservation context during the cut.",
    },
    nutritionContext?.proteinTarget && {
      title: "Protein target",
      detail: "Protein supports the preservation objective when adherence is logged.",
    },
    {
      title: "Resistance training",
      detail: "Training quality is core supporting context for preserving muscle.",
    },
    {
      title: "Recovery work",
      detail: "Recovery helps protect performance as the cut gets leaner.",
    },
  ].filter(Boolean);
}

function sortByDate(records, field) {
  return [...records].sort((a, b) => String(a[field]).localeCompare(String(b[field])));
}

function getConfidenceLabel(confidence) {
  if (confidence >= 80) return "High Confidence";
  if (confidence >= 55) return "Moderate Confidence";

  return "Building Confidence";
}
