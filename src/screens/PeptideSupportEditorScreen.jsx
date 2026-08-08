"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import Card from "../components/ui/Card";
import { formatSupportSchedulePreview } from "../domain/models/SupportScheduleModel";
import { formatDosingStrategyPreview } from "../domain/models/PeptideDosingStrategyModel";

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const initialState = { message: null };

export default function PeptideSupportEditorScreen({ action, hydration, protocol }) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [schedule, setSchedule] = useState(hydration.supportSchedule);
  const [strategy, setStrategy] = useState(hydration.dosingStrategy);
  const [reminder, setReminder] = useState(hydration.reminderPreference);
  const schedulePreview = useMemo(() => formatSupportSchedulePreview(schedule), [schedule]);
  const dosingPreview = useMemo(() => formatDosingStrategyPreview(strategy, hydration.legacyTimeline), [strategy, hydration.legacyTimeline]);
  const scheduleReady = Boolean(schedule.startDate && (schedule.frequency === "daily" || schedule.frequency === "every_x_days" || schedule.daysOfWeek.length));
  const dosingReady = strategy.pattern === "custom" ? hydration.legacyTimeline.length > 0 : Boolean(strategy.startDate && strategy.startingDose.amount && strategy.startingDose.unit);
  const set = (key, value) => setSchedule((current) => ({ ...current, [key]: value }));
  const setDose = (key, value) => setStrategy((current) => ({ ...current, [key]: value }));

  return <main className="app-surface min-h-screen"><div className="mx-auto max-w-[393px] px-4 pb-28 pt-10">
    <Link className="mb-6 inline-flex min-h-11 items-center text-sm font-semibold text-[var(--text-secondary)]" href={`/profile/operating-plan/execution/peptides/${protocol.id}`}>← {protocol.name}</Link>
    <header className="mb-6"><p className="text-[10px] font-extrabold uppercase tracking-[.1em] text-[var(--primary)]">Peptide Support</p><h1 className="mt-1 text-3xl font-extrabold">Edit Support</h1><p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">Describe the schedule and dosing strategy you intend to follow. The dated support plan is generated for you.</p></header>
    <form action={formAction} className="space-y-4">
      <input name="supportScheduleJson" type="hidden" value={JSON.stringify(schedule)}/>
      <input name="dosingStrategyJson" type="hidden" value={JSON.stringify(strategy)}/>
      <input name="legacyTimelineJson" type="hidden" value={JSON.stringify(hydration.legacyTimeline)}/>
      <input name="legacyPriority" type="hidden" value={hydration.legacyPriority}/>
      <input name="timingContext" type="hidden" value={hydration.timingContext}/>

      <Section number="1" title="Schedule">
        <Question label="How often?"><Select value={schedule.frequency} onChange={(event) => set("frequency", event.target.value)} options={[["daily","Daily"],["weekly","Weekly"],["specific_days","Specific days"],["every_x_days","Every X days"]]}/></Question>
        {schedule.frequency === "weekly" && <Question label="Which day?"><Select value={schedule.daysOfWeek[0] ?? ""} onChange={(event) => set("daysOfWeek", [event.target.value])} options={DAYS.map((day) => [day, capitalize(day)])}/></Question>}
        {schedule.frequency === "specific_days" && <Question label="Which days?"><div className="grid grid-cols-2 gap-2">{DAYS.map((day) => <Check key={day} label={capitalize(day)} checked={schedule.daysOfWeek.includes(day)} onChange={(checked) => set("daysOfWeek", checked ? [...schedule.daysOfWeek, day] : schedule.daysOfWeek.filter((item) => item !== day))}/>)}</div></Question>}
        {schedule.frequency === "every_x_days" && <Question label="Repeat interval"><Field min="1" type="number" value={schedule.intervalDays} onChange={(event) => set("intervalDays", Number(event.target.value))}/></Question>}
        <Question label="When?"><Select value={schedule.timing} onChange={(event) => set("timing", event.target.value)} options={[["morning","Morning"],["afternoon","Afternoon"],["evening","Evening"],["specific","Specific time"]]}/></Question>
        {schedule.timing === "specific" && <Question label="Local time"><Field type="time" value={schedule.specificTime} onChange={(event) => set("specificTime", event.target.value)}/></Question>}
        <Question label="Starts"><Field type="date" value={schedule.startDate} onChange={(event) => set("startDate", event.target.value)}/></Question>
        <Question label="Ends"><div className="grid grid-cols-2 gap-2"><Choice active={!schedule.endDate} label="Until changed" onClick={() => set("endDate", null)}/><Choice active={Boolean(schedule.endDate)} label="Choose date" onClick={() => set("endDate", schedule.endDate ?? schedule.startDate)}/></div>{schedule.endDate && <Field className="mt-2" type="date" value={schedule.endDate} onChange={(event) => set("endDate", event.target.value)}/>}</Question>
        <Preview title="Schedule preview" lines={[schedulePreview]}/>
      </Section>

      {scheduleReady && <Section number="2" title="Dosing Strategy">
        <Question label="How will the dose change over time?"><Select value={strategy.pattern} onChange={(event) => setDose("pattern", event.target.value)} options={[["stay","Stay at this dose"],["titrate_up","Titrate up"],["titrate_down","Titrate down"],["up_hold_down","Titrate up → hold → titrate down"],["custom","Custom (compatibility)"]]}/></Question>
        {strategy.pattern === "custom" ? <div className="rounded-2xl border border-[var(--divider)] p-3 text-sm leading-6 text-[var(--text-secondary)]">Your existing manually authored phases will be preserved exactly. Choose a structured pattern only when you intend to replace them.</div> : <>
          <div className="grid grid-cols-2 gap-2"><Question label="Starting dose"><Field inputMode="decimal" value={strategy.startingDose.amount} onChange={(event) => setDose("startingDose", { ...strategy.startingDose, amount: event.target.value })}/></Question><Question label="Unit"><Field value={strategy.startingDose.unit} onChange={(event) => setDose("startingDose", { ...strategy.startingDose, unit: event.target.value })}/></Question></div>
          <Question label="Dosing start date"><Field type="date" value={strategy.startDate} onChange={(event) => setDose("startDate", event.target.value)}/></Question>
          {["titrate_up","titrate_down","up_hold_down"].includes(strategy.pattern) && <><Question label={strategy.pattern === "titrate_down" ? "Decrease by" : "Increase by"}><Field inputMode="decimal" value={strategy.stepAmount} onChange={(event) => setDose("stepAmount", event.target.value)}/></Question><Interval label="Change dose every" count={strategy.stepInterval} unit={strategy.stepUnit} setCount={(value) => setDose("stepInterval", value)} setUnit={(value) => setDose("stepUnit", value)}/><Question label={strategy.pattern === "up_hold_down" ? "Peak dose" : "Target dose"}><Field inputMode="decimal" value={strategy.targetDose} onChange={(event) => setDose("targetDose", event.target.value)}/></Question></>}
          {strategy.pattern === "up_hold_down" && <><Interval label="Hold at peak for" count={strategy.holdDuration} unit={strategy.holdUnit} setCount={(value) => setDose("holdDuration", value)} setUnit={(value) => setDose("holdUnit", value)}/><Question label="Decrease by"><Field inputMode="decimal" value={strategy.decreaseAmount} onChange={(event) => setDose("decreaseAmount", event.target.value)}/></Question><Interval label="Decrease every" count={strategy.decreaseInterval} unit={strategy.decreaseUnit} setCount={(value) => setDose("decreaseInterval", value)} setUnit={(value) => setDose("decreaseUnit", value)}/><Question label="Landing dose"><Field inputMode="decimal" value={strategy.landingDose} onChange={(event) => setDose("landingDose", event.target.value)}/></Question></>}
          <Question label="Final state"><div className="grid grid-cols-2 gap-2"><Choice active={!strategy.endDate} label="Until changed" onClick={() => setDose("endDate", null)}/><Choice active={Boolean(strategy.endDate)} label="Choose end date" onClick={() => setDose("endDate", strategy.endDate ?? strategy.startDate)}/></div>{strategy.endDate && <Field className="mt-2" type="date" value={strategy.endDate} onChange={(event) => setDose("endDate", event.target.value)}/>}</Question>
        </>}
        <Preview title="Generated dosing plan" lines={dosingPreview}/>
      </Section>}

      {scheduleReady && dosingReady && <Section number="3" title="Reminder"><p className="text-sm leading-6 text-[var(--text-secondary)]">Use this Support schedule for the in-app reminder.</p><div className="grid grid-cols-2 gap-2"><Choice active={reminder === "remind"} label="Remind me" onClick={() => setReminder("remind")}/><Choice active={reminder === "none"} label="No reminder" onClick={() => setReminder("none")}/></div><input name="reminderPreference" type="hidden" value={reminder}/></Section>}
      {scheduleReady && dosingReady && reminder && <Section number="4" title="Execution Notes"><label className="text-sm font-bold" htmlFor="notes">Optional notes shown when this priority is opened</label><textarea className="mt-2 min-h-28 w-full rounded-2xl border border-[var(--divider)] bg-white p-3 text-sm" defaultValue={hydration.notes} id="notes" maxLength={1000} name="notes" placeholder="Take under the conditions specified for this protocol."/></Section>}
      {state?.message && <p className="rounded-2xl bg-red-50 p-3 text-sm font-semibold text-red-700">{state.message}</p>}
      <button className="min-h-12 w-full rounded-2xl bg-[var(--primary)] font-extrabold text-white disabled:opacity-50" disabled={pending || !scheduleReady || !dosingReady || !reminder} type="submit">{pending ? "Saving…" : "Save Support"}</button>
    </form>
  </div></main>;
}

function Section({ children, number, title }) { return <Card className="space-y-4"><div className="flex items-center gap-3"><span className="flex size-7 items-center justify-center rounded-full bg-[var(--primary)] text-xs font-extrabold text-white">{number}</span><h2 className="text-xl font-extrabold">{title}</h2></div>{children}</Card>; }
function Question({ children, label }) { return <div><p className="mb-2 text-sm font-extrabold">{label}</p>{children}</div>; }
function Field({ className = "", ...props }) { return <input {...props} className={`${className} min-h-11 w-full rounded-xl border border-[var(--divider)] bg-white px-3 text-sm font-semibold`}/>; }
function Select({ options, ...props }) { return <select {...props} className="min-h-11 w-full rounded-xl border border-[var(--divider)] bg-white px-3 text-sm font-semibold">{options.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>; }
function Choice({ active, label, onClick }) { return <button className={`min-h-11 rounded-xl border px-3 text-sm font-bold ${active ? "border-[var(--primary)] bg-blue-50 text-[var(--primary)]" : "border-[var(--divider)]"}`} onClick={onClick} type="button">{label}</button>; }
function Check({ checked, label, onChange }) { return <label className="flex min-h-11 items-center gap-2 rounded-xl border border-[var(--divider)] px-3 text-sm font-semibold"><input checked={checked} onChange={(event) => onChange(event.target.checked)} type="checkbox"/>{label}</label>; }
function Interval({ count, label, setCount, setUnit, unit }) { return <Question label={label}><div className="grid grid-cols-2 gap-2"><Field min="1" type="number" value={count} onChange={(event) => setCount(Number(event.target.value))}/><Select value={unit} onChange={(event) => setUnit(event.target.value)} options={[["days","Days"],["weeks","Weeks"]]}/></div></Question>; }
function Preview({ lines, title }) { return <div className="rounded-2xl bg-[var(--surface-muted)] p-3"><p className="text-[10px] font-extrabold uppercase tracking-[.08em] text-[var(--text-muted)]">{title}</p><div className="mt-2 space-y-1">{lines.map((line,index) => <p className="text-sm font-semibold leading-5" key={`${line}-${index}`}>{line}</p>)}</div></div>; }
function capitalize(value) { return value.charAt(0).toUpperCase() + value.slice(1); }
