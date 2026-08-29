import { describe, expect, it } from "vitest";
import {
  attachBriefingDependencyManifest,
} from "./BriefingDependencyManifestService";
import {
  createBriefingReconciliationEnqueueService,
} from "./BriefingReconciliationEnqueueService";

const USER = "user_founder_001";
const ZONE = "America/Los_Angeles";

describe("current-briefing late-evidence eligibility", () => {
  it("does not create work for the August 28 Morning weight outside the current window", () => {
    const candidate = store([
      publication("midweek-current", "midweek", "2026-08-23", "2026-08-25",
        "2026-08-26T16:00:00.000Z"),
    ]);
    const result = enqueue(candidate, morningWeight("2026-08-28",
      "2026-08-29T02:30:00.000Z"), "2026-08-29T02:30:00.000Z");

    expect(result).toMatchObject({ changed: false, workItemIds: [] });
    expect(candidate.briefingReconciliationWorkItems).toEqual([]);
  });

  it("creates durable work when yesterday evidence changes today's current briefing", () => {
    const current = publication("weekly-current", "weekly",
      "2026-08-23", "2026-08-29", "2026-08-30T15:00:00.000Z");
    const candidate = store([current]);
    const result = enqueue(candidate, training("2026-08-29",
      "2026-08-30T20:00:00.000Z"), "2026-08-30T20:00:00.000Z");

    expect(result).toMatchObject({
      changed: true,
      affectedPublicationIds: [current.id],
    });
    expect(result.workItemIds).toHaveLength(1);
    expect(candidate.briefingReconciliationWorkItems[0]).toMatchObject({
      publicationRootId: current.id,
      status: "revision_pending",
      affectedDependencies: [expect.objectContaining({
        evidenceType: "training",
        observedDate: "2026-08-29",
      })],
    });
  });

  it("targets current A and never claims unrelated historical B", () => {
    const historical = publication("weekly-historical", "weekly",
      "2026-08-16", "2026-08-22", "2026-08-23T15:00:00.000Z");
    const current = publication("weekly-current", "weekly",
      "2026-08-23", "2026-08-29", "2026-08-30T15:00:00.000Z");
    const oldWork = {
      id: "historical-retry",
      publicationRootId: historical.id,
      status: "failed",
      attempts: 1,
      failure: { retryable: true },
      affectedDependencies: [{ observedDate: "2026-08-22" }],
    };
    const candidate = store([historical, current], [oldWork]);
    const result = enqueue(candidate, training("2026-08-29",
      "2026-08-30T20:00:00.000Z"), "2026-08-30T20:00:00.000Z");

    expect(result.affectedPublicationIds).toEqual([current.id]);
    expect(result.workItemIds).not.toContain(oldWork.id);
    expect(candidate.briefingReconciliationWorkItems.find((item) =>
      item.id === oldWork.id)).toEqual(oldWork);
  });

  it("does not enqueue an already represented dependency", () => {
    const evidence = training("2026-08-29", "2026-08-30T20:00:00.000Z");
    const current = attachBriefingDependencyManifest(
      publication("weekly-current", "weekly",
        "2026-08-23", "2026-08-29", "2026-08-30T15:00:00.000Z"),
      [evidence],
    );
    const candidate = store([current]);

    expect(enqueue(candidate, evidence, "2026-08-30T20:00:00.000Z"))
      .toMatchObject({ changed: false, workItemIds: [] });
  });

  it("does not duplicate work when the same qualifying evidence is reconciled again", () => {
    const current = publication("weekly-current", "weekly",
      "2026-08-23", "2026-08-29", "2026-08-30T15:00:00.000Z");
    const candidate = store([current]);
    const evidence = training("2026-08-29", "2026-08-30T20:00:00.000Z");

    const first = enqueue(candidate, evidence, evidence.updatedAt);
    const firstItem = structuredClone(candidate.briefingReconciliationWorkItems[0]);
    const second = enqueue(candidate, evidence, evidence.updatedAt);

    expect(first.workItemIds).toHaveLength(1);
    expect(second).toMatchObject({ changed: false, workItemIds: [] });
    expect(candidate.briefingReconciliationWorkItems).toEqual([firstItem]);
  });

  it("ignores evidence types outside the briefing dependency contract", () => {
    const current = publication("weekly-current", "weekly",
      "2026-08-23", "2026-08-29", "2026-08-30T15:00:00.000Z");
    const candidate = store([current]);
    const evidence = {
      canonicalId: "unrelated",
      evidence_type: "unrelated_domain",
      lastObservedAt: "2026-08-29",
      updatedAt: "2026-08-30T20:00:00.000Z",
      payload: { id: "unrelated", evidence_type: "unrelated_domain",
        observed_at: "2026-08-29" },
    };

    expect(enqueue(candidate, evidence, evidence.updatedAt))
      .toMatchObject({ changed: false, workItemIds: [] });
  });
});

function enqueue(candidate, evidence, confirmedAt) {
  return createBriefingReconciliationEnqueueService({
    now: () => new Date(confirmedAt),
  }).stageCanonicalEvidenceChanges(candidate, {
    canonicalChanges: [evidence], confirmedAt, userId: USER,
  });
}

function store(dailyBriefings, workItems = []) {
  return {
    user: { id: USER, timeZone: ZONE },
    goals: [], protocols: [], protocolVersions: [],
    canonicalEvidenceObjects: [],
    dailyBriefings,
    briefingReconciliationWorkItems: structuredClone(workItems),
  };
}

function publication(id, cadence, startDate, endDate, generatedAt) {
  const localDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(generatedAt));
  return {
    id, userId: USER, artifactType: "scheduled", cadence, generatedAt,
    evidenceWindow: {
      id: `${cadence}:${startDate}:${endDate}:${ZONE}`,
      cadence, startDate, endDate, date: endDate,
      briefingDate: localDate,
      ...(cadence === "monthly" ? { deliveryDate: localDate } : {}),
      timeZone: ZONE, closed: true,
    },
    briefing: {
      ...(cadence === "weekly" ? { weeklyNarrative: {} } : {}),
      ...(cadence === "midweek" ? { hero: {} } : {}),
      ...(cadence === "monthly" ? { monthlyPresentation: {} } : {}),
    },
  };
}

function morningWeight(date, updatedAt) {
  return {
    canonicalId: `morning_weight|${USER}|${date}`,
    evidence_type: "morning_weight",
    lastObservedAt: date,
    updatedAt,
    payload: {
      id: `morning_weight_${date}`,
      evidence_type: "morning_weight",
      observed_at: date,
      metadata: { value: 169.1, unit: "lb" },
    },
  };
}

function training(date, updatedAt) {
  return {
    canonicalId: `training-${date}`,
    evidence_type: "training",
    lastObservedAt: date,
    updatedAt,
    payload: {
      id: `training-${date}`,
      evidence_type: "training",
      observed_at: date,
      exercises: [{ id: "fixture", sets: [{ reps: 8, weight: 100 }] }],
    },
  };
}
