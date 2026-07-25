import Link from "next/link";
import Card from "../components/ui/Card";
import { formatSupplementExecutionSummary } from "../domain/services/SupplementExecutionManagementService";

export default function SupplementExecutionDetailScreen({ item, protocol }) {
  return <main className="app-surface min-h-screen"><div className="mx-auto max-w-[393px] space-y-5 px-4 pb-28 pt-10">
    <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--text-secondary)]" href="/profile/operating-plan">← Operating Plan</Link>
    <header><p className="text-xs font-extrabold uppercase tracking-widest text-[var(--primary)]">Supplement Execution</p><h1 className="mt-2 text-3xl font-extrabold">{protocol.name}</h1><p className="mt-2 text-sm font-semibold text-[var(--text-secondary)]">{formatSupplementExecutionSummary(item)}</p></header>
    {!item?<Card><p className="text-sm font-semibold text-[var(--text-secondary)]">Not configured</p></Card>:<div className="space-y-3">
      <Row label="Dose" value={[item.dose?.amount,item.dose?.unit].filter(Boolean).join(" ")||"Not specified"}/>
      <Row label="Cadence" value={formatSupplementExecutionSummary({...item,preferredSchedule:{...item.preferredSchedule,timeOfDay:""}})}/>
      <Row label="Timing" value={formatTiming(item.preferredSchedule?.timeOfDay)}/>
      <Row label="Schedule" value={[item.preferredSchedule?.startDate,item.preferredSchedule?.endDate&&`through ${item.preferredSchedule.endDate}`].filter(Boolean).join(" ")||"Ongoing"}/>
      <Row label="Reminders" value={item.reminderPreference==="remind"?"Remind me":"Keep in plan without reminders"}/>
      <Row label="Priority" value={label(item.priority)}/>
      {item.timeline?.length>0&&<Row label="Dosing Timeline" value={`${item.timeline.length} phase${item.timeline.length===1?"":"s"}`}/>}
      {item.notes&&<Row label="Notes" value={item.notes}/>}
    </div>}
    <Link className="flex min-h-12 items-center justify-center rounded-2xl bg-[var(--primary)] px-4 text-sm font-extrabold text-white" href={`/profile/operating-plan/execution/supplements/${encodeURIComponent(protocol.id)}?edit=1`}>{item?"Edit Execution":"Configure Execution"}</Link>
  </div></main>;
}
function Row({label:heading,value}){return <Card className="space-y-1"><h2 className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-muted)]">{heading}</h2><p className="text-sm font-semibold leading-6 text-[var(--text-primary)]">{value}</p></Card>}
function label(value){return String(value??"").replaceAll("_"," ").replace(/\b\w/g,(letter)=>letter.toUpperCase());}
function formatTiming(value){if(!value)return"Not specified";if(/^\d{2}:\d{2}$/.test(value)){const[h,m]=value.split(":").map(Number);return new Date(2000,0,1,h,m).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"});}return label(value);}
