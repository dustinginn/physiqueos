"use client";

import Link from "next/link";
import { useFormStatus } from "react-dom";
import { ArrowLeft, Scale } from "lucide-react";
import Card from "../components/ui/Card";
import IconBadge from "../components/ui/IconBadge";

export default function MorningCheckInScreen({ action, dateLabel, existingWeight = null, previousWeight = null }) {
  const change = previousWeight == null || existingWeight == null ? null : Number((existingWeight - previousWeight).toFixed(1));
  return <main className="app-surface min-h-screen overflow-x-hidden"><div className="mx-auto max-w-[393px] px-4 pb-32 pt-10">
    <Link className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-500" href="/"><ArrowLeft size={18}/>Home</Link>
    <div className="mb-6 space-y-2"><p className="text-sm font-semibold uppercase tracking-[0.12em] text-indigo-600">Morning Check-In</p><h1 className="text-3xl font-extrabold leading-tight text-slate-950">What’s your weight today?</h1><p className="text-sm font-semibold text-slate-500">{dateLabel}</p></div>
    <form action={action} className="space-y-4">
      <Card className="space-y-4"><div className="flex items-center gap-3"><IconBadge color="primary" icon={Scale} size="sm"/><p className="text-base font-bold text-slate-950">Morning weight</p></div>
        <div className="flex items-end gap-3"><input autoFocus className="min-h-20 w-full rounded-2xl border border-[var(--divider)] bg-[var(--surface-elevated)] px-4 text-4xl font-black text-[var(--text-primary)] outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" defaultValue={existingWeight?.toFixed(1)??""} inputMode="decimal" max="1000" min="50" name="weight" placeholder="165.2" required step="0.1" type="number"/><span className="pb-5 text-lg font-bold text-slate-500">lb</span></div>
        {existingWeight!=null&&<p className="rounded-xl bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-900">A {existingWeight.toFixed(1)} lb weight already exists for today. Saving a different value will correct today’s entry; saving the same value will make no change.</p>}
      </Card>
      {previousWeight!=null&&<div className="rounded-2xl bg-[var(--surface-muted)] p-4 text-sm font-semibold text-slate-600"><p>Previous weight: <strong>{previousWeight.toFixed(1)} lb</strong></p>{change!=null&&<p className="mt-1">Current change: <strong>{change>0?"+":""}{change.toFixed(1)} lb</strong></p>}</div>}
      <SubmitButton/>
      <Link className="flex min-h-12 items-center justify-center rounded-2xl border border-[var(--divider)] text-sm font-bold text-[var(--text-primary)]" href="/">Cancel</Link>
    </form>
  </div></main>;
}

function SubmitButton(){const {pending}=useFormStatus();return <button aria-disabled={pending} className="min-h-14 w-full rounded-2xl bg-[var(--primary)] px-4 text-base font-bold text-white disabled:cursor-not-allowed disabled:opacity-60" disabled={pending} type="submit">{pending?"Saving…":"Save Weight"}</button>}
