import { createAnalysisRepository } from "../../data/repositories/AnalysisRepository.js";
import { createProgressPhotoRepository } from "../../data/repositories/ProgressPhotoRepository.js";
import { loadApplicationCanonicalCommitBindings } from "../runtime/ApplicationCanonicalRuntime.js";

// Post-confirmation steps that persist a single collection (analysis, goal
// evaluation, progress-photo compatibility rows) must not go through the
// repository facade. That path loads the whole canonical runtime (about 50 MB of
// canonical JSON in production), clones it, and rewrites every changed
// collection, which peaks near 340 MB of the worker's roughly 500 MB heap for a
// single write. The bounded runtime mutation loads, digests, and rewrites only
// the named collection, the way Priority completion, briefing publication, and
// canonical commit already do.
export const CONFIRMATION_ANALYSIS_COLLECTIONS = Object.freeze(["analyses"]);
export const CONFIRMATION_PROGRESS_PHOTO_COLLECTIONS = Object.freeze(["progressPhotos"]);

async function loadBoundedMutation(loadCanonicalCommitBindings) {
  const bindings = await loadCanonicalCommitBindings();
  return typeof bindings?.mutateCanonicalRuntime === "function"
    ? bindings.mutateCanonicalRuntime
    : null;
}

function boundedInput(operation, collections) {
  return {
    operation,
    allowedCollections: collections,
    readCollections: collections,
    readApplicationContext: false,
    readImportMetadata: false,
    allowApplicationContextMutation: false,
  };
}

export function createConfirmationAnalysisWriter({
  repositories,
  loadCanonicalCommitBindings = loadApplicationCanonicalCommitBindings,
} = {}) {
  // Persists every analysis of one confirmation unit in a single bounded write.
  // createAnalysis replaces an analysis for the same evidence target, so replaying
  // the same batch after a lost acknowledgement leaves the same final state.
  return async function persistConfirmationAnalyses(analyses = []) {
    const batch = (analyses ?? []).filter(Boolean);
    if (batch.length === 0) return [];
    const mutate = await loadBoundedMutation(loadCanonicalCommitBindings);
    if (!mutate) {
      // Legacy or in-memory composition: no bounded runtime exists, so the
      // repository is the only durable path.
      for (const analysis of batch) await repositories.analyses.createAnalysis(analysis);
      return batch;
    }
    await mutate({
      ...boundedInput("evidence-confirmation-analysis-persistence", CONFIRMATION_ANALYSIS_COLLECTIONS),
      async mutate(candidate) {
        candidate.analyses = Array.isArray(candidate.analyses) ? candidate.analyses : [];
        const repository = createAnalysisRepository(candidate.analyses);
        for (const analysis of batch) await repository.createAnalysis(structuredClone(analysis));
        return { analysisIds: batch.map((analysis) => analysis.id) };
      },
    });
    return batch;
  };
}

export function createConfirmationProgressPhotoWriter({
  repositories,
  loadCanonicalCommitBindings = loadApplicationCanonicalCommitBindings,
} = {}) {
  // Writes the compatibility rows for one confirmed PhotoSession. A photo whose
  // retained image path is already present for the capture date is skipped, and
  // upsert is keyed by a stable id, so a replay writes nothing new.
  return async function persistConfirmationProgressPhotos({ userId, date, records = [] } = {}) {
    if (records.length === 0) return [];
    const apply = async (repository) => {
      const existing = await repository.getPhotosByDate(userId, date);
      const written = [];
      for (const record of records) {
        if (existing.some((item) => item.imagePath === record.imagePath)) continue;
        await repository.upsertPhoto(structuredClone(record));
        written.push(record.id);
      }
      return written;
    };
    const mutate = await loadBoundedMutation(loadCanonicalCommitBindings);
    if (!mutate) return apply(repositories.progressPhotos);
    const committed = await mutate({
      ...boundedInput("evidence-confirmation-progress-photo-persistence", CONFIRMATION_PROGRESS_PHOTO_COLLECTIONS),
      async mutate(candidate) {
        candidate.progressPhotos = Array.isArray(candidate.progressPhotos) ? candidate.progressPhotos : [];
        return { written: await apply(createProgressPhotoRepository(candidate.progressPhotos)) };
      },
    });
    return committed.result.written;
  };
}
