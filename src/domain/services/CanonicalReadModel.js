export function isActiveCanonicalEvidenceObject(canonicalObject = {}) {
  return (
    canonicalObject?.quality?.status !== "superseded" &&
    !canonicalObject?.quality?.supersededBy &&
    !canonicalObject?.retiredAt &&
    !canonicalObject?.quality?.retiredAt &&
    !canonicalObject?.payload?.retiredAt &&
    canonicalObject?.payload?.quality?.status !== "superseded" &&
    !canonicalObject?.payload?.quality?.supersededBy
  );
}

export function decorateCanonicalPayloadForReadModel(payload = {}, canonicalObject = {}) {
  if (!canonicalObject?.canonicalId) return payload;

  return {
    ...payload,
    _canonicalId: canonicalObject.canonicalId,
    _canonicalNutritionRevision: canonicalObject.nutritionRevision ?? null,
    _canonicalProvenance: canonicalObject.provenance ?? null,
    _canonicalQuality: canonicalObject.quality ?? null,
    _canonicalUpdatedAt: canonicalObject.updatedAt ?? null,
  };
}

export function isActiveCanonicalTrainingSession(canonicalObject = {}) {
  const payload = canonicalObject.payload ?? canonicalObject;

  return (
    isActiveCanonicalEvidenceObject(canonicalObject) &&
    payload?.evidence_type === "training"
  );
}
