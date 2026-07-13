import { getFounderAlphaPhotoSessionCompletion } from "../models/progressPhotoPoseVocabulary";

export function evaluateScheduledCompletion({ canonicalObjects = [], evidencePackage } = {}) {
  return (evidencePackage?.evidence_objects ?? []).filter((item) => item.removed !== true).map((item) => {
    const type = normalizeType(item.evidence_type);
    const observedDate = String(item.observed_at ?? "").slice(0, 10);
    const canonical = canonicalObjects.find((object) => normalizeType(object.evidence_type) === type && object.quality?.status !== "superseded" && (!observedDate || String(object.lastObservedAt ?? object.payload?.observed_at ?? "").slice(0, 10) === observedDate));
    let satisfied = Boolean(canonical);
    let reason = satisfied ? "Confirmed canonical evidence satisfies the scheduled item." : "No confirmed canonical evidence is available.";
    if (type === "photo_session") {
      const completion = getFounderAlphaPhotoSessionCompletion(canonical?.payload?.photos ?? []);
      satisfied = Boolean(canonical) && completion.complete;
      reason = satisfied ? "Confirmed canonical PhotoSession contains three unique required poses." : `Canonical PhotoSession is missing: ${completion.missingPoseIds.join(", ")}.`;
    }
    return { evidenceType: type, observedDate, canonicalEvidenceId: canonical?.canonicalId ?? null, satisfied, reason };
  });
}

function normalizeType(value) {
  if (["morning_weight", "weight"].includes(value)) return "weight";
  if (["dexa", "dexa_scan", "body_composition"].includes(value)) return "dexa";
  if (["workout", "training_session"].includes(value)) return "training";
  return value;
}
