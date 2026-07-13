import { founderAnalyses } from "../founderSeed/analyses";
import { latestByDate } from "./repositoryUtils";

export function createAnalysisRepository(analyses = [], options = {}) {
  return {
    async listAnalyses() {
      return analyses;
    },

    async getLatestAnalysis() {
      return latestByDate(analyses, "createdAt");
    },

    async getLatestAnalysisByType(evidenceType) {
      return latestByDate(
        analyses.filter((analysis) => analysis.evidenceTypes?.includes(evidenceType)),
        "createdAt"
      );
    },

    async getAnalysisById(analysisId) {
      return analyses.find((analysis) => analysis.id === analysisId) ?? null;
    },

    async createAnalysis(analysis) {
      const matchingAnalyses = analyses.filter((item) =>
        hasSameEvidenceTarget(item, analysis)
      );

      if (matchingAnalyses.length > 0) {
        for (let index = analyses.length - 1; index >= 0; index -= 1) {
          if (hasSameEvidenceTarget(analyses[index], analysis)) {
            analyses.splice(index, 1);
          }
        }

        analyses.push({
          ...analysis,
          replacedAnalysisHistory: [
            ...matchingAnalyses.flatMap(
              (item) => item.replacedAnalysisHistory ?? []
            ),
            ...matchingAnalyses.map((item) => ({
              replacedAt: analysis.createdAt ?? new Date().toISOString(),
              analysis: item,
              reason: "Authoritative evidence correction recomputed analysis.",
            })),
          ],
        });
      } else {
        analyses.push(analysis);
      }

      options.onChange?.();

      return analysis;
    },
  };
}

export const AnalysisRepository = createAnalysisRepository(founderAnalyses);

function hasSameEvidenceTarget(left, right) {
  const leftEvidenceIds = normalizeList(left.evidenceIds);
  const rightEvidenceIds = normalizeList(right.evidenceIds);

  if (leftEvidenceIds.length === 0 || rightEvidenceIds.length === 0) {
    return false;
  }

  return (
    leftEvidenceIds.join("|") === rightEvidenceIds.join("|") &&
    normalizeList(left.evidenceTypes).join("|") ===
      normalizeList(right.evidenceTypes).join("|")
  );
}

function normalizeList(value) {
  return [...(Array.isArray(value) ? value : [])].sort();
}
