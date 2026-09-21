import { describe, expect, it } from "vitest";
import { capabilityFamily, supersedeStaleCadenceObservations } from "./CurrentWindowSupersessionV3.js";

const observation = (id, capabilityId, window, quality = "adequate") => ({
  observationId: `cadence_v3|${id}`,
  evidenceWindow: window,
  quality: { status: quality },
  capabilities: [{ capabilityId }],
});
const week = { startDate: "2026-09-13", endDate: "2026-09-19" };
const priorWeek = { startDate: "2026-09-06", endDate: "2026-09-12" };
const midweek = { startDate: "2026-09-13", endDate: "2026-09-15" };

describe("current-window supersession", () => {
  it("drops an older observation for a capability the current window covers with usable evidence", () => {
    const result = supersedeStaleCadenceObservations({
      stored: [observation("weekly_a|nutrition|coverage", "execution.nutrition", priorWeek)],
      current: [observation("weekly_b|nutrition|coverage", "execution.nutrition", week)],
      currentArtifactId: "weekly_b",
    });
    expect(result.observations).toEqual([]);
    expect(result.superseded).toEqual([expect.objectContaining({
      capabilityId: "execution.nutrition", reason: "current_window_covers_capability",
    })]);
  });

  it("carries forward a capability the current window does not observe", () => {
    const stored = observation("prior|performance|overall", "execution.training", priorWeek);
    const result = supersedeStaleCadenceObservations({
      stored: [stored], current: [observation("weekly_b|nutrition|coverage", "execution.nutrition", week)],
    });
    expect(result.observations).toEqual([stored]);
    expect(result.superseded).toEqual([]);
  });

  it("does not let an insufficient current observation cover the capability outside its window", () => {
    const stored = observation("prior|nutrition|coverage", "execution.nutrition", priorWeek);
    const result = supersedeStaleCadenceObservations({
      stored: [stored],
      current: [observation("weekly_b|nutrition|coverage", "execution.nutrition", week, "insufficient")],
    });
    expect(result.observations).toEqual([stored]);
  });

  it("supersedes an older observation whose window sits inside a thin current window", () => {
    const result = supersedeStaleCadenceObservations({
      stored: [observation("midweek_a|nutrition|coverage", "execution.nutrition", midweek)],
      current: [observation("weekly_b|nutrition|coverage", "execution.nutrition", week, "insufficient")],
    });
    expect(result.superseded[0].reason).toBe("current_window_contains_observation_window");
  });

  it("treats Energy estimate, pairing, intake and tension as one family", () => {
    expect(capabilityFamily("strategy.energy_outcome_tension")).toBe(capabilityFamily("strategy.energy_balance_estimate"));
    expect(capabilityFamily("execution.energy_pairing")).toBe(capabilityFamily("execution.energy_intake"));
    expect(capabilityFamily("execution.nutrition")).toBe("execution.nutrition");
    const result = supersedeStaleCadenceObservations({
      stored: [observation("prior|energy|outcome_tension", "strategy.energy_outcome_tension", priorWeek)],
      current: [observation("weekly_b|energy|weekly.balance", "strategy.energy_balance_estimate", week)],
    });
    expect(result.observations).toEqual([]);
  });

  it("replaces a regenerated artifact's own prior version entirely, never merging its leftovers", () => {
    const priorOwnTension = observation("weekly_b|energy|outcome_tension", "strategy.energy_outcome_tension", week);
    const result = supersedeStaleCadenceObservations({
      stored: [priorOwnTension],
      current: [observation("weekly_b|energy|weekly.balance", "strategy.energy_balance_estimate", week)],
      currentArtifactId: "weekly_b",
    });
    expect(result.observations).toEqual([]);
    expect(result.superseded[0].reason).toBe("regenerated_artifact_replaces_prior_version");
  });

  it("supersedes contained Nutrition coverage even when the current window has no usable Nutrition capability", () => {
    // The current briefing measured Energy for the whole week (food logged, no activity recorded),
    // so an earlier Midweek's Nutrition/Activity coverage for days inside the week is stale.
    const result = supersedeStaleCadenceObservations({
      stored: [
        observation("midweek_a|nutrition|coverage", "execution.nutrition", midweek),
        observation("midweek_a|activity|coverage", "execution.activity", midweek),
      ],
      current: [observation("weekly_b|energy|weekly.balance", "strategy.energy_balance_estimate", week, "insufficient")],
      currentArtifactId: "weekly_b",
    });
    expect(result.observations).toEqual([]);
    expect(result.superseded.map((item) => item.reason)).toEqual([
      "current_window_contains_observation_window", "current_window_contains_observation_window",
    ]);
  });

  it("does not supersede non-window-scoped evidence just because its window is contained", () => {
    const training = observation("midweek_a|performance|overall", "execution.training", midweek);
    const result = supersedeStaleCadenceObservations({
      stored: [training],
      current: [observation("weekly_b|energy|weekly.balance", "strategy.energy_balance_estimate", week)],
      currentArtifactId: "weekly_b",
    });
    expect(result.observations).toEqual([training]);
  });

  it("never supersedes non-cadence observations", () => {
    const canonical = { observationId: "canonical|dexa|1", capabilities: [{ capabilityId: "execution.nutrition" }] };
    const result = supersedeStaleCadenceObservations({
      stored: [canonical],
      current: [observation("weekly_b|nutrition|coverage", "execution.nutrition", week)],
      currentArtifactId: "weekly_b",
    });
    expect(result.observations).toEqual([canonical]);
  });
});
