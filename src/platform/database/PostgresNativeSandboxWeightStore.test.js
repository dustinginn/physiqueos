import { describe, expect, it, vi } from "vitest";
import { createPostgresNativeSandboxWeightStore } from "./PostgresNativeSandboxWeightStore.js";

const OWNER = "sandbox-owner";
const DATE = "2026-08-31";

describe("PostgresNativeSandboxWeightStore canonical day semantics", () => {
  it("uses the same owner-day advisory lock for artifact and scalar manual writes", async () => {
    const fixture = databaseFixture();
    const store = createPostgresNativeSandboxWeightStore({
      pool: fixture.pool,
      authority: fixture.authority,
      createId: () => "outbox-id",
    });

    await store.writeManual(manualCommand());
    await store.confirm(confirmCommand());

    const locks = fixture.queries.filter(({ sql }) => sql.includes("pg_advisory_xact_lock"));
    expect(locks).toHaveLength(2);
    expect(locks.map(({ values }) => values[0])).toEqual([
      `physiqueos:weight:${OWNER}:${DATE}`,
      `physiqueos:weight:${OWNER}:${DATE}`,
    ]);
  });

  it("treats a same-value request with a new idempotency key as a canonical no-op", async () => {
    const current = weightEntry(168.4);
    const fixture = databaseFixture({ dayEntries: [current] });
    const store = createPostgresNativeSandboxWeightStore({
      pool: fixture.pool,
      authority: fixture.authority,
    });

    await expect(store.writeManual(manualCommand({ weightEntry: current })))
      .resolves.toMatchObject({ changed: false, weightEntry: current });
    expect(fixture.queries.some(({ sql }) => sql.includes("INSERT INTO physiqueos.outbox_messages")))
      .toBe(false);
  });

  it("updates one canonical row, retains correction history, and enqueues one continuation", async () => {
    const fixture = databaseFixture({ dayEntries: [weightEntry(168.4)] });
    const store = createPostgresNativeSandboxWeightStore({
      pool: fixture.pool,
      authority: fixture.authority,
      createId: () => "correction-outbox-id",
    });

    const result = await store.writeManual(manualCommand({
      weightEntry: weightEntry(169.1, { updatedAt: "2026-09-01T16:00:00.000Z" }),
    }));

    expect(result).toMatchObject({
      changed: true,
      weightEntry: {
        id: "weight_2026_08_31",
        weight: { value: 169.1, unit: "lb" },
        correctionHistory: [expect.objectContaining({
          previousEntry: expect.objectContaining({ weight: { value: 168.4, unit: "lb" } }),
        })],
      },
    });
    expect(fixture.queries.filter(({ sql }) => sql.includes("INSERT INTO physiqueos.outbox_messages")))
      .toHaveLength(1);
  });
});

function databaseFixture({ dayEntries = [] } = {}) {
  const queries = [];
  const query = vi.fn(async (sql, values = []) => {
    queries.push({ sql, values });
    if (sql.includes("SELECT payload,version") &&
        sql.includes("canonical_evidence_records") &&
        values[1] === "evidenceReviews") {
      return {
        rows: [{
          version: 1,
          payload: {
            id: "review-1",
            userId: OWNER,
            status: "pending",
            version: 1,
          },
        }],
        rowCount: 1,
      };
    }
    if (sql.includes("SELECT payload,version") && sql.includes("canonical_evidence_records")) {
      return { rows: [], rowCount: 0 };
    }
    if (sql.includes("SELECT payload FROM physiqueos.canonical_checkin_records")) {
      return { rows: dayEntries.map((payload) => ({ payload })), rowCount: dayEntries.length };
    }
    if (sql.includes("UPDATE physiqueos.canonical_evidence_records SET payload=$5::jsonb")) {
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes("UPDATE physiqueos.canonical_checkin_records SET payload=$4::jsonb")) {
      return {
        rows: [],
        rowCount: dayEntries.some((entry) => entry.id === values[2]) ? 1 : 0,
      };
    }
    return { rows: [], rowCount: 1 };
  });
  const client = { query, release: vi.fn() };
  const descriptor = Object.freeze({
    authorityId: "sandbox-authority",
    databaseName: "sandbox-database",
    ownerUserId: OWNER,
  });
  return {
    queries,
    pool: { query, connect: vi.fn(async () => client) },
    authority: {
      descriptor,
      assertDatabase: vi.fn(async () => ({ databaseName: descriptor.databaseName })),
      assertOutboxMessage: vi.fn((message) => message),
    },
  };
}

function manualCommand({ weightEntry: entry = weightEntry(168.4) } = {}) {
  return {
    authority: { authorityId: "sandbox-authority", databaseName: "sandbox-database" },
    ownerUserId: OWNER,
    submissionIdentity: "018f0f6f-8f4c-7e4d-8a6c-3d831df41001",
    idempotencyKey: "manual-request-one",
    weightEntry: entry,
    continuation: continuation("manual-request-one"),
    confirmedAt: entry.updatedAt,
  };
}

function confirmCommand() {
  const entry = weightEntry(169.1, { source: { type: "evidence_review" } });
  return {
    authority: { authorityId: "sandbox-authority", databaseName: "sandbox-database" },
    ownerUserId: OWNER,
    reviewId: "review-1",
    expectedVersion: 1,
    weightEntry: entry,
    continuation: continuation("review-1"),
    confirmedAt: entry.updatedAt,
  };
}

function continuation(key) {
  return {
    id: `outbox-${key}`,
    userId: OWNER,
    topic: "native.sandbox.weight.confirmed",
    dedupeKey: `weight:${key}`,
    payloadVersion: "1",
    payload: { weightEntryId: "weight_2026_08_31", measurementDate: DATE },
  };
}

function weightEntry(value, overrides = {}) {
  return {
    id: "weight_2026_08_31",
    userId: OWNER,
    measuredAt: DATE,
    weight: { value, unit: "lb" },
    source: { type: "manual" },
    createdAt: "2026-09-01T14:00:00.000Z",
    updatedAt: "2026-09-01T15:00:00.000Z",
    ...overrides,
  };
}
