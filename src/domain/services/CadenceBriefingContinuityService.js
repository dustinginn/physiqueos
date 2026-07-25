const SUPPORTED_CADENCES = new Set(["midweek", "weekly"]);

export async function loadLatestCadenceBriefingContinuity({
  repository,
  userId,
  cadence,
  excludeArtifactId = null,
} = {}) {
  if (!SUPPORTED_CADENCES.has(cadence)) {
    throw new Error(`Unsupported cadence continuity request: ${cadence}`);
  }
  const method = cadence === "midweek"
    ? repository?.getLatestMidweekBriefing
    : repository?.getLatestWeeklyBriefing;
  if (typeof method !== "function") {
    return unavailable("bounded_same_cadence_read_unavailable");
  }
  try {
    const artifact = await method.call(repository, userId, {
      excludeArtifactId,
    });
    if (!artifact) return unavailable("same_cadence_history_empty");
    return createCadenceContinuityInput(artifact, cadence);
  } catch {
    return unavailable("same_cadence_history_read_failed");
  }
}

export function createCadenceContinuityInput(artifact, cadence) {
  if (!artifact || artifact.cadence !== cadence || !artifact.briefing) {
    return unavailable("completed_same_cadence_artifact_unavailable");
  }
  const rawMemory =
    artifact.piMemory ??
    artifact.briefing.piMemory ??
    artifact.briefing.briefingMemory ??
    artifact.briefing.weeklyNarrative?.piMemory ??
    null;
  const memory = normalizePIBriefingMemory(rawMemory, { cadence });
  if (!memory) {
    return unavailable("structured_pi_memory_unavailable", artifact);
  }
  return Object.freeze({
    status: "available",
    cadence,
    sourceArtifactId: artifact.id,
    sourceBriefingDate:
      artifact.briefing.briefingDate ??
      artifact.briefing.weeklyNarrative?.weekEnd ??
      artifact.evidenceWindow?.endDate ??
      null,
    memory,
    communicatedClaimIds: unique(memory.communicatedClaimIds).slice(-24),
    claimHistory: normalizeHistory(memory.claimHistory).slice(-48),
    trainingPRIds: unique(memory.trainingPRClaimIds).slice(-24),
    priorClaims: Array.isArray(memory.priorClaims)
      ? structuredClone(memory.priorClaims).slice(-12)
      : [],
    limitations: [],
    provenance: {
      source: "bounded_same_cadence_briefing_history",
      readLimit: 1,
      proseParsed: false,
    },
  });
}

function unavailable(reason, artifact = null) {
  return Object.freeze({
    status: "unavailable",
    cadence: artifact?.cadence ?? null,
    sourceArtifactId: artifact?.id ?? null,
    sourceBriefingDate: artifact?.evidenceWindow?.endDate ?? null,
    memory: null,
    communicatedClaimIds: [],
    claimHistory: [],
    trainingPRIds: [],
    priorClaims: [],
    limitations: [reason],
    provenance: {
      source: "bounded_same_cadence_briefing_history",
      readLimit: 1,
      proseParsed: false,
    },
  });
}

function normalizeHistory(entries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .filter((entry) => entry && typeof entry.claimId === "string")
    .map((entry) => ({
      claimId: entry.claimId,
      communicatedAt: entry.communicatedAt ?? null,
      lifecycleState: entry.lifecycleState ?? null,
    }));
}

function unique(values) {
  return [...new Set(Array.isArray(values) ? values.filter(Boolean) : [])];
}
import { normalizePIBriefingMemory } from "./PIBriefingMemoryService";
