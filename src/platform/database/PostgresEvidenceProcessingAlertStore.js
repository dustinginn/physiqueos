import { createUuidV7 } from "../../contracts/v1/identifiers.js";
import {
  EVIDENCE_PROCESSING_OPERATOR_ALERT_PAYLOAD_VERSION,
  EVIDENCE_PROCESSING_OPERATOR_ALERT_TOPIC,
} from "../jobs/EvidenceProcessingAlertRouting.js";

const LOCK_KEY = 7_603_112_014;

export function createPostgresEvidenceProcessingAlertStore({ pool, ownerUserId, buildId } = {}) {
  if (!pool?.connect || !ownerUserId || !buildId) throw new Error("Evidence alert store requires pool, owner, and build identity.");
  return Object.freeze({
    async reconcile({ codes, metrics, observedAt, escalationAfterMs }) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock($1)", [LOCK_KEY]);
        const priorRows = (await client.query(
          `SELECT payload FROM (
             SELECT DISTINCT ON (payload->>'code') payload, created_at, id
               FROM physiqueos.outbox_messages
              WHERE topic=$1 AND payload ? 'code'
              ORDER BY payload->>'code', created_at DESC, id DESC
           ) latest ORDER BY created_at DESC, id DESC`,
          [EVIDENCE_PROCESSING_OPERATOR_ALERT_TOPIC],
        )).rows;
        const prior = latestTransitions(priorRows);
        const active = new Set(codes);
        const transitions = [];
        for (const code of active) {
          const state = prior.get(code);
          if (!state || state.transition === "resolved") transitions.push({ code, transition: "opened", episodeOpenedAt: observedAt });
          else if (state.transition !== "escalated" && observedAt - new Date(state.episodeOpenedAt) >= escalationAfterMs) {
            transitions.push({ code, transition: "escalated", episodeOpenedAt: new Date(state.episodeOpenedAt) });
          }
        }
        for (const [code, state] of prior) {
          if (!active.has(code) && state.transition !== "resolved") {
            transitions.push({ code, transition: "resolved", episodeOpenedAt: new Date(state.episodeOpenedAt) });
          }
        }
        let enqueued = 0;
        for (const transition of transitions) {
          const episode = transition.episodeOpenedAt.toISOString();
          const payload = {
            schemaVersion: 1,
            code: transition.code,
            transition: transition.transition,
            severity: severityFor(transition.code, transition.transition),
            episodeOpenedAt: episode,
            observedAt: observedAt.toISOString(),
            buildId,
            metrics,
          };
          const inserted = await client.query(
            `INSERT INTO physiqueos.outbox_messages
              (id,user_id,operation_id,topic,dedupe_key,payload_version,payload,status,due_at)
             VALUES ($1,$2,NULL,$3,$4,$5,$6::jsonb,'pending',$7)
             ON CONFLICT (topic,dedupe_key) DO NOTHING`,
            [createUuidV7(), ownerUserId, EVIDENCE_PROCESSING_OPERATOR_ALERT_TOPIC,
              `${transition.code}:${episode}:${transition.transition}`,
              EVIDENCE_PROCESSING_OPERATOR_ALERT_PAYLOAD_VERSION, JSON.stringify(payload), observedAt],
          );
          enqueued += Number(inserted.rowCount ?? 0);
        }
        await client.query("COMMIT");
        return Object.freeze({ enqueued });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  });
}

function latestTransitions(rows) {
  const result = new Map();
  for (const row of rows) {
    const payload = row.payload ?? {};
    if (!result.has(payload.code) && payload.code && payload.transition && payload.episodeOpenedAt) result.set(payload.code, payload);
  }
  return result;
}

function severityFor(code, transition) {
  if (transition === "resolved") return "recovery";
  if (transition === "escalated" || code.includes("CRITICAL") || code.includes("DEAD") || code.includes("UNAVAILABLE")) return "critical";
  return "warning";
}
