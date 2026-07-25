"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

export default function SupplementStrategyEditorScreen({ action, goals, model, mode }) {
  const [state, formAction] = useActionState(action, { message: null, values: {} });
  const values = { ...model, ...state?.values };
  const back = mode === "create" ? "/profile/operating-plan" : `/profile/protocols/${encodeURIComponent(model.protocolId)}?from=operating-plan`;
  return <main className="app-surface min-h-screen"><form action={formAction} className="mx-auto max-w-[393px] space-y-6 px-4 pb-28 pt-10">
    <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--text-secondary)]" href={back}>← {mode === "create" ? "Operating Plan" : "Supplement"}</Link>
    <header className="space-y-2"><p className="text-xs font-extrabold uppercase tracking-[.12em] text-[var(--primary)]">Supplement Strategy</p><h1 className="text-3xl font-extrabold text-[var(--text-primary)]">{mode === "create" ? "Add Supplement" : "Edit Strategy"}</h1><p className="text-sm leading-6 text-[var(--text-secondary)]">Define why this supplement belongs in your plan. Dose, timing, and reminders stay in Execution.</p></header>
    {state?.message&&<p aria-live="polite" className="rounded-xl border border-[var(--divider)] bg-[var(--surface-muted)] p-3 text-sm font-semibold text-[var(--text-secondary)]">{state.message}</p>}
    <section className="space-y-4 rounded-2xl bg-[var(--surface-elevated)] p-4">
      <Field defaultValue={values.name} label="Supplement name" name="name" required/>
      <Field defaultValue={values.purpose} label="Purpose" name="purpose" required/>
      <label className="block"><span className="mb-2 block text-xs font-bold text-[var(--text-secondary)]">Current strategy or role</span><textarea className="min-h-28 w-full rounded-xl border border-[var(--divider)] bg-[var(--surface-muted)] p-3 text-sm font-semibold" defaultValue={values.role} name="role" required/></label>
      <label className="block"><span className="mb-2 block text-xs font-bold text-[var(--text-secondary)]">Goal supported</span><select className="min-h-12 w-full rounded-xl border border-[var(--divider)] bg-[var(--surface-muted)] px-3 text-sm font-semibold" defaultValue={values.goalId} name="goalId">{goals.map((goal)=><option key={goal.id} value={goal.id}>{goal.title}</option>)}</select></label>
      {mode==="create"&&<><Field defaultValue={values.startDate} label="Start date" name="startDate" required type="date"/><label className="block"><span className="mb-2 block text-xs font-bold text-[var(--text-secondary)]">Initial status</span><select className="min-h-12 w-full rounded-xl border border-[var(--divider)] bg-[var(--surface-muted)] px-3 text-sm font-semibold" defaultValue="active" name="initialStatus"><option value="active">Active</option></select></label></>}
    </section>
    <SubmitButton label={mode === "create" ? "Add Supplement" : "Save Strategy"}/>
  </form></main>;
}
function Field({ label, ...props }) { return <label className="block"><span className="mb-2 block text-xs font-bold text-[var(--text-secondary)]">{label}</span><input className="min-h-12 w-full rounded-xl border border-[var(--divider)] bg-[var(--surface-muted)] px-3 text-sm font-semibold" {...props}/></label>; }
function SubmitButton({ label }) { const { pending }=useFormStatus(); return <button className="min-h-12 w-full rounded-2xl bg-[var(--primary)] px-4 text-sm font-extrabold text-white disabled:opacity-60" disabled={pending} type="submit">{pending?"Saving…":label}</button>; }
