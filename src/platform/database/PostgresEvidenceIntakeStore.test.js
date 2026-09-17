import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { createEvidenceUploadArtifactManifest } from "../../domain/services/EvidenceUploadArtifactManifest.js";
import { createPostgresEvidenceIntakeStore } from "./PostgresEvidenceIntakeStore.js";

const source = fs.readFileSync(new URL("./PostgresEvidenceIntakeStore.js", import.meta.url), "utf8");

describe("targeted provider Evidence intake storage", () => {
  it("uses an owner-scoped receipt lock and never reconstructs the Founder runtime", () => {
    expect(source).toContain("physiqueos:intake:${ownerUserId}:${input.submissionIdentity}");
    expect(source).toContain("FOR UPDATE");
    expect(source).not.toMatch(/loadCanonicalRuntime|createSeedRepositories|structuredClone\(runtime\)/);
  });

  it("atomically links one deterministic package/review to one receipt", () => {
    expect(source).toContain('collection: "evidencePackages"');
    expect(source).toContain('collection: "evidenceReviews"');
    expect(source).toContain("interpretation_state='completed'");
    expect(source).toContain("package_id=$3,review_id=$4");
  });

  it("dedupes interpretation work by the durable receipt identity", () => {
    expect(source).toContain("createEvidenceIntakeInterpretationMessage");
    expect(source).toContain("ON CONFLICT (topic,dedupe_key) DO NOTHING");
    expect(source).toContain("EVIDENCE_INTAKE_CANONICAL_IDENTITY_CONFLICT");
  });

  it("persists the text provenance needed to keep device OCR out of typed evidence", () => {
    expect(source).toContain('"client_extracted"');
    expect(source).toContain('"founder_typed"');
    expect(source).toContain("row.evidence_text_kind === \"client_extracted\"");
    expect(source).toContain("EVIDENCE_INTAKE_TEXT_PROVENANCE_CONFLICT");
  });

  it("requires a fresh linked identity after a dismissed review while preserving the predecessor", async () => {
    const predecessor = receipt({ review_id: "review-dismissed", evidence_text_kind: null });
    const harness = databaseHarness({ receipts: [predecessor], reviewStatuses: { "review-dismissed": "discarded" } });
    const store = evidenceStore(harness);

    await expect(store.beginUpload(input({ submissionIdentity: predecessor.submission_identity })))
      .rejects.toMatchObject({ code: "EVIDENCE_INTAKE_REPLACEMENT_REQUIRED" });
    expect(harness.receipts).toEqual([predecessor]);

    const replacementIdentity = "02999999-9999-7999-8999-999999999999";
    const result = await store.beginUpload(input({
      submissionIdentity: replacementIdentity,
      recoveryContext: {
        kind: "dismissed_evidence_replacement",
        predecessorSubmissionIdentity: predecessor.submission_identity,
      },
    }));
    expect(result).toMatchObject({ claimed: true, receipt: {
      submissionIdentity: replacementIdentity,
      recoveryContext: {
        kind: "dismissed_evidence_replacement",
        predecessorSubmissionIdentity: predecessor.submission_identity,
      },
    } });
    expect(harness.receipts.find((row) => row.submission_identity === predecessor.submission_identity))
      .toBe(predecessor);

    const replay = await store.beginUpload(input({
      submissionIdentity: replacementIdentity,
      recoveryContext: {
        kind: "dismissed_evidence_replacement",
        predecessorSubmissionIdentity: predecessor.submission_identity,
      },
    }));
    expect(replay).toMatchObject({ claimed: false, receipt: {
      submissionIdentity: replacementIdentity,
      recoveryContext: {
        kind: "dismissed_evidence_replacement",
        predecessorSubmissionIdentity: predecessor.submission_identity,
      },
    } });
    expect(harness.receipts).toHaveLength(2);
    expect(harness.reviewStatuses["review-dismissed"]).toBe("discarded");
  });

  it("permits only one immutable replacement lineage for a dismissed predecessor", async () => {
    const predecessor = receipt({ review_id: "review-dismissed" });
    const harness = databaseHarness({ receipts: [predecessor], reviewStatuses: { "review-dismissed": "discarded" } });
    const store = evidenceStore(harness);
    const context = {
      kind: "dismissed_evidence_replacement",
      predecessorSubmissionIdentity: predecessor.submission_identity,
    };
    await store.beginUpload(input({
      submissionIdentity: "02999999-9999-7999-8999-999999999999",
      recoveryContext: context,
    }));
    await expect(store.beginUpload(input({
      submissionIdentity: "03999999-9999-7999-8999-999999999999",
      recoveryContext: context,
    }))).rejects.toMatchObject({ code: "EVIDENCE_INTAKE_REPLACEMENT_ALREADY_EXISTS" });
    expect(harness.receipts).toHaveLength(2);
  });

  it.each(["pending", "committing", "confirmed"])(
    "does not admit replacement lineage from a %s predecessor", async (status) => {
      const predecessor = receipt({ review_id: `review-${status}` });
      const harness = databaseHarness({ receipts: [predecessor], reviewStatuses: { [`review-${status}`]: status } });
      const store = evidenceStore(harness);
      await expect(store.beginUpload(input({
        submissionIdentity: "02999999-9999-7999-8999-999999999999",
        recoveryContext: {
          kind: "dismissed_evidence_replacement",
          predecessorSubmissionIdentity: predecessor.submission_identity,
        },
      }))).rejects.toMatchObject({ code: "EVIDENCE_INTAKE_REPLACEMENT_PREDECESSOR_INVALID" });
      expect(harness.receipts).toEqual([predecessor]);
    }
  );

  it.each(["pending", "committing", "confirmed"])(
    "keeps %s review identity protection fail-closed", async (status) => {
      const prior = receipt({ review_id: `review-${status}`, evidence_text_kind: "client_extracted" });
      const harness = databaseHarness({ receipts: [prior], reviewStatuses: { [`review-${status}`]: status } });
      const store = evidenceStore(harness);
      await expect(store.beginUpload(input({
        submissionIdentity: prior.submission_identity,
        artifactManifest: createEvidenceUploadArtifactManifest([
          { name: "different.png", size: 4, type: "image/png" },
        ]),
      }))).rejects.toMatchObject({ code: "EVIDENCE_INTAKE_IDENTITY_CONFLICT" });
      expect(harness.receipts).toHaveLength(1);
    }
  );
});

function evidenceStore(harness) {
  return createPostgresEvidenceIntakeStore({
    pool: harness.pool,
    ownerUserId: "owner",
    authorityStore: { claimCanonicalWriteBoundary: async () => undefined },
    now: () => new Date("2026-09-17T22:00:00.000Z"),
    createId: () => "claim-token",
  });
}

function input(overrides = {}) {
  const manifest = createEvidenceUploadArtifactManifest([
    { name: "activity.png", size: 3, type: "image/png" },
  ]);
  return {
    submissionIdentity: "01999999-9999-7999-8999-999999999999",
    effectiveDate: "2026-09-16",
    expectedEvidenceType: "activity_day",
    source: "historical_universal_intake",
    artifactManifest: manifest,
    clientExtractedText: "Move 841 cal Exercise 111 min",
    recoveryContext: null,
    ...overrides,
  };
}

function receipt(overrides = {}) {
  const value = input();
  return {
    id: `evidence_intake_${value.submissionIdentity}`,
    submission_identity: value.submissionIdentity,
    owner_user_id: "owner",
    effective_date: value.effectiveDate,
    expected_evidence_type: value.expectedEvidenceType,
    source: value.source,
    artifact_manifest: value.artifactManifest,
    manifest_sha256: "manifest-original",
    typed_evidence: value.clientExtractedText,
    typed_evidence_sha256: "typed-original",
    evidence_text_kind: "client_extracted",
    recovery_context: null,
    media_state: "stored",
    interpretation_state: "completed",
    stored_artifacts: [],
    package_id: "package-old",
    review_id: "review-old",
    version: 5,
    created_at: new Date("2026-09-17T05:55:22.559Z"),
    updated_at: new Date("2026-09-17T05:55:23.362Z"),
    ...overrides,
  };
}

function databaseHarness({ receipts, reviewStatuses }) {
  const client = {
    async query(sql, values = []) {
      const text = String(sql).replace(/\s+/g, " ").trim();
      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(text) || text.includes("pg_advisory_xact_lock")) return { rows: [] };
      if (text.startsWith("INSERT INTO physiqueos.evidence_intake_receipts")) {
        if (receipts.some((row) => row.submission_identity === values[1])) return { rows: [] };
        const row = receipt({
          id: values[0], submission_identity: values[1], effective_date: values[3],
          expected_evidence_type: values[4], source: values[5], artifact_manifest: JSON.parse(values[6]),
          manifest_sha256: values[7], typed_evidence: values[8], typed_evidence_sha256: values[9],
          evidence_text_kind: values[10], recovery_context: JSON.parse(values[11]),
          media_state: "receiving", interpretation_state: "waiting_for_media",
          upload_claimed_by: values[12], upload_claim_expires_at: values[13], review_id: null, package_id: null,
        });
        receipts.push(row);
        return { rows: [row] };
      }
      if (text.includes("FROM physiqueos.evidence_intake_receipts") && text.includes("submission_identity=$2 FOR UPDATE")) {
        return { rows: receipts.filter((row) => row.submission_identity === values[1]) };
      }
      if (text.includes("recovery_context->>'kind'='dismissed_evidence_replacement'")) {
        return { rows: receipts.filter((row) =>
          row.recovery_context?.kind === "dismissed_evidence_replacement" &&
          row.recovery_context?.predecessorSubmissionIdentity === values[1]) };
      }
      if (text.includes("FROM physiqueos.canonical_evidence_records") && text.includes("payload->>'status' AS status")) {
        return { rows: reviewStatuses[values[1]] ? [{ status: reviewStatuses[values[1]] }] : [] };
      }
      if (text.includes("FROM physiqueos.canonical_media_objects")) return { rows: [] };
      throw new Error(`Unexpected SQL in harness: ${text}`);
    },
    release() {},
  };
  return { receipts, reviewStatuses, pool: { connect: async () => client, query: async (...args) => client.query(...args) } };
}
