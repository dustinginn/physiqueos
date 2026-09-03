import { randomUUID } from "node:crypto";

const SUBMISSION_COLLECTION = "nativeSandboxWeightSubmissions";
const REVIEW_COLLECTION = "evidenceReviews";
const MANUAL_SUBMISSION_COLLECTION = "nativeSandboxManualWeightSubmissions";
const WEIGHT_ENTRY_COLLECTION = "weightEntries";
const WEIGHT_ENTRY_TABLE = "canonical_checkin_records";

export function createPostgresNativeSandboxWeightStore({
  pool,
  authority,
  now = () => new Date(),
  createId = randomUUID,
} = {}) {
  if (!pool?.connect || !pool?.query || !authority?.assertDatabase || !authority?.descriptor) {
    throw new Error("PostgreSQL Native sandbox Weight storage requires an isolated database authority.");
  }
  const ownerUserId = authority.descriptor.ownerUserId;

  return Object.freeze({
    async begin({ authority: descriptor, ownerUserId: requestedOwner, submissionIdentity, idempotencyKey, candidate }) {
      assertDescriptor(authority.descriptor, descriptor, requestedOwner);
      return transaction(pool, async (client) => {
        await authority.assertDatabase(client);
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`native-sandbox:${ownerUserId}:${idempotencyKey}`]);
        const existing = await getSubmission(client, ownerUserId, idempotencyKey);
        if (existing) {
          if (existing.submissionIdentity !== submissionIdentity) throw conflict();
          const review = existing.reviewId ? await getRecord(client, ownerUserId, REVIEW_COLLECTION, existing.reviewId) : null;
          return Object.freeze({ outcome: "existing", intakeId: existing.intakeId, review });
        }
        const intakeId = `native_sandbox_intake_${submissionIdentity.replaceAll("-", "")}`;
        const payload = {
          schemaVersion: "1", id: `native_sandbox_submission_${submissionIdentity.replaceAll("-", "")}`,
          userId: ownerUserId, sandboxAuthority: authority.descriptor, submissionIdentity,
          idempotencyKey, intakeId, reviewId: null, candidate, status: "receiving",
          createdAt: now().toISOString(), updatedAt: now().toISOString(),
        };
        await putRecord(client, { table: "canonical_evidence_records", collection: SUBMISSION_COLLECTION,
          ownerUserId, recordId: payload.id, sourceIdentity: idempotencyKey, occurrenceDate: candidate.measurementDate,
          status: payload.status, provenance: { sandboxAuthority: authority.descriptor }, payload });
        return Object.freeze({ outcome: "created", intakeId });
      });
    },

    async stage({ authority: descriptor, ownerUserId: requestedOwner, idempotencyKey, review }) {
      assertDescriptor(authority.descriptor, descriptor, requestedOwner);
      return transaction(pool, async (client) => {
        await authority.assertDatabase(client);
        const submission = await getSubmission(client, ownerUserId, idempotencyKey, true);
        if (!submission || submission.submissionIdentity !== review.submissionIdentity) throw conflict();
        const existing = await getRecord(client, ownerUserId, REVIEW_COLLECTION, review.id);
        if (existing) return existing;
        await putRecord(client, { table: "canonical_evidence_records", collection: REVIEW_COLLECTION,
          ownerUserId, recordId: review.id, sourceIdentity: review.intakeId,
          occurrenceDate: review.occurrenceDate, status: review.status,
          provenance: { sandboxAuthority: authority.descriptor, intakeId: review.intakeId }, payload: review });
        await client.query(
          `UPDATE physiqueos.canonical_evidence_records SET payload=jsonb_set(jsonb_set(payload,'{reviewId}',to_jsonb($4::text)),'{status}',to_jsonb('staged'::text)),
             status='staged',version=version+1,updated_at=$5
           WHERE owner_user_id=$1 AND collection_name=$2 AND source_identity=$3`,
          [ownerUserId, SUBMISSION_COLLECTION, idempotencyKey, review.id, now()],
        );
        return structuredClone(review);
      });
    },

    async getReview({ ownerUserId: requestedOwner, reviewId }) {
      if (requestedOwner !== ownerUserId) return null;
      await authority.assertDatabase();
      return getRecord(pool, ownerUserId, REVIEW_COLLECTION, reviewId);
    },

    async confirm({ authority: descriptor, ownerUserId: requestedOwner, reviewId, expectedVersion,
      weightEntry, continuation, confirmedAt }) {
      assertDescriptor(authority.descriptor, descriptor, requestedOwner);
      authority.assertOutboxMessage(continuation);
      return transaction(pool, async (client) => {
        await authority.assertDatabase(client);
        const review = await getRecord(client, ownerUserId, REVIEW_COLLECTION, reviewId, true);
        if (!review || review.status !== "pending" || Number(review.version) !== Number(expectedVersion)) throw conflict();
        const updated = { ...review, status: "confirmed", version: Number(review.version) + 1,
          confirmation: { confirmedAt }, updatedAt: confirmedAt };
        const changed = await client.query(
          `UPDATE physiqueos.canonical_evidence_records SET payload=$5::jsonb,status='confirmed',
             version=version+1,updated_at=$6 WHERE owner_user_id=$1 AND collection_name=$2 AND record_id=$3 AND version=$4`,
          [ownerUserId, REVIEW_COLLECTION, reviewId, expectedVersion, JSON.stringify(updated), confirmedAt],
        );
        if (changed.rowCount !== 1) throw conflict();
        await putRecord(client, { table: "canonical_checkin_records", collection: "weightEntries",
          ownerUserId, recordId: weightEntry.id, sourceIdentity: `native-sandbox-review:${reviewId}`,
          occurrenceDate: weightEntry.measuredAt, status: "confirmed",
          provenance: { sandboxAuthority: authority.descriptor, reviewId }, payload: weightEntry });
        await client.query(
          `INSERT INTO physiqueos.outbox_messages
            (id,user_id,topic,dedupe_key,payload_version,payload,due_at)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
           ON CONFLICT (topic,dedupe_key) DO NOTHING`,
          [`native_sandbox_outbox_${createId()}`, continuation.userId, continuation.topic,
            continuation.dedupeKey, continuation.payloadVersion, JSON.stringify(continuation.payload), confirmedAt],
        );
        return Object.freeze({ review: updated, weightEntry });
      });
    },

    // Direct canonical write for the manual scalar Weight path (no Evidence
    // Review stage, mirroring production manual Weight). idempotencyKey
    // guards true request replay; weightEntry.id is date-scoped by the
    // caller so a second distinct value for the same day corrects the same
    // canonical record, matching MorningCheckInPersistenceService's
    // one-entry-per-day semantics.
    async writeManual({ authority: descriptor, ownerUserId: requestedOwner, submissionIdentity,
      idempotencyKey, weightEntry, continuation, confirmedAt }) {
      assertDescriptor(authority.descriptor, descriptor, requestedOwner);
      return transaction(pool, async (client) => {
        await authority.assertDatabase(client);
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          [`native-sandbox-weight-manual:${ownerUserId}:${idempotencyKey}`],
        );
        const priorSubmission = await getRecord(client, ownerUserId, MANUAL_SUBMISSION_COLLECTION, idempotencyKey);
        if (priorSubmission) {
          if (priorSubmission.submissionIdentity !== submissionIdentity) throw conflict();
          return Object.freeze({ weightEntry: priorSubmission.weightEntry, changed: false });
        }
        authority.assertOutboxMessage(continuation);
        const existing = await getRecord(client, ownerUserId, WEIGHT_ENTRY_COLLECTION, weightEntry.id, true, WEIGHT_ENTRY_TABLE);
        const unchanged = existing != null &&
          existing.weight?.value === weightEntry.weight.value &&
          existing.weight?.unit === weightEntry.weight.unit;
        if (!unchanged) {
          if (existing) {
            await client.query(
              `UPDATE physiqueos.${WEIGHT_ENTRY_TABLE} SET payload=$4::jsonb,status='confirmed',version=version+1,updated_at=$5
                 WHERE owner_user_id=$1 AND collection_name=$2 AND record_id=$3`,
              [ownerUserId, WEIGHT_ENTRY_COLLECTION, weightEntry.id, JSON.stringify(weightEntry), confirmedAt],
            );
          } else {
            await putRecord(client, { table: WEIGHT_ENTRY_TABLE, collection: WEIGHT_ENTRY_COLLECTION,
              ownerUserId, recordId: weightEntry.id, sourceIdentity: `native-sandbox-weight-manual:${weightEntry.id}`,
              occurrenceDate: weightEntry.measuredAt, status: "confirmed",
              provenance: { sandboxAuthority: authority.descriptor }, payload: weightEntry });
          }
          await client.query(
            `INSERT INTO physiqueos.outbox_messages
              (id,user_id,topic,dedupe_key,payload_version,payload,due_at)
             VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
             ON CONFLICT (topic,dedupe_key) DO NOTHING`,
            [`native_sandbox_outbox_${createId()}`, continuation.userId, continuation.topic,
              continuation.dedupeKey, continuation.payloadVersion, JSON.stringify(continuation.payload), confirmedAt],
          );
        }
        await putRecord(client, { table: "canonical_evidence_records", collection: MANUAL_SUBMISSION_COLLECTION,
          ownerUserId, recordId: idempotencyKey, sourceIdentity: idempotencyKey, occurrenceDate: weightEntry.measuredAt,
          status: "recorded", provenance: { sandboxAuthority: authority.descriptor },
          payload: { submissionIdentity, weightEntry } });
        return Object.freeze({ weightEntry, changed: !unchanged });
      });
    },

    async discard({ authority: descriptor, ownerUserId: requestedOwner, reviewId, expectedVersion }) {
      assertDescriptor(authority.descriptor, descriptor, requestedOwner);
      return transaction(pool, async (client) => {
        await authority.assertDatabase(client);
        const review = await getRecord(client, ownerUserId, REVIEW_COLLECTION, reviewId, true);
        if (!review || Number(review.version) !== Number(expectedVersion) || review.status === "confirmed") throw conflict();
        await client.query(
          "DELETE FROM physiqueos.canonical_evidence_records WHERE owner_user_id=$1 AND collection_name=$2 AND record_id=$3",
          [ownerUserId, REVIEW_COLLECTION, reviewId],
        );
        await client.query(
          "DELETE FROM physiqueos.canonical_evidence_records WHERE owner_user_id=$1 AND collection_name=$2 AND payload->>'reviewId'=$3",
          [ownerUserId, SUBMISSION_COLLECTION, reviewId],
        );
        await client.query(
          `UPDATE physiqueos.canonical_media_objects SET state='tombstoned',version=version+1,updated_at=$3
            WHERE owner_user_id=$1 AND evidence_record_id=$2 AND state='verified'`,
          [ownerUserId, review.intakeId, now()],
        );
        return Object.freeze({ discarded: true, reviewId });
      });
    },
  });
}

async function getSubmission(client, ownerUserId, idempotencyKey, lock = false) {
  const result = await client.query(
    `SELECT payload FROM physiqueos.canonical_evidence_records
      WHERE owner_user_id=$1 AND collection_name=$2 AND source_identity=$3${lock ? " FOR UPDATE" : ""}`,
    [ownerUserId, SUBMISSION_COLLECTION, idempotencyKey],
  );
  return result.rows[0]?.payload ?? null;
}
async function getRecord(client, ownerUserId, collection, recordId, lock = false, table = "canonical_evidence_records") {
  const result = await client.query(
    `SELECT payload,version FROM physiqueos.${table}
      WHERE owner_user_id=$1 AND collection_name=$2 AND record_id=$3${lock ? " FOR UPDATE" : ""}`,
    [ownerUserId, collection, recordId],
  );
  const row = result.rows[0];
  return row ? Object.freeze({ ...row.payload, version: Number(row.version) }) : null;
}

async function putRecord(client, { table, collection, ownerUserId, recordId, sourceIdentity,
  occurrenceDate, status, provenance, payload }) {
  await client.query(
    `INSERT INTO physiqueos.${table}
      (owner_user_id,collection_name,record_id,source_ordinal,legacy_id,version,status,occurrence_date,source_identity,provenance,payload)
     VALUES ($1,$2,$3,(SELECT COALESCE(MAX(source_ordinal)+1,0) FROM physiqueos.${table} WHERE owner_user_id=$1 AND collection_name=$2),
       $3,$4,$5,$6::date,$7,$8::jsonb,$9::jsonb)
     ON CONFLICT (owner_user_id,collection_name,record_id) DO NOTHING`,
    [ownerUserId, collection, recordId, Number(payload.version ?? 1), status ?? null,
      occurrenceDate ?? null, sourceIdentity ?? null, JSON.stringify(provenance ?? {}), JSON.stringify(payload)],
  );
}

async function transaction(pool, callback) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
function assertDescriptor(expected, actual, ownerUserId) {
  if (actual?.authorityId !== expected.authorityId || actual?.databaseName !== expected.databaseName || ownerUserId !== expected.ownerUserId) {
    throw Object.assign(new Error("Native sandbox authority boundary violation."), { code: "NATIVE_SANDBOX_AUTHORITY_VIOLATION" });
  }
}
function conflict() { return Object.assign(new Error("Native sandbox Weight persistence conflict."), { code: "NATIVE_SANDBOX_WEIGHT_REVIEW_CONFLICT" }); }
