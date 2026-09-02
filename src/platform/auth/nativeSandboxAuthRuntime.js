import { createFounderBearerAuthenticator } from "./requestAuthenticator.js";
import { createNativeFounderAuthRuntime } from "./nativeFounderAuthRuntime.js";
import { getNativeSandboxApplicationComposition } from "../../application/composition/nativeSandboxApplicationComposition.js";
import { foundationLogger } from "../foundation/runtime.js";

let runtime;

export function createNativeSandboxAuthRuntime({ composition, logger = null, clock = () => performance.now() } = {}) {
  if (!composition?.founderAuthService || !composition?.weightSummaryReadService || !composition?.weightCandidateService) {
    throw new Error("Native sandbox runtime dependencies are required.");
  }
  const auth = createNativeFounderAuthRuntime({
    founderAuthService: composition.founderAuthService,
    weightSummaryReadService: composition.weightSummaryReadService,
    logger,
    clock,
  });
  const authenticator = createFounderBearerAuthenticator(composition.founderAuthService);
  const timed = async (event, requestId, callback) => {
    const startedAt = clock();
    try {
      return await callback();
    } finally {
      logger?.info(event, {
        requestId,
        authorityId: composition.authority.descriptor.authorityId,
        durationMs: Math.max(0, Math.round((clock() - startedAt) * 100) / 100),
      });
    }
  };
  return Object.freeze({
    ...auth,
    authority: composition.authority.descriptor,
    async issueBootstrapPairing({ recoveryCredential, requestId = null }) {
      const startedAt = clock();
      const result = await composition.founderAuthService.issuePairingCredentialWithRecovery({
        recoveryCredential,
        expectedUserId: composition.authority.descriptor.ownerUserId,
      });
      logger?.info("native.sandbox.bootstrap_pairing.issued", {
        requestId,
        authorityId: composition.authority.descriptor.authorityId,
        durationMs: Math.max(0, Math.round((clock() - startedAt) * 100) / 100),
      });
      return result;
    },
    async submitWeightCandidate({ request, submission, asset, requestId = null }) {
      return timed("native.sandbox.weight_candidate.review_ready", requestId, async () => {
        const principal = await authenticator.authenticate(request);
        return composition.weightCandidateService.submit({ principal, submission, asset, requestId });
      });
    },
    async getWeightReview({ request, reviewId, requestId = null }) {
      return timed("native.sandbox.weight_review.read", requestId, async () => {
        const principal = await authenticator.authenticate(request);
        return composition.weightCandidateService.getReview({ principal, reviewId });
      });
    },
    async confirmWeightReview({ request, reviewId, expectedVersion, correctedValue, correctedUnit, requestId = null }) {
      return timed("native.sandbox.weight_review.confirmed", requestId, async () => {
        const principal = await authenticator.authenticate(request);
        return composition.weightCandidateService.confirm({
          principal, reviewId, expectedVersion, correctedValue, correctedUnit, requestId,
        });
      });
    },
    async discardWeightReview({ request, reviewId, expectedVersion, requestId = null }) {
      return timed("native.sandbox.weight_review.discarded", requestId, async () => {
        const principal = await authenticator.authenticate(request);
        return composition.weightCandidateService.discard({ principal, reviewId, expectedVersion });
      });
    },
  });
}

export function getNativeSandboxAuthRuntime(env = process.env) {
  runtime ??= createNativeSandboxAuthRuntime({
    composition: getNativeSandboxApplicationComposition(env),
    logger: foundationLogger,
  });
  return runtime;
}

export function resetNativeSandboxAuthRuntimeForTests() {
  if (process.env.NODE_ENV === "production") throw new Error("Native sandbox runtime cannot be reset in production.");
  runtime = undefined;
}
