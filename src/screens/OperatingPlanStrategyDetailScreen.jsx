import Link from "next/link";
import { ArrowLeft, CalendarDays, Target } from "lucide-react";
import Card from "../components/ui/Card";
import IconBadge from "../components/ui/IconBadge";

export default function OperatingPlanStrategyDetailScreen({ detail }) {
  return <main className="app-surface min-h-screen"><div className="mx-auto max-w-[393px] px-4 pb-28 pt-10">
    <Link className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]" href="/profile/operating-plan"><ArrowLeft size={18}/>Operating Plan</Link>
    {!detail ? <Unavailable/> : <>
      <header className="mb-6 space-y-2"><p className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--primary)]">{detail.eyebrow}</p><h1 className="text-3xl font-extrabold leading-tight text-[var(--text-primary)]">{detail.title}</h1><p className="text-sm font-medium leading-6 text-[var(--text-secondary)]">{detail.purpose}</p></header>
      <div className="space-y-4">
        <Card className="space-y-3" variant="accent"><div className="flex items-center justify-between gap-3"><p className="text-[10px] font-extrabold uppercase tracking-[.1em] text-[var(--primary)]">Current Strategy</p><span className="rounded-full bg-[var(--surface-elevated)] px-3 py-1 text-xs font-extrabold text-[var(--text-primary)]">{detail.status}</span></div><dl className="grid grid-cols-2 gap-2">{detail.sections.filter(Boolean).map((item)=><div className="rounded-xl bg-[var(--surface-elevated)] p-3" key={item.label}><dt className="text-[10px] font-extrabold uppercase tracking-[.08em] text-[var(--text-muted)]">{item.label}</dt><dd className="mt-1 text-sm font-extrabold leading-5 text-[var(--text-primary)]">{item.value}</dd></div>)}</dl></Card>
        <Card className="space-y-3"><div className="flex items-center gap-3"><IconBadge className="rounded-full" color="primary" icon={Target} size="sm"/><h2 className="font-extrabold text-[var(--text-primary)]">Goal Supported</h2></div><p className="text-sm font-semibold text-[var(--text-secondary)]">{detail.goal ?? "No Goal is attached to this strategy."}</p></Card>
        {detail.startedDate&&<Card className="space-y-3"><div className="flex items-center gap-3"><IconBadge className="rounded-full" color="primary" icon={CalendarDays} size="sm"/><h2 className="font-extrabold text-[var(--text-primary)]">Started</h2></div><p className="text-sm font-semibold text-[var(--text-secondary)]">{detail.startedDate}</p></Card>}
        {detail.editHref&&<Link className="flex min-h-12 items-center justify-center rounded-2xl bg-[var(--primary)] px-4 text-sm font-extrabold text-white" href={detail.editHref}>{detail.editLabel ?? "Edit Strategy"}</Link>}
      </div>
    </>}
  </div></main>;
}
function Unavailable(){return <section aria-live="polite"><h1 className="text-3xl font-extrabold text-[var(--text-primary)]">This strategy is not available right now.</h1><p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">Return to the Operating Plan to review the strategies currently available.</p></section>;}
