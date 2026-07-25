import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { createSeedRepositories } from "../../data/repositories/createSeedRepositories";
import {
  executeSeatedHipIdentityMigration,
  SEATED_HIP_IDENTITY_MIGRATION_ID,
} from "./SeatedHipIdentityMigrationService";

const julySets = [
  { set_number: 1, reps: 12, weight: 110, weight_unit: "lb" },
  { set_number: 2, reps: 15, weight: 100, weight_unit: "lb" },
  { set_number: 3, reps: 15, weight: 100, weight_unit: "lb" },
  { set_number: 4, reps: 15, weight: 100, weight_unit: "lb" },
];
const todaySets = [
  { set_number: 1, reps: 15, weight: 120, weight_unit: "lb" },
  { set_number: 2, reps: 15, weight: 130, weight_unit: "lb" },
  { set_number: 3, reps: 15, weight: 150, weight_unit: "lb" },
];

function fixture() {
  const julyExercise = { id: "seated_abductions", name: "Seated Abductions", sets: structuredClone(julySets) };
  const todayExercise = { id: "seated_hip_abductions", name: "Seated Hip Abductions", sets: structuredClone(todaySets) };
  const july = {
    canonicalId: "training|2026-07-07|traditional strength training|||3623||284",
    evidence_type: "training",
    userId: "founder",
    payload: { observed_at: "2026-07-07", exercises: [julyExercise] },
  };
  const today = {
    canonicalId: "training|2026-07-23|traditional strength training|||4658||680",
    evidence_type: "training",
    userId: "founder",
    payload: { observed_at: "2026-07-23", exercises: [todayExercise] },
  };
  const state = {
    analyses: [],
    canonicalEvidenceObjects: [july, today],
    evidencePackages: [{
      package_id: "evidence_submission_20260707162436210_images_reprocess_20260707233840354",
      userId: "founder",
      evidence_objects: [{ evidence_type: "training", exercises: [structuredClone(julyExercise)] }],
    }],
    evidenceReviews: [],
    migrationMarkers: [],
  };
  return {
    state,
    repositories: createSeedRepositories(state),
    persist: vi.fn(),
  };
}

describe("seated hip canonical identity migration", () => {
  it("migrates July 7, preserves today and all sets, reconciles derived state, and is idempotent", async () => {
    const { persist, repositories, state } = fixture();
    const todayBefore = structuredClone(state.canonicalEvidenceObjects[1]);
    const first = await executeSeatedHipIdentityMigration({
      repositories,
      runtimeStore: state,
      persistRuntimeStore: persist,
      now: () => new Date("2026-07-24T02:00:00Z"),
    });
    const migrated = state.canonicalEvidenceObjects[0].payload.exercises[0];

    expect(first).toMatchObject({ changed: true, idempotent: false });
    expect(migrated).toMatchObject({
      id: "seated_hip_adductions",
      name: "Seated Hip Adductions",
      body_region: "Glutes",
      sets: julySets,
    });
    expect(state.canonicalEvidenceObjects[1]).toEqual(todayBefore);
    expect(state.analyses).toHaveLength(1);
    expect(state.migrationMarkers).toEqual([
      expect.objectContaining({ id: SEATED_HIP_IDENTITY_MIGRATION_ID, status: "complete" }),
    ]);

    const second = await executeSeatedHipIdentityMigration({
      repositories,
      runtimeStore: state,
      persistRuntimeStore: persist,
    });
    expect(second).toMatchObject({ changed: false, idempotent: true });
    expect(state.analyses).toHaveLength(1);
    expect(state.migrationMarkers).toHaveLength(1);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("keeps the legacy Training Library route read-only and redirects it to Adductions", () => {
    const source = fs.readFileSync(
      new URL("../../app/progress/training/library/[[...path]]/page.js", import.meta.url),
      "utf8"
    );
    expect(source).toContain('["seated_abductions", "seated-abductions"]');
    expect(source).toContain(
      'return "/progress/training/library/glutes/seated-hip-adductions"'
    );
    expect(source).not.toMatch(/save|persist|update|delete/i);
  });
});
