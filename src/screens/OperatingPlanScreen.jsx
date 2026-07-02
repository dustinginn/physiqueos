import Link from "next/link";
import {
  ArrowLeft,
  ChevronRight,
  Dumbbell,
  HeartPulse,
  Salad,
  Scale,
  Syringe,
} from "lucide-react";
import Card from "../components/ui/Card";
import IconBadge from "../components/ui/IconBadge";

export default function OperatingPlanScreen({
  nutritionContext,
  protocols,
  reminders,
}) {
  const plan = buildOperatingPlan({ nutritionContext, protocols, reminders });

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
            Operating Plan
          </p>
          <h1 className="text-3xl font-extrabold leading-tight text-[var(--text-primary)]">
            What PhysiqueOS expects.
          </h1>
          <p className="text-sm font-medium leading-6 text-[var(--text-secondary)]">
            Scheduled evidence, recurring actions, and daily expectations that shape the operating loop.
          </p>
        </header>

        <div className="space-y-4">
          {plan.map((section) => (
            <PlanSection key={section.title} section={section} />
          ))}
        </div>
      </div>
    </main>
  );
}

function PlanSection({ section }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <IconBadge className="rounded-full" color={section.tone} icon={section.icon} size="sm" />
          <div>
            <h2 className="text-base font-extrabold text-[var(--text-primary)]">
              {section.title}
            </h2>
            <p className="text-xs font-semibold text-[var(--text-secondary)]">
              {section.subtitle}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {section.items.map((item) => (
          <PlanRow item={item} key={item.id} />
        ))}
      </div>
    </Card>
  );
}

function PlanRow({ item }) {
  const Wrapper = item.href ? Link : "div";
  const wrapperProps = item.href ? { href: item.href } : {};

  return (
    <Wrapper
      className="flex items-center justify-between gap-3 rounded-[12px] bg-[var(--surface-muted)] p-3"
      {...wrapperProps}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-extrabold text-[var(--text-primary)]">
          {item.title}
        </p>
        <p className="mt-0.5 truncate text-xs font-semibold text-[var(--text-secondary)]">
          {item.detail}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="rounded-full bg-[var(--surface-elevated)] px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.06em] text-[var(--text-muted)]">
          {item.status}
        </span>
        {item.href && <ChevronRight className="text-[var(--text-muted)]" size={16} />}
      </div>
    </Wrapper>
  );
}

function buildOperatingPlan({ nutritionContext, protocols, reminders }) {
  const evidenceReminders = reminders.filter(
    (reminder) => reminder.type === "evidence_reminder"
  );
  const recoveryReminders = reminders.filter(
    (reminder) => reminder.type === "recovery_reminder"
  );
  const protocolReminders = reminders.filter(
    (reminder) => reminder.type === "protocol_reminder"
  );
  const supplements = protocols.filter((protocol) => protocol.category === "supplement");

  return [
    {
      icon: Scale,
      title: "Evidence",
      subtitle: `${evidenceReminders.length} scheduled expectations`,
      tone: "evidence",
      items: evidenceReminders.map((reminder) => ({
        id: reminder.id,
        title: reminder.title,
        detail: formatReminderSchedule(reminder),
        href: getEvidenceHref(reminder),
        status: "Scheduled",
      })),
    },
    {
      icon: HeartPulse,
      title: "Recovery",
      subtitle: `${recoveryReminders.length} recurring action`,
      tone: "success",
      items: recoveryReminders.map((reminder) => ({
        id: reminder.id,
        title: reminder.title,
        detail: formatReminderSchedule(reminder),
        href: null,
        status: formatPersistence(reminder.persistenceMode),
      })),
    },
    {
      icon: Syringe,
      title: "Protocol Schedule",
      subtitle: `${protocolReminders.length} protocol references`,
      tone: "effort",
      items: protocolReminders.map((reminder) => {
        const protocol = protocols.find(
          (item) => item.id === reminder.linkedEntityId
        );

        return {
          id: reminder.id,
          title: reminder.title,
          detail: formatReminderSchedule(reminder),
          href: protocol ? `/profile/protocols/${protocol.id}?from=operating-plan` : null,
          status: formatPersistence(reminder.persistenceMode),
        };
      }),
    },
    {
      icon: Dumbbell,
      title: "Supplements",
      subtitle: `${supplements.length} active protocols`,
      tone: "success",
      items: supplements.map((protocol) => ({
        id: protocol.id,
        title: protocol.name,
        detail: formatProtocolSchedule(protocol),
        href: `/profile/protocols/${protocol.id}?from=operating-plan`,
        status: formatPersistence(protocol.status),
      })),
    },
    {
      icon: Salad,
      title: "Nutrition",
      subtitle: "Manual context",
      tone: "primary",
      items: [
        {
          id: "nutrition-calorie-range",
          title: "Calorie Range",
          detail: formatCalorieRange(nutritionContext),
          href: "/progress/nutrition",
          status: "Context",
        },
        {
          id: "nutrition-hydration",
          title: "Hydration",
          detail: "Future expectation",
          href: null,
          status: "Future",
        },
      ],
    },
  ].filter((section) => section.items.length > 0);
}

function getEvidenceHref(reminder) {
  if (reminder.linkedEvidenceType === "weight") return "/progress/weight";
  if (reminder.linkedEvidenceType === "progress_photo") return "/progress/photos";
  if (reminder.linkedEvidenceType === "dexa") return "/progress/dexa";

  return "/progress";
}

function formatReminderSchedule(reminder) {
  const schedule = reminder.schedule ?? {};
  const days =
    schedule.preferredDay ??
    schedule.dayOfWeek ??
    (schedule.daysOfWeek?.length ? schedule.daysOfWeek.map(formatPersistence).join(", ") : "");
  const time = schedule.timeOfDay ? formatPersistence(schedule.timeOfDay) : "";

  return [days && formatPersistence(days), time].filter(Boolean).join(" / ") || "Scheduled";
}

function formatProtocolSchedule(protocol) {
  const schedule = protocol.schedule ?? {};
  const time = schedule.timeOfDay ? formatPersistence(schedule.timeOfDay) : "Timing pending";
  const dose = protocol.dose?.value
    ? `${protocol.dose.value} ${protocol.dose.unit ?? protocol.doseUnit ?? ""}`.trim()
    : "Dose pending";

  return `${dose} / ${time}`;
}

function formatCalorieRange(nutritionContext) {
  const range = nutritionContext?.estimatedDailyCaloricIntake;

  if (!range?.min || !range?.max) return "Range pending";

  return `${range.min}-${range.max} ${range.unit}`;
}

function formatPersistence(value) {
  return String(value || "")
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
