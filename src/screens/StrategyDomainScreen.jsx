import Link from "next/link";
import { Activity, ArrowLeft, Dumbbell, Syringe } from "lucide-react";
import Card from "../components/ui/Card";
import IconBadge from "../components/ui/IconBadge";
import { resolvePeptideDose, formatPeptideDose, formatPeptideExecutionSummary } from "../domain/services/ExecutionPhaseResolver";
import { formatSupplementExecutionSummary } from "../domain/services/SupplementExecutionManagementService";
import { formatExecutionSchedule } from "./OperatingPlanScreen";

const DOMAIN_PRESENTATION = Object.freeze({
  recovery: {
    title: "Recovery Strategy",
    collectionTitle: "Current Recovery Methods",
    helperCopy: "Your current recovery strategy is supported by the following methods.",
    icon: Activity,
    tone: "success",
  },
  peptide: {
    title: "Peptide Strategy",
    collectionTitle: "Current Peptides",
    helperCopy: "The following peptides currently support this strategy.",
    icon: Syringe,
    tone: "effort",
  },
  supplement: {
    title: "Supplement Strategy",
    collectionTitle: "Current Supplements",
    helperCopy: "The following supplements currently support this strategy.",
    icon: Dumbbell,
    tone: "success",
  },
});

export default function StrategyDomainScreen({
  category,
  executionItems = [],
  goals = [],
  localDate,
  protocols = [],
  versions = [],
}) {
  const model = buildStrategyDomainModel({
    category,
    executionItems,
    goals,
    localDate,
    protocols,
    versions,
  });
  const presentation = DOMAIN_PRESENTATION[category];
  const Icon = presentation.icon;

  return (
    <main className="app-surface min-h-screen">
      <div className="mx-auto max-w-[393px] px-4 pb-28 pt-10">
        <Link
          className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]"
          href="/profile/operating-plan"
        >
          <ArrowLeft size={18} />
          Operating Plan
        </Link>

        <header className="mb-6 space-y-3">
          <div className="flex items-start gap-3">
            <IconBadge className="rounded-full" color={presentation.tone} icon={Icon} size="lg" />
            <div className="min-w-0">
              <h1 className="text-3xl font-extrabold leading-tight text-[var(--text-primary)]">
                {presentation.title}
              </h1>
            </div>
          </div>
        </header>

        <div className="space-y-5">
          <Card className="space-y-2" variant="accent">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--primary)]">
              Purpose
            </p>
            <p className="text-sm font-semibold leading-6 text-[var(--text-primary)]">
              {model.purpose}
            </p>
            {model.supportingLine && (
              <p className="text-xs font-semibold text-[var(--text-secondary)]">
                {model.supportingLine}
              </p>
            )}
          </Card>

          <section className="space-y-3">
            <div className="space-y-1 px-1">
              <h2 className="text-xl font-extrabold text-[var(--text-primary)]">
                {presentation.collectionTitle}
              </h2>
              <p className="text-sm font-medium leading-6 text-[var(--text-secondary)]">
                {model.helperCopy}
              </p>
            </div>

            {model.methods.length ? (
              model.methods.map((method) => (
                <SupportMethodCard category={category} key={method.id} method={method} />
              ))
            ) : (
              <Card>
                <p className="text-sm font-semibold text-[var(--text-secondary)]">
                  No support methods are currently included in this strategy.
                </p>
              </Card>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function SupportMethodCard({ category, method }) {
  return (
    <Card className="space-y-4">
      <div>
        <h3 className="text-lg font-extrabold text-[var(--text-primary)]">{method.name}</h3>
        <p className="mt-1 text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--text-muted)]">
          {category === "peptide" ? "Strategic role" : "Purpose"}
        </p>
        <p className="mt-1 text-sm font-medium leading-6 text-[var(--text-secondary)]">
          {method.purpose}
        </p>
      </div>

      <SupportDetail label="Current support summary" value={method.supportSummary} />

      {category === "peptide" && (
        <div className="grid grid-cols-2 gap-2">
          <SupportDetail label="Current dose" value={method.currentDose} />
          <SupportDetail label="Current schedule" value={method.currentSchedule} />
        </div>
      )}

      <Link
        className="flex min-h-12 items-center justify-center rounded-2xl bg-[var(--primary)] px-4 text-sm font-extrabold text-white"
        href={method.editSupportHref}
      >
        Edit Support
      </Link>
    </Card>
  );
}

function SupportDetail({ label, value }) {
  return (
    <div className="rounded-[12px] bg-[var(--surface-muted)] p-3">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[var(--text-muted)]">
        {label}
      </p>
      <p className="mt-1 text-sm font-extrabold leading-5 text-[var(--text-primary)]">
        {value}
      </p>
    </div>
  );
}

export function buildStrategyDomainModel({
  category,
  executionItems = [],
  goals = [],
  localDate,
  protocols = [],
  versions = [],
} = {}) {
  const presentation = DOMAIN_PRESENTATION[category];
  if (!presentation) return null;

  const activeProtocols = protocols.filter(
    (protocol) => protocol.category === category && protocol.status === "active"
  );
  const linkedActiveGoals = goals.filter(
    (goal) => goal.status === "active" && activeProtocols.some((protocol) => protocol.relatedGoalIds?.includes(goal.id))
  );
  const activeGoal = linkedActiveGoals.find((goal) => goal.primary === true)
    ?? goals.find((goal) => goal.status === "active" && goal.primary === true)
    ?? linkedActiveGoals[0]
    ?? null;
  const versionByProtocolId = new Map(versions.map((version) => [version?.protocolId, version]));
  const goalLabel = formatGoalLabel(activeGoal?.title);
  const goalReference = goalLabel ? `your ${goalLabel}` : "your current strategy";

  return Object.freeze({
    category,
    goalTitle: activeGoal?.title ?? null,
    helperCopy: presentation.helperCopy,
    purpose: strategyPurpose(category, goalReference),
    supportingLine: goalLabel ? `Supporting your ${goalLabel}.` : null,
    methods: activeProtocols.map((protocol) => buildSupportMethod({
      category,
      executionItem: findExecutionItem({ category, executionItems, protocol }),
      goalReference,
      localDate,
      protocol,
      version: versionByProtocolId.get(protocol.id) ?? null,
    })),
  });
}

function buildSupportMethod({ category, executionItem, goalReference, localDate, protocol, version }) {
  if (category === "peptide") {
    const current = resolvePeptideDose(executionItem, localDate).current;
    return Object.freeze({
      id: protocol.id,
      name: protocol.name,
      purpose: peptideStrategicRole(protocol, goalReference),
      supportSummary: formatPeptideExecutionSummary(executionItem, localDate),
      currentDose: current ? formatPeptideDose(current.dose) : "No active phase",
      currentSchedule: formatPeptideSchedule(executionItem, localDate),
      editSupportHref: `/profile/operating-plan/execution/peptides/${encodeURIComponent(protocol.id)}?edit=1`,
    });
  }

  if (category === "supplement") {
    return Object.freeze({
      id: protocol.id,
      name: protocol.name,
      purpose: supplementPurpose(protocol, version, goalReference),
      supportSummary: formatSupplementExecutionSummary(executionItem),
      editSupportHref: `/profile/operating-plan/execution/supplements/${encodeURIComponent(protocol.id)}?edit=1`,
    });
  }

  return Object.freeze({
    id: protocol.id,
    name: protocol.name,
    purpose: recoveryMethodPurpose(protocol, goalReference),
    supportSummary: executionItem ? formatExecutionSchedule(executionItem) : "Not configured",
    editSupportHref: executionItem
      ? `/profile/operating-plan/execution/${encodeURIComponent(executionItem.id)}`
      : "/profile/operating-plan",
  });
}

function findExecutionItem({ category, executionItems, protocol }) {
  return executionItems.find((item) => {
    if (item.active !== true) return false;
    const linked = [item.protocolRootId, item.linkedProtocolId].includes(protocol.id);
    if (category === "peptide") {
      return linked && ["peptide", "protocol"].includes(item.type);
    }
    if (category === "supplement") {
      return linked && item.type === "supplement";
    }
    return linked && item.type === "recovery";
  }) ?? null;
}

function formatPeptideSchedule(item, localDate) {
  if (!item) return "Not configured";
  return formatPeptideExecutionSummary({ ...item, timeline: [] }, localDate);
}

function strategyPurpose(category, goalReference) {
  if (category === "recovery") {
    return `Support consistent training and day-to-day readiness as you work toward ${goalReference}.`;
  }
  if (category === "peptide") {
    return `Coordinate the current peptide plan around the recovery, appetite, and body-composition needs of ${goalReference}.`;
  }
  return `Provide consistent nutrition, hydration, training, and recovery support for ${goalReference}.`;
}

function peptideStrategicRole(protocol, goalReference) {
  if (protocol.name === "Retatrutide") {
    return `Support nutrition consistency and body-composition direction as you work toward ${goalReference}.`;
  }
  if (protocol.name === "Tesamorelin") {
    return `Support recovery and training consistency as you work toward ${goalReference}.`;
  }
  return `Provide targeted peptide support within ${goalReference}.`;
}

function recoveryMethodPurpose(protocol, goalReference) {
  if (protocol.name === "Foam Rolling") {
    return `Support movement quality and readiness so training stays consistent with ${goalReference}.`;
  }
  return `Support recovery quality and training readiness within ${goalReference}.`;
}

function supplementPurpose(protocol, version, goalReference) {
  const configured = version?.supplementStrategy?.purpose;
  const defaults = {
    Electrolytes: `Support hydration and electrolyte consistency across the training and recovery demands of ${goalReference}.`,
    "Fadogia Agrestis": `Support consistency in the supplement plan accompanying ${goalReference}.`,
    Multivitamin: `Provide foundational micronutrient coverage while you work toward ${goalReference}.`,
    "Tongkat Ali": `Support consistency in the supplement plan accompanying ${goalReference}.`,
  };
  return defaults[protocol.name]
    ?? (configured ? `${withoutTerminalPunctuation(configured)} as part of ${goalReference}.` : null)
    ?? `Provide targeted supplemental support within ${goalReference}.`;
}

function formatGoalLabel(title) {
  const value = String(title ?? "").trim();
  if (!value) return null;
  const withoutGoalSuffix = value.replace(/\s+goal$/i, "");
  return `${withoutGoalSuffix} goal`;
}

function withoutTerminalPunctuation(value) {
  return String(value).trim().replace(/[.!?]+$/, "");
}
