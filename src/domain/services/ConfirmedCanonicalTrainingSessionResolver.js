function uniqueStrings(values = []) {
  return [...new Set((values ?? []).map((value) => String(value ?? "").trim()).filter(Boolean))];
}

export function resolveConfirmedCanonicalTrainingSession({
  reviewItem,
  canonicalEvidenceObjects = [],
  canonicalCommitResults = [],
} = {}) {
  if (!reviewItem || reviewItem.evidence_type !== "training") {
    return { status: "not_training", canonicalSession: null, canonicalCommitResult: null };
  }

  const sourceRefs = uniqueStrings([
    reviewItem.id,
    ...(reviewItem.source?.source_artifact_refs ?? []),
    ...(reviewItem.provenance?.source_artifact_refs ?? []),
    ...(reviewItem.references?.source_artifact_refs ?? []),
  ]);

  if (sourceRefs.length === 0) {
    return {
      status: "canonical_mapping_missing",
      canonicalSession: null,
      canonicalCommitResult: null,
      sourceRefs,
    };
  }

  const commitResult = resolveFromCommittedMapping({
    canonicalCommitResults,
    canonicalEvidenceObjects,
    reviewItem,
    sourceRefs,
  });
  if (commitResult?.canonicalSession) {
    return commitResult;
  }

  const candidates = canonicalEvidenceObjects.filter((item) =>
    item?.evidence_type === "training" &&
    item?.quality?.status === "active" &&
    referencesIncludeAll(item, sourceRefs)
  );

  if (candidates.length === 1) {
    return {
      status: "resolved",
      canonicalSession: candidates[0],
      canonicalCommitResult: null,
      sourceRefs,
      resolutionPath: "source_reference",
    };
  }

  if (candidates.length > 1) {
    return {
      status: "ambiguous_canonical_session",
      canonicalSession: null,
      canonicalCommitResult: null,
      sourceRefs,
      candidateIds: candidates.map((item) => item.canonicalId).sort(),
    };
  }

  const explicitCanonicalId = String(
    reviewItem.reconciliation?.canonical_id ??
      reviewItem.canonicalId ??
      ""
  ).trim();
  if (explicitCanonicalId) {
    const explicit = canonicalEvidenceObjects.find(
      (item) => item.canonicalId === explicitCanonicalId
    );
    if (explicit) {
      return {
        status: "resolved",
        canonicalSession: explicit,
        canonicalCommitResult: commitResult?.canonicalCommitResult ?? null,
        sourceRefs,
        resolutionPath: "explicit_canonical_id",
      };
    }
  }

  return {
    status: commitResult?.status ?? "canonical_session_missing",
    canonicalSession: null,
    canonicalCommitResult: commitResult?.canonicalCommitResult ?? null,
    sourceRefs,
  };
}

function resolveFromCommittedMapping({
  canonicalCommitResults = [],
  canonicalEvidenceObjects = [],
  reviewItem,
  sourceRefs,
} = {}) {
  const mapped = uniqueStrings([
    reviewItem?.id,
    reviewItem?.source?.source_artifact_refs?.[0],
    reviewItem?.provenance?.source_artifact_refs?.[0],
  ]);
  const matches = (canonicalCommitResults ?? []).filter((result) => {
    const resultRefs = uniqueStrings([
      result?.reviewItemId,
      result?.sourceEvidenceId,
      result?.originalNormalizedId,
    ]);
    return (
      result?.canonicalEntityType === "training" &&
      result?.canonicalEntityId &&
      (mapped.some((value) => resultRefs.includes(value)) ||
        referencesIncludeAny(result?.canonicalSourceReferences ?? [], sourceRefs))
    );
  });

  if (matches.length > 1) {
    return {
      status: "ambiguous_canonical_session",
      canonicalSession: null,
      canonicalCommitResult: null,
      sourceRefs,
      candidateIds: matches.map((item) => item.canonicalEntityId).sort(),
    };
  }

  const canonicalCommitResult = matches[0] ?? null;
  if (!canonicalCommitResult) {
    return null;
  }

  const canonicalSession = canonicalEvidenceObjects.find(
    (item) => item.canonicalId === canonicalCommitResult.canonicalEntityId
  );

  if (canonicalSession) {
    return {
      status: "resolved",
      canonicalSession,
      canonicalCommitResult,
      sourceRefs,
      resolutionPath: "persisted_commit_mapping",
    };
  }

  return {
    status: "canonical_session_missing",
    canonicalSession: null,
    canonicalCommitResult,
    sourceRefs,
  };
}

function referencesIncludeAll(candidate = {}, sourceRefs = []) {
  const candidateRefs = uniqueStrings([
    ...(candidate?.provenance?.source_artifact_refs ?? []),
    ...(candidate?.provenance?.contributing_evidence_object_ids ?? []),
    ...(candidate?.source?.source_artifact_refs ?? []),
  ]);
  return sourceRefs.every((ref) => candidateRefs.includes(ref));
}

function referencesIncludeAny(candidateRefs = [], sourceRefs = []) {
  const uniqueCandidateRefs = uniqueStrings(candidateRefs);
  return uniqueCandidateRefs.some((ref) => sourceRefs.includes(ref));
}
