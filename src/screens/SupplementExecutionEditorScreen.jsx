"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

const DAYS=[["monday","Mon"],["tuesday","Tue"],["wednesday","Wed"],["thursday","Thu"],["friday","Fri"],["saturday","Sat"],["sunday","Sun"]];
export default function SupplementExecutionEditorScreen({ action, item, protocol }) {
  const [state, formAction]=useActionState(action,{message:null,values:null});
  const value=createSupplementExecutionEditorModel(state?.values??item);
  const [cadence,setCadence]=useState(value.cadence?.type??"daily");
  const [timing,setTiming]=useState(specific(value.preferredSchedule?.timeOfDay)?"specific":value.preferredSchedule?.timeOfDay??"morning");
  const [days,setDays]=useState(value.preferredSchedule?.daysOfWeek??[]);
  const [phases,setPhases]=useState(value.timeline?.length?value.timeline:[]);
  return <main className="app-surface min-h-screen"><form action={formAction} className="mx-auto max-w-[393px] space-y-5 px-4 pb-28 pt-10">
    <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--text-secondary)]" href="/profile/operating-plan">← Operating Plan</Link>
    <header><p className="text-xs font-extrabold uppercase tracking-widest text-[var(--primary)]">Supplement Execution</p><h1 className="mt-2 text-3xl font-extrabold">{protocol.name}</h1><p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">Maintain how you take this supplement. Its strategy and purpose remain unchanged.</p></header>
    {state?.message&&<p className="rounded-xl bg-[var(--surface-muted)] p-3 text-sm font-semibold">{state.message}</p>}
    <Section title="Dose"><div className="grid grid-cols-2 gap-3"><Field defaultValue={value.dose?.amount} label="Amount" name="doseAmount"/><Field defaultValue={value.dose?.unit} label="Unit (optional)" name="doseUnit"/></div></Section>
    <Section title="Schedule"><Select defaultValue={cadence} label="Cadence" name="cadence" onChange={(e)=>setCadence(e.target.value)} options={[["daily","Daily"],["every_other_day","Every other day"],["specific_days","Specific days"],["weekly","Weekly"],["as_needed","As needed"],["custom","Custom"]]}/>{["specific_days","weekly"].includes(cadence)&&<><span className="text-xs font-bold text-[var(--text-secondary)]">Selected days</span><div className="flex flex-wrap gap-2">{DAYS.map(([id,label])=><button aria-pressed={days.includes(id)} className={`min-h-11 rounded-full border px-3 text-xs font-extrabold ${days.includes(id)?"border-[var(--primary)] text-[var(--primary)]":"border-[var(--divider)]"}`} key={id} onClick={()=>setDays(cadence==="weekly"?[id]:days.includes(id)?days.filter((day)=>day!==id):[...days,id])} type="button">{label}</button>)}</div><input name="days" type="hidden" value={days.join(",")}/></>}<div className="grid grid-cols-2 gap-3"><Field defaultValue={value.preferredSchedule?.startDate} label="Start date" name="startDate" required={cadence==="every_other_day"} type="date"/><Field defaultValue={value.preferredSchedule?.endDate??""} label="End date (optional)" name="endDate" type="date"/></div></Section>
    <Section title="Timing"><Select defaultValue={timing} label="Timing" name="timing" onChange={(e)=>setTiming(e.target.value)} options={[["morning","Morning"],["afternoon","Afternoon"],["evening","Evening"],["before_bed","Before bed"],["with_breakfast","With breakfast"],["with_lunch","With lunch"],["with_dinner","With dinner"],["specific","Specific time"]]}/>{timing==="specific"&&<Field defaultValue={specific(value.preferredSchedule?.timeOfDay)?value.preferredSchedule.timeOfDay:""} label="Local time" name="specificTime" type="time"/>}</Section>
    <Section title="Support"><Select defaultValue={value.reminderPreference??"none"} label="Reminders" name="reminderPreference" options={[["remind","Remind me"],["none","Keep in plan without reminders"]]}/><Select defaultValue={value.priority??"normal"} label="Priority" name="priority" options={[["high","High"],["normal","Normal"],["low","Low"]]}/></Section>
    <Section title="Notes"><textarea className="min-h-24 w-full rounded-xl border border-[var(--divider)] bg-[var(--surface-muted)] p-3 text-sm" defaultValue={value.notes} maxLength={1000} name="notes" placeholder="Optional execution context"/></Section>
    <Section title="Dosing Timeline (optional)"><p className="text-xs font-semibold leading-5 text-[var(--text-secondary)]">Use phases only when this supplement changes over time.</p>{phases.map((phase,index)=><div className="space-y-3 rounded-xl border border-[var(--divider)] p-3" key={`${index}-${phase.startDate}`}><div className="grid grid-cols-2 gap-3"><Field defaultValue={phase.startDate} label="Phase start" name="phaseStart" type="date"/><Field defaultValue={phase.endDate??""} label="Phase end" name="phaseEnd" type="date"/><Field defaultValue={phase.dose?.amount} label="Phase dose" name="phaseDose"/><Field defaultValue={phase.dose?.unit} label="Unit" name="phaseUnit"/></div><Field defaultValue={phase.notes} label="Phase notes" maxLength={500} name="phaseNotes"/><button className="min-h-11 text-xs font-extrabold text-[var(--text-secondary)]" onClick={()=>setPhases(phases.filter((_,phaseIndex)=>phaseIndex!==index))} type="button">Remove phase</button></div>)}<button className="min-h-11 rounded-xl border border-[var(--divider)] px-3 text-sm font-extrabold" onClick={()=>setPhases([...phases,{startDate:"",endDate:null,dose:{amount:"",unit:""},notes:""}])} type="button">Add phase</button></Section>
    <Submit/>
  </form></main>;
}
function defaults(){return{dose:{amount:"",unit:""},cadence:{type:"daily"},preferredSchedule:{daysOfWeek:[],timeOfDay:"morning",startDate:"",endDate:null},reminderPreference:"none",priority:"normal",notes:"",timeline:[]};}
export function createSupplementExecutionEditorModel(item) {
  const fallback=defaults();
  if(!item)return fallback;
  return {
    ...fallback,
    ...item,
    dose:{...fallback.dose,...item.dose},
    cadence:{...fallback.cadence,...item.cadence,type:item.cadence?.type==="specific_weekdays"?"specific_days":item.cadence?.type??fallback.cadence.type},
    preferredSchedule:{...fallback.preferredSchedule,...item.preferredSchedule,daysOfWeek:[...(item.preferredSchedule?.daysOfWeek??[])]},
    timeline:(item.timeline??[]).map((phase)=>({...phase,dose:{amount:phase.dose?.amount??"",unit:phase.dose?.unit??""}})),
  };
}
function Section({children,title}){return <section className="space-y-3 rounded-2xl bg-[var(--surface-elevated)] p-4"><h2 className="font-extrabold">{title}</h2>{children}</section>}
function Field({label,...props}){return <label><span className="mb-2 block text-xs font-bold text-[var(--text-secondary)]">{label}</span><input className="min-h-12 w-full rounded-xl border border-[var(--divider)] bg-[var(--surface-muted)] px-3 text-sm" {...props}/></label>}
function Select({label,options,...props}){return <label><span className="mb-2 block text-xs font-bold text-[var(--text-secondary)]">{label}</span><select className="min-h-12 w-full rounded-xl border border-[var(--divider)] bg-[var(--surface-muted)] px-3 text-sm" {...props}>{options.map(([id,text])=><option key={id} value={id}>{text}</option>)}</select></label>}
function Submit(){const{pending}=useFormStatus();return <button className="min-h-12 w-full rounded-2xl bg-[var(--primary)] font-extrabold text-white disabled:opacity-60" disabled={pending} type="submit">{pending?"Saving…":"Save Execution"}</button>}
function specific(value){return /^\d{2}:\d{2}$/.test(value??"");}
