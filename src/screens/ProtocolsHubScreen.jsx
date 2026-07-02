import Link from "next/link";
import {
  ArrowLeft,
  ChevronRight,
  Dumbbell,
  FlaskConical,
  HeartPulse,
  Leaf,
  Salad,
  ShieldCheck,
  Syringe,
} from "lucide-react";
import Card from "../components/ui/Card";
import IconBadge from "../components/ui/IconBadge";

const categoryMeta = {
  lifestyle: { icon: Leaf, title: "Lifestyle", tone: "success" },
  medication: { icon: FlaskConical, title: "Medications", tone: "evidence" },
  nutrition: { icon: Salad, title: "Nutrition", tone: "success" },
  other: { icon: ShieldCheck, title: "Other", tone: "muted" },
  peptide: { icon: Syringe, title: "Peptides", tone: "effort" },
  recovery: { icon: HeartPulse, title: "Recovery", tone: "evidence" },
  supplement: { icon: Dumbbell, title: "Supplements", tone: "success" },
  training: { icon: Dumbbell, title: "Training", tone: "primary" },
};

export default function ProtocolsHubScreen({ goals, protocols }) {
  const groups = getProtocolGroups(protocols);

  return (
    <main className="app-surface min-h-screen">
      <div className="mx-auto max-w-[393px] px-4 pt-10 pb-28">
        <Link
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]"
          href="/profile"
        >
          <ArrowLeft size={18} />
          You
        </Link>

        <header className="mb-6 space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--primary)]">
            Protocols
          </p>
          <h1 className="text-3xl font-extrabold leading-tight text-[var(--text-primary)]">
            What you are doing.
          </h1>
          <p className="text-sm font-medium leading-6 text-[var(--text-secondary)]">
            Protocols provide context for interpretation. They do not overwrite measured evidence.
          </p>
        </header>

        <div className="space-y-4">
          {groups.map((group) => (
            <ProtocolGroup goals={goals} group={group} key={group.category} />
          ))}
        </div>
      </div>
    </main>
  );
}

function ProtocolGroup({ goals, group }) {
  const meta = categoryMeta[group.category] ?? categoryMeta.other;

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <IconBadge className="rounded-full" color={meta.tone} icon={meta.icon} size="sm" />
          <div>
            <h2 className="text-base font-extrabold text-[var(--text-primary)]">
              {meta.title}
            </h2>
            <p className="text-xs font-semibold text-[var(--text-secondary)]">
              {group.activeCount} active
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {group.protocols.map((protocol) => (
          <Link
            className="flex items-center justify-between gap-3 rounded-[12px] bg-[var(--surface-muted)] p-3"
            href={`/profile/protocols/${protocol.id}?from=protocols`}
            key={protocol.id}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold text-[var(--text-primary)]">
                {protocol.name}
              </p>
              <p className="mt-0.5 truncate text-xs font-semibold text-[var(--text-secondary)]">
                {getProtocolSubtitle(protocol, goals)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="rounded-full bg-[var(--surface-elevated)] px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                {formatLabel(protocol.status)}
              </span>
              <ChevronRight className="text-[var(--text-muted)]" size={16} />
            </div>
          </Link>
        ))}
      </div>
    </Card>
  );
}

function getProtocolGroups(protocols) {
  const order = ["peptide", "supplement", "nutrition", "training", "recovery", "lifestyle", "medication", "other"];

  return order
    .map((category) => {
      const items = protocols.filter((protocol) => protocol.category === category);

      if (items.length === 0) return null;

      return {
        category,
        activeCount: items.filter((protocol) => protocol.status === "active").length,
        protocols: items,
      };
    })
    .filter(Boolean);
}

function getProtocolSubtitle(protocol, goals) {
  const dose = protocol.dose?.value
    ? `${protocol.dose.value} ${protocol.dose.unit ?? protocol.doseUnit ?? ""}`.trim()
    : "Dose pending";
  const supportedGoals = goals.filter((goal) =>
    protocol.relatedGoalIds?.includes(goal.id)
  );

  if (supportedGoals.length === 0) return dose;

  return `${dose} / ${supportedGoals.map((goal) => normalizeGoalTitle(goal.title)).join(", ")}`;
}

function normalizeGoalTitle(title) {
  return String(title ?? "")
    .replace("Visible abs at rest", "Visible Abs")
    .replace("Maintain 8-9% body fat", "Maintenance")
    .replace("Preserve lean mass", "Lean Mass");
}

function formatLabel(value) {
  return String(value ?? "")
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
