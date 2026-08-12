import { createApplicationReadModel } from "./readModel.js";
import { requireAuthenticationPrincipal } from "../auth/principal.js";

export const Phase3ReadModel = Object.freeze({
  HOME: "home.v1", LOG: "log.v1", EVIDENCE_REVIEW: "evidence-review.v1",
  GOALS: "goals.v1", OPERATING_PLAN: "operating-plan.v1", PRIORITIES: "priorities.v1",
  PROGRESS: "progress.v1", CONFIDENCE: "confidence.v1", BRIEFINGS: "briefings.v1",
  TRAINING: "training.v1", PROFILE: "profile.v1",
});

export function createPhase3ReadModelService({ loaders, now = () => new Date(), readResourceVersion = () => "1" } = {}) {
  async function read(model, principal, input = {}) {
    const actor = requireAuthenticationPrincipal(principal);
    const loader = loaders?.[model];
    if (typeof loader !== "function") throw new Error(`No application loader is registered for ${model}.`);
    const generatedAt = now().toISOString();
    const data = await loader({ ...input, principal: actor });
    return createApplicationReadModel({
      model,
      data,
      resourceVersion: await readResourceVersion({ model, principal: actor, data }),
      generatedAt,
      freshThrough: generatedAt,
      intentionalDifferences: ["Raw web href fields are represented as typed destinations.", "Persistence and filesystem implementation fields are omitted."],
    });
  }
  return Object.freeze({
    home: (principal, input) => read(Phase3ReadModel.HOME, principal, input),
    log: (principal, input) => read(Phase3ReadModel.LOG, principal, input),
    evidenceReview: (principal, input) => read(Phase3ReadModel.EVIDENCE_REVIEW, principal, input),
    goals: (principal, input) => read(Phase3ReadModel.GOALS, principal, input),
    operatingPlan: (principal, input) => read(Phase3ReadModel.OPERATING_PLAN, principal, input),
    priorities: (principal, input) => read(Phase3ReadModel.PRIORITIES, principal, input),
    progress: (principal, input) => read(Phase3ReadModel.PROGRESS, principal, input),
    confidence: (principal, input) => read(Phase3ReadModel.CONFIDENCE, principal, input),
    briefings: (principal, input) => read(Phase3ReadModel.BRIEFINGS, principal, input),
    training: (principal, input) => read(Phase3ReadModel.TRAINING, principal, input),
    profile: (principal, input) => read(Phase3ReadModel.PROFILE, principal, input),
  });
}
