import { firstRow, requiredRow } from "./postgresRows.js";

export function createPostgresCommandStore({ query }) {
  return Object.freeze({
    commandReceipts: Object.freeze({
      async find(userId, idempotencyKey) {
        return mapCommandReceipt(firstRow(await query("SELECT * FROM physiqueos.command_receipts WHERE user_id = $1 AND idempotency_key = $2", [userId, idempotencyKey])));
      },
      // Two requests carrying the same idempotency key can race this far apart
      // in wall-clock time (e.g. a still-in-flight request from the app's
      // previous process lifetime overlapping a fresh request after relaunch).
      // ON CONFLICT DO NOTHING makes the insert itself race-safe instead of
      // throwing a raw unique-violation; the caller must re-fetch via find()
      // when this returns null (the race was lost, not an error).
      //
      // ON CONFLICT's arbiter only suppresses a violation of the NAMED
      // constraint -- (user_id, idempotency_key) here. This table also has a
      // PRIMARY KEY (id) and UNIQUE (user_id, command_id); every current
      // caller (ProductionNativeAPI.submitCommand, Swift) generates a fresh
      // commandId per HTTP attempt, so a real race here only ever collides
      // on the idempotency-key arbiter in practice. But createCommandMetadata
      // lets a caller supply its own stable commandId, so a hypothetical
      // future caller that reuses one across retries could hit the PK/
      // command_id constraint instead, which ON CONFLICT would NOT suppress.
      // The catch below is defense-in-depth against exactly that: any
      // unique-violation (23505) on this insert -- not just the named
      // arbiter's -- is treated as "someone else's identical attempt won",
      // never a raw, unhandled error.
      async insert(record) {
        let inserted;
        try {
          inserted = await query(
            `INSERT INTO physiqueos.command_receipts
              (id, user_id, device_id, session_id, command_id, idempotency_key, command_type, payload_hash, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (user_id, idempotency_key) DO NOTHING
             RETURNING *`,
            [record.id, record.userId, record.deviceId, record.sessionId, record.commandId, record.idempotencyKey, record.commandType, record.payloadHash, record.status],
          );
        } catch (error) {
          if (error?.code !== "23505") throw error;
          return null;
        }
        return mapCommandReceipt(firstRow(inserted));
      },
      async complete(userId, idempotencyKey, completion) {
        return mapCommandReceipt(requiredRow(await query(
          `UPDATE physiqueos.command_receipts
              SET status = $3, result = $4, operation_id = $5, completed_at = now()
            WHERE user_id = $1 AND idempotency_key = $2 RETURNING *`,
          [userId, idempotencyKey, completion.status, completion.result, completion.operationId],
        )));
      },
    }),
    outbox: Object.freeze({
      // Same unguarded-unique-constraint pattern as commandReceipts.insert
      // used to have, against outbox_messages' UNIQUE (topic, dedupe_key) --
      // fixed the same way. Unlike a lost commandReceipts race (a graceful
      // replay), a duplicate outbox dedupe key within one command's own
      // execution is a genuine application error (the same event enqueued
      // twice), so this still throws -- just a controlled, typed error
      // instead of a raw unique-violation -- matching
      // InMemoryFoundationTransactionStore's existing "Duplicate outbox
      // dedupe key." contract exactly.
      async insert(record) {
        const inserted = await query(
          `INSERT INTO physiqueos.outbox_messages
            (id, user_id, operation_id, topic, dedupe_key, payload_version, payload, due_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, now()))
           ON CONFLICT (topic, dedupe_key) DO NOTHING
           RETURNING *`,
          [record.id, record.userId ?? null, record.operationId ?? null, record.topic, record.dedupeKey, record.payloadVersion, record.payload, record.dueAt ?? null],
        );
        const row = firstRow(inserted);
        if (!row) throw new Error("Duplicate outbox dedupe key.");
        return row;
      },
    }),
  });
}

function mapCommandReceipt(row) {
  if (!row) return null;
  return Object.freeze({
    ...row,
    userId: row.user_id,
    deviceId: row.device_id,
    sessionId: row.session_id,
    commandId: row.command_id,
    idempotencyKey: row.idempotency_key,
    commandType: row.command_type,
    payloadHash: row.payload_hash,
    operationId: row.operation_id,
  });
}
