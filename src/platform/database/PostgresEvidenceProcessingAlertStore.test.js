import { describe, expect, it } from "vitest";
import { createPostgresEvidenceProcessingAlertStore } from "./PostgresEvidenceProcessingAlertStore.js";

describe("PostgresEvidenceProcessingAlertStore", () => {
  it("persists opened, escalated, and resolved transitions without identities", async () => {
    const rows = [];
    const client = {
      async query(sql, values = []) {
        if (sql.includes("SELECT payload FROM")) return { rows: [...rows].reverse() };
        if (sql.includes("INSERT INTO physiqueos.outbox_messages")) {
          const payload = JSON.parse(values[5]);
          if (!rows.some((row) => row.payload.code === payload.code && row.payload.transition === payload.transition
            && row.payload.episodeOpenedAt === payload.episodeOpenedAt)) {
            rows.push({ payload });
            return { rows: [], rowCount: 1 };
          }
          return { rows: [], rowCount: 0 };
        }
        return { rows: [] };
      },
      release() {},
    };
    const store = createPostgresEvidenceProcessingAlertStore({
      pool: { connect: async () => client }, ownerUserId: "owner-private", buildId: "build-1",
    });
    const reconcile = (codes, observedAt) => store.reconcile({
      codes, metrics: { staleReviewCount: codes.length }, observedAt: new Date(observedAt), escalationAfterMs: 900_000,
    });
    await reconcile(["EVIDENCE_REVIEW_STALE"], "2026-10-10T20:00:00.000Z");
    await reconcile(["EVIDENCE_REVIEW_STALE"], "2026-10-10T20:05:00.000Z");
    await reconcile(["EVIDENCE_REVIEW_STALE"], "2026-10-10T20:16:00.000Z");
    await reconcile([], "2026-10-10T20:17:00.000Z");
    expect(rows.map((row) => row.payload.transition)).toEqual(["opened", "escalated", "resolved"]);
    expect(JSON.stringify(rows)).not.toContain("owner-private");
  });
});
