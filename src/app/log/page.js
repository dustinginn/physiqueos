import { FounderRepositories } from "../../data/repositories/founderRepositories";
import { createEvidenceReviewPresentation } from "../../domain/services/EvidenceReviewPresentationService";
import LogHubScreen from "../../screens/LogHubScreen";

export const dynamic = "force-dynamic";

export default async function LogPage({ searchParams }) {
  const params = await searchParams;
  const user = await FounderRepositories.users.getCurrentUser();
  const evidenceReviews = await FounderRepositories.evidenceReviews.listReviews(user.id);

  return (
    <LogHubScreen
      error={params?.error ?? null}
      saved={params?.saved ?? null}
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
    const presentation=createEvidenceReviewPresentation({evidencePackage:review.interpretedEvidence,itemDecisions:review.itemDecisions});
    const fingerprint=JSON.stringify(objects.map((item)=>[item.evidence_type,String(item.observed_at).slice(0,10),item.source_file??item.provenance?.source_artifact_refs]).sort());
    const likelyDuplicate=fingerprints.has(fingerprint); fingerprints.add(fingerprint);
    const date=String(review.interpretedEvidence?.observed_at??objects[0]?.observed_at??review.createdAt).slice(0,10);
    const training=objects.find((item)=>item.evidence_type==="training");
    return {
      id:review.id,
      date:formatPendingReviewDate(date),
      title:training?.metadata?.activity_type ? `${training.metadata.activity_type} ready to review` : `${presentation.items[0]?.title??"Check-in"} ready to review`,
      summary:formatPendingReviewSummary(presentation.items),
      likelyDuplicate,
    };
  });
}

function formatPendingReviewDate(value) {
  const [year,month,day]=String(value).split("-").map(Number);
  if (![year,month,day].every(Number.isFinite)) return "Date unavailable";
  return new Date(year,month-1,day).toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"});
}

function formatPendingReviewSummary(items) {
  const counts=new Map();
  items.forEach((item)=>counts.set(item.noun,(counts.get(item.noun)??0)+1));
  return [...counts].map(([noun,count])=>`${count} ${count===1?noun:pluralize(noun)}`).join(", ");
}

function pluralize(noun) {
  return noun.endsWith("entry") ? `${noun.slice(0,-5)}entries` : `${noun}s`;
}
