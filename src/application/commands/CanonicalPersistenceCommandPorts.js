export const CANONICAL_PERSISTENCE_PORT_NAMES = Object.freeze([
  "submitWeight", "submitCheckIn", "createEvidenceIntake", "editEvidenceReview",
  "confirmEvidenceReview", "disposeEvidenceReview", "completePriority", "reconcilePreviousDay",
  "editProtocol", "editGoal", "transitionGoal", "createTrainingSession", "correctTrainingSession",
  "completeTrainingLogger", "confirmNutritionEvidence", "confirmPhotoEvidence", "confirmDexaEvidence",
]);

export function createCanonicalPersistenceCommandPorts({ records, now = () => new Date() } = {}) {
  if (!records?.get || !records?.put) throw new Error("Canonical command ports require a record store.");
  const edit = (collection, idField) => async (context) => mutateExisting(
    context,
    collection,
    context.payload[idField],
    context.payload.changes ?? context.payload.patch ?? { corrections: context.payload.corrections }
  );
  const review = (status) => async (context) => mutateExisting(context, "evidenceReviews", context.payload.reviewId, { ...(context.payload.changes ?? {}), status });

  return Object.freeze({
    submitWeight: (context) => create(context, "weightEntries", `weight:${context.payload.localDate}`, {
      id: `weight:${context.payload.localDate}`, userId: context.ownerUserId, localDate: context.payload.localDate,
      date: context.payload.localDate, value: Number(context.payload.value), unit: context.payload.unit ?? "lb",
      observedAt: context.payload.observedAt ?? now().toISOString(), provenance: commandProvenance(context),
    }),
    submitCheckIn: (context) => create(context, "dailyCheckIns", `check-in:${context.payload.localDate}`, {
      id: `check-in:${context.payload.localDate}`, userId: context.ownerUserId, localDate: context.payload.localDate,
      ...context.payload, provenance: commandProvenance(context),
    }),
    createEvidenceIntake: (context) => create(context, "evidencePackages", context.payload.submissionId, {
      id: context.payload.submissionId, userId: context.ownerUserId, status: "pending_review",
      ...context.payload, provenance: commandProvenance(context),
    }, context.payload.sourceIdentity ?? context.payload.submissionId),
    editEvidenceReview: edit("evidenceReviews", "reviewId"),
    confirmEvidenceReview: review("confirmed"),
    disposeEvidenceReview: async (context) => mutateExisting(context, "evidenceReviews", context.payload.reviewId, { status: context.payload.disposition }),
    completePriority: completeOccurrence("executionItems", "priorityId", "completionHistory"),
    reconcilePreviousDay: async (context) => create(context, "dailyCheckIns", `reconciliation:${context.payload.localDate}`, {
      id: `reconciliation:${context.payload.localDate}`, userId: context.ownerUserId,
      localDate: context.payload.localDate, items: context.payload.items, status: "reconciled", provenance: commandProvenance(context),
    }),
    editProtocol: edit("protocols", "protocolId"),
    editGoal: edit("goals", "goalId"),
    transitionGoal: async (context) => mutateExisting(context, "goals", context.payload.goalId, {
      status: context.payload.status ?? "completed", transitionId: context.payload.transitionId,
      transitionedAt: now().toISOString(),
    }),
    createTrainingSession: (context) => create(context, "trainingPerformanceEvents", context.payload.sessionId, {
      id: context.payload.sessionId, userId: context.ownerUserId, observedAt: context.payload.observedAt,
      status: "recorded", ...context.payload, provenance: commandProvenance(context),
    }, context.payload.sourceIdentity ?? context.payload.sessionId),
    correctTrainingSession: edit("trainingPerformanceEvents", "sessionId"),
    completeTrainingLogger: completeOccurrence("trainingPerformanceEvents", "draftId", "reconciliations", "localDate"),
    confirmNutritionEvidence: review("confirmed_nutrition"),
    confirmPhotoEvidence: review("confirmed_photo"),
    confirmDexaEvidence: review("confirmed_dexa"),
  });

  function completeOccurrence(collection, idField, historyField, dateField = "occurrenceDate") {
    return async (context) => {
      const id = context.payload[idField];
      const current = await ownedRecord(context, collection, id);
      const occurrence = String(context.payload[dateField]);
      const history = Array.isArray(current[historyField]) ? current[historyField] : [];
      if (history.some((entry) => String(entry.occurrenceDate ?? entry.localDate) === occurrence)) {
        return outcome(context, current, "already_completed", collection, id);
      }
      return putExisting(context, collection, id, current, {
        [historyField]: [...history, { occurrenceDate: occurrence, localDate: occurrence, completedAt: now().toISOString(), commandId: context.metadata.commandId }],
        status: "completed",
      });
    };
  }

  async function mutateExisting(context, collection, id, changes) {
    const current = await ownedRecord(context, collection, id);
    return putExisting(context, collection, id, current, changes);
  }

  async function putExisting(context, collection, id, current, changes) {
    const updated = await records.put({
      ownerUserId: context.ownerUserId, collection, recordId: String(id),
      expectedVersion: context.metadata.expectedVersion,
      payload: { ...current, ...structuredClone(changes), id: current.id ?? id, userId: context.ownerUserId, provenance: commandProvenance(context) },
    });
    return outcome(context, updated, "committed", collection, id);
  }

  async function create(context, collection, id, payload, sourceIdentity = null) {
    const existing = await records.get({ ownerUserId: context.ownerUserId, collection, recordId: String(id) });
    if (existing) return outcome(context, existing, "already_exists", collection, id);
    const created = await records.put({ ownerUserId: context.ownerUserId, collection, recordId: String(id), payload, sourceIdentity });
    return outcome(context, created, "committed", collection, id);
  }

  async function ownedRecord(context, collection, id) {
    const record = await records.get({ ownerUserId: context.ownerUserId, collection, recordId: String(id) });
    if (!record || (record.userId != null && String(record.userId) !== String(context.ownerUserId))) {
      throw new Error(`Canonical ${collection} record is unavailable.`);
    }
    return record;
  }

  function outcome(context, record, status = "committed", collection = "unknown", recordId = record?.id ?? "unknown") {
    return {
      status: "committed",
      result: { status, record },
      outbox: [],
    };
  }
  function commandProvenance(context) { return { source: "phase4-application-command", commandId: context.metadata.commandId, deviceId: context.principal.deviceId, ...(context.canonicalStoreEpoch ? { canonicalStoreEpoch: context.canonicalStoreEpoch } : {}) }; }
}
