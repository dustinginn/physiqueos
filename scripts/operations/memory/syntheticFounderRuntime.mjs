// Production-shaped synthetic Founder canonical runtime for memory harnesses.
//
// Collection sizes follow the October 9 2026 production measurement of the
// Founder runtime's foundation collections (payload JSON, MB): analyses 26.1,
// dailyBriefings 16.6, evidenceReviews 7.1, evidencePackages 5.3,
// goalConfidenceHistory 3.7, canonicalEvidenceObjects 2.5, everything else
// about 1.5; 62.8 MB in all. Every size is scaled by SCALE so the synthetic
// runtime is at least 85 MB, deliberately larger than production. Content is
// generated: nested records of short fields and prose of realistic density.
// No Founder value is reproduced.

export const SYNTHETIC_OWNER = "user_synthetic_memory";
export const SYNTHETIC_SCAN_DATE = "2026-10-09";
export const SYNTHETIC_CANONICAL_ID = `dexa_scan|${SYNTHETIC_OWNER}|${SYNTHETIC_SCAN_DATE}`;
export const SYNTHETIC_OBJECT_ID = "evidence_submission_synthetic_pdf_1_2026_10_09";
export const SYNTHETIC_REVIEW_ID = "evidence_review_synthetic_dexa";
export const SYNTHETIC_PACKAGE_ID = "evidence_submission_synthetic_dexa_package";

const SCALE = 1.36;
const MB = 1024 * 1024;
// [collection, production MB, approximate bytes per record]
const SHAPE = Object.freeze([
  ["analyses", 26.1, 62_000],
  ["dailyBriefings", 16.6, 286_000],
  ["evidenceReviews", 7.1, 28_000],
  ["evidencePackages", 5.3, 15_000],
  ["goalConfidenceHistory", 3.7, 110_000],
  ["canonicalEvidenceObjects", 2.5, 4_200],
  ["trainingPerformanceEvents", 0.45, 1_500],
  ["canonicalExerciseLibrary", 0.15, 900],
  ["weightEntries", 0.12, 420],
  ["dailyCheckIns", 0.08, 600],
  ["goals", 0.2, 15_000],
  ["protocols", 0.08, 1_500],
  ["protocolVersions", 0.05, 2_000],
  ["reminders", 0.06, 1_500],
  ["progressPhotos", 0.1, 1_200],
  ["goalConfidenceSnapshots", 0.02, 4_000],
  ["phaseStrategies", 0.02, 3_000],
  ["phaseReviewDecisions", 0.01, 2_000],
]);

export const DEXA_METRICS = Object.freeze({
  provider: "Synthetic Provider",
  totalMass: { value: 190, unit: "lb" },
  bodyFatPercentage: 18,
  fatMass: { value: 34.2, unit: "lb" },
  leanMass: { value: 148.6, unit: "lb" },
  boneMineralContent: { value: 7.2, unit: "lb" },
  sourceFileId: "media://synthetic.pdf",
  provenance: { extraction_engine: "synthetic", source_artifact_refs: ["media://synthetic.pdf"] },
});

function prng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

const WORDS = "steady progress lean mass protein intake training volume recovery sleep quality energy balance trend signal evidence weekly review phase goal confidence outcome measure adherence session strength cardio nutrition hydration".split(" ");

function prose(random, length) {
  const words = [];
  let size = 0;
  while (size < length) {
    const word = WORDS[Math.floor(random() * WORDS.length)];
    words.push(word);
    size += word.length + 1;
  }
  return words.join(" ");
}

// A record of roughly `bytes` JSON bytes, about half prose and half small
// structured fields, the mix production analyses and briefings carry.
function filler(random, bytes, index) {
  const sections = [];
  let size = 200;
  let sectionIndex = 0;
  while (size < bytes) {
    const items = Array.from({ length: 6 }, (_, itemIndex) => ({
      id: `item_${index}_${sectionIndex}_${itemIndex}`,
      label: prose(random, 18),
      value: Math.round(random() * 10_000) / 100,
      unit: random() > 0.5 ? "lb" : "kcal",
      confidence: random() > 0.5 ? "moderate" : "high",
    }));
    const section = { heading: prose(random, 30), body: prose(random, 260), items, tags: [prose(random, 8), prose(random, 8)] };
    sections.push(section);
    size += JSON.stringify(section).length;
    sectionIndex += 1;
  }
  return sections;
}

function record(collection, index, bytes, random) {
  const id = `${collection}_${index}`;
  const base = { id, userId: SYNTHETIC_OWNER, createdAt: "2026-09-01T12:00:00.000Z", updatedAt: "2026-10-01T12:00:00.000Z" };
  switch (collection) {
    case "analyses":
      return { ...base, title: prose(random, 30), summary: prose(random, 200), evidenceIds: [`ev_${index}`], evidenceTypes: [random() > 0.5 ? "training" : "nutrition"], metadata: { findings: filler(random, bytes, index) } };
    case "dailyBriefings":
      return { ...base, artifactType: "weekly", cadence: "weekly", generatedAt: "2026-09-28T07:00:00.000Z", goalId: "goal_other", briefing: { sections: filler(random, bytes, index) } };
    case "canonicalEvidenceObjects":
      return { ...base, canonicalId: `canonical_${index}`, evidence_type: random() > 0.5 ? "training" : "nutrition", lastObservedAt: "2026-09-20", quality: { status: "active" }, payload: { sections: filler(random, bytes, index) } };
    case "goals":
      return { ...base, status: index === 0 ? "active" : "completed", primary: index === 0, title: prose(random, 20), phases: filler(random, bytes, index) };
    case "weightEntries":
      return { ...base, measuredAt: `2026-${String(1 + (index % 9)).padStart(2, "0")}-${String(1 + (index % 28)).padStart(2, "0")}`, weight: { value: 175 + random() * 10, unit: "lb" }, context: { note: prose(random, 200) } };
    default:
      return { ...base, status: "active", content: filler(random, bytes, index) };
  }
}

/** Streams the synthetic runtime into `database.insert(collection, payload)`. */
export function seedSyntheticFounderRuntime(database) {
  const random = prng(20261009);
  let bytes = 0;
  const add = (collection, payload) => {
    database.insert(collection, payload);
    bytes += JSON.stringify(payload).length;
  };
  add("user", { id: SYNTHETIC_OWNER, timeZone: "America/Los_Angeles" });
  add("nutritionContext", { id: "nutrition_context", userId: SYNTHETIC_OWNER });
  add("operatingPlan", { id: "operating_plan", userId: SYNTHETIC_OWNER });
  for (const [collection, productionMb, recordBytes] of SHAPE) {
    const count = Math.max(1, Math.round((productionMb * SCALE * MB) / recordBytes));
    for (let index = 0; index < count; index += 1) add(collection, record(collection, index, recordBytes, random));
  }
  // The records the DEXA steps act on.
  const dexaObject = { id: SYNTHETIC_OBJECT_ID, evidence_type: "dexa_scan", observed_at: SYNTHETIC_SCAN_DATE, measuredAt: SYNTHETIC_SCAN_DATE, ...DEXA_METRICS };
  add("canonicalEvidenceObjects", {
    id: SYNTHETIC_CANONICAL_ID, canonicalId: SYNTHETIC_CANONICAL_ID, userId: SYNTHETIC_OWNER, evidence_type: "dexa_scan",
    quality: { status: "active" }, firstObservedAt: SYNTHETIC_SCAN_DATE, lastObservedAt: SYNTHETIC_SCAN_DATE,
    dexaRevision: { revision: 1, supersedes: null }, goalPhaseAttribution: { goalId: "goals_0", phaseId: "phase_0" },
    provenance: { evidence_package_ids: [SYNTHETIC_PACKAGE_ID], contributing_evidence_object_ids: [SYNTHETIC_OBJECT_ID] },
    payload: { ...dexaObject },
  });
  for (let index = 0; index < 17; index += 1) {
    add("dexaScans", { id: `legacy_scan_${index}`, userId: SYNTHETIC_OWNER, measuredAt: `2025-${String(1 + (index % 12)).padStart(2, "0")}-15`, ...DEXA_METRICS });
  }
  add("executionItems", { id: "execution_next_dexa", userId: SYNTHETIC_OWNER, type: "evidence", status: "scheduled", active: true, timezone: "America/Los_Angeles", preferredSchedule: { date: SYNTHETIC_SCAN_DATE }, uploadReminder: true, completionHistory: [] });
  add("executionItems", { id: "execution_dexa", userId: SYNTHETIC_OWNER, type: "evidence", active: true, completionHistory: [] });
  for (let index = 0; index < 36; index += 1) add("executionItems", record("executionItems", index, 2_500, random));
  add("evidenceReviews", {
    id: SYNTHETIC_REVIEW_ID, userId: SYNTHETIC_OWNER, status: "committing",
    interpretedEvidence: { package_id: SYNTHETIC_PACKAGE_ID, evidence_objects: [dexaObject] },
    commitProgress: { canonical_commit: { status: "completed", attempts: 1, result: { status: "completed", canonicalEvidenceIds: [SYNTHETIC_CANONICAL_ID] } } },
  });
  return Object.freeze({ payloadBytes: bytes, payloadMb: Math.round((bytes / MB) * 10) / 10 });
}
