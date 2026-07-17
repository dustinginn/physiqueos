export function resolveBriefingReviewArtifact(artifacts = [], { artifactId, version = null } = {}) {
  const root = artifacts.find((item) => item.id === artifactId) ?? null;
  if (!root || !version) return root;
  if (matchesVersion(root, version)) return root;
  return (root.replacedBriefingHistory ?? [])
    .map((entry) => entry?.artifact)
    .find((artifact) => matchesVersion(artifact, version)) ?? null;
}

function matchesVersion(artifact, requested) {
  const value = String(requested ?? "");
  return [
    artifact?.generatedAt,
    artifact?.briefing?.version,
    artifact?.briefing?.weeklyNarrative?.id,
    artifact?.briefing?.photoEventNarrative?.id,
    artifact?.briefing?.narrative?.id,
  ].filter(Boolean).map(String).includes(value);
}
