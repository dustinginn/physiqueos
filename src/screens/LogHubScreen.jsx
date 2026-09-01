import Link from "next/link";
import { Activity, ArrowLeft, ClipboardList, Dumbbell, FileText, FileUp, Utensils, Upload } from "lucide-react";
import Card from "../components/ui/Card";
import IconBadge from "../components/ui/IconBadge";
import UploadAnythingForm from "../components/evidence/UploadAnythingForm";

export default function LogHubScreen({
  defaultLogDate,
  directWeighInAction,
  error = null,
  intakeState = null,
  loggedToday = { rows: [] },
  pendingEvidenceReviews = [],
  recoveryContext = null,
  saved = null,
  uploadAnythingAction,
}) {
  return (
    <main className="min-h-screen bg-[#F7F8FA]">
      <div className="mx-auto max-w-[393px] px-4 pb-10 pt-10">
        <Link className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-500" href={recoveryContext?.returnTo ?? "/"}>
          <ArrowLeft size={18} />
          {recoveryContext ? "Back to Morning Check-In" : "Back to Home"}
        </Link>

        <header className="mb-6 space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-indigo-600">Log</p>
          <h1 className="text-3xl font-extrabold leading-tight text-slate-950">What happened?</h1>
          <p className="text-base leading-7 text-slate-500">
            Upload a screenshot, photo, PDF, or note and PhysiqueOS will organize it.
          </p>
          {saved && <p className="rounded-full bg-[#ECFDF3] px-3 py-2 text-sm font-bold text-[#15803D]">Your upload was saved.</p>}
          {intakeState === "received" && (
            <div className="rounded-[16px] bg-[#ECFDF3] px-4 py-3 text-[#15803D]" role="status">
              <p className="text-sm font-extrabold">Upload received</p>
              <p className="mt-1 text-sm font-medium leading-6">PhysiqueOS is reading your evidence. You can leave this page; your review will appear here when it is ready.</p>
            </div>
          )}
          {intakeState === "processing" && (
            <div className="rounded-[16px] bg-[#ECFDF3] px-4 py-3 text-[#15803D]" role="status">
              <p className="text-sm font-extrabold">Upload received</p>
              <p className="mt-1 text-sm font-medium leading-6">PhysiqueOS is reading your evidence. You can leave this page; your review will appear here when it is ready.</p>
            </div>
          )}
          {intakeState === "processing_failed" && (
            <div className="rounded-[16px] bg-amber-50 px-4 py-3 text-amber-800" role="status">
              <p className="text-sm font-extrabold">Upload received</p>
              <p className="mt-1 text-sm font-medium leading-6">Your files are preserved, but PhysiqueOS still needs to finish reading them. Do not upload them again.</p>
            </div>
          )}
          {error && <p className="rounded-[16px] bg-[#FEF2F2] px-3 py-2 text-sm font-bold leading-6 text-[#B91C1C]">{formatLogError(error)}</p>}
        </header>

        <div className="space-y-4">
          <LoggedTodayCard summary={loggedToday} />
          {pendingEvidenceReviews.length > 0 && <PendingEvidenceReviews reviews={pendingEvidenceReviews} />}
          <TrainingLoggerCard />
          <UploadAnythingCard
            action={uploadAnythingAction}
            defaultDate={defaultLogDate}
            directWeighInAction={directWeighInAction}
            recoveryContext={recoveryContext}
          />
        </div>
      </div>
    </main>
  );
}

function TrainingLoggerCard() {
  return (
    <Link className="block" href="/log/training">
      <Card className="transition hover:border-indigo-300" variant="accent">
        <div className="flex items-center gap-3">
          <IconBadge icon={Dumbbell} color="primary" size="md" />
          <span className="min-w-0 flex-1">
            <span className="block text-xl font-black leading-tight text-slate-950">Training Logger</span>
            <span className="mt-1 block text-sm font-medium leading-6 text-slate-500">Start a workout or log a past workout with exercises, sets, variants, and supersets.</span>
          </span>
          <span aria-hidden="true" className="text-xl font-bold text-indigo-600">›</span>
        </div>
      </Card>
    </Link>
  );
}

const LOGGED_TODAY_ICONS = {
  activity: Activity,
  nutrition: Utensils,
  training: Dumbbell,
};

function LoggedTodayCard({ summary }) {
  return (
    <Card className="space-y-1">
      <h2 className="px-1 pb-2 text-base font-extrabold text-slate-950">
        Logged Today
      </h2>
      {summary.rows.map((row) => (
        <LoggedTodayRow key={row.id} row={row} />
      ))}
    </Card>
  );
}

function LoggedTodayRow({ row }) {
  const Icon = LOGGED_TODAY_ICONS[row.id];
  const content = (
    <>
      <Icon aria-hidden="true" className="shrink-0 text-indigo-600" size={18} />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-extrabold uppercase tracking-[0.08em] text-slate-500">
          {row.label}
        </span>
        <span className="mt-0.5 block text-sm font-semibold leading-5 text-slate-950">
          {row.summary}
        </span>
        {row.context && (
          <span className="block text-xs font-medium leading-5 text-slate-500">
            {row.context}
          </span>
        )}
      </span>
    </>
  );
  const className =
    "flex min-h-16 items-center gap-3 rounded-[14px] px-3 py-2.5";

  return row.href ? (
    <Link
      className={`${className} transition hover:bg-[#F8FAFC] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100`}
      href={row.href}
    >
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}

function UploadAnythingCard({ action, defaultDate, directWeighInAction, recoveryContext }) {
  return (
    <Card className="space-y-4">
      <div className="flex items-start gap-3">
        <IconBadge icon={Upload} color="primary" size="md" />
        <div>
          <h2 className="text-xl font-black leading-tight text-slate-950">Upload</h2>
          <p className="mt-1 text-sm font-medium leading-6 text-slate-500">Add one file, several files, or just a note.</p>
        </div>
      </div>

      <UploadAnythingForm
        action={action}
        defaultDate={recoveryContext?.date ?? defaultDate}
        directWeighInAction={directWeighInAction}
      >
        {recoveryContext && <>
          <input name="expectedEvidenceType" type="hidden" value={recoveryContext.expectedEvidenceType}/>
          <input name="recoveryDate" type="hidden" value={recoveryContext.date}/>
          <input name="recoveryEvidenceType" type="hidden" value={recoveryContext.expectedEvidenceType}/>
          {recoveryContext.recoveryIntent && (
            <input name="recoveryIntent" type="hidden" value={recoveryContext.recoveryIntent}/>
          )}
          <input name="recoveryKey" type="hidden" value={recoveryContext.recoveryKey}/>
          <input name="returnTo" type="hidden" value={recoveryContext.returnTo}/>
        </>}
        <label className="block rounded-[16px] border border-dashed border-[#C7D2FE] bg-[#F8FAFC] p-4">
          <span className="flex items-center gap-2 text-sm font-extrabold text-slate-950"><FileUp size={18} />Upload files</span>
          <span className="mt-1 block text-xs font-medium leading-5 text-slate-500">Choose screenshots, photos, or PDFs. You can select more than one.</span>
          <input accept="image/*,application/pdf,.pdf" className="mt-3 block w-full text-xs font-semibold text-slate-600 file:mr-3 file:rounded-full file:border-0 file:bg-indigo-600 file:px-3 file:py-2 file:text-xs file:font-bold file:text-white" multiple name="evidenceFiles" type="file" />
        </label>

        <label className="block space-y-2 rounded-[16px] border border-[#E5E7EB] bg-[#F8FAFC] p-4">
          <span className="flex items-center gap-2 text-sm font-extrabold text-slate-950"><FileText size={18} />Add details</span>
          <span className="block text-xs font-medium leading-5 text-slate-500">Add any details that help PhysiqueOS understand what you&apos;re logging.</span>
          <textarea className="min-h-24 w-full resize-none rounded-[12px] border border-[#E5E7EB] bg-white px-3 py-2 text-sm leading-6 text-slate-950 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" name="evidenceNote" placeholder="Example: Did spider curls 4 x 13 @ 30 lb and EZ bar curls 2 x 12 @ 65 lb..." />
        </label>

      </UploadAnythingForm>
    </Card>
  );
}

function PendingEvidenceReviews({ reviews }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-3"><IconBadge icon={ClipboardList} color="primary" size="sm" /><h2 className="text-base font-extrabold text-slate-950">Uploads ready to review</h2></div>
      <p className="text-sm text-slate-500">Finish checking these uploads before adding them to your history.</p>
      {reviews.map((review) => (
        <Link className="block rounded-[14px] border border-[#E5E7EB] bg-[#F8FAFC] p-3 transition hover:border-[#C7D2FE] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100" href={`/evidence/review/${review.id}`} key={review.id}>
          <span className="block text-sm font-extrabold text-slate-950">{review.title}</span>
          <span className="mt-1 block text-xs font-semibold text-slate-600">{review.date}</span>
          <span className="mt-2 block text-sm font-medium text-slate-600">{review.summary}</span>
          {review.likelyDuplicate && <span className="mt-2 block text-xs font-medium text-amber-700">This may be another copy of an earlier upload.</span>}
          <span className="mt-3 block text-sm font-extrabold text-indigo-600">Review before adding to your history</span>
        </Link>
      ))}
    </Card>
  );
}

function formatLogError(error) {
  if (error === "empty-intake") return "Add a file or note before submitting.";
  if (error === "intake-failed") return "Your upload was saved, but PhysiqueOS could not finish reading it. Please try again.";
  if (error === "writes-paused") return "Writes are temporarily paused for maintenance. Nothing was applied; try again after maintenance completes.";
  return "Something went wrong while saving your upload.";
}
