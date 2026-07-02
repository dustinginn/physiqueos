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

    async getAnalysisById(analysisId) {
      return analyses.find((analysis) => analysis.id === analysisId) ?? null;
    },

    async createAnalysis(analysis) {
      analyses.push(analysis);
      options.onChange?.();

      return analysis;
    },
  };
}

export const AnalysisRepository = createAnalysisRepository(founderAnalyses);
