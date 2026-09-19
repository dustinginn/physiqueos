import { FOUNDATION_SOURCE_COLLECTIONS } from "../src/platform/migration/foundationSourceCollections.js";
import { Phase3Command } from "../src/application/commands/Phase3CommandService.js";

const CANONICAL_COLLECTIONS = new Set(FOUNDATION_SOURCE_COLLECTIONS);

export function createPhase4CommandParityFixtureCollections(ownerUserId) {
  const ownerId = requiredIdentity(ownerUserId, "Phase 4 command-parity owner");
  const record = (id, extra = {}) => ({ id, userId: ownerId, version: 1, ...extra });
  return Object.freeze({
    goals: [record("synthetic-goal"), record("synthetic-transition-goal")],
    protocols: [record("synthetic-protocol")],
    executionItems: [record("synthetic-priority", { completionHistory: [] })],
    reminders: [record("synthetic-priority", { completionHistory: [] })],
    evidenceReviews: ["edit", "confirm", "dispose", "nutrition", "photo", "dexa"]
      .map((kind) => record(`synthetic-review-${kind}`, { status: "pending" })),
    trainingPerformanceEvents: [record("synthetic-training-correct"), record("synthetic-training-draft", { reconciliations: [] })],
    weightEntries: [],
    dailyCheckIns: [],
    evidencePackages: [],
    goalTransitionDrafts: [],
    progressPhotos: [],
    dexaScans: [],
  });
}

export function createPhase4CommandParityCases() {
  return Object.freeze([
    command(Phase3Command.SUBMIT_WEIGHT, { localDate: "2026-08-11", value: 180 }),
    command(Phase3Command.SUBMIT_CHECK_IN, { localDate: "2026-08-11", value: 180, energy: 4 }),
    command(Phase3Command.CREATE_EVIDENCE_INTAKE, { submissionId: "synthetic-intake", sourceIdentity: "synthetic-intake-source" }),
    command(Phase3Command.EDIT_EVIDENCE_REVIEW, { reviewId: "synthetic-review-edit", changes: { note: "corrected" } }, "1"),
    command(Phase3Command.CONFIRM_EVIDENCE_REVIEW, { reviewId: "synthetic-review-confirm" }, "1"),
    command(Phase3Command.DISPOSE_EVIDENCE_REVIEW, { reviewId: "synthetic-review-dispose", disposition: "discarded" }, "1"),
    command(Phase3Command.COMPLETE_PRIORITY, { priorityId: "synthetic-priority", occurrenceDate: "2026-08-11" }, "1"),
    command(Phase3Command.RECONCILE_PREVIOUS_DAY, { localDate: "2026-08-10", items: [{ id: "item", complete: true }] }, "1"),
    command(Phase3Command.EDIT_PROTOCOL, { protocolId: "synthetic-protocol", patch: { title: "updated" } }, "1"),
    command(Phase3Command.EDIT_GOAL, { goalId: "synthetic-goal", patch: { title: "updated" } }, "1"),
    command(Phase3Command.TRANSITION_GOAL, { goalId: "synthetic-transition-goal", transitionId: "synthetic-transition" }, "1"),
    command(Phase3Command.CREATE_TRAINING_SESSION, { sessionId: "synthetic-training-new", observedAt: "2026-08-11T18:00:00.000Z" }),
    command(Phase3Command.CORRECT_TRAINING_SESSION, { sessionId: "synthetic-training-correct", corrections: [{ field: "load" }] }, "1"),
    command(Phase3Command.COMPLETE_TRAINING_LOGGER, { draftId: "synthetic-training-draft", localDate: "2026-08-11" }, "1"),
    command(Phase3Command.CONFIRM_NUTRITION, { reviewId: "synthetic-review-nutrition" }, "1"),
    command(Phase3Command.CONFIRM_PHOTO, { reviewId: "synthetic-review-photo" }, "1"),
    command(Phase3Command.CONFIRM_DEXA, { reviewId: "synthetic-review-dexa" }, "1"),
  ]);
}

export function createPhase4CommandParityMemoryCollections({
  packageCollections,
  expectedOwnerUserId,
} = {}) {
  const ownerUserId = requiredIdentity(expectedOwnerUserId, "Phase 4 command-parity expected owner");
  if (!packageCollections || typeof packageCollections !== "object" || Array.isArray(packageCollections)) {
    throw new Error("Phase 4 command parity requires the synthetic package's canonical collections.");
  }
  const owners = recordsFor(packageCollections.user);
  if (owners.length !== 1) throw new Error("Phase 4 command parity requires exactly one synthetic package owner.");
  const [canonicalOwner] = owners;
  if (String(canonicalOwner.id ?? "") !== ownerUserId ||
      (canonicalOwner.userId != null && String(canonicalOwner.userId) !== ownerUserId)) {
    throw new Error("Phase 4 command-parity owner identity does not match the synthetic package.");
  }

  const result = {};
  for (const collection of FOUNDATION_SOURCE_COLLECTIONS) {
    result[collection] = Object.freeze(recordsFor(packageCollections[collection]).map((record) => {
      assertOwnedRecord(record, ownerUserId, collection);
      return Object.freeze(structuredClone(record));
    }));
  }
  return Object.freeze(result);
}

export async function applyPhase4CommandParityFixtureOverlays({
  records,
  ownerUserId,
  fixtureCollections,
} = {}) {
  const ownerId = requiredIdentity(ownerUserId, "Phase 4 command-parity overlay owner");
  if (typeof records?.put !== "function") {
    throw new Error("Phase 4 command parity requires a canonical record store for fixture overlays.");
  }
  if (!fixtureCollections || typeof fixtureCollections !== "object" || Array.isArray(fixtureCollections)) {
    throw new Error("Phase 4 command parity requires fixture collections.");
  }
  if (Object.hasOwn(fixtureCollections, "user")) {
    throw new Error("Phase 4 command-parity shared fixtures must not replace the package owner.");
  }

  const applied = [];
  for (const [collection, source] of Object.entries(fixtureCollections)) {
    if (!CANONICAL_COLLECTIONS.has(collection)) {
      throw new Error(`Phase 4 command-parity fixture collection is not canonical: ${collection}.`);
    }
    for (const [position, record] of recordsFor(source).entries()) {
      assertOwnedRecord(record, ownerId, collection);
      const recordId = resolveRecordId(record, position);
      const stored = await records.put({
        ownerUserId: ownerId,
        collection,
        recordId,
        payload: structuredClone(record),
        sourceIdentity: record.sourceIdentity ?? record.provenance?.sourceIdentity ?? null,
      });
      applied.push(Object.freeze({ collection, recordId, version: stored.version }));
    }
  }
  return Object.freeze(applied);
}

function requiredIdentity(value, label) {
  const identity = String(value ?? "").trim();
  if (!identity) throw new Error(`${label} identity is required.`);
  return identity;
}

function recordsFor(source) {
  if (source == null) return [];
  return Array.isArray(source) ? source : [source];
}

function assertOwnedRecord(record, ownerUserId, collection) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new Error(`Phase 4 command-parity ${collection} record must be an object.`);
  }
  if (record.userId != null && String(record.userId) !== ownerUserId) {
    throw new Error(`Phase 4 command-parity ${collection} owner identity does not match the synthetic package.`);
  }
}

function resolveRecordId(record, position) {
  return String(record.id ?? record.canonicalId ?? record.package_id ?? record.review_id ?? `@index:${position}`);
}

function command(commandType, payload, expectedVersion = undefined) {
  return Object.freeze({
    commandType,
    payload: Object.freeze(structuredClone(payload)),
    ...(expectedVersion === undefined ? {} : { expectedVersion }),
  });
}
