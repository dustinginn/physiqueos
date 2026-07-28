"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { resolveExecutionSupportLabel } from "../domain/services/ExecutionSupportLabelService";

const DAYS = [["monday","Mon"],["tuesday","Tue"],["wednesday","Wed"],["thursday","Thu"],["friday","Fri"],["saturday","Sat"],["sunday","Sun"]];
const COPY = {
  execution_morning_weigh_in: { why: "Morning weight is one of the clearest signals of whether your Energy Strategy is working. PhysiqueOS will focus on the trend rather than reacting to individual days.", times: ["morning","specific"], placeholder: "Usually immediately after waking and before food or water." },
  execution_foam_roll: { why: "Consistent recovery work helps support training quality and keeps small areas of tightness from becoming larger interruptions.", times: ["morning","afternoon","evening","after_training","specific"], placeholder: "Focus on lower body after leg sessions." },
  execution_retatrutide: { why: "Keeping your Retatrutide schedule consistent makes the protocol easier to evaluate and reduces uncertainty when appetite, weight, or recovery changes.", times: ["evening","night","specific"], cadenceLocked: "specific_weekdays", placeholder: "Usually taken Thursday night under consistent conditions." },
  execution_tesamorelin: { why: "A consistent Tesamorelin schedule gives PhysiqueOS a clearer picture of how the protocol aligns with recovery, sleep, and body-composition changes.", times: ["evening","night","specific"], cadenceLocked: "specific_weekdays", placeholder: "Taken at night while fasted." },
  execution_progress_photos: { why: "Progress photos often reveal changes that weight alone may miss, especially as you move closer to your goal. A consistent setup improves comparability without making the day a rigid deadline.", times: ["morning","afternoon","evening","specific"], supportsWeeklyInterval: true, placeholder: "Front, rear, and side photos after training using similar lighting and distance." },
  execution_dexa: { why: "DEXA provides PhysiqueOS with the clearest picture of body composition and metabolic change.", times: ["specific"], cadenceLocked: "scheduled_date", placeholder: "Schedule close to the morning weigh-in using similar preparation conditions." },
};
const CADENCES = [["daily","Every day"],["specific_weekdays","Specific days"],["weekly","Once a week"],["weekly_interval_2","Every 2 weeks"],["scheduled_date","Scheduled date"],["custom","Custom"]];

export default function ExecutionItemBuilderScreen({ action, context = null, item }) {
  const config = COPY[item.id];
  if (!config) return <ExecutionUnavailable/>;
  return <ConfiguredExecutionItemBuilder action={action} config={config} context={context} item={item}/>;
}

function ConfiguredExecutionItemBuilder({ action, config, context, item }) {
  const [actionState, formAction] = useActionState(action, { message: null });
  const title = item.id === "execution_dexa" ? "DEXA Scan" : item.title;
  const [cadence, setCadence] = useState(config.cadenceLocked ?? item.cadence.type);
  const [days, setDays] = useState(item.preferredSchedule.daysOfWeek ?? []);
  const initialTime = getInitialTime(item.preferredSchedule.timeOfDay, config.times);
  const [timeChoice, setTimeChoice] = useState(initialTime.choice);
  const [specificTime, setSpecificTime] = useState(initialTime.specific);
  const [support, setSupport] = useState(item.reminderPreference);
  const showDays = cadence === "specific_weekdays" || cadence === "weekly" || cadence === "weekly_interval_2";
  const showDate = cadence === "scheduled_date";

  const schedulePreview = item.schedulePreviews?.[cadence] ?? {
    summary: item.scheduleSummary,
    next: item.nextOccurrenceSummary,
  };

  return <main className="app-surface min-h-screen"><form action={formAction} className="mx-auto max-w-[393px] space-y-6 px-4 pb-10 pt-8">
    <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--text-secondary)]" href="/profile/operating-plan">← Operating Plan</Link>
    <header className="space-y-2"><p className="text-xs font-extrabold uppercase tracking-widest text-[var(--primary)]">Execution Plan</p><h1 className="text-2xl font-black">Refine {title}</h1><p className="text-sm font-semibold leading-6 text-[var(--text-secondary)]">{config.why}</p><p className="text-xs font-bold text-[var(--text-muted)]">{resolveExecutionSupportLabel(item)}</p></header>
    {actionState.message&&<p aria-live="polite" className="rounded-xl bg-[var(--surface-muted)] p-3 text-sm font-semibold">{actionState.message}</p>}
    <input name="id" type="hidden" value={item.id}/><input name="cadence" type="hidden" value={cadence}/><input name="days" type="hidden" value={days.join(",")}/><input name="timeChoice" type="hidden" value={timeChoice}/>
    {context&&<><input name="protocolId" type="hidden" value={context.protocolId}/><input name="expectedCurrentVersionId" type="hidden" value={context.expectedCurrentVersionId}/><input name="expectedRevision" type="hidden" value={context.expectedRevision}/><input name="expectedSemanticDigest" type="hidden" value={context.expectedSemanticDigest}/><input name="expectedLastCommitId" type="hidden" value={context.expectedLastCommitId??""}/><input name="expectedFileHash" type="hidden" value={context.expectedFileHash??""}/><input name="anchorDate" type="hidden" value={item.preferredSchedule.anchorDate??""}/><input name="timezone" type="hidden" value={item.preferredSchedule.timezone??""}/><input name="effectiveDate" type="hidden" value={cadence==="weekly_interval_2"?item.intervalTwoNextDueAt:item.preferredSchedule.nextDueAt??""}/></>}
    <Section title="When do you want to do it?">
      {!config.cadenceLocked && <ChoiceGroup label="Cadence" options={config.supportsWeeklyInterval?CADENCES:CADENCES.filter(([id])=>id!=="weekly_interval_2")} value={cadence} onChange={setCadence}/>}
      {showDays && <div><Label>{cadence === "specific_weekdays" ? "Preferred days" : "Preferred day"}</Label><div aria-label="Preferred weekdays" className="flex flex-wrap gap-2" role="group">{DAYS.map(([id,label])=><button aria-pressed={days.includes(id)} className={`min-h-11 min-w-11 rounded-full border px-3 text-xs font-extrabold ${days.includes(id)?"border-[var(--primary)] bg-[var(--surface-accent)] text-[var(--primary)]":"border-[var(--divider)] bg-[var(--surface-muted)]"}`} key={id} onClick={()=>setDays(toggleDay(days,id,cadence!=="specific_weekdays"))} type="button">{label}</button>)}</div></div>}
      {showDate && <label className="block"><Label>Appointment date</Label><input className="min-h-12 w-full rounded-xl border border-[var(--divider)] bg-[var(--surface-muted)] px-3" defaultValue={item.preferredSchedule.date??""} name="date" type="date"/></label>}
      <ChoiceGroup label={showDate ? "Appointment time" : "Preferred time"} options={config.times.map((id)=>[id,timeLabel(id)])} value={timeChoice} onChange={setTimeChoice}/>
      {timeChoice === "specific" && <label className="block"><Label>Specific time</Label><input className="min-h-12 w-full rounded-xl border border-[var(--divider)] bg-[var(--surface-muted)] px-3" name="specificTime" onChange={(event)=>setSpecificTime(event.target.value)} type="time" value={specificTime}/></label>}
      {cadence === "custom" && <p className="rounded-xl bg-[var(--surface-muted)] p-3 text-sm font-semibold text-[var(--text-secondary)]">Custom schedules are kept in the plan as notes for now. More detailed recurrence options can come later.</p>}
      {schedulePreview.summary&&<div aria-live="polite" className="rounded-xl bg-[var(--surface-muted)] p-3"><p className="text-sm font-extrabold">{schedulePreview.summary}</p><p className="mt-1 text-xs font-bold text-[var(--text-secondary)]">{schedulePreview.next}</p></div>}
    </Section>
    <Section title="How should PhysiqueOS support this?"><p className="text-sm font-semibold leading-6 text-[var(--text-secondary)]">PhysiqueOS can surface this commitment when it becomes relevant without turning the plan into a stream of alerts.</p><ChoiceGroup label="Support preference" name="support" onChange={setSupport} options={[["in_app","Show it in PhysiqueOS"],["none","Keep it in the plan without prompting me"]]} value={support}/></Section>
    <Section title="Execution Context"><p className="text-sm font-semibold leading-6 text-[var(--text-secondary)]">Share anything that helps PhysiqueOS understand how you intend to carry out this commitment. This can help future evidence be interpreted in the right context.</p><textarea className="min-h-24 w-full rounded-xl border border-[var(--divider)] bg-[var(--surface-muted)] p-3 text-sm" defaultValue={item.notes} name="notes" placeholder={config.placeholder??"Add context that would help this commitment fit your routine."}/></Section>
    <SaveButton/>
  </form></main>;
}
function ExecutionUnavailable(){return <main className="app-surface min-h-screen"><section aria-live="polite" className="mx-auto max-w-[393px] px-4 pb-28 pt-10"><Link className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--text-secondary)]" href="/profile/operating-plan">â† Operating Plan</Link><h1 className="mt-6 text-3xl font-extrabold text-[var(--text-primary)]">This execution item is not available here.</h1><p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">Return to the Operating Plan to review the actions currently available.</p></section></main>}
function Section({children,title}){return <section className="space-y-3 rounded-2xl bg-[var(--surface-elevated)] p-4"><h2 className="text-base font-extrabold">{title}</h2>{children}</section>}
function Label({children}){return <span className="mb-2 block text-xs font-extrabold text-[var(--text-muted)]">{children}</span>}
function ChoiceGroup({label,name,onChange,options,value}){return <div><Label>{label}</Label>{name&&<input name={name} type="hidden" value={value}/>}<div className="grid grid-cols-2 gap-2" role="radiogroup">{options.map(([id,text])=><button aria-checked={value===id} className={`flex min-h-12 items-center rounded-xl border px-3 text-left text-sm font-extrabold ${value===id?"border-[var(--primary)] bg-[var(--surface-accent)] text-[var(--primary)]":"border-[var(--divider)] bg-[var(--surface-muted)]"}`} key={id} onClick={()=>onChange?.(id)} role="radio" type="button">{text}</button>)}</div></div>}
function SaveButton(){const{pending}=useFormStatus();return <button className="min-h-12 w-full rounded-2xl bg-[var(--primary)] px-4 font-extrabold text-white disabled:opacity-60" disabled={pending} type="submit">{pending?"Saving…":"Save changes"}</button>}
function toggleDay(days,day,single){if(single)return[day];return days.includes(day)?days.filter((item)=>item!==day):[...days,day]}
function getInitialTime(value,allowed){if(allowed.includes(value))return{choice:value,specific:""};if(/^\d{2}:\d{2}$/.test(value??""))return{choice:"specific",specific:value};return{choice:allowed[0],specific:""}}
function timeLabel(value){return({morning:"Morning",afternoon:"Afternoon",evening:"Evening",night:"Night",after_training:"After training",specific:"Specific time"})[value]}
