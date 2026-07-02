import Link from "next/link";
import { ArrowLeft, FileUp, ScanLine, ShieldCheck } from "lucide-react";
import ActionButton from "../components/ui/ActionButton";
import Card from "../components/ui/Card";
import IconBadge from "../components/ui/IconBadge";

export default function DEXAUploadScreen({ action }) {
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
            Confirm calibration evidence.
          </h1>
          <p className="text-base leading-7 text-slate-500">
            Upload the raw PDF, confirm the extracted values, and PhysiqueOS
            will treat the scan as authoritative body-composition evidence.
          </p>
        </header>

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

          <Card className="space-y-4">
            <FieldLabel icon={ShieldCheck} label="Founder-confirmed values" />
            <input
              className="min-h-12 w-full rounded-[14px] border border-[#E5E7EB] bg-white px-3 text-base font-semibold text-slate-950 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
              name="measuredAt"
              required
              type="date"
            />
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Total Mass" name="totalMass" suffix="lb" />
              <NumberField label="Body Fat" name="bodyFatPercentage" suffix="%" />
              <NumberField label="Fat Tissue" name="fatMass" suffix="lb" />
              <NumberField label="Lean Tissue" name="leanMass" suffix="lb" />
              <NumberField label="Bone Mineral" name="boneMineralContent" suffix="lb" />
              <NumberField label="RMR" name="restingMetabolicRate" suffix="kcal" />
              <NumberField label="VAT Mass" name="vatMass" suffix="lb" />
              <NumberField label="VAT Volume" name="vatVolume" suffix="in3" />
            </div>
            <label className="flex items-start gap-3 rounded-[14px] bg-[#F8FAFC] p-3 text-sm font-semibold text-slate-700">
              <input
                className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                name="confirmed"
                required
                type="checkbox"
              />
              <span>
                I confirmed these extracted values.
                <span className="block text-xs font-medium leading-5 text-slate-500">
                  Blank fields will remain unknown. PhysiqueOS will not infer
                  or overwrite them.
                </span>
              </span>
            </label>
          </Card>

          <ActionButton type="submit">Save DEXA Evidence</ActionButton>
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

function NumberField({ label, name, suffix }) {
  return (
    <label className="space-y-1 text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
      <span>{label}</span>
      <div className="flex min-h-12 items-center rounded-[14px] border border-[#E5E7EB] bg-white px-3 focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-100">
        <input
          className="min-w-0 flex-1 bg-transparent text-base font-semibold normal-case tracking-normal text-slate-950 outline-none"
          inputMode="decimal"
          name={name}
          step="0.1"
          type="number"
        />
        <span className="text-xs font-bold normal-case tracking-normal text-slate-400">
          {suffix}
        </span>
      </div>
    </label>
  );
}
