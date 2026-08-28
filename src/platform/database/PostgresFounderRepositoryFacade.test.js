import { describe, expect, it, vi } from "vitest";
import { createHomeBriefingService } from "../../domain/services/HomeBriefingService.js";
import { createProgressReportingService } from "../../domain/services/ProgressReportingService.js";
import { getWeightTimelineReport } from "../../domain/services/WeightEvidenceContextService.js";
import { getTrainingTimelineReport } from "../../domain/services/TrainingEvidenceContextService.js";
import { getPhotosTimelineReport } from "../../domain/services/PhotosEvidenceContextService.js";
import { getDEXATimelineReport } from "../../domain/services/DEXAEvidenceContextService.js";
import { createSeedRepositories } from "../../data/repositories/createSeedRepositories.js";
import { createProductionRepositoryFacade } from "../../data/repositories/founderRepositories.js";
import { runInactiveLegacyWebReadScope } from "../../application/auth/legacyWebContext.js";
import { loadCanonicalRuntime } from "../migration/phase4CanonicalImport.js";
import { createPhase5SyntheticRuntime, PHASE5_SYNTHETIC_OWNER_ID } from "../migration/phase5SyntheticPackage.js";
import { createPostgresFounderReadScope, createPostgresFounderRepositoryFacade } from "./PostgresFounderRepositoryFacade.js";

describe("PostgreSQL Founder repository facade", () => {
  it("hydrates reads from PostgreSQL and commits a repository mutation with metadata, enqueueing no durable outbox work", async () => {
    const database = fakeDatabase();
    const repositories = createPostgresFounderRepositoryFacade({
      pool: database.pool,
      ownerUserId: PHASE5_SYNTHETIC_OWNER_ID,
      compatibilityMode: true,
      requireCompatibilityAuthority: true,
      authorityStore: { assertCompatibilityAccess: vi.fn(async () => ({ authority: "provider-compatibility-nonauthoritative" })) },
      now: () => new Date("2026-08-14T01:00:00.000Z"),
      createCommandId: () => "repository-command-1",
    });

    const before = await repositories.goals.getGoalById("phase5-goals-001");
    expect(before.title).toBe("Synthetic strength and composition goal");
    const updated = await repositories.goals.updateGoal(before.id, { title: "Provider canonical goal" });
    expect(updated.title).toBe("Provider canonical goal");
    expect((await repositories.goals.getGoalById(before.id)).title).toBe("Provider canonical goal");
    expect(database.metadata.revision).toBe(5002);
    expect(database.outbox).toHaveLength(0);
    expect(database.transactions).toEqual(["BEGIN", "COMMIT"]);
  });

  it("requires durable compatibility authority and rejects authority drift before an isolated write", async () => {
    const database = fakeDatabase();
    expect(() => createPostgresFounderRepositoryFacade({
      pool: database.pool, ownerUserId: PHASE5_SYNTHETIC_OWNER_ID, compatibilityMode: true,
      requireCompatibilityAuthority: true,
    })).toThrow(/durable compatibility authority/i);
    const assertCompatibilityAccess = vi.fn(async () => {
      throw Object.assign(new Error("production authority rejected"), { code: "RUNTIME_AUTHORITY_COMPATIBILITY_REJECTED" });
    });
    const repositories = createPostgresFounderRepositoryFacade({
      pool: database.pool, ownerUserId: PHASE5_SYNTHETIC_OWNER_ID, compatibilityMode: true,
      requireCompatibilityAuthority: true,
      authorityStore: { assertCompatibilityAccess },
    });
    await expect(repositories.goals.updateGoal("phase5-goals-001", { title: "Rejected" }))
      .rejects.toMatchObject({ code: "RUNTIME_AUTHORITY_COMPATIBILITY_REJECTED" });
    expect(database.transactions).toEqual(["BEGIN", "ROLLBACK"]);
  });

  it("claims the first provider boundary inside the same transaction before a canonical write", async () => {
    const database = fakeDatabase();
    const claimCanonicalWriteBoundary = vi.fn(async () => ({ outcome: "recorded" }));
    const repositories = createPostgresFounderRepositoryFacade({
      pool: database.pool,
      ownerUserId: PHASE5_SYNTHETIC_OWNER_ID,
      authorityStore: { claimCanonicalWriteBoundary },
      migrationOperationId: "combined-operation",
      compatibilityMode: false,
      createCommandId: () => "first-provider-command",
    });
    await repositories.goals.updateGoal("phase5-goals-001", { title: "Canonical" });
    expect(claimCanonicalWriteBoundary).toHaveBeenCalledWith(expect.objectContaining({
      client: database.client,
      migrationOperationId: "combined-operation",
      commandId: "first-provider-command",
    }));
  });

  it("persists confirmation claims and progress without reconstructing the full Founder runtime", async () => {
    const database = fakeDatabase();
    const review = database.runtime.evidenceReviews[0];
    review.status = "pending";
    review.interpretedEvidence = { package_id: "package-one", evidence_objects: [] };
    review.commitProgress = {};
    const repositories = createPostgresFounderRepositoryFacade({
      pool: database.pool,
      ownerUserId: PHASE5_SYNTHETIC_OWNER_ID,
      compatibilityMode: true,
      requireCompatibilityAuthority: true,
      authorityStore: { assertCompatibilityAccess: vi.fn(async () => ({ authority: "provider-compatibility-nonauthoritative" })) },
      createCommandId: ({ methodName }) => `review-${methodName}`,
    });

    await repositories.evidenceReviews.claimEvidenceReviewCommit(review.id, {
      operationId: "operation-one",
      claimedAt: "2026-08-28T21:30:00.000Z",
      leaseExpiresAt: "2026-08-28T21:32:00.000Z",
      packageId: "package-one",
      evidencePackage: review.interpretedEvidence,
    });
    await repositories.evidenceReviews.recordEvidenceReviewCommitProgress(review.id, {
      operationId: "operation-one",
      key: "canonical_commit",
      value: { status: "completed", result: { canonicalEvidenceIds: ["canonical-one"] } },
      leaseExpiresAt: "2026-08-28T21:32:30.000Z",
    });
    await repositories.evidenceReviews.releaseEvidenceReviewCommit(review.id, {
      operationId: "operation-one",
      releasedAt: "2026-08-28T21:31:00.000Z",
    });

    const fullRuntimeReads = database.client.query.mock.calls.filter(([sql]) =>
      String(sql).replace(/\s+/g, " ").includes("SELECT record_id,payload FROM physiqueos."));
    expect(fullRuntimeReads).toHaveLength(0);
    expect(database.runtime.evidenceReviews[0]).toMatchObject({
      status: "committing",
      commitClaim: { operationId: "operation-one", status: "available" },
      commitProgress: { canonical_commit: { status: "completed" } },
    });
    expect(database.metadata.revision).toBe(5004);
  });

  it("shares one canonical repository snapshot across the complete Home fan-out and refreshes the next request", async () => {
    let source = structuredClone(createPhase5SyntheticRuntime());
    let loads = 0;
    const diagnostics = [];
    const scope = createPostgresFounderReadScope({
      loadRuntime: async () => { loads += 1; return structuredClone(source); },
      readPoolState: () => ({ totalCount: 1, idleCount: 1, waitingCount: 0 }),
      onComplete: (event) => diagnostics.push(event),
    });
    const repositories = createPostgresFounderRepositoryFacade({
      pool: { query: vi.fn(), connect: vi.fn() },
      ownerUserId: PHASE5_SYNTHETIC_OWNER_ID,
      compatibilityMode: true,
      readRepositories: () => scope.readRepositories(),
    });
    const home = createHomeBriefingService({
      repositories,
      readRuntimeStore: () => scope.currentRuntime(),
      now: () => new Date("2026-08-12T12:00:00.000Z"),
    });

    const first = await scope.run(() => home.getHomeBriefing(PHASE5_SYNTHETIC_OWNER_ID), { readModel: "home.v1" });
    expect(first.header.name).toBe("Synthetic");
    expect(loads).toBe(1);
    expect(scope.currentRuntime()).toBeNull();

    source.user.firstName = "Refreshed";
    const second = await scope.run(() => home.getHomeBriefing(PHASE5_SYNTHETIC_OWNER_ID), { readModel: "home.v1" });
    expect(second.header.name).toBe("Refreshed");
    expect(loads).toBe(2);
    expect(diagnostics).toEqual([
      expect.objectContaining({ readModel: "home.v1", runtimeLoadCount: 1, poolAfter: { totalCount: 1, idleCount: 1, waitingCount: 0 } }),
      expect.objectContaining({ readModel: "home.v1", runtimeLoadCount: 1, poolAfter: { totalCount: 1, idleCount: 1, waitingCount: 0 } }),
    ]);
  });

  it("reduces a provider-equivalent 20-way read fan-out from 840 queries and 15 waiters to one 42-query load", async () => {
    const runtime = structuredClone(createPhase5SyntheticRuntime());
    const baseline = limitedCanonicalQuery(runtime, 5);
    await Promise.all(Array.from({ length: 20 }, () => loadCanonicalRuntime({ query: baseline.query, ownerUserId: PHASE5_SYNTHETIC_OWNER_ID })));
    expect(baseline.telemetry()).toEqual({ queryCount: 840, maxActive: 5, maxWaiting: 15, active: 0, waiting: 0 });

    const repaired = limitedCanonicalQuery(runtime, 5);
    const scope = createPostgresFounderReadScope({
      loadRuntime: () => loadCanonicalRuntime({ query: repaired.query, ownerUserId: PHASE5_SYNTHETIC_OWNER_ID }),
    });
    await scope.run(() => Promise.all(Array.from({ length: 20 }, () => scope.readRepositories())));
    expect(repaired.telemetry()).toEqual({ queryCount: 42, maxActive: 1, maxWaiting: 0, active: 0, waiting: 0 });
  });

  it("shares one 42-query provider runtime across composition, principal, and a nested page read", async () => {
    const runtime = structuredClone(createPhase5SyntheticRuntime());
    const database = limitedCanonicalQuery(runtime, 5);
    const scope = createPostgresFounderReadScope({
      loadRuntime: () => loadCanonicalRuntime({ query: database.query, ownerUserId: PHASE5_SYNTHETIC_OWNER_ID }),
      readPoolState: database.telemetry,
    });
    const repositories = createPostgresFounderRepositoryFacade({
      pool: { query: database.query, connect: vi.fn() },
      ownerUserId: PHASE5_SYNTHETIC_OWNER_ID,
      compatibilityMode: true,
      readRepositories: () => scope.readRepositories(),
      runInReadScope: (callback, metadata) => scope.run(callback, metadata),
    });
    const runRequest = () => runInactiveLegacyWebReadScope({
      readModel: "home.page",
      runInReadScope: (callback, metadata) => scope.run(callback, metadata),
      resolveComposition: async () => {
        await scope.readRuntime();
        return Object.freeze({ repositories });
      },
      callback: ({ context }) => repositories.runInReadScope(async () => ({
        user: await repositories.users.getUserById(context.principal.userId),
        goals: await repositories.goals.listGoals(context.principal.userId),
      }), { readModel: "home.v1" }),
    });

    const first = await runRequest();
    expect(first.user.id).toBe(PHASE5_SYNTHETIC_OWNER_ID);
    expect(first.goals.length).toBeGreaterThan(0);
    expect(database.telemetry()).toEqual({ queryCount: 42, maxActive: 1, maxWaiting: 0, active: 0, waiting: 0 });

    await runRequest();
    expect(database.telemetry()).toEqual({ queryCount: 84, maxActive: 1, maxWaiting: 0, active: 0, waiting: 0 });
  });

  it("isolates concurrent requests, releases rejected scopes, and never serves a stale cross-request snapshot", async () => {
    let revision = 1;
    let loads = 0;
    let fail = true;
    const scope = createPostgresFounderReadScope({
      loadRuntime: async () => {
        loads += 1;
        if (fail) throw new Error("provider read failed");
        return { ...structuredClone(createPhase5SyntheticRuntime()), revision };
      },
    });
    await expect(scope.run(() => scope.readRepositories())).rejects.toThrow("provider read failed");
    expect(scope.currentRuntime()).toBeNull();
    fail = false;
    const [left, right] = await Promise.all([
      scope.run(async () => (await scope.readRepositories()).users.getCurrentUser()),
      scope.run(async () => (await scope.readRepositories()).users.getCurrentUser()),
    ]);
    expect(left.id).toBe(PHASE5_SYNTHETIC_OWNER_ID);
    expect(right.id).toBe(PHASE5_SYNTHETIC_OWNER_ID);
    expect(loads).toBe(3);
    revision = 2;
    await scope.run(() => scope.readRepositories());
    expect(loads).toBe(4);
    expect(scope.currentRuntime()).toBeNull();
  });

  it("shares one runtime across the direct Progress facade even when every repository call resolves a fresh composition", async () => {
    const runtime = structuredClone(createPhase5SyntheticRuntime());
    const database = limitedCanonicalQuery(runtime, 5);
    const diagnostics = [];
    const scope = createPostgresFounderReadScope({
      loadRuntime: () => loadCanonicalRuntime({ query: database.query, ownerUserId: PHASE5_SYNTHETIC_OWNER_ID }),
      readPoolState: database.telemetry,
      onComplete: (event) => diagnostics.push(event),
    });
    const direct = createProductionRepositoryFacade({
      legacyRepositories: createSeedRepositories(structuredClone(runtime)),
      runInReadScope: (callback, metadata) => scope.run(callback, metadata),
      resolveComposition: async () => ({
        repositories: createPostgresFounderRepositoryFacade({
          pool: { query: database.query, connect: vi.fn() },
          ownerUserId: PHASE5_SYNTHETIC_OWNER_ID,
          compatibilityMode: true,
          readRepositories: () => scope.readRepositories(),
        }),
      }),
    });

    const report = await createProgressReportingService({ repositories: direct }).getProgressHub();

    expect(report.streams).toHaveLength(9);
    expect(database.telemetry()).toEqual({ queryCount: 42, maxActive: 1, maxWaiting: 0, active: 0, waiting: 0 });
    expect(diagnostics).toEqual([expect.objectContaining({
      readModel: "progress.getProgressHub",
      runtimeLoadCount: 1,
      poolAfter: expect.objectContaining({ waitingCount: 0 }),
    })]);
    expect(scope.currentRuntime()).toBeNull();
  });

  it("reuses an active direct-composite scope when a nested Phase 3 scope is entered", async () => {
    let loads = 0;
    const scope = createPostgresFounderReadScope({
      loadRuntime: async () => { loads += 1; return structuredClone(createPhase5SyntheticRuntime()); },
    });

    await scope.run(async () => {
      await scope.readRepositories();
      await scope.run(async () => {
        await scope.readRepositories();
      }, { readModel: "home.v1" });
    }, { readModel: "direct-composite" });

    expect(loads).toBe(1);
    expect(scope.currentRuntime()).toBeNull();
  });

  it.each([
    ["weight", (repositories) => getWeightTimelineReport({ repositories, context: "all" })],
    ["training", (repositories) => getTrainingTimelineReport({ repositories, context: "all" })],
    ["photos", (repositories) => getPhotosTimelineReport({ repositories, context: "all" })],
    ["dexa", (repositories) => getDEXATimelineReport({ repositories, context: "all" })],
  ])("shares one runtime across the nested %s Progress composite", async (_stream, read) => {
    const runtime = structuredClone(createPhase5SyntheticRuntime());
    const database = limitedCanonicalQuery(runtime, 5);
    const diagnostics = [];
    const scope = createPostgresFounderReadScope({
      loadRuntime: () => loadCanonicalRuntime({ query: database.query, ownerUserId: PHASE5_SYNTHETIC_OWNER_ID }),
      readPoolState: database.telemetry,
      onComplete: (event) => diagnostics.push(event),
    });
    const direct = createProductionRepositoryFacade({
      legacyRepositories: createSeedRepositories(structuredClone(runtime)),
      runInReadScope: (callback, metadata) => scope.run(callback, metadata),
      resolveComposition: async () => ({
        repositories: createPostgresFounderRepositoryFacade({
          pool: { query: database.query, connect: vi.fn() },
          ownerUserId: PHASE5_SYNTHETIC_OWNER_ID,
          compatibilityMode: true,
          readRepositories: () => scope.readRepositories(),
        }),
      }),
    });

    await read(direct);

    expect(database.telemetry()).toEqual({ queryCount: 42, maxActive: 1, maxWaiting: 0, active: 0, waiting: 0 });
    expect(diagnostics).toEqual([expect.objectContaining({
      runtimeLoadCount: 1,
      poolAfter: expect.objectContaining({ waitingCount: 0 }),
    })]);
    expect(scope.currentRuntime()).toBeNull();
  });
});

function limitedCanonicalQuery(runtime, limit) {
  let active = 0, waiting = 0, maxActive = 0, maxWaiting = 0, queryCount = 0;
  const queue = [];
  async function query(sql, values = []) {
    queryCount += 1;
    if (active >= limit) {
      waiting += 1;
      maxWaiting = Math.max(maxWaiting, waiting);
      await new Promise((resolve) => queue.push(resolve));
      waiting -= 1;
    }
    active += 1;
    maxActive = Math.max(maxActive, active);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1));
      return canonicalRows(runtime, sql, values);
    } finally {
      active -= 1;
      queue.shift()?.();
    }
  }
  return { query, telemetry: () => ({ queryCount, maxActive, maxWaiting, active, waiting }) };
}

function canonicalRows(runtime, sql, values) {
  const normalized = String(sql).replace(/\s+/g, " ").trim();
  if (normalized.includes("SELECT record_id,payload FROM physiqueos.")) {
    const source = runtime[values[1]];
    const records = source == null ? [] : Array.isArray(source) ? source : [source];
    return { rows: records.map((payload, index) => ({ record_id: id(payload, index), payload: structuredClone(payload) })), rowCount: records.length };
  }
  if (normalized.includes("FROM physiqueos.phase4_import_runs")) return { rows: [{ report: { runtimeVersion: runtime.version, runtimeRevision: runtime.revision, sourceUpdatedAt: runtime.updatedAt }, source_sha256: "a".repeat(64) }], rowCount: 1 };
  if (normalized.includes("FROM physiqueos.canonical_application_context")) return { rows: [{ operating_rhythm: runtime.operatingRhythm ?? null, adaptive_trust_profile: runtime.adaptiveTrustProfile ?? null, retired_milestones: runtime.milestones ?? [] }], rowCount: 1 };
  if (normalized.startsWith("SELECT runtime_version,revision,last_command_id,updated_at,imported_at")) return { rows: [{ runtime_version: runtime.version, revision: runtime.revision, last_command_id: runtime.lastCommitId, updated_at: runtime.updatedAt, imported_at: runtime.importedAt }], rowCount: 1 };
  throw new Error(`Unexpected canonical read SQL: ${normalized}`);
}

function fakeDatabase() {
  const runtime = structuredClone(createPhase5SyntheticRuntime());
  const metadata = { revision: runtime.revision };
  const outbox = [];
  const transactions = [];
  const query = vi.fn(async (sql, values = []) => {
    const normalized = String(sql).replace(/\s+/g, " ").trim();
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(normalized)) {
      transactions.push(normalized);
      return { rows: [], rowCount: 0 };
    }
    if (normalized.includes("pg_advisory_xact_lock")) return { rows: [{}], rowCount: 1 };
    if (normalized === "SELECT current_database() AS database") return { rows: [{ database: "physiqueos_phase5_test_provider_unit" }], rowCount: 1 };
    if (normalized.startsWith("SELECT version,payload FROM physiqueos.canonical_evidence_records")) {
      const review = runtime.evidenceReviews.find((item) => id(item) === values[1]);
      return { rows: review ? [{ version: review.version ?? 1, payload: structuredClone(review) }] : [], rowCount: review ? 1 : 0 };
    }
    if (normalized.startsWith("UPDATE physiqueos.canonical_evidence_records SET") && normalized.includes("collection_name='evidenceReviews'")) {
      const position = runtime.evidenceReviews.findIndex((item) => id(item) === values[1]);
      if (position < 0) return { rows: [], rowCount: 0 };
      runtime.evidenceReviews[position] = JSON.parse(values[8]);
      return { rows: [], rowCount: 1 };
    }
    if (normalized.includes("SELECT record_id,payload FROM physiqueos.")) {
      const collection = values[1];
      const source = runtime[collection];
      const records = source == null ? [] : Array.isArray(source) ? source : [source];
      return { rows: records.map((payload, index) => ({ record_id: id(payload, index), payload: structuredClone(payload) })), rowCount: records.length };
    }
    if (normalized.includes("FROM physiqueos.phase4_import_runs")) {
      return { rows: [{ report: { runtimeVersion: runtime.version, runtimeRevision: metadata.revision, sourceUpdatedAt: runtime.updatedAt }, source_sha256: "a".repeat(64) }], rowCount: 1 };
    }
    if (normalized.includes("FROM physiqueos.canonical_application_context")) {
      return { rows: [{ operating_rhythm: null, adaptive_trust_profile: null, retired_milestones: [] }], rowCount: 1 };
    }
    if (normalized.startsWith("DELETE FROM physiqueos.")) {
      const collection = values[1];
      if (collection) {
        const retained = new Set(values[2] ?? []);
        const source = runtime[collection];
        const records = source == null ? [] : Array.isArray(source) ? source : [source];
        runtime[collection] = records.filter((record, index) => retained.has(id(record, index)));
      }
      return { rows: [], rowCount: 0 };
    }
    if (normalized.startsWith("SELECT version FROM physiqueos.")) {
      const source = runtime[values[1]];
      const records = source == null ? [] : Array.isArray(source) ? source : [source];
      const record = records.find((entry, index) => id(entry, index) === values[2]);
      return { rows: record ? [{ version: record.version ?? 1 }] : [], rowCount: record ? 1 : 0 };
    }
    if (normalized.startsWith("INSERT INTO physiqueos.") && normalized.includes("collection_name,record_id")) {
      const collection = values[1];
      const payload = JSON.parse(values[11]);
      const source = runtime[collection];
      const records = source == null ? [] : Array.isArray(source) ? source : [source];
      const position = records.findIndex((entry, index) => id(entry, index) === values[2]);
      if (position >= 0) records[position] = payload;
      else records.push(payload);
      runtime[collection] = ["user", "nutritionContext", "operatingPlan"].includes(collection) ? records[0] ?? null : records;
      return { rows: [], rowCount: 1 };
    }
    if (normalized.startsWith("UPDATE physiqueos.canonical_runtime_metadata")) {
      metadata.revision += 1;
      return { rows: [], rowCount: 1 };
    }
    if (normalized.startsWith("SELECT runtime_version,revision,last_command_id,updated_at,imported_at")) {
      return { rows: [{ runtime_version: "founder-seed-v2", revision: metadata.revision,
        last_command_id: null, updated_at: "2026-08-13T00:00:00.000Z",
        imported_at: "2026-08-13T00:00:00.000Z" }], rowCount: 1 };
    }
    if (normalized.startsWith("INSERT INTO physiqueos.outbox_messages")) {
      outbox.push(JSON.parse(values[3]));
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`Unexpected SQL in fake database: ${normalized}`);
  });
  const client = { query, release: vi.fn() };
  return { runtime, metadata, outbox, transactions, client, pool: { query, connect: async () => client } };
}

function id(record, position) { return String(record?.id ?? record?.package_id ?? record?.review_id ?? `@index:${position}`); }
