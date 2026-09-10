import { createFounderBearerAuthenticator } from "./requestAuthenticator.js";
import { createNativeProductionContractService } from "../../application/native/NativeProductionContractService.js";
import {
  getProductionActiveGoalReadService,
  getProductionApplicationComposition,
  getProductionBriefingNavigationReadService,
  getProductionCompletedGoalReadService,
  getProductionCoreNavigationReadService,
  getProductionEvidenceReviewReadService,
  getProductionEvidenceTimelineReadService,
  getProductionFounderAuthService,
  getProductionFounderWeightSummaryReadService,
  getProductionPhotoEventBriefingReadService,
  getProductionPriorityNavigationReadService,
  getProductionProgressEvidenceReadService,
  getProductionProgressPhotosReadService,
  getProductionProviderMediaDelivery,
  getProductionTrainingNavigationReadService,
} from "../../application/composition/productionApplicationComposition.js";

let runtime;

export function createNativeProductionContractRuntime({ founderAuthService, ownerUserId, readers, commands, media, now } = {}) {
  const authenticator = createFounderBearerAuthenticator(founderAuthService);
  return createNativeProductionContractService({
    authenticate: (request) => authenticator.authenticate(request),
    ownerUserId,
    readers,
    executeCommand: (input) => commands.execute(input),
    openMedia: (input) => media.openRead(input),
    now,
  });
}
export async function getProductionNativeContractRuntime(env = process.env) {
  if (runtime) return runtime;
  const composition = await getProductionApplicationComposition(env);
  runtime = createNativeProductionContractRuntime({
    founderAuthService: getProductionFounderAuthService(env),
    ownerUserId: composition.ownerUserId,
    readers: Object.freeze({
      core: getProductionCoreNavigationReadService(env),
      activeGoal: getProductionActiveGoalReadService(env),
      completedGoal: getProductionCompletedGoalReadService(env),
      priorities: getProductionPriorityNavigationReadService(env),
      weight: getProductionFounderWeightSummaryReadService(env),
      training: getProductionTrainingNavigationReadService(env),
      progress: getProductionProgressEvidenceReadService(env),
      photos: getProductionProgressPhotosReadService(env),
      briefings: getProductionBriefingNavigationReadService(env),
      photoEvents: getProductionPhotoEventBriefingReadService(env),
      evidenceReview: getProductionEvidenceReviewReadService(env),
      timeline: getProductionEvidenceTimelineReadService(env),
    }),
    commands: composition.commands,
    media: getProductionProviderMediaDelivery(env),
  });
  return runtime;
}

export function resetProductionNativeContractRuntimeForTests() {
  if (process.env.NODE_ENV === "production") throw new Error("The Native production contract runtime cannot be reset in production.");
  runtime = undefined;
}
