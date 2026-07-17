import Link from "next/link";
import { ArrowLeft, ClipboardList, FileText, FileUp, Upload } from "lucide-react";
import Card from "../components/ui/Card";
import IconBadge from "../components/ui/IconBadge";
import UploadAnythingForm from "../components/evidence/UploadAnythingForm";

export default function LogHubScreen({
  error = null,
  pendingEvidenceReviews = [],
  saved = null,
  uploadAnythingAction,
}) {
  return (
    <main className="min-h-screen bg-[#F7F8FA]">
      <div className="mx-auto max-w-[393px] px-4 pb-10 pt-10">
        <Link className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-500" href="/">
          <ArrowLeft size={18} />
          Back to Home
        </Link>

        <header className="mb-6 space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-indigo-600">Log</p>
          <h1 className="text-3xl font-extrabold leading-tight text-slate-950">What happened?</h1>
          <p className="text-base leading-7 text-slate-500">
            Upload a screenshot, photo, PDF, or note and PhysiqueOS will organize it.
          </p>
          {saved && <p className="rounded-full bg-[#ECFDF3] px-3 py-2 text-sm font-bold text-[#15803D]">Your upload was saved.</p>}
          {error && <p className="rounded-[16px] bg-[#FEF2F2] px-3 py-2 text-sm font-bold leading-6 text-[#B91C1C]">{formatLogError(error)}</p>}
        </header>

        <div className="space-y-4">
          {pendingEvidenceReviews.length > 0 && <PendingEvidenceReviews reviews={pendingEvidenceReviews} />}
          <UploadAnythingCard action={uploadAnythingAction} />
        </div>
      </div>
    </main>
  );
}

function UploadAnythingCard({ action }) {
  return (
    <Card className="space-y-4">
      <div className="flex items-start gap-3">
        <IconBadge icon={Upload} color="primary" size="md" />
        <div>
          <h2 className="text-xl font-black leading-tight text-slate-950">Upload</h2>
          <p className="mt-1 text-sm font-medium leading-6 text-slate-500">Add one file, several files, or just a note.</p>
        </div>
      </div>

      <UploadAnythingForm action={action}>
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

        <label className="block space-y-2 rounded-[16px] border border-[#E5E7EB] bg-[#F8FAFC] p-4">
          <span className="text-sm font-extrabold text-slate-950">When did this happen?</span>
          <span className="block text-xs font-medium leading-5 text-slate-500">Use the date the workout, meal, scan, or activity happened.</span>
          <input className="w-full rounded-[12px] border border-[#E5E7EB] bg-white px-3 py-2 text-sm font-bold text-slate-950 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" defaultValue={getTodayKey()} name="evidenceDate" type="date" />
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
  return "Something went wrong while saving your upload.";
}

function getTodayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
