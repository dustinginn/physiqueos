import { latestByDate } from "./repositoryUtils";
import { assertFlatBriefingHistory, classifyBriefingCadence, createBriefingHistoryEntry, flattenBriefingHistory, getBriefingOccurrenceIdentity } from "./DailyBriefingHistory";

export function createDailyBriefingRepository(dailyBriefings = [], options = {}) {
  return {
    async listDailyBriefings(userId) {
      return dailyBriefings.filter((briefing) => briefing.userId === userId);
    },

    async getLatestDailyBriefing(userId, options) { return selectLatest(userId, "daily", options); },
    async getLatestScheduledDailyBriefing(userId, options) { return selectLatest(userId, "daily", options); },
    async getLatestWeeklyBriefing(userId, options) { return selectLatest(userId, "weekly", options); },
    async getLatestMonthlyBriefing(userId, options) { return selectLatest(userId, "monthly", options); },
    async getLatestEventBriefing(userId, options) { return selectLatest(userId, "event", options); },
    async getLatestBriefingArtifact(userId, options = {}) { return selectLatest(userId, null, options); },

    async getLatestScheduledBriefing(userId) {
      return latestByDate(
        dailyBriefings.filter((item) => item.userId === userId && item.artifactType !== "event"),
        "generatedAt"
      );
    },

    async getBriefingByEvidenceWindow(userId, windowId) {
      return dailyBriefings.find((item) => item.userId === userId && item.artifactType !== "event" && item.evidenceWindow?.id === windowId) ?? null;
    },

    async claimScheduledBriefing({ artifactId, evidenceWindow, claimedAt, userId }) {
      const existing = dailyBriefings.find((item) => item.id === artifactId);
      if (existing) {
        if (existing.lifecycle?.generationStatus === "failed") {
          existing.lifecycle = {
            ...existing.lifecycle,
            generationStatus: "in_progress",
            claimedAt,
            failedAt: null,
            failureReason: null,
          };
          existing.updatedAt = claimedAt;
          options.onChange?.();
          return { acquired: true, artifact: structuredClone(existing), state: "in_progress" };
        }
        return {
          acquired: false,
          artifact: structuredClone(existing),
          state: existing.lifecycle?.generationStatus ?? (existing.briefing ? "complete" : "in_progress"),
        };
      }

      const claim = {
        id: artifactId,
        userId,
        artifactType: "scheduled",
        cadence: evidenceWindow.cadence,
        generatedAt: null,
        evidenceWindow: structuredClone(evidenceWindow),
        lifecycle: {
          generationStatus: "in_progress",
          claimedAt,
          generatedAt: null,
          failedAt: null,
          failureReason: null,
          openedAt: null,
          consumedAt: null,
        },
        trigger: {},
        briefing: null,
        createdAt: claimedAt,
        updatedAt: claimedAt,
      };
      dailyBriefings.push(claim);
      options.onChange?.();
      return { acquired: true, artifact: structuredClone(claim), state: "in_progress" };
    },

    async completeScheduledBriefing(artifact) {
      const index = dailyBriefings.findIndex((item) => item.id === artifact.id);
      if (index < 0) throw new Error(`Scheduled briefing claim ${artifact.id} was not found.`);
      dailyBriefings[index] = structuredClone(artifact);
      assertFlatBriefingHistory(dailyBriefings);
      options.onChange?.();
      return structuredClone(artifact);
    },

    async failScheduledBriefing(id, { failedAt, reason }) {
      const artifact = dailyBriefings.find((item) => item.id === id);
      if (!artifact) return null;
      artifact.lifecycle = {
        ...(artifact.lifecycle ?? {}),
        generationStatus: "failed",
        failedAt,
        failureReason: reason,
      };
      artifact.updatedAt = failedAt;
      options.onChange?.();
      return structuredClone(artifact);
    },

    async getLatestActiveEventBriefing(userId) {
      return latestByDate(
        dailyBriefings.filter((item) => item.userId === userId && item.artifactType === "event" && !item.lifecycle?.consumedAt),
        "generatedAt"
      );
    },

    async markBriefingOpened(id, openedAt = new Date().toISOString()) {
      return updateLifecycle(id, { openedAt });
    },

    async markBriefingConsumed(id, consumedAt = new Date().toISOString()) {
      return updateLifecycle(id, { consumedAt });
    },

    async markBriefingSurfaced(id, surfacedAt = new Date().toISOString()) {
      return updateLifecycle(id, { surfacedAt });
    },

    async createDailyBriefing(briefing) {
      const matchingBriefings = dailyBriefings.filter((item) =>
        hasSameBriefingOccurrence(item, briefing)
      );

      if (matchingBriefings.length > 0) {
        for (let index = dailyBriefings.length - 1; index >= 0; index -= 1) {
          if (hasSameBriefingOccurrence(dailyBriefings[index], briefing)) {
            dailyBriefings.splice(index, 1);
          }
        }

        dailyBriefings.push({
          ...briefing,
          replacedBriefingHistory: buildReplacementHistory(matchingBriefings, briefing),
        });
      } else {
        dailyBriefings.push(briefing);
      }

      assertFlatBriefingHistory(dailyBriefings);
      options.onChange?.();

      return briefing;
    },
  };

  function updateLifecycle(id, changes) {
    const briefing = dailyBriefings.find((item) => item.id === id);
    if (!briefing) return null;
    briefing.lifecycle = { ...(briefing.lifecycle ?? {}), ...changes };
    briefing.updatedAt = Object.values(changes)[0];
    options.onChange?.();
    return briefing;
  }

  function selectLatest(userId, cadence, { excludeArtifactId = null } = {}) {
    return dailyBriefings.filter((item) => item.userId === userId && item.id !== excludeArtifactId && item.preview !== true && item.lifecycle?.preview !== true && item.lifecycle?.generationStatus !== "in_progress" && item.lifecycle?.generationStatus !== "failed" && Boolean(item.briefing) && (!cadence || classifyBriefingCadence(item) === cadence)).sort(compareBriefingRecency)[0] ?? null;
  }
}

function compareBriefingRecency(left, right) {
  return String(right.generatedAt ?? right.createdAt ?? "").localeCompare(String(left.generatedAt ?? left.createdAt ?? "")) || String(right.id ?? "").localeCompare(String(left.id ?? ""));
}

function hasSameBriefingOccurrence(left, right) {
  const leftIdentity = getBriefingOccurrenceIdentity(left);
  const rightIdentity = getBriefingOccurrenceIdentity(right);
  return Boolean(leftIdentity && rightIdentity && leftIdentity === rightIdentity);
}

function buildReplacementHistory(matching, replacement) {
  const entries = matching.flatMap((item) => [
    ...flattenBriefingHistory(item, { replacedByArtifactId: replacement.id }),
    createBriefingHistoryEntry(item, {
      replacedAt: replacement.generatedAt ?? new Date().toISOString(),
      replacedByArtifactId: replacement.id,
      reason: "Authoritative evidence correction regenerated briefing.",
    }),
  ]);
  return flattenBriefingHistory({ replacedBriefingHistory: entries }, { replacedByArtifactId: replacement.id });
}
