// Read-only production replay. This script intentionally loads the persisted canonical
// Confidence history for audit; Founder routes use bounded read stores and never call this script.
import pg from "pg";

if (process.env.PHYSIQUEOS_AUDIT_BUNDLE !== "1") {
  const { register } = await import("node:module");
  register(new URL("./sourceModuleResolutionHook.mjs", import.meta.url), import.meta.url);
}

const [{
  buildConfidenceExplanationModel,
}, {
  findFounderPresentationLeaks,
}] = await Promise.all([
  import("../src/domain/presentation/confidenceExplanationPresentation.js"),
  import("../src/domain/presentation/productLanguagePresentation.js"),
]);

const MONTHLY_ARTIFACT_ID = "monthly_briefing_user_founder_001_202608";
const MONTHLY_ASSESSMENT_ID =
  "confidence_assessment_v2|47b1e317da1282b9b38e01843830ad71e1627ef1d6940635e9282f601006077e";
const OWNER = "user_founder_001";
const rawConnectionString = String(process.env.PHYSIQUEOS_DATABASE_URL ?? "").trim();
const certificate = String(process.env.PHYSIQUEOS_DATABASE_CA_CERT ?? "").trim();
const databaseUrl = new URL(rawConnectionString);
if (certificate) {
  for (const key of ["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert",
    "sslnegotiation", "uselibpqcompat"]) databaseUrl.searchParams.delete(key);
}
const pool = new pg.Pool({
  connectionString: databaseUrl.toString(),
  ssl: certificate ? { ca: certificate, rejectUnauthorized: true } : undefined,
  max: 1,
  statement_timeout: 30_000,
  allowExitOnIdle: true,
  application_name: "physiqueos-confidence-explanation-v2-readonly-replay",
});

try {
  await pool.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const rows = (await pool.query(`
    SELECT record_id, version, payload
    FROM physiqueos.canonical_confidence_records
    WHERE owner_user_id = $1 AND collection_name = 'goalConfidenceHistory'
    ORDER BY record_id
  `, [OWNER])).rows;
  const revisionBefore = Object.freeze({
    rowCount: rows.length,
    versionSum: rows.reduce((sum, row) => sum + Number(row.version ?? 0), 0),
  });
  const records = rows.map((row) => row.payload)
    .filter((record) => record.assessment?.schemaVersion ===
      "canonical_confidence_assessment_v2");
  const current = records.find((record) =>
    record.assessmentId === MONTHLY_ASSESSMENT_ID)
    ?.assessment ?? null;
  const predecessor = records.find((record) =>
    record.assessmentId === current?.priorAssessmentId)?.assessment ?? null;
  assert(current?.currentPercentage === 62, "Current Monthly score changed.");
  assert(current?.confidenceBand === "moderate", "Current Monthly band changed.");
  assert(current?.movement === "no_meaningful_change",
    "Current Monthly movement changed.");
  assert(predecessor?.currentPercentage === 62 &&
    predecessor?.publisherType === "weekly_briefing",
  "Current Monthly predecessor changed.");
  assert(current?.sourceCutoff === "2026-09-01T06:59:59.999Z",
    "Current Monthly cutoff changed.");
  assert(current?.briefingArtifactId === MONTHLY_ARTIFACT_ID,
    "Current Monthly artifact binding changed.");

  const replay = records.map((record) => {
    const assessment = record.assessment;
    const surface = ({
      weekly_briefing: "weekly",
      midweek_briefing: "midweek",
      monthly_briefing: "monthly",
      dexa_event_briefing: "dexa_event",
      photo_event_briefing: "photo_event",
    })[assessment.publisherType] ?? "detail";
    const model = buildConfidenceExplanationModel({
      assessment,
      surface,
      historicalContext: surface.endsWith("event")
        ? { eventDate: assessment.sourceCutoff } : null,
    });
    return {
      assessmentId: assessment.id,
      publisher: assessment.publisherType,
      score: assessment.currentPercentage,
      prior: assessment.priorPercentage,
      band: assessment.confidenceBand,
      movement: assessment.movement,
      currentMonthly: assessment.id === current.id,
      leakCount: findFounderPresentationLeaks(model).length,
      degradation: model.degradation.status,
    };
  });
  const decreases = replay.filter((item) => item.movement === "decrease");
  const validDecreases = decreases.filter((item) =>
    item.publisher !== "monthly_briefing" || item.currentMonthly);
  assert(replay.length === 19, `Expected 19 V2 assessments; found ${replay.length}.`);
  assert(replay.every((item) => item.leakCount === 0),
    "Founder-facing presentation leakage was detected.");
  assert(validDecreases.length === 0,
    "A valid historical decrease requires manual semantic review.");

  const result = {
    observedAt: new Date().toISOString(),
    deployment: {
      source: process.env.PHYSIQUEOS_GIT_SHA ?? null,
      build: process.env.PHYSIQUEOS_BUILD_ID ?? null,
    },
    assessmentCount: replay.length,
    increaseCount: replay.filter((item) => item.movement === "increase").length,
    validDecreaseCount: validDecreases.length,
    retainedDefectiveDecreaseCount: decreases.length,
    currentMonthly: {
      assessmentId: current.id,
      score: current.currentPercentage,
      band: current.confidenceBand,
      movement: current.movement,
      predecessorAssessmentId: predecessor.id,
      predecessorScore: predecessor.currentPercentage,
      predecessorPublisher: predecessor.publisherType,
      sourceCutoff: current.sourceCutoff,
    },
    zeroPresentationLeaks: replay.every((item) => item.leakCount === 0),
    degradationCounts: replay.reduce((counts, item) => ({
      ...counts,
      [item.degradation]: Number(counts[item.degradation] ?? 0) + 1,
    }), {}),
    replay,
    revisionBefore,
    revisionAfter: revisionBefore,
    productionMutationPerformed: "NONE",
  };
  process.stdout.write(`CONFIDENCE_EXPLANATION_REPLAY_BEGIN${Buffer.from(
    JSON.stringify(result)).toString("base64")}CONFIDENCE_EXPLANATION_REPLAY_END\n`);
  await pool.query("COMMIT");
} catch (error) {
  await pool.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  await pool.end();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
