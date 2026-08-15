import Link from "next/link";
import { AlertTriangle, ArrowLeft, FileUp, ScanLine, ShieldCheck } from "lucide-react";
import ActionButton from "../components/ui/ActionButton";
import Card from "../components/ui/Card";
import IconBadge from "../components/ui/IconBadge";

const ERROR_COPY = {
  "invalid-pdf": "That file is not a valid PDF. Choose the raw PDF exported by BodySpec.",
  "missing-pdf": "Choose a BodySpec PDF to continue.",
  "pdf-too-large": "That PDF is larger than 50 MB. Choose the original BodySpec report.",
  "writes-paused": "DEXA uploads are temporarily paused for maintenance. Nothing was uploaded; try again when maintenance is complete.",
};

export default function DEXAUploadScreen({ action, errorCode = null }) {
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
          <IconBadge icon={ScanLine} color="evidence" size="md" />
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-indigo-600">
            DEXA Upload
          </p>
          <h1 className="text-3xl font-extrabold leading-tight text-slate-950">
            Upload your BodySpec PDF.
          </h1>
          <p className="text-base leading-7 text-slate-500">
            PhysiqueOS will read the report first. You’ll review and correct the
            extracted measurements before anything is added to your history.
          </p>
        </header>

        {ERROR_COPY[errorCode] && (
          <Card className="mb-4 border-amber-200 bg-amber-50">
            <div className="flex gap-3 text-amber-950">
              <AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0" size={20} />
              <p className="text-sm font-semibold leading-6">{ERROR_COPY[errorCode]}</p>
            </div>
          </Card>
        )}

        <form action={action} className="space-y-4">
          <Card className="space-y-4">
            <FieldLabel icon={FileUp} label="Raw BodySpec PDF" />
            <input
              accept="application/pdf"
              className="block w-full rounded-[16px] border border-[#E5E7EB] bg-white px-4 py-3 text-sm font-semibold text-slate-700 file:mr-4 file:rounded-full file:border-0 file:bg-[#EEF2FF] file:px-3 file:py-2 file:text-sm file:font-bold file:text-[#4F46E5]"
              name="dexaPdf"
              required
              type="file"
            />
          </Card>

          <Card className="space-y-3 bg-[#F8FAFC]">
            <FieldLabel icon={ShieldCheck} label="Review before saving" />
            <p className="text-sm leading-6 text-slate-600">
              Uploading only creates a private review. The scan date and measurements
              stay noncanonical until you inspect them and choose Save included evidence.
            </p>
          </Card>

          <ActionButton type="submit">Upload and Continue to Review</ActionButton>
        </form>
      </div>
    </main>
  );
}

function FieldLabel({ icon, label }) {
  return (
    <div className="flex items-center gap-3">
      <IconBadge icon={icon} color="evidence" size="sm" />
      <p className="text-base font-bold text-slate-950">{label}</p>
    </div>
  );
}
