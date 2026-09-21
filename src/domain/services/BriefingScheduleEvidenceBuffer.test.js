import { describe, expect, it } from "vitest";
import { createCadenceEnergyAssessment } from "./CadenceEnergyAssessmentService";
import { createWeeklyEvidenceWindow } from "./BriefingEvidenceWindowService";
import { composeWeeklyNarrative } from "./WeeklyNarrativeService";
import { planAffectedBriefingPublications } from "./BriefingAffectedPublicationPlannerService";

const LA = "America/Los_Angeles";
// Weekly generation is due Sunday 2026-09-27 03:00 PDT = 10:00Z, covering the
// completed local week Sunday 2026-09-20 through Saturday 2026-09-26.
const GENERATION = "2026-09-27T10:00:00.000Z";
const window = createWeeklyEvidenceWindow({ now: new Date(GENERATION), timeZone: LA });

// Ingestion timestamps around the 03:00 local generation cutoff.
const BUFFER_02_30 = "2026-09-27T09:30:00.000Z";
const BUFFER_02_59_59 = "2026-09-27T09:59:59.000Z";

describe("post-midnight buffer: evidence eligibility follows observed date, not ingestion time", () => {
  it("anchors the evidence window on the completed local week", () => {
    expect(window).toMatchObject({
      startDate: "2026-09-20", endDate: "2026-09-26", cutoff: "2026-09-27T06:59:59.999Z",
    });
  });

  describe("Weekly composition", () => {
    const compose = (canonicalObjects) => composeWeeklyNarrative({
      window, canonicalObjects, weights: [], photoEvent: null, goal: { title: "Visible Abs at Rest" },
      context: null, activityTarget: 7000, trainingPerformance: { exerciseObservations: [] },
      generatedAt: GENERATION,
    }).cards.snapshot.facts;
    const facts = (list) => Object.fromEntries(list.map((item) => [item.label, item.value]));
    const activityDays = (last, receivedAt = "2026-09-26T23:00:00.000Z") =>
      ["20", "21", "22", "23", "24", "25", "26"]
        .filter((day) => day <= last)
        .map((day) => activity(`2026-09-${day}`, receivedAt));

    it("includes a prior-day record that reaches the canonical layer at 02:59:59, before generation", () => {
      const withoutLate = facts(compose(activityDays("25")));
      expect(withoutLate["Activity Days"]).toBe("6 complete days");
      const withLate = facts(compose([...activityDays("25"), activity("2026-09-26", BUFFER_02_59_59)]));
      expect(withLate["Activity Days"]).toBe("7 complete days");
    });

    it("includes a prior-day training session that arrives in the buffer", () => {
      const base = compose([...activityDays("26")]);
      expect(facts(base)["Training Days"]).not.toMatch(/^1 /);
      const trained = facts(compose([...activityDays("26"), training("2026-09-26", BUFFER_02_30)]));
      expect(trained["Training Days"]).toBe("1 training days");
    });

    it("excludes new-day evidence that arrives before 03:00 from the prior window", () => {
      const baseline = facts(compose([...activityDays("26"), training("2026-09-26", "2026-09-26T23:30:00.000Z")]));
      const withNewDay = facts(compose([
        ...activityDays("26"),
        training("2026-09-26", "2026-09-26T23:30:00.000Z"),
        // Observed on the new local day (Sunday), but ingested before 03:00.
        activity("2026-09-27", BUFFER_02_30),
        training("2026-09-27", BUFFER_02_59_59),
      ]));
      expect(withNewDay).toEqual(baseline);
      expect(withNewDay["Activity Days"]).toBe("7 complete days");
      expect(withNewDay["Training Days"]).toBe("1 training days");
    });
  });

  describe("Energy assessment", () => {
    const energy = (activityDays) => createCadenceEnergyAssessment({
      cadence: "weekly",
      window: { startDate: window.startDate, endDate: window.endDate, timeZone: LA },
      nutritionDays: [],
      activityDays,
      dexaScans: [],
    });

    it("counts a prior-day activity day ingested at 02:59:59 and never the new day", () => {
      const days = [
        { id: "a-25", date: "2026-09-25", activeCalories: 500, receivedAt: "2026-09-26T05:00:00.000Z" },
        { id: "a-26", date: "2026-09-26", activeCalories: 600, receivedAt: BUFFER_02_59_59 },
        { id: "a-27", date: "2026-09-27", activeCalories: 9_999, receivedAt: BUFFER_02_30 },
      ];
      expect(energy(days).activity.total).toBe(1_100);
      expect(energy(days.slice(0, 2)).activity.total).toBe(1_100);
    });
  });

  describe("late-evidence reconciliation contract is unchanged", () => {
    const publication = {
      id: "weekly_briefing_2026-09-20_2026-09-26",
      cadence: "weekly",
      briefing: { version: "locked" },
      lifecycle: { generationStatus: "completed" },
      evidenceWindow: { id: window.id, startDate: window.startDate, endDate: window.endDate, timeZone: LA },
      generatedAt: "2026-09-27T10:00:05.000Z",
      dependencyManifest: null,
    };
    const change = (observedDate, changedAt) => ({
      canonicalId: `training-${observedDate}-${changedAt}`,
      evidence_type: "training",
      lastObservedAt: observedDate,
      updatedAt: changedAt,
      payload: { observed_at: observedDate, exercises: [{ name: "Squat", sets: [{ reps: 5, weight: 225 }] }] },
    });
    const plan = (evidenceChanges, options = {}) =>
      planAffectedBriefingPublications({ evidenceChanges, publications: [publication], ...options });

    it("does not reconcile prior-day evidence that reached the canonical layer before generation", () => {
      expect(plan([change("2026-09-26", BUFFER_02_59_59)])).toEqual([]);
    });

    it("reconciles eligible prior-day evidence arriving after generation the same local day, as before", () => {
      const plans = plan([change("2026-09-26", "2026-09-27T10:05:00.000Z")]);
      expect(plans).toHaveLength(1);
      expect(plans[0]).toMatchObject({
        cadence: "weekly",
        publicationRootId: publication.id,
        reason: "late_evidence_reconciliation",
        eligible: true,
      });
    });

    it("does not silently expand the artifact for evidence arriving after the following-day lateness policy", () => {
      const late = change("2026-09-26", "2026-09-28T20:00:00.000Z");
      expect(plan([late], { confirmedAt: "2026-09-28T20:00:00.000Z" })).toEqual([]);
      // An explicit (non-automatic) reconciliation still follows its existing contract.
      expect(plan([late], { confirmedAt: "2026-09-28T20:00:00.000Z", automatic: false })).toHaveLength(1);
    });

    it("never reconciles the prior window for new-day evidence, whenever it arrives", () => {
      expect(plan([change("2026-09-27", BUFFER_02_30)])).toEqual([]);
      expect(plan([change("2026-09-27", "2026-09-27T10:05:00.000Z")])).toEqual([]);
    });
  });
});

function canonical(id, type, date, receivedAt, payload) {
  return {
    canonicalId: id,
    evidence_type: type,
    lastObservedAt: date,
    createdAt: receivedAt,
    quality: { status: "active" },
    payload: {
      id, evidence_type: type, observed_at: date, createdAt: receivedAt,
      quality: { status: "complete" }, ...payload,
    },
  };
}

function activity(date, receivedAt) {
  return canonical(`activity-${date}-${receivedAt}`, "activity_day", date, receivedAt, {
    daily_activity: { move_calories: 900 },
  });
}

function training(date, receivedAt) {
  return canonical(`training-${date}-${receivedAt}`, "training", date, receivedAt, {
    metadata: { activity_type: "Traditional Strength Training" },
    exercises: [{ name: "Squat", sets: [{ reps: 5, weight: 225 }] }],
  });
}
