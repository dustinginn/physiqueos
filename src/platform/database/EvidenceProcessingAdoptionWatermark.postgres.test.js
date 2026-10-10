import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import pg from "pg";
import { createPostgresOutboxStore } from "./PostgresOutboxStore.js";
import { createPostgresEvidenceProcessingReliabilityStore } from "./PostgresEvidenceProcessingReliabilityStore.js";
import { createEvidenceProcessingReliabilityMonitor } from "../jobs/EvidenceProcessingReliabilityMonitor.js";

const databaseUrl = process.env.PHYSIQUEOS_TEST_DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;
const { Pool } = pg;

describePostgres("immutable evidence-processing adoption watermark (PostgreSQL)", () => {
  let pool;

  beforeAll(async () => {
    const target = new URL(databaseUrl);
    if (!["localhost", "127.0.0.1", "::1"].includes(target.hostname) ||
        !target.pathname.slice(1).startsWith("physiqueos_adoption_test")) {
      throw new Error("Adoption watermark integration tests require an isolated local physiqueos_adoption_test database.");
    }
    pool = new Pool({ connectionString: databaseUrl, max: 6 });
    await pool.query("CREATE SCHEMA IF NOT EXISTS physiqueos");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS physiqueos.worker_heartbeats (
        worker_id text PRIMARY KEY,
        build_id text NOT NULL,
        status text NOT NULL,
        observed_at timestamptz NOT NULL,
        details jsonb
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS physiqueos.canonical_evidence_records (
        owner_user_id text NOT NULL,
        collection_name text NOT NULL,
        record_id text NOT NULL,
        status text NOT NULL,
        payload jsonb NOT NULL,
        updated_at timestamptz NOT NULL,
        PRIMARY KEY (owner_user_id, collection_name, record_id)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS physiqueos.outbox_messages (
        id text PRIMARY KEY,
        user_id text NOT NULL,
        topic text NOT NULL,
        status text NOT NULL,
        attempt_count integer NOT NULL DEFAULT 0,
        due_at timestamptz,
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL,
        claim_expires_at timestamptz,
        dead_at timestamptz,
        payload jsonb NOT NULL
      )
    `);
  });

  beforeEach(async () => {
    await pool.query(`TRUNCATE physiqueos.worker_heartbeats,
      physiqueos.canonical_evidence_records, physiqueos.outbox_messages`);
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query("DROP SCHEMA IF EXISTS physiqueos CASCADE");
    await pool.end();
  });

  it("preserves first activation across ticks, restart, concurrency, and worker-id changes", async () => {
    const firstActivation = new Date("2026-10-10T17:00:00.123Z");
    const stableStore = createPostgresOutboxStore({ query: (...args) => pool.query(...args) });

    await stableStore.heartbeat({
      workerId: "stable-worker",
      buildId: "candidate-a",
      status: "healthy",
      observedAt: firstActivation,
      details: { source: "first" },
    });
    await stableStore.heartbeat({
      workerId: "stable-worker",
      buildId: "candidate-a",
      status: "healthy",
      observedAt: new Date("2026-10-10T17:01:00.456Z"),
      details: { source: "tick", buildAdoptedAt: "1900-01-01T00:00:00.000Z" },
    });

    // A new store instance represents a same-build worker process restart.
    const restartedStore = createPostgresOutboxStore({ query: (...args) => pool.query(...args) });
    await restartedStore.heartbeat({
      workerId: "stable-worker",
      buildId: "candidate-a",
      status: "healthy",
      observedAt: new Date("2026-10-10T17:02:00.789Z"),
      details: { source: "restart" },
    });
    await Promise.all([
      restartedStore.heartbeat({
        workerId: "stable-worker",
        buildId: "candidate-a",
        status: "healthy",
        observedAt: new Date("2026-10-10T17:03:00.000Z"),
        details: { source: "concurrent-a" },
      }),
      restartedStore.heartbeat({
        workerId: "stable-worker",
        buildId: "candidate-a",
        status: "healthy",
        observedAt: new Date("2026-10-10T17:03:01.000Z"),
        details: { source: "concurrent-b" },
      }),
      restartedStore.heartbeat({
        workerId: "rotated-worker",
        buildId: "candidate-a",
        status: "healthy",
        observedAt: new Date("2026-10-10T17:04:00.000Z"),
        details: { source: "rotated" },
      }),
    ]);

    const persisted = await pool.query(
      `SELECT worker_id,observed_at,details FROM physiqueos.worker_heartbeats
        WHERE build_id=$1 ORDER BY worker_id`,
      ["candidate-a"],
    );
    expect(persisted.rows).toHaveLength(2);
    expect(Date.parse(persisted.rows.find(
      (row) => row.worker_id === "stable-worker",
    ).details.buildAdoptedAt)).toBe(firstActivation.getTime());

    const reliability = createReliabilityStore(pool, "candidate-a");
    await expect(reliability.inspect({ observedAt: new Date("2026-10-10T18:00:00.000Z") }))
      .resolves.toMatchObject({
        adoptionBoundary: firstActivation.toISOString(),
        adoptionBoundaryStatus: "durable",
        buildHeartbeatCount: 2,
      });

    await restartedStore.heartbeat({
      workerId: "stable-worker",
      buildId: "candidate-b",
      status: "healthy",
      observedAt: new Date("2026-10-10T17:05:00.321Z"),
      details: { source: "new-build" },
    });
    await expect(createReliabilityStore(pool, "candidate-b").inspect({
      observedAt: new Date("2026-10-10T18:00:00.000Z"),
    })).resolves.toMatchObject({
      adoptionBoundary: "2026-10-10T17:05:00.321Z",
      adoptionBoundaryStatus: "durable",
      buildHeartbeatCount: 1,
    });
  });

  it("recovers only post-adoption stranded work after a later process restart", async () => {
    const ownerUserId = "owner-1";
    const adoptedAt = new Date("2026-10-10T17:00:00.000Z");
    const observedAt = new Date("2026-10-10T18:00:00.000Z");
    const store = createPostgresOutboxStore({ query: (...args) => pool.query(...args) });
    await store.heartbeat({
      workerId: "watchdog-worker",
      buildId: "candidate-a",
      status: "healthy",
      observedAt: adoptedAt,
    });
    await store.heartbeat({
      workerId: "watchdog-worker",
      buildId: "candidate-a",
      status: "healthy",
      observedAt: new Date("2026-10-10T17:50:00.000Z"),
    });

    await insertStrandedReview(pool, ownerUserId, "historical-review", "2026-10-10T16:00:00.000Z");
    await insertStrandedReview(pool, ownerUserId, "adopted-review", "2026-10-10T17:15:00.000Z");

    const postgresStore = createReliabilityStore(pool, "candidate-a", ownerUserId);
    const recover = vi.fn().mockResolvedValue({
      status: "committing",
      commitClaim: { status: "available" },
      processingReliability: { autoResumeCount: 1 },
    });
    const monitor = createEvidenceProcessingReliabilityMonitor({
      store: { inspect: postgresStore.inspect, recover },
      workerId: "watchdog-worker",
      buildId: "candidate-a",
      now: () => observedAt,
      processStartedAt: new Date("2026-10-10T17:45:00.000Z"),
      reviewAgeThresholdMs: 60_000,
      sampleMemory: () => ({ rss: 128 * 1024 * 1024 }),
      sampleCpu: () => 1,
    });

    const result = await monitor.runOnce();
    expect(result.metrics).toMatchObject({
      adoptionBoundary: adoptedAt.toISOString(),
      adoptionBoundaryStatus: "durable",
      adoptionBoundaryDurable: true,
      staleReviewCount: 2,
      adoptedStaleReviewCount: 1,
      historicalStaleReviewCount: 1,
    });
    expect(recover).toHaveBeenCalledOnce();
    expect(recover).toHaveBeenCalledWith("adopted-review", {
      observedAt,
      maximumAutoResumes: 2,
    });
  });

  it("fails closed and alerts when a persisted watermark is missing or invalid", async () => {
    const ownerUserId = "owner-1";
    const observedAt = new Date("2026-10-10T18:00:00.000Z");
    await pool.query(
      `INSERT INTO physiqueos.worker_heartbeats (worker_id,build_id,status,observed_at,details)
       VALUES ($1,$2,$3,$4,$5::jsonb)`,
      ["legacy-worker", "candidate-a", "healthy", observedAt, JSON.stringify({ buildAdoptedAt: "invalid" })],
    );
    await insertStrandedReview(pool, ownerUserId, "historical-review", "2026-10-10T16:00:00.000Z");
    const postgresStore = createReliabilityStore(pool, "candidate-a", ownerUserId);
    const recover = vi.fn();
    const monitor = createEvidenceProcessingReliabilityMonitor({
      store: { inspect: postgresStore.inspect, recover },
      workerId: "legacy-worker",
      buildId: "candidate-a",
      now: () => observedAt,
      processStartedAt: new Date("2026-10-10T17:55:00.000Z"),
      reviewAgeThresholdMs: 60_000,
      sampleMemory: () => ({ rss: 128 * 1024 * 1024 }),
      sampleCpu: () => 1,
    });

    const result = await monitor.runOnce();
    expect(result.metrics).toMatchObject({
      adoptionBoundaryStatus: "invalid",
      adoptionBoundaryDurable: false,
      adoptedStaleReviewCount: 0,
      historicalStaleReviewCount: 1,
    });
    expect(result.alerts).toContain("EVIDENCE_ADOPTION_BOUNDARY_UNAVAILABLE");
    expect(recover).not.toHaveBeenCalled();
  });
});

function createReliabilityStore(pool, buildId, ownerUserId = "owner-1") {
  return createPostgresEvidenceProcessingReliabilityStore({
    pool,
    ownerUserId,
    buildId,
    authorityStore: {},
  });
}

async function insertStrandedReview(pool, ownerUserId, reviewId, updatedAt) {
  const payload = {
    status: "committing",
    updatedAt,
    commitClaim: { status: "available" },
    processingReliability: { autoResumeCount: 0 },
  };
  await pool.query(
    `INSERT INTO physiqueos.canonical_evidence_records
      (owner_user_id,collection_name,record_id,status,payload,updated_at)
     VALUES ($1,'evidenceReviews',$2,'committing',$3::jsonb,$4::timestamptz)`,
    [ownerUserId, reviewId, JSON.stringify(payload), updatedAt],
  );
}
