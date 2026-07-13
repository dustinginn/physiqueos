import Link from "next/link";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  ClipboardList,
  Dumbbell,
  FileText,
  FileUp,
  NotebookPen,
  Pill,
  Scale,
  Syringe,
  Upload,
} from "lucide-react";
import ActionButton from "../components/ui/ActionButton";
import Card from "../components/ui/Card";
import IconBadge from "../components/ui/IconBadge";
import UploadAnythingForm from "../components/evidence/UploadAnythingForm";

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
  activeSessionId = null,
  completeReminderAction,
  completeSupplementAction,
  contextualizedUpload = false,
  error = null,
  evidenceView = null,
  noteAction,
  objects = null,
  protocols = [],
  reminders = [],
  saved = null,
  historicalUpload = false,
  sessions = [],
  uploadAnythingAction,
  pendingEvidenceReviews = [],
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
  const activeSession =
    sessions.find((session) => session.timeBlock === activeSessionId) ??
    sessions.find((session) => session.id === activeSessionId) ??
    null;

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
              {saved === "intake"
                ? historicalUpload || contextualizedUpload
                  ? `Evidence contextualized${objects ? `: ${objects}` : "."}`
                  : `Evidence processed${objects ? `: ${objects}` : "."}`
                : "Saved."}
            </p>
          )}
          {error && (
            <p className="rounded-[16px] bg-[#FEF2F2] px-3 py-2 text-sm font-bold leading-6 text-[#B91C1C]">
              {formatLogError(error)}
            </p>
          )}
        </header>

        <div className="space-y-4">
          {saved === "intake" && (historicalUpload || contextualizedUpload) && (
            <EvidenceContextualizedComplete
              evidenceView={evidenceView}
              historicalUpload={historicalUpload}
              objects={objects}
            />
          )}

          {activeSession && (
            <SessionChecklist session={activeSession} />
          )}

          {!activeSession && sessions.some((session) => session.pendingCount > 0) && (
            <Card className="space-y-3">
              <SectionHeader icon={ClipboardList} title="Today's Sessions" />
              {sessions
                .filter((session) => session.pendingCount > 0)
                .map((session) => (
                  <LogLink
                    href={`/log?session=${session.timeBlock}`}
                    icon={ClipboardList}
                    key={session.id}
                    label={session.label}
                    subtitle={`${session.completedCount}/${session.totalCount} complete`}
                  />
                ))}
            </Card>
          )}

          {pendingEvidenceReviews.length > 0 && <PendingEvidenceReviews reviews={pendingEvidenceReviews}/>}
          <UploadAnythingCard action={uploadAnythingAction} />

          <Card className="space-y-3">
            <SectionHeader icon={Scale} title="Quick Actions" />
            <div className="grid grid-cols-1 gap-2">
              <LogLink
                href="/check-in/morning"
                icon={Scale}
                label="Morning Weight"
                subtitle="Fast check-in shortcut"
              />
              <LogLink
                href="/evidence/photos"
                icon={Camera}
                label="Progress Photo"
                subtitle="Photo evidence through the shared intake model"
              />
              <LogLink
                href="/evidence/dexa"
                icon={FileUp}
                label="DEXA Upload"
                subtitle="Convenience shortcut; Upload Anything also accepts PDFs"
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

function EvidenceContextualizedComplete({ evidenceView, historicalUpload, objects }) {
  const evidenceHref = getEvidenceViewHref(evidenceView);

  return (
    <Card className="space-y-4 border-[#D1FAE5] bg-[#F0FDF4]">
      <div className="flex items-start gap-3">
        <IconBadge icon={CheckCircle2} color="success" size="md" />
        <div className="min-w-0">
          <h2 className="text-xl font-black leading-tight text-slate-950">
            {historicalUpload ? "Historical evidence uploaded" : "Evidence added to your history"}
          </h2>
          <p className="mt-1 text-sm font-medium leading-6 text-slate-600">
            PhysiqueOS contextualized this against your existing history and updated
            your records{objects ? `: ${objects}` : "."}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <ActionButton href={evidenceHref}>View Evidence</ActionButton>
        <ActionButton href="/">Go Home</ActionButton>
      </div>
    </Card>
  );
}

function getEvidenceViewHref(evidenceView) {
  if (evidenceView === "nutrition") return "/progress/nutrition";
  if (evidenceView === "training") return "/progress/training";
  if (evidenceView === "dexa") return "/progress/dexa";
  if (evidenceView === "photos") return "/progress/photos";

  return "/timeline";
}

function UploadAnythingCard({ action }) {
  return (
    <Card className="space-y-4">
      <div className="flex items-start gap-3">
        <IconBadge icon={Upload} color="primary" size="md" />
        <div>
          <h2 className="text-xl font-black leading-tight text-slate-950">
            Upload Anything
          </h2>
          <p className="mt-1 text-sm font-medium leading-6 text-slate-500">
            Screenshots, PDFs, photos, notes, workouts, nutrition, activity, labs,
            or body composition.
          </p>
        </div>
      </div>

      <UploadAnythingForm action={action}>
        <label className="block rounded-[16px] border border-dashed border-[#C7D2FE] bg-[#F8FAFC] p-4">
          <span className="flex items-center gap-2 text-sm font-extrabold text-slate-950">
            <FileUp size={18} />
            Upload files
          </span>
          <span className="mt-1 block text-xs font-medium leading-5 text-slate-500">
            Add screenshots, PDFs, or photos. Multiple files can be interpreted
            together.
          </span>
          <input
            accept="image/*,application/pdf,.pdf"
            className="mt-3 block w-full text-xs font-semibold text-slate-600 file:mr-3 file:rounded-full file:border-0 file:bg-indigo-600 file:px-3 file:py-2 file:text-xs file:font-bold file:text-white"
            multiple
            name="evidenceFiles"
            type="file"
          />
        </label>

        <label className="block space-y-2 rounded-[16px] border border-[#E5E7EB] bg-[#F8FAFC] p-4">
          <span className="flex items-center gap-2 text-sm font-extrabold text-slate-950">
            <FileText size={18} />
            Add note
          </span>
          <span className="block text-xs font-medium leading-5 text-slate-500">
            Add anything that helps PhysiqueOS understand this evidence.
          </span>
          <textarea
            className="min-h-24 w-full resize-none rounded-[12px] border border-[#E5E7EB] bg-white px-3 py-2 text-sm leading-6 text-slate-950 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
            name="evidenceNote"
            placeholder="Example: Did spider curls 4 x 13 @ 30 lb and EZ bar curls 2 x 12 @ 65 lb..."
          />
        </label>

        <label className="block space-y-2 rounded-[16px] border border-[#E5E7EB] bg-[#F8FAFC] p-4">
          <span className="text-sm font-extrabold text-slate-950">
            Evidence date
          </span>
          <span className="block text-xs font-medium leading-5 text-slate-500">
            Use the date the workout, meal, scan, or activity happened.
          </span>
          <input
            className="w-full rounded-[12px] border border-[#E5E7EB] bg-white px-3 py-2 text-sm font-bold text-slate-950 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
            defaultValue={getTodayKey()}
            name="evidenceDate"
            type="date"
          />
        </label>

        <label className="block rounded-[16px] border border-[#E5E7EB] bg-[#F8FAFC] p-4">
          <span className="flex items-center gap-2 text-sm font-extrabold text-slate-950">
            <Camera size={18} />
            Take photo / upload photo
          </span>
          <span className="mt-1 block text-xs font-medium leading-5 text-slate-500">
            Use your camera for quick visual evidence when supported.
          </span>
          <input
            accept="image/*"
            capture="environment"
            className="mt-3 block w-full text-xs font-semibold text-slate-600 file:mr-3 file:rounded-full file:border-0 file:bg-white file:px-3 file:py-2 file:text-xs file:font-bold file:text-indigo-600"
            name="evidenceFiles"
            type="file"
          />
        </label>

      </UploadAnythingForm>
    </Card>
  );
}

function PendingEvidenceReviews({ reviews }) {
  return <Card className="space-y-3"><SectionHeader icon={ClipboardList} title="Pending evidence reviews"/><p className="text-sm text-slate-500">Uploads are safely saved. Resume a review before it is added to your history.</p>{reviews.map((review)=><Link className="block rounded-[14px] border border-[#E5E7EB] bg-[#F8FAFC] p-3" href={`/evidence/review/${review.id}`} key={review.id}><span className="block text-sm font-extrabold text-slate-950">{review.date} · {review.itemCount} item{review.itemCount===1?"":"s"}</span><span className="mt-1 block text-xs font-medium text-slate-500">{review.evidenceTypes.join(", ")}{review.likelyDuplicate?" · Likely duplicate upload":""}</span></Link>)}</Card>;
}

function SessionChecklist({ session }) {
  const allComplete = session.pendingCount === 0;
  const sessionTime = formatSessionTimeBlock(session.timeBlock);

  return (
    <Card className="space-y-4">
      <SectionHeader icon={ClipboardList} title={session.label} />
      <div>
        <p className="text-sm font-medium leading-6 text-slate-500">
          Complete today&apos;s scheduled {sessionTime} evidence.
        </p>
        <p className="mt-1 text-xs font-bold uppercase tracking-[0.08em] text-indigo-600">
          {session.completedCount}/{session.totalCount} complete
        </p>
      </div>
      <div className="space-y-2">
        {session.items.map((item) => (
          <SessionChecklistItem item={item} key={item.id} />
        ))}
      </div>
      {allComplete ? (
        <ActionButton href="/">Finish Session</ActionButton>
      ) : (
        <p className="text-xs font-medium leading-5 text-slate-500">
          After saving an item, you will return here with the next incomplete item ready.
        </p>
      )}
    </Card>
  );
}

function formatSessionTimeBlock(timeBlock) {
  if (!timeBlock) return "check-in";
  return timeBlock.charAt(0).toLowerCase() + timeBlock.slice(1);
}

function SessionChecklistItem({ item }) {
  const Icon = item.icon === "camera" ? Camera : item.icon === "scale" ? Scale : ClipboardList;
  const content = (
    <>
      <IconBadge icon={item.completed ? CheckCircle2 : Icon} color={item.completed ? "success" : item.color} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-extrabold text-slate-950">
          {item.label}
        </span>
        <span className="block text-xs font-medium leading-5 text-slate-500">
          {item.completed ? "Complete" : [item.subtitle, item.metadata].filter(Boolean).join(" - ")}
        </span>
      </span>
      <span className="text-xs font-bold uppercase tracking-[0.08em] text-indigo-600">
        {item.completed ? "Done" : "Open"}
      </span>
    </>
  );

  if (item.completed) {
    return (
      <div className="flex items-center gap-3 rounded-[14px] border border-[#D1FAE5] bg-[#ECFDF3] px-3 py-3">
        {content}
      </div>
    );
  }

  return (
    <Link
      className="flex items-center gap-3 rounded-[14px] border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-3 transition hover:border-[#C7D2FE]"
      href={item.href}
    >
      {content}
    </Link>
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

function formatLogError(error) {
  if (error === "empty-intake") {
    return "Add a file or note before submitting evidence.";
  }

  if (error === "intake-failed") {
    return "PhysiqueOS saved the attempt, but interpretation needs to be retried.";
  }

  return "Something went wrong while saving evidence.";
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
