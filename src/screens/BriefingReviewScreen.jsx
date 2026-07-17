import Link from "next/link";
import Card from "../components/ui/Card";
import DailyBriefingScreen from "./DailyBriefingScreen";

export default function BriefingReviewScreen({ artifact, preview }) {
  return <main className="app-surface min-h-screen"><div className="mx-auto max-w-[720px] px-4 pt-10">
    <Link className="font-bold text-[var(--primary)]" href="/briefings/review">← Briefing History</Link>
    <h1 className="mt-5 text-3xl font-extrabold">Historical Briefing Review</h1>
    <Card className="mt-5 space-y-2"><p className="text-xs font-extrabold uppercase text-indigo-600">Artifact metadata</p><p><b>ID:</b> {artifact.id}</p><p><b>Type:</b> {artifact.artifactType}</p><p><b>Cadence:</b> {artifact.cadence}</p><p><b>Generated:</b> {artifact.generatedAt}</p><p><b>Opened:</b> {artifact.lifecycle?.openedAt ?? "Never"}</p><p><b>Consumed:</b> {artifact.lifecycle?.consumedAt ?? "No"}</p><p><b>Evidence ID:</b> {artifact.trigger?.evidenceId ?? "None"}</p><p><b>PhotoSession:</b> {artifact.trigger?.evidenceType === "photo_session" ? artifact.trigger.evidenceId : "None"}</p><p><b>Composer:</b> {artifact.briefing?.composerVersion ?? artifact.briefing?.version ?? "Legacy"}</p><p><b>Artifact version:</b> {artifact.briefing?.version ?? "Legacy"}</p></Card>
    <div className="mt-5 flex gap-3"><Link className="rounded-xl bg-[var(--primary)] px-4 py-3 font-extrabold text-white" href={`/briefings/review/${artifact.id}?preview=1`}>Regenerate Preview</Link></div>
    <h2 className="mt-8 text-xl font-extrabold">Original</h2>
  </div><DailyBriefingScreen backHref={`/briefings/review/${artifact.id}`} backLabel="Review" briefing={{...artifact.briefing, artifactType: artifact.artifactType}} eyebrow={artifact.cadence === "weekly" ? "Weekly Briefing" : "Daily Briefing"}/>
  {preview && <><div className="mx-auto max-w-[720px] px-4"><h2 className="text-xl font-extrabold text-indigo-600">Preview · current code</h2><p className="mt-1 text-sm text-slate-500">Generated {preview.previewGeneratedAt}. Non-destructive: the original artifact and lifecycle above are unchanged.</p></div><DailyBriefingScreen backHref={`/briefings/review/${artifact.id}`} backLabel="Review" briefing={preview}/></>}
  </main>;
}
