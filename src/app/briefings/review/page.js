import Link from "next/link";
import { FounderRepositories } from "../../../data/repositories/founderRepositories";

export const dynamic = "force-dynamic";

export default async function BriefingHistoryPage() {
  const user = await FounderRepositories.users.getCurrentUser();
  const artifacts = (await FounderRepositories.dailyBriefings.listDailyBriefings(user?.id))
    .sort((left, right) => String(right.generatedAt).localeCompare(String(left.generatedAt)));
  const founderPhotoArtifact = artifacts.find((item) => item.id === "daily_briefing_20260710")
    ?? artifacts.find((item) => String(item.generatedAt).startsWith("2026-07-11"));

  return <main className="app-surface min-h-screen"><div className="mx-auto max-w-[720px] px-4 py-10">
    <Link className="font-bold text-[var(--primary)]" href="/">← Home</Link>
    <h1 className="mt-5 text-3xl font-extrabold">Briefing History</h1>
    {founderPhotoArtifact && <Link className="mt-4 inline-flex rounded-xl border border-[var(--divider)] px-4 py-3 text-sm font-extrabold text-[var(--primary)]" href={`/briefings/review/${founderPhotoArtifact.id}`}>Founder link · July 11 photo-era artifact</Link>}
    <div className="mt-6 space-y-3">{artifacts.map((item) => <Link className="block rounded-2xl border border-[var(--divider)] bg-[var(--surface-elevated)] p-4" href={`/briefings/review/${item.id}`} key={item.id}><p className="font-extrabold">{item.briefing?.hero?.title ?? item.id}</p><p className="mt-1 text-xs text-slate-500">{item.cadence} · {item.generatedAt}</p></Link>)}</div>
  </div></main>;
}
