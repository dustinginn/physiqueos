"use client";

import Link from "next/link";
import { useState } from "react";

const DAYS = [["monday","Mon"],["tuesday","Tue"],["wednesday","Wed"],["thursday","Thu"],["friday","Fri"],["saturday","Sat"],["sunday","Sun"]];
const COPY = {
  execution_morning_weigh_in: { why: "Morning weight is one of the clearest signals of whether your Energy Strategy is working. PhysiqueOS will focus on the trend rather than reacting to individual days.", times: ["morning","specific"], placeholder: "Usually immediately after waking and before food or water." },
  execution_foam_roll: { why: "Consistent recovery work helps support training quality and keeps small areas of tightness from becoming larger interruptions.", times: ["morning","afternoon","evening","after_training","specific"], placeholder: "Focus on lower body after leg sessions." },
  execution_retatrutide: { why: "Keeping your Retatrutide schedule consistent makes the protocol easier to evaluate and reduces uncertainty when appetite, weight, or recovery changes.", times: ["evening","night","specific"], cadenceLocked: "specific_weekdays", placeholder: "Usually taken Thursday night under consistent conditions." },
  execution_tesamorelin: { why: "A consistent Tesamorelin schedule gives PhysiqueOS a clearer picture of how the protocol aligns with recovery, sleep, and body-composition changes.", times: ["evening","night","specific"], cadenceLocked: "specific_weekdays", placeholder: "Taken at night while fasted." },
  execution_progress_photos: { why: "Progress photos often reveal changes that weight alone may miss, especially as you move closer to your goal. A consistent setup improves comparability without making the day a rigid deadline.", times: ["morning","afternoon","evening","specific"], placeholder: "Front, rear, and side photos after training using similar lighting and distance." },
  execution_dexa: { why: "DEXA provides PhysiqueOS with the clearest picture of body composition and metabolic change.", times: ["specific"], cadenceLocked: "scheduled_date", placeholder: "Schedule close to the morning weigh-in using similar preparation conditions." },
};
const CADENCES = [["daily","Every day"],["specific_weekdays","Specific days"],["weekly","Once a week"],["scheduled_date","Scheduled date"],["custom","Custom"]];

export default function ExecutionItemBuilderScreen({ action, item }) {
  const config = COPY[item.id];
  const title = item.id === "execution_dexa" ? "DEXA Scan" : item.title;
  const [cadence, setCadence] = useState(config.cadenceLocked ?? item.cadence.type);
  const [days, setDays] = useState(item.preferredSchedule.daysOfWeek ?? []);
  const initialTime = getInitialTime(item.preferredSchedule.timeOfDay, config.times);
  const [timeChoice, setTimeChoice] = useState(initialTime.choice);
  const [specificTime, setSpecificTime] = useState(initialTime.specific);
  const [support, setSupport] = useState(item.reminderPreference);
  const showDays = cadence === "specific_weekdays" || cadence === "weekly";
  const showDate = cadence === "scheduled_date";

  return <main className="app-surface min-h-screen"><form action={action} className="mx-auto max-w-[393px] space-y-6 px-4 pb-10 pt-8">
    <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--text-secondary)]" href="/profile/operating-plan">← Operating Plan</Link>
    <header className="space-y-2"><p className="text-xs font-extrabold uppercase tracking-widest text-[var(--primary)]">Execution Plan</p><h1 className="text-2xl font-black">Refine {title}</h1><p className="text-sm font-semibold leading-6 text-[var(--text-secondary)]">{config.why}</p><p className="text-xs font-bold text-[var(--text-muted)]">{supportSummary(item)}</p></header>
    <input name="id" type="hidden" value={item.id}/><input name="cadence" type="hidden" value={cadence}/><input name="days" type="hidden" value={days.join(",")}/><input name="timeChoice" type="hidden" value={timeChoice}/>
    <Section title="When do you want to do it?">
      {!config.cadenceLocked && <ChoiceGroup label="Cadence" options={CADENCES} value={cadence} onChange={setCadence}/>}
      {showDays && <div><Label>{cadence === "weekly" ? "Preferred day" : "Preferred days"}</Label><div aria-label="Preferred weekdays" className="flex flex-wrap gap-2" role="group">{DAYS.map(([id,label])=><button aria-pressed={days.includes(id)} className={`min-h-11 min-w-11 rounded-full border px-3 text-xs font-extrabold ${days.includes(id)?"border-[var(--primary)] bg-[var(--surface-accent)] text-[var(--primary)]":"border-[var(--divider)] bg-[var(--surface-muted)]"}`} key={id} onClick={()=>setDays(toggleDay(days,id,cadence==="weekly"))} type="button">{label}</button>)}</div></div>}
      {showDate && <label className="block"><Label>Appointment date</Label><input className="min-h-12 w-full rounded-xl border border-[var(--divider)] bg-[var(--surface-muted)] px-3" defaultValue={item.preferredSchedule.date??""} name="date" type="date"/></label>}
      <ChoiceGroup label={showDate ? "Appointment time" : "Preferred time"} options={config.times.map((id)=>[id,timeLabel(id)])} value={timeChoice} onChange={setTimeChoice}/>
      {timeChoice === "specific" && <label className="block"><Label>Specific time</Label><input className="min-h-12 w-full rounded-xl border border-[var(--divider)] bg-[var(--surface-muted)] px-3" name="specificTime" onChange={(event)=>setSpecificTime(event.target.value)} type="time" value={specificTime}/></label>}
      {cadence === "custom" && <p className="rounded-xl bg-[var(--surface-muted)] p-3 text-sm font-semibold text-[var(--text-secondary)]">Custom schedules are kept in the plan as notes for now. More detailed recurrence options can come later.</p>}
    </Section>
    <Section title="How should PhysiqueOS support this?"><p className="text-sm font-semibold leading-6 text-[var(--text-secondary)]">PhysiqueOS can surface this commitment when it becomes relevant without turning the plan into a stream of alerts.</p><ChoiceGroup label="Support preference" name="support" onChange={setSupport} options={[["in_app","Show it in PhysiqueOS"],["none","Keep it in the plan without prompting me"]]} value={support}/></Section>
    <Section title="Execution Context"><p className="text-sm font-semibold leading-6 text-[var(--text-secondary)]">Share anything that helps PhysiqueOS understand how you intend to carry out this commitment. This can help future evidence be interpreted in the right context.</p><textarea className="min-h-24 w-full rounded-xl border border-[var(--divider)] bg-[var(--surface-muted)] p-3 text-sm" defaultValue={item.notes} name="notes" placeholder={config.placeholder??"Add context that would help this commitment fit your routine."}/></Section>
    <button className="min-h-12 w-full rounded-2xl bg-[var(--primary)] px-4 font-extrabold text-white" type="submit">Save changes</button>
  </form></main>;
}
function Section({children,title}){return <section className="space-y-3 rounded-2xl bg-[var(--surface-elevated)] p-4"><h2 className="text-base font-extrabold">{title}</h2>{children}</section>}
function Label({children}){return <span className="mb-2 block text-xs font-extrabold text-[var(--text-muted)]">{children}</span>}
function ChoiceGroup({label,name,onChange,options,value}){return <div><Label>{label}</Label>{name&&<input name={name} type="hidden" value={value}/>}<div className="grid grid-cols-2 gap-2" role="radiogroup">{options.map(([id,text])=><button aria-checked={value===id} className={`flex min-h-12 items-center rounded-xl border px-3 text-left text-sm font-extrabold ${value===id?"border-[var(--primary)] bg-[var(--surface-accent)] text-[var(--primary)]":"border-[var(--divider)] bg-[var(--surface-muted)]"}`} key={id} onClick={()=>onChange?.(id)} role="radio" type="button">{text}</button>)}</div></div>}
function toggleDay(days,day,single){if(single)return[day];return days.includes(day)?days.filter((item)=>item!==day):[...days,day]}
function getInitialTime(value,allowed){if(allowed.includes(value))return{choice:value,specific:""};if(/^\d{2}:\d{2}$/.test(value??""))return{choice:"specific",specific:value};return{choice:allowed[0],specific:""}}
function timeLabel(value){return({morning:"Morning",afternoon:"Afternoon",evening:"Evening",night:"Night",after_training:"After training",specific:"Specific time"})[value]}
function supportSummary(item){const id=item.linkedStrategyIds?.[0]??"";if(id.includes("energy"))return"Supports your Energy Strategy";if(id.includes("training"))return"Supports Training and Recovery";if(id==="recovery")return"Supports recovery";return"Helps PhysiqueOS track progress toward Visible Abs at Rest"}
