import { FounderRepositories } from "../../data/repositories/founderRepositories";
import { DailyFocusService } from "../../domain/services/DailyFocusService";
import LogHubScreen from "../../screens/LogHubScreen";
import {
  completeLogReminder,
  completeLogSupplement,
  saveLogNote,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function LogPage({ searchParams }) {
  const params = await searchParams;
  const user = await FounderRepositories.users.getCurrentUser();
  const [protocols, reminders, checkIns, latestWeight, progressPhotos, evidenceReviews] = await Promise.all([
    FounderRepositories.protocols.listActiveProtocols(user.id),
    FounderRepositories.reminders.listActiveReminders(user.id),
    FounderRepositories.dailyCheckIns.listCheckIns(user.id),
    FounderRepositories.weights.getLatestWeightEntry(user.id),
    FounderRepositories.progressPhotos?.listPhotos(user.id) ?? [],
    FounderRepositories.evidenceReviews.listReviews(user.id),
  ]);
  const sessions = DailyFocusService.getDailySessions({
    checkIns,
    latestWeight,
    progressPhotos,
    reminders,
  });

  return (
    <LogHubScreen
      activeSessionId={params?.session ?? null}
      completeReminderAction={completeLogReminder}
      completeSupplementAction={completeLogSupplement}
      contextualizedUpload={params?.contextualized === "1"}
      error={params?.error ?? null}
      noteAction={saveLogNote}
      objects={params?.objects ?? null}
      protocols={protocols}
      reminders={reminders}
      saved={params?.saved ?? null}
      evidenceView={params?.view ?? null}
      historicalUpload={params?.historical === "1"}
      sessions={sessions}
      uploadAnythingAction="/log/upload"
      pendingEvidenceReviews={projectPendingReviews(evidenceReviews)}
    />
  );
}

function projectPendingReviews(reviews) {
  const pending = reviews.filter((review) => ["pending", "commit_failed", "partially_committed"].includes(review.status)).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  const fingerprints = new Set();
  return pending.map((review) => {
    const objects=review.interpretedEvidence?.evidence_objects??[];
    const fingerprint=JSON.stringify(objects.map((item)=>[item.evidence_type,String(item.observed_at).slice(0,10),item.source_file??item.provenance?.source_artifact_refs]).sort());
    const likelyDuplicate=fingerprints.has(fingerprint); fingerprints.add(fingerprint);
    return { id:review.id, date:String(review.interpretedEvidence?.observed_at??objects[0]?.observed_at??review.createdAt).slice(0,10), itemCount:objects.length, evidenceTypes:review.evidenceTypes??[], likelyDuplicate };
  });
}
