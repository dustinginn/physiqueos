import { canonicalJson, createPayloadHash } from "../../contracts/v1/canonicalJson.js";

const STATUS = Object.freeze({ DECLARED: "declared", RECEIVING: "receiving", VERIFIED: "verified", CONSUMED: "consumed", FAILED: "failed" });

export function createPostgresCombinedTransferReceiptStore({ pool } = {}) {
  if (!pool?.connect || !pool?.query) throw new Error("Combined transfer receipts require PostgreSQL.");
  return Object.freeze({
    async declare(input) {
      validateIdentity(input);
      const manifest = normalizedManifest(input);
      const result = await pool.query(
        `INSERT INTO physiqueos.combined_transfer_receipts
          (migration_operation_id,authorization_fingerprint,fence_id,package_digest,runtime_sha256,
           media_inventory_sha256,migration_control_sha256,status,manifest,provider_deployment_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'declared',$8::jsonb,$9)
         ON CONFLICT (migration_operation_id) DO NOTHING RETURNING *`,
        values(input, manifest),
      );
      if (result.rows[0]) return freeze({ receipt: row(result.rows[0]), outcome: "declared" });
      const existing = await readReceipt(pool, input.migrationOperationId);
      assertSameDeclaration(existing.receipt, input, manifest);
      return freeze({ receipt: existing.receipt, outcome: "idempotent-replay" });
    },
    async read(migrationOperationId, options = {}) { return readReceipt(pool, migrationOperationId, options); },
    async markReceiving({ migrationOperationId, authorizationFingerprint, fenceId }) {
      return transition(pool, { migrationOperationId, authorizationFingerprint, fenceId,
        from: [STATUS.DECLARED, STATUS.RECEIVING], to: STATUS.RECEIVING });
    },
    async verify({ migrationOperationId, authorizationFingerprint, fenceId, receipt }) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const current = (await readReceipt(pool, migrationOperationId, { client, forUpdate: true })).receipt;
        assertControlTuple(current, { authorizationFingerprint, fenceId });
        if (![STATUS.DECLARED, STATUS.RECEIVING, STATUS.VERIFIED].includes(current.status)) throw transferError("TRANSFER_RECEIPT_STATE_INVALID", "Transfer cannot be verified from its current state.");
        validateProviderReceipt(current, receipt);
        const result = await client.query(
          `UPDATE physiqueos.combined_transfer_receipts SET status='verified',receipt=$2::jsonb,
             verified_at=COALESCE(verified_at,now()),updated_at=now()
           WHERE migration_operation_id=$1 RETURNING *`,
          [migrationOperationId, JSON.stringify(freeze({ ...receipt, receiptDigest: createPayloadHash(receipt) }))],
        );
        await client.query("COMMIT");
        return freeze({ receipt: row(result.rows[0]), outcome: current.status === STATUS.VERIFIED ? "idempotent-replay" : "verified" });
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally { client.release(); }
    },
    async consume({ migrationOperationId, authorizationFingerprint, fenceId }) {
      return transition(pool, { migrationOperationId, authorizationFingerprint, fenceId,
        from: [STATUS.VERIFIED, STATUS.CONSUMED], to: STATUS.CONSUMED, consumed: true });
    },
  });
}

async function readReceipt(pool, migrationOperationId, { client = null, forUpdate = false } = {}) {
  const result = await (client ?? pool).query(
    `SELECT * FROM physiqueos.combined_transfer_receipts WHERE migration_operation_id=$1${client && forUpdate ? " FOR UPDATE" : ""}`,
    [required(migrationOperationId, "migrationOperationId")],
  );
  if (!result.rows[0]) throw transferError("TRANSFER_RECEIPT_UNAVAILABLE", "Combined transfer receipt is unavailable.");
  return freeze({ receipt: row(result.rows[0]) });
}

async function transition(pool, input) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(`SELECT * FROM physiqueos.combined_transfer_receipts WHERE migration_operation_id=$1 FOR UPDATE`, [input.migrationOperationId]);
    if (!result.rows[0]) throw transferError("TRANSFER_RECEIPT_UNAVAILABLE", "Combined transfer receipt is unavailable.");
    const current = row(result.rows[0]);
    assertControlTuple(current, input);
    if (!input.from.includes(current.status)) throw transferError("TRANSFER_RECEIPT_STATE_INVALID", "Transfer receipt transition is not allowed.");
    if (current.status === input.to) { await client.query("COMMIT"); return freeze({ receipt: current, outcome: "idempotent-replay" }); }
    const updated = await client.query(
      `UPDATE physiqueos.combined_transfer_receipts SET status=$2,
         consumed_at=CASE WHEN $3::boolean THEN now() ELSE consumed_at END,updated_at=now()
       WHERE migration_operation_id=$1 RETURNING *`,
      [input.migrationOperationId, input.to, input.consumed === true],
    );
    await client.query("COMMIT");
    return freeze({ receipt: row(updated.rows[0]), outcome: input.to });
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
  finally { client.release(); }
}

function normalizedManifest(input) {
  const manifest = structuredClone(input.manifest ?? {});
  if (String(manifest.packageDigest ?? "").toLowerCase() !== String(input.packageDigest).toLowerCase()) throw transferError("TRANSFER_MANIFEST_MISMATCH", "Transfer manifest package digest does not match.");
  if (!Array.isArray(manifest.files) || manifest.files.some((file) => !String(file.sha256 ?? "").match(/^[a-f0-9]{64}$/i) || !Number.isSafeInteger(Number(file.byteLength)))) throw transferError("TRANSFER_MANIFEST_INVALID", "Transfer manifest file inventory is invalid.");
  return freeze({ ...manifest, files: [...manifest.files].sort((a, b) => String(a.path).localeCompare(String(b.path))) });
}
function validateProviderReceipt(current, receipt = {}) {
  for (const [field, expected] of [["packageDigest", current.packageDigest], ["runtimeSha256", current.runtimeSha256], ["mediaInventorySha256", current.mediaInventorySha256], ["migrationControlSha256", current.migrationControlSha256], ["providerDeploymentId", current.providerDeploymentId]]) {
    if (String(receipt[field] ?? "").toLowerCase() !== String(expected).toLowerCase()) throw transferError("TRANSFER_VERIFICATION_MISMATCH", `Provider receipt does not match ${field}.`);
  }
  if (receipt.allObjectsVerified !== true || Number(receipt.fileCount) !== Number(current.manifest.files.length)) throw transferError("TRANSFER_VERIFICATION_INCOMPLETE", "Provider did not verify every transferred object.");
}
function validateIdentity(input) {
  for (const field of ["authorizationFingerprint", "packageDigest", "runtimeSha256", "mediaInventorySha256", "migrationControlSha256"]) if (!/^[a-f0-9]{64}$/i.test(String(input?.[field] ?? ""))) throw transferError("TRANSFER_IDENTITY_INVALID", `${field} must be a SHA-256 digest.`);
  for (const field of ["migrationOperationId", "fenceId", "providerDeploymentId"]) required(input?.[field], field);
}
function assertSameDeclaration(current, input, manifest) {
  assertControlTuple(current, input);
  for (const field of ["packageDigest", "runtimeSha256", "mediaInventorySha256", "migrationControlSha256", "providerDeploymentId"]) if (String(current[field]).toLowerCase() !== String(input[field]).toLowerCase()) throw transferError("TRANSFER_OPERATION_CONFLICT", `Existing transfer declaration conflicts on ${field}.`);
  if (canonicalJson(current.manifest) !== canonicalJson(manifest)) throw transferError("TRANSFER_OPERATION_CONFLICT", "Existing transfer manifest differs.");
}
function assertControlTuple(current, input) {
  if (String(current.authorizationFingerprint).toLowerCase() !== String(input.authorizationFingerprint).toLowerCase() || String(current.fenceId) !== String(input.fenceId)) throw transferError("TRANSFER_CONTROL_TUPLE_MISMATCH", "Transfer control tuple does not match the declared authorization and fence.");
}
function values(input, manifest) { return [input.migrationOperationId, input.authorizationFingerprint.toLowerCase(), input.fenceId, input.packageDigest.toLowerCase(), input.runtimeSha256.toLowerCase(), input.mediaInventorySha256.toLowerCase(), input.migrationControlSha256.toLowerCase(), JSON.stringify(manifest), input.providerDeploymentId]; }
function row(value) { return freeze({ migrationOperationId: value.migration_operation_id, authorizationFingerprint: value.authorization_fingerprint, fenceId: value.fence_id, packageDigest: value.package_digest, runtimeSha256: value.runtime_sha256, mediaInventorySha256: value.media_inventory_sha256, migrationControlSha256: value.migration_control_sha256, status: value.status, manifest: value.manifest, receipt: value.receipt, providerDeploymentId: value.provider_deployment_id }); }
function required(value, field) { if (!String(value ?? "").trim()) throw transferError("TRANSFER_IDENTITY_INVALID", `${field} is required.`); return String(value); }
function transferError(code, message) { return Object.assign(new Error(message), { code }); }
function freeze(value) { return Object.freeze(value); }
