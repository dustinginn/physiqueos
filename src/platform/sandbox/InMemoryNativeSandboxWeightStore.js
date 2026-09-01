export function createInMemoryNativeSandboxWeightStore({ authority, state = null } = {}) {
  if (!authority?.descriptor) throw new Error("A Native sandbox authority is required.");
  const data = state ?? {
    submissions: new Map(),
    reviews: new Map(),
    weightEntries: new Map(),
    outbox: [],
  };
  return Object.freeze({
    state: data,
    async begin({ authority: descriptor, ownerUserId, submissionIdentity, idempotencyKey }) {
      assertAuthority(authority, descriptor, ownerUserId);
      const prior = data.submissions.get(idempotencyKey);
      if (prior) {
        if (prior.submissionIdentity !== submissionIdentity) throw conflict();
        return Object.freeze({ outcome: "existing", intakeId: prior.intakeId, review: data.reviews.get(prior.reviewId) });
      }
      const intakeId = `native_sandbox_intake_${submissionIdentity.replaceAll("-", "")}`;
      data.submissions.set(idempotencyKey, { submissionIdentity, intakeId, reviewId: null });
      return Object.freeze({ outcome: "created", intakeId });
    },
    async stage({ authority: descriptor, ownerUserId, idempotencyKey, review }) {
      assertAuthority(authority, descriptor, ownerUserId);
      const entry = data.submissions.get(idempotencyKey);
      if (!entry) throw conflict();
      const frozen = structuredClone(review);
      data.reviews.set(review.id, frozen);
      entry.reviewId = review.id;
      return structuredClone(frozen);
    },
    async getReview({ ownerUserId, reviewId }) {
      if (ownerUserId !== authority.descriptor.ownerUserId) return null;
      const review = data.reviews.get(reviewId);
      return review ? structuredClone(review) : null;
    },
    async confirm({ authority: descriptor, ownerUserId, reviewId, expectedVersion, weightEntry, continuation, confirmedAt }) {
      assertAuthority(authority, descriptor, ownerUserId);
      const review = data.reviews.get(reviewId);
      if (!review || review.status !== "pending" || review.version !== Number(expectedVersion)) throw conflict();
      authority.assertOutboxMessage(continuation);
      data.weightEntries.set(weightEntry.id, structuredClone(weightEntry));
      data.outbox.push(structuredClone(continuation));
      const updated = { ...review, status: "confirmed", version: review.version + 1, confirmation: { confirmedAt }, updatedAt: confirmedAt };
      data.reviews.set(reviewId, updated);
      return structuredClone({ review: updated, weightEntry });
    },
    async discard({ authority: descriptor, ownerUserId, reviewId, expectedVersion }) {
      assertAuthority(authority, descriptor, ownerUserId);
      const review = data.reviews.get(reviewId);
      if (!review || review.version !== Number(expectedVersion) || review.status === "confirmed") throw conflict();
      data.reviews.delete(reviewId);
      for (const [key, submission] of data.submissions) {
        if (submission.reviewId === reviewId) data.submissions.delete(key);
      }
      return Object.freeze({ discarded: true, reviewId });
    },
  });
}

function assertAuthority(authority, descriptor, ownerUserId) {
  if (descriptor?.authorityId !== authority.descriptor.authorityId ||
      descriptor?.databaseName !== authority.descriptor.databaseName ||
      ownerUserId !== authority.descriptor.ownerUserId) throw violation();
}
function violation() { return Object.assign(new Error("Native sandbox authority boundary violation."), { code: "NATIVE_SANDBOX_AUTHORITY_VIOLATION" }); }
function conflict() { return Object.assign(new Error("Native sandbox Weight submission conflict."), { code: "NATIVE_SANDBOX_WEIGHT_REVIEW_CONFLICT" }); }
