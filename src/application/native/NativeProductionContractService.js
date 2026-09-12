import { requireScope } from "../auth/principal.js";
import { projectClientSafeValue } from "../read-models/readModel.js";
import { ApplicationProblem } from "../../contracts/v1/problem.js";
import { nativeProductionContractManifest, NativeProductionResource } from "./nativeProductionContractManifest.js";
import { projectNativeMediaReferences } from "./nativeMediaProjection.js";
import { createProviderEnergyEvidenceReport } from "../../domain/services/EnergyEvidenceService.js";
import {
  projectNativeTrainingReportingRead,
  projectNativeWeightRead,
} from "./NativeReadProjectionService.js";
import { Phase3Command } from "../commands/Phase3CommandService.js";

const RESOURCES = new Set(Object.values(NativeProductionResource));
const CONTEXTS = new Set(["all", "build-lean-mass", "visible-abs"]);
const NATIVE_EVIDENCE_REVIEW_TYPES = new Set([
  "nutrition", "activity", "activity_day", "training", "dexa", "dexa_scan", "body_composition",
]);
const NATIVE_WRITE_COMMANDS = new Set([
  Phase3Command.SUBMIT_WEIGHT,
  Phase3Command.SUBMIT_CHECK_IN,
  Phase3Command.COMPLETE_PRIORITY,
  Phase3Command.COMMIT_TRAINING_SESSION,
  Phase3Command.UPSERT_NUTRITION_DAY,
  Phase3Command.UPSERT_ACTIVITY_DAY,
  Phase3Command.EDIT_DEXA_REVIEW,
  Phase3Command.COMMIT_EVIDENCE_REVIEW,
  Phase3Command.DISPOSE_EVIDENCE_REVIEW,
]);

export function createNativeProductionContractService({
  authenticate,
  ownerUserId,
  readers,
  executeCommand,
  confirmEvidenceReview,
  evidenceIntake,
  openMedia,
  now = () => new Date(),
} = {}) {
  if (typeof authenticate !== "function" || !ownerUserId || !readers) {
    throw new Error("Native production contracts require authentication, owner authority, and readers.");
  }

  async function authorize(request, scope = "founder:read") {
    const principal = requireScope(await authenticate(request), scope);
    if (principal.userId !== ownerUserId) {
      throw new ApplicationProblem({ status: 404, code: "RESOURCE_NOT_FOUND", title: "The requested resource is unavailable." });
    }
    return principal;
  }

  return Object.freeze({
    async profile({ request }) {
      const principal = await authorize(request);
      const profile = await readers.core.getProfile();
      return envelope("profile", {
        profile,
        authority: Object.freeze({ type: "founder-production", sandbox: false }),
        capabilities: Object.freeze({ read: true, write: principal.scopes.includes("founder:write"), media: true }),
      });
    },

    async manifest({ request }) {
      await authorize(request);
      return nativeProductionContractManifest;
    },

    async read({ request, resource, input = {} }) {
      const principal = await authorize(request);
      if (!RESOURCES.has(resource) || resource === NativeProductionResource.PROFILE) throw unavailableResource();
      const context = CONTEXTS.has(input.context) ? input.context : "all";
      const currentDate = input.currentDate ? validDate(input.currentDate, "currentDate") : now();
      let data;
      switch (resource) {
        case "home": data = await readers.core.getHome(); break;
        case "goals": data = await readers.core.getGoals(); break;
        case "active-goal": data = await readers.activeGoal.getPreview({ currentDate }); break;
        case "completed-goal": data = await readers.completedGoal.getVisibleAbs(); break;
        case "operating-plan": data = await readers.core.getOperatingPlan(); break;
        case "priority": data = await readers.priorities.getPriorityDetail(
          required(input.priorityId, "priorityId"),
          { occurrenceDate: input.occurrenceDate ? dateKey(input.occurrenceDate, "occurrenceDate") : null },
        ); break;
        case "morning-check-in": data = await readers.core.getMorningCheckIn(); break;
        case "weight": {
          const limit = boundedResourceLimit(input.limit, { fallback: 90, maximum: 365 });
          const weight = await readers.progress.getWeight({ context, currentDate });
          data = projectNativeWeightRead({ ...weight, limit });
          break;
        }
        case "training-logger": data = await readers.core.getTrainingLogger(); break;
        case "training-landing": data = await readers.training.getLanding({ context, currentDate }); break;
        case "training-reporting": {
          const reporting = await readers.training.getReporting({ context, currentDate });
          data = projectNativeTrainingReportingRead(reporting);
          break;
        }
        case "training-library": data = await readers.training.getLibrary({ context, currentDate, path: pathParts(input.path) }); break;
        case "training-day": data = await readers.training.getDay({ date: dateKey(input.date, "date"), timeZone: input.timeZone || null }); break;
        case "training-session": data = await readers.training.getSession({ sessionId: required(input.sessionId, "sessionId") }); break;
        case "training-exercise": data = await readers.training.getExercise({ context, currentDate, exerciseSlug: required(input.exerciseId, "exerciseId") }); break;
        case "nutrition": data = await readers.progress.getNutrition({ context, currentDate }); break;
        case "activity": data = await readers.progress.getActivity({ context, currentDate }); break;
        case "energy": {
          // The raw progress read returns unreconciled source collections
          // (Activity/Nutrition days, DEXA scans). Native must not derive
          // Energy itself, so this runs the same accepted composition the
          // web /progress/energy route already uses (src/app/progress/energy/page.js)
          // before the finished report ever reaches the envelope.
          const energyEvidence = await readers.progress.getEnergy({ context, currentDate });
          data = createProviderEnergyEvidenceReport({
            ...energyEvidence,
            contextId: energyEvidence.timeline.contextId,
            timeline: energyEvidence.timeline,
          });
          break;
        }
        case "dexa": data = await readers.progress.getDEXA({ context, currentDate }); break;
        case "photos": data = await readers.photos.getNativePhotosTimeline({
          context,
          currentDate,
          limit: boundedResourceLimit(input.limit, { fallback: 12, maximum: 50 }),
        }); break;
        case "briefing-history": data = await readers.briefings.listNativeHistory({
          limit: boundedBriefingLimit(input.limit),
          cursor: optional(input.cursor),
        }); break;
        case "briefing": data = await readers.briefings.getNativeArtifact({ artifactId: required(input.artifactId, "artifactId"), version: input.version || null }); break;
        case "dexa-event": data = await readers.briefings.getDexaArtifact({ scanId: required(input.scanId, "scanId") }); break;
        case "photo-event": data = await readers.photoEvents.getPhotoEvent({ sessionId: required(input.sessionId, "sessionId") }); break;
        case "confidence": data = (await readers.activeGoal.getPreview({ currentDate }))?.confidence ?? null; break;
        case "evidence-review": data = await readers.evidenceReview.getReview(required(input.reviewId, "reviewId")); break;
        case "evidence-review-queue": data = await readers.core.getLog(); break;
        case "timeline": data = await readers.timeline.getPage({ limit: boundedLimit(input.limit) }); break;
        default: throw unavailableResource();
      }
      if (data == null) throw unavailableResource();
      return envelope(resource, data);
    },

    async command({ request, commandType, metadata, payload }) {
      const principal = await authorize(request, "founder:write");
      if (typeof executeCommand !== "function") throw unavailableResource();
      if (!NATIVE_WRITE_COMMANDS.has(commandType)) {
        throw new ApplicationProblem({
          status: 400,
          code: "NATIVE_COMMAND_UNAVAILABLE",
          title: "This command is not a canonical Native production write.",
        });
      }
      if ([Phase3Command.COMMIT_EVIDENCE_REVIEW, Phase3Command.DISPOSE_EVIDENCE_REVIEW].includes(commandType)) {
        const detail = await readers.evidenceReview.getReview(required(payload.reviewId, "reviewId"));
        const review = detail?.review;
        if (!review) throw unavailableResource();
        const evidenceTypes = new Set([
          ...(review.evidenceTypes ?? []),
          ...(review.interpretedEvidence?.evidence_objects ?? []).map((item) => item?.evidence_type),
        ].filter(Boolean));
        if (evidenceTypes.size === 0 || [...evidenceTypes].some((type) => !NATIVE_EVIDENCE_REVIEW_TYPES.has(type))) {
          throw new ApplicationProblem({
            status: 400,
            code: "NATIVE_EVIDENCE_REVIEW_UNAVAILABLE",
            title: "This Evidence Review is not available to the Native production workflow.",
          });
        }
      }
      const result = await executeCommand({ commandType, principal, metadata, payload });
      if (![Phase3Command.COMMIT_EVIDENCE_REVIEW, Phase3Command.COMMIT_TRAINING_SESSION].includes(commandType)) return result;
      if (typeof confirmEvidenceReview !== "function") throw unavailableResource();
      const reviewId = payload.reviewId ?? result.receipt?.result?.reviewId;
      let confirmation;
      try {
        confirmation = await confirmEvidenceReview({
          principal,
          reviewId,
          commandId: result.receipt?.commandId ?? metadata.commandId,
        });
      } catch (error) {
        // The canonical command receipt already committed. A synchronous
        // continuation failure must not turn that accepted write into an
        // HTTP failure that invites clients to mutate again.
        confirmation = Object.freeze({
          state: "processing",
          reviewId,
          accepted: true,
          continuationWarning: error?.code ?? "confirmation_continuation_pending",
        });
      }
      return Object.freeze({ ...result, confirmation });
    },

    async acceptEvidenceIntake({ request, input }) {
      const principal = await authorize(request, "founder:write");
      if (!evidenceIntake?.accept) throw unavailableResource();
      return evidenceIntake.accept({ ...input, ownerUserId: principal.userId });
    },

    async evidenceIntakeStatus({ request, intakeId }) {
      await authorize(request, "founder:read");
      if (!evidenceIntake?.getStatus) throw unavailableResource();
      const status = await evidenceIntake.getStatus(required(intakeId, "intakeId"));
      if (!status) throw unavailableResource();
      return status;
    },

    async media({ request, mediaId }) {
      const principal = await authorize(request, "founder:read");
      if (typeof openMedia !== "function") throw unavailableResource();
      return openMedia({ principal, objectId: required(mediaId, "mediaId") });
    },
  });

  function envelope(resource, data) {
    return Object.freeze({
      contractVersion: "1",
      resource,
      authority: "founder-production",
      generatedAt: now().toISOString(),
      data: projectClientSafeValue(projectNativeMediaReferences(data)),
    });
  }
}

function required(value, field) {
  const candidate = String(value ?? "").trim();
  if (!candidate) throw validation(field, `${field} is required.`);
  return candidate;
}
function dateKey(value, field) {
  const candidate = required(value, field);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate) || Number.isNaN(Date.parse(`${candidate}T00:00:00.000Z`))) throw validation(field, `${field} must be YYYY-MM-DD.`);
  return candidate;
}
function validDate(value, field) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw validation(field, `${field} must be an ISO date-time.`);
  return date;
}
function boundedLimit(value) {
  const number = Number(value ?? 100);
  if (!Number.isInteger(number) || number < 1 || number > 200) throw validation("limit", "limit must be an integer from 1 through 200.");
  return number;
}
function boundedBriefingLimit(value) {
  const number = Number(value ?? 20);
  if (!Number.isInteger(number) || number < 1 || number > 50) throw validation("limit", "limit must be an integer from 1 through 50.");
  return number;
}
function boundedResourceLimit(value, { fallback, maximum }) {
  const number = Number(value ?? fallback);
  if (!Number.isInteger(number) || number < 1 || number > maximum) {
    throw validation("limit", `limit must be an integer from 1 through ${maximum}.`);
  }
  return number;
}
function optional(value) { const candidate = String(value ?? "").trim(); return candidate || null; }
function pathParts(value) { return String(value ?? "").split("/").map((item) => item.trim()).filter(Boolean).slice(0, 4); }
function validation(field, detail) {
  return new ApplicationProblem({ status: 400, code: "CONTRACT_VALIDATION_FAILED", title: "The Native request contract is invalid.", fieldErrors: [{ field, code: "invalid", detail }] });
}
function unavailableResource() {
  return new ApplicationProblem({ status: 404, code: "RESOURCE_NOT_FOUND", title: "The requested resource is unavailable." });
}
