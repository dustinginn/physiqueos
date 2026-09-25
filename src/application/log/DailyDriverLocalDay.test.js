import { describe, expect, it, vi } from "vitest";
import { createLogReadService } from "./LogReadService.js";
import { resolveRequestedTimeZone } from "../../domain/utils/localDate.js";
import { createInMemoryCanonicalRecordStore } from "../../platform/database/Phase4CanonicalRecordStore.js";
import { createCanonicalPersistenceCommandPorts } from "../commands/CanonicalPersistenceCommandPorts.js";

// Daily-driver local-day contract (travel):
//  - "Logged Today" follows the user's CURRENT local calendar day when the client
//    names its zone; without one it keeps the canonical user zone.
//  - A plain weigh-in's future-date guard judges "today" in the device zone when
//    named, so a weigh-in logged after local midnight east of the canonical zone
//    is accepted for the device's date.
//  - Nothing here rewrites a record's canonical localDate or the stored user zone,
//    and the Morning Check-In (which reconciles the Server-owned briefing/priority
//    day) keeps the canonical zone.
// Founder control: 2026-09-25T05:11Z = 00:11 Sep 25 in Texas (America/Chicago),
// 22:11 Sep 24 in the canonical America/Los_Angeles.

const OWNER = "user_founder_001";
const TEXAS_AFTER_MIDNIGHT = new Date("2026-09-25T05:11:00.000Z");

describe("requested time zone validation", () => {
  it("accepts IANA zones and rejects malformed/unknown values", () => {
    expect(resolveRequestedTimeZone("America/Chicago")).toBe("America/Chicago");
    expect(resolveRequestedTimeZone("America/Argentina/Buenos_Aires")).toBe("America/Argentina/Buenos_Aires");
    expect(resolveRequestedTimeZone("UTC")).toBe("UTC");
    expect(resolveRequestedTimeZone("Pacific/Honolulu")).toBe("Pacific/Honolulu");
    for (const bad of [null, undefined, "", "   ", "Mars/Olympus_Mons", "America/Chicago; DROP", "../etc/passwd", "x".repeat(80), 42]) {
      expect(resolveRequestedTimeZone(bad), String(bad)).toBeNull();
    }
  });
});

describe("Logged Today follows the requested local day", () => {
  const sep24Strength = {
    canonicalId: "training|authoritative|training_logger_draft_24",
    status: "active",
    payload: {
      id: "training|authoritative|training_logger_draft_24", evidence_type: "training", observed_at: "2026-09-24",
      exercises: [{ id: "e1", name: "Leg Press" }], metadata: { activity_type: "Traditional Strength Training", duration_seconds: 1680 },
      quality: { status: "active" },
    },
  };
  function logService(now = TEXAS_AFTER_MIDNIGHT) {
    const listCanonicalEvidenceObjects = vi.fn(async () => [sep24Strength]);
    const repositories = {
      users: { getUserById: async () => ({ id: OWNER, timeZone: "America/Los_Angeles" }), getCurrentUser: async () => ({ id: OWNER, timeZone: "America/Los_Angeles" }) },
      evidenceReviews: { listReviews: async () => [] },
      canonicalEvidence: { listCanonicalEvidenceObjects },
    };
    return { service: createLogReadService({ repositories, now: () => now }), repositories };
  }
  const principal = { userId: OWNER, deviceId: "device-1", sessionId: "session-1" };

  it("without a requested zone the canonical zone still says Sep 24 (the Founder observation was the Server's honest answer)", async () => {
    const log = await logService().service.getLog({ principal });
    expect(log.localDate).toBe("2026-09-24");
  });

  it("with the device zone (Texas) the day rolls to Sep 25 and yesterday's values are not shown as today", async () => {
    const withCanonical = await logService().service.getLog({ principal });
    const withDevice = await logService().service.getLog({ principal, timeZone: "America/Chicago" });
    expect(withDevice.localDate).toBe("2026-09-25");
    expect(JSON.stringify(withCanonical.loggedToday)).not.toBe(JSON.stringify(withDevice.loggedToday));
  });

  it("westward travel shows the device's (earlier) day even after canonical midnight", async () => {
    const honoluluBeforeMidnight = new Date("2026-09-25T08:30:00.000Z"); // 22:30 Sep 24 HST, 01:30 Sep 25 PDT
    expect((await logService(honoluluBeforeMidnight).service.getLog({ principal })).localDate).toBe("2026-09-25");
    expect((await logService(honoluluBeforeMidnight).service.getLog({ principal, timeZone: "Pacific/Honolulu" })).localDate).toBe("2026-09-24");
  });

  it("historical canonical records are never rewritten by a travel read", async () => {
    const { service } = logService();
    const before = JSON.stringify(sep24Strength);
    await service.getLog({ principal, timeZone: "America/Chicago" });
    await service.getLog({ principal, timeZone: "Asia/Tokyo" });
    expect(JSON.stringify(sep24Strength)).toBe(before);
    expect(sep24Strength.payload.observed_at).toBe("2026-09-24");
  });
});

describe("weigh-in future-date guard uses the device day; Morning Check-In keeps the canonical day", () => {
  const principal = { userId: OWNER, deviceId: "device-1", sessionId: "session-1" };
  const context = (payload, commandId) => ({ ownerUserId: OWNER, principal, metadata: { commandId, expectedVersion: null }, payload });
  function store() {
    return createInMemoryCanonicalRecordStore({
      user: [{ id: OWNER, timeZone: "America/Los_Angeles", version: 1 }],
      goals: [], protocols: [], executionItems: [], reminders: [], evidenceReviews: [], trainingPerformanceEvents: [],
      weightEntries: [], dailyCheckIns: [], evidencePackages: [], canonicalEvidenceObjects: [], dexaScans: [], protocolVersions: [],
      progressPhotos: [], dailyBriefings: [], analyses: [], briefingReconciliationWorkItems: [], canonicalExerciseLibrary: [],
      piEnergyConfidenceWorkItems: [], piTrainingConfidenceWorkItems: [],
    });
  }
  const ports = (records) => createCanonicalPersistenceCommandPorts({ records, now: () => TEXAS_AFTER_MIDNIGHT });

  it("without a zone, a Sep 25 weigh-in at 00:11 Texas is judged by the canonical day (future) — the travel defect", async () => {
    await expect(ports(store()).submitWeight(context({ localDate: "2026-09-25", value: 175.9 }, "w-no-zone")))
      .rejects.toThrow("A weigh-in cannot be logged for a future date.");
  });

  it("with the device zone the same weigh-in is accepted for Sep 25; the stored user zone is unchanged", async () => {
    const records = store();
    await ports(records).submitWeight(context({ localDate: "2026-09-25", value: 175.9, timeZone: "America/Chicago" }, "w-device-zone"));
    const snapshot = records.snapshot();
    expect(snapshot.weightEntries.map((entry) => entry.id)).toEqual(["weight_2026_09_25"]);
    expect(snapshot.user[0].timeZone).toBe("America/Los_Angeles");
  });

  it("a malformed zone falls back to the canonical day", async () => {
    await expect(ports(store()).submitWeight(context({ localDate: "2026-09-25", value: 175.9, timeZone: "Mars/Base" }, "w-bad-zone")))
      .rejects.toThrow("A weigh-in cannot be logged for a future date.");
  });

  it("the device zone never lets a genuinely future date through", async () => {
    await expect(ports(store()).submitWeight(context({ localDate: "2026-09-26", value: 175.9, timeZone: "America/Chicago" }, "w-future")))
      .rejects.toThrow("A weigh-in cannot be logged for a future date.");
  });

  it("the Morning Check-In ignores a client zone (Server-owned briefing/priority day)", async () => {
    await expect(ports(store()).submitCheckIn(context({ localDate: "2026-09-25", value: 175.9, timeZone: "America/Chicago" }, "c-device-zone")))
      .rejects.toThrow("A weigh-in cannot be logged for a future date.");
  });
});

describe("strategic briefing timezone isolation", () => {
  it("no briefing/schedule/reconciliation module can consume a client-requested zone", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const root = path.resolve(import.meta.dirname, "../..");
    const offenders = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(js|mjs|jsx)$/.test(entry.name) && !/\.test\./.test(entry.name) &&
          /briefing|schedule|reconciliation|midweek|weekly|monthly/i.test(entry.name) &&
          fs.readFileSync(full, "utf8").includes("resolveRequestedTimeZone")) offenders.push(path.relative(root, full));
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
