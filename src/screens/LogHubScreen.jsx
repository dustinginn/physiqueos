import Link from "next/link";
import {
  ArrowLeft,
  Camera,
  ClipboardList,
  Dumbbell,
  FileUp,
  NotebookPen,
  Pill,
  Scale,
  Syringe,
} from "lucide-react";
import ActionButton from "../components/ui/ActionButton";
import Card from "../components/ui/Card";
import IconBadge from "../components/ui/IconBadge";

const DAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

export default function LogHubScreen({
  completeReminderAction,
  completeSupplementAction,
  noteAction,
  protocols = [],
  reminders = [],
  saved = null,
}) {
  const now = new Date();
  const dayName = DAY_NAMES[now.getDay()];
  const todaysReminders = reminders.filter((reminder) =>
    reminderAppliesToday(reminder, dayName)
  );
  const protocolReminders = todaysReminders.filter(
    (reminder) => reminder.type === "protocol_reminder"
  );
  const recoveryReminders = todaysReminders.filter(
    (reminder) => reminder.linkedEvidenceType === "recovery"
  );
  const supplements = protocols.filter(
    (protocol) => protocol.category === "supplement"
  );

  return (
    <main className="min-h-screen bg-[#F7F8FA]">
      <div className="mx-auto max-w-[393px] px-4 pt-10 pb-10">
        <Link
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-500"
          href="/"
        >
          <ArrowLeft size={18} />
          Home
        </Link>

        <header className="mb-6 space-y-2">
          <IconBadge icon={ClipboardList} color="primary" size="md" />
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-indigo-600">
            Log Evidence
          </p>
          <h1 className="text-3xl font-extrabold leading-tight text-slate-950">
            What do you want to log?
          </h1>
          <p className="text-base leading-7 text-slate-500">
            The global capture point for evidence, completions, and quick notes.
          </p>
          {saved && (
            <p className="rounded-full bg-[#ECFDF3] px-3 py-2 text-sm font-bold text-[#15803D]">
              Saved.
            </p>
          )}
        </header>

        <div className="space-y-4">
          <Card className="space-y-3">
            <SectionHeader icon={Scale} title="Evidence" />
            <div className="grid grid-cols-1 gap-2">
              <LogLink
                href="/check-in/morning"
                icon={Scale}
                label="Morning Weight"
                subtitle="Fastest daily check-in"
              />
              <LogLink
                href="/evidence/photos"
                icon={Camera}
                label="Progress Photo"
                subtitle="Front, rear, or side visual evidence"
              />
              <LogLink
                href="/evidence/dexa"
                icon={FileUp}
                label="DEXA Upload"
                subtitle="Parse and confirm a BodySpec PDF"
              />
            </div>
          </Card>

          {(protocolReminders.length > 0 || recoveryReminders.length > 0) && (
            <Card className="space-y-3">
              <SectionHeader icon={Syringe} title="Complete Scheduled Items" />
              {[...protocolReminders, ...recoveryReminders].map((reminder) => (
                <CompletionForm
                  key={reminder.id}
                  action={completeReminderAction}
                  hiddenName="reminderId"
                  hiddenValue={reminder.id}
                  icon={reminder.type === "protocol_reminder" ? Syringe : Dumbbell}
                  label={reminder.title}
                  subtitle={formatReminderSubtitle(reminder)}
                />
              ))}
            </Card>
          )}

          {supplements.length > 0 && (
            <Card className="space-y-3">
              <SectionHeader icon={Pill} title="Supplement Completion" />
              {supplements.map((protocol) => (
                <CompletionForm
                  key={protocol.id}
                  action={completeSupplementAction}
                  hiddenName="protocolId"
                  hiddenValue={protocol.id}
                  icon={Pill}
                  label={protocol.name}
                  subtitle={formatDose(protocol.dose)}
                />
              ))}
            </Card>
          )}

          <Card className="space-y-3">
            <SectionHeader icon={NotebookPen} title="Quick Note" />
            <NoteForm action={noteAction} noteType="nutrition" title="Nutrition Note" />
            <NoteForm action={noteAction} noteType="training" title="Training Note" />
            <NoteForm action={noteAction} noteType="general" title="General Note" />
          </Card>

          <ActionButton href="/">Return Home</ActionButton>
        </div>
      </div>
    </main>
  );
}

function LogLink({ href, icon, label, subtitle }) {
  const Icon = icon;

  return (
    <Link
      className="flex items-center gap-3 rounded-[14px] border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-3 transition hover:border-[#C7D2FE]"
      href={href}
    >
      <IconBadge icon={Icon} color="primary" size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-extrabold text-slate-950">
          {label}
        </span>
        <span className="block text-xs font-medium leading-5 text-slate-500">
          {subtitle}
        </span>
      </span>
    </Link>
  );
}

function CompletionForm({
  action,
  hiddenName,
  hiddenValue,
  icon,
  label,
  subtitle,
}) {
  const Icon = icon;

  return (
    <form action={action}>
      <input name={hiddenName} type="hidden" value={hiddenValue} />
      <button
        className="flex w-full items-center gap-3 rounded-[14px] border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-3 text-left transition hover:border-[#C7D2FE]"
        type="submit"
      >
        <IconBadge icon={Icon} color="effort" size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-extrabold text-slate-950">
            {label}
          </span>
          {subtitle && (
            <span className="block text-xs font-medium leading-5 text-slate-500">
              {subtitle}
            </span>
          )}
        </span>
        <span className="text-xs font-bold uppercase tracking-[0.08em] text-indigo-600">
          Done
        </span>
      </button>
    </form>
  );
}

function NoteForm({ action, noteType, title }) {
  return (
    <form action={action} className="space-y-2 rounded-[14px] border border-[#E5E7EB] bg-[#F8FAFC] p-3">
      <input name="noteType" type="hidden" value={noteType} />
      <label className="block space-y-2">
        <span className="text-sm font-extrabold text-slate-950">{title}</span>
        <textarea
          className="min-h-20 w-full resize-none rounded-[12px] border border-[#E5E7EB] bg-white px-3 py-2 text-sm leading-6 text-slate-950 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
          name="note"
          placeholder="Add context..."
          required
        />
      </label>
      <button
        className="text-sm font-bold text-indigo-600"
        type="submit"
      >
        Save note
      </button>
    </form>
  );
}

function SectionHeader({ icon, title }) {
  return (
    <div className="flex items-center gap-3">
      <IconBadge icon={icon} color="primary" size="sm" />
      <h2 className="text-base font-extrabold text-slate-950">{title}</h2>
    </div>
  );
}

function reminderAppliesToday(reminder, dayName) {
  if (isSameLocalDate(reminder.completedAt, getTodayKey())) return false;
  if (reminder.schedule?.type === "daily" || reminder.schedule?.cadence === "daily") {
    return true;
  }

  const daysOfWeek = reminder.schedule?.daysOfWeek ?? [];

  if (daysOfWeek.length > 0) return daysOfWeek.includes(dayName);

  return reminder.schedule?.dayOfWeek === dayName;
}

function formatReminderSubtitle(reminder) {
  const time = formatTimeOfDay(reminder.schedule?.timeOfDay);
  const mode = String(reminder.persistenceMode ?? "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

  return [time, mode].filter(Boolean).join(" · ");
}

function formatTimeOfDay(value) {
  if (!value) return null;
  if (value === "morning" || value === "night") {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  const [hourText, minuteText] = value.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText ?? 0);

  if (!Number.isFinite(hour)) return value;

  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function formatDose(dose) {
  if (!dose?.value || !dose?.unit) return null;

  return `${dose.value} ${dose.unit}`;
}

function getTodayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function isSameLocalDate(value, dateKey) {
  if (!value) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return value === dateKey;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10) === dateKey;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}` === dateKey;
}
