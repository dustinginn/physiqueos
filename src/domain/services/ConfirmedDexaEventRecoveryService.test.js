import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { reprocessConfirmedDexaEventInPlace } from "./ConfirmedDexaEventRecoveryService";

const storePath = path.join(process.cwd(), "private", "founder", "runtime-store.json");
const pdfPath = path.join(process.cwd(), "private", "founder", "evidence", "uploads", "evidence_submission_20260718144114116-1-7-18-26-DEXA.pdf");

describe.runIf(fs.existsSync(storePath) && fs.existsSync(pdfPath))("confirmed DEXA recovery", () => {
  it("builds a bounded corrected candidate and is idempotent", async () => {
    const sourceBytes = fs.readFileSync(storePath);
    const live = JSON.parse(sourceBytes);
    const source = live.evidenceReviews.find((item) => item.id === "evidence_review_20260718144114248")?.recovery?.status === "completed"
      ? JSON.parse(fs.readFileSync(findRecoveryBackup(), "utf8"))
      : live;
    const first = await reprocessConfirmedDexaEventInPlace({
      pdfBuffer: fs.readFileSync(pdfPath),
      store: source,
      now: () => new Date("2026-07-18T18:00:00.000Z"),
    });
    expect(fs.readFileSync(storePath)).toEqual(sourceBytes);
    expect(first.changed).toBe(true);
    expect(first.candidate.canonicalEvidenceObjects.filter((item) => item.evidence_type === "dexa_scan" && item.quality?.status === "active" && item.lastObservedAt === "2026-07-18")).toHaveLength(1);
    expect(first.candidate.dexaScans.filter((item) => item.measuredAt === "2026-07-18" && item.canonicalLifecycleStatus !== "superseded")).toHaveLength(1);
    const event = first.candidate.dailyBriefings.find((item) => item.id.includes("2026_07_18"));
    expect(event.briefing.dexaEventNarrative.snapshot).toMatchObject({ scanDate: "2026-07-18", weight: 167.4, bodyFat: 7.7, fatMass: 12.8, leanMass: 147.5, rmr: 1794 });
    const evaluations = first.candidate.analyses.find((item) => item.id.includes("recovered_2026_07_18")).metadata.evaluations;
    expect(evaluations.find((item) => item.goalId === "goal_maintain_8_9_body_fat").current).toBe("7.7%");
    expect(evaluations.find((item) => item.goalId === "goal_preserve_lean_mass").current).toBe("147.5 lb");
    expect(evaluations.find((item) => item.goalId === "goal_visible_abs_at_rest").current).not.toBe("Pending");

    const second = await reprocessConfirmedDexaEventInPlace({
      pdfBuffer: fs.readFileSync(pdfPath),
      store: first.candidate,
      now: () => new Date("2026-07-18T18:01:00.000Z"),
    });
    expect(second.changed).toBe(false);
    expect(second.candidate).toEqual(first.candidate);
  }, 20_000);
});

function findRecoveryBackup() {
  const root = path.join(process.cwd(), "private", "founder", "incident-recovery");
  const matches = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("dexa-20260718-"))
    .flatMap((entry) => fs.readdirSync(path.join(root, entry.name))
      .filter((name) => name.startsWith("runtime-store.pre-dexa-recovery."))
      .map((name) => path.join(root, entry.name, name)))
    .sort();
  if (!matches.length) throw new Error("DEXA recovery backup fixture is unavailable.");
  return matches.at(-1);
}
