import Link from "next/link";
import { ArrowLeft, Camera, ImageUp, ShieldCheck } from "lucide-react";
import ActionButton from "../components/ui/ActionButton";
import Card from "../components/ui/Card";
import IconBadge from "../components/ui/IconBadge";

export default function ProgressPhotoUploadScreen({ action, defaultDate = "" }) {
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
          <IconBadge icon={Camera} color="evidence" size="md" />
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-indigo-600">
            Progress Photos
          </p>
          <h1 className="text-3xl font-extrabold leading-tight text-slate-950">
            Add visual evidence.
          </h1>
          <p className="text-base leading-7 text-slate-500">
            Upload front or rear photos using Founder defaults. Visual evidence
            supports Visible Abs without replacing DEXA or weight data.
          </p>
        </header>

        <form action={action} className="space-y-4">
          <Card className="space-y-4">
            <FieldLabel icon={ImageUp} label="Photo" />
            <input
              accept="image/*"
              className="block w-full rounded-[16px] border border-[#E5E7EB] bg-white px-4 py-3 text-sm font-semibold text-slate-700 file:mr-4 file:rounded-full file:border-0 file:bg-[#EEF2FF] file:px-3 file:py-2 file:text-sm file:font-bold file:text-[#4F46E5]"
              name="photo"
              required
              type="file"
            />
            <p className="text-xs font-medium leading-5 text-slate-500">
              On iPhone, this opens the photo library and can offer camera capture
              depending on Safari/PWA permissions.
            </p>
          </Card>

          <Card className="space-y-4">
            <FieldLabel icon={ShieldCheck} label="Photo metadata" />
            <input
              className="min-h-12 w-full rounded-[14px] border border-[#E5E7EB] bg-white px-3 text-base font-semibold text-slate-950 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
              name="capturedAt"
              required
              type="date"
              defaultValue={defaultDate}
            />
            <div className="grid grid-cols-2 gap-3">
              <Select label="View" name="view">
                <option value="front">Front</option>
                <option value="back">Rear</option>
                <option value="side">Side</option>
              </Select>
              <Select label="Pose" name="pose">
                <option value="relaxed">Relaxed</option>
                <option value="double_biceps">Double biceps</option>
              </Select>
            </div>
            <details className="rounded-[14px] border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-3">
              <summary className="cursor-pointer text-sm font-bold text-slate-700">
                Different conditions?
              </summary>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Defaults are morning, fasted, same lighting, same mirror, no
                pump, and no post-workout effect.
              </p>
              <textarea
                className="mt-3 min-h-20 w-full resize-none rounded-[12px] border border-[#E5E7EB] bg-white px-3 py-2 text-sm leading-6 text-slate-950 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                name="notes"
                placeholder="Optional override notes"
              />
            </details>
          </Card>

          <ActionButton type="submit">Save Photo Evidence</ActionButton>
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

function Select({ label, name, children }) {
  return (
    <label className="space-y-1 text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
      <span>{label}</span>
      <select
        className="min-h-12 w-full rounded-[14px] border border-[#E5E7EB] bg-white px-3 text-base font-semibold normal-case tracking-normal text-slate-950 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
        name={name}
      >
        {children}
      </select>
    </label>
  );
}
