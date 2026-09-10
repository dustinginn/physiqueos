import { requireScope } from "../auth/principal.js";
import { projectClientSafeValue } from "../read-models/readModel.js";
import { ApplicationProblem } from "../../contracts/v1/problem.js";
import { nativeProductionContractManifest, NativeProductionResource } from "./nativeProductionContractManifest.js";
import { projectNativeMediaReferences } from "./nativeMediaProjection.js";

const RESOURCES = new Set(Object.values(NativeProductionResource));
const CONTEXTS = new Set(["all", "build-lean-mass", "visible-abs"]);

export function createNativeProductionContractService({
  authenticate,
  ownerUserId,
  readers,
  executeCommand,
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
        case "priority": data = await readers.priorities.getPriorityDetail(required(input.priorityId, "priorityId")); break;
        case "morning-check-in": data = await readers.core.getMorningCheckIn(); break;
        case "weight": data = await readers.weight.getCurrentWeight({ principal }); break;
        case "training-logger": data = await readers.core.getTrainingLogger(); break;
        case "training-landing": data = await readers.training.getLanding({ context, currentDate }); break;
        case "training-reporting": data = await readers.training.getReporting({ context, currentDate }); break;
        case "training-library": data = await readers.training.getLibrary({ context, currentDate, path: pathParts(input.path) }); break;
        case "training-day": data = await readers.training.getDay({ date: dateKey(input.date, "date"), timeZone: input.timeZone || null }); break;
        case "training-session": data = await readers.training.getSession({ sessionId: required(input.sessionId, "sessionId") }); break;
        case "training-exercise": data = await readers.training.getExercise({ context, currentDate, exerciseSlug: required(input.exerciseId, "exerciseId") }); break;
        case "nutrition": data = await readers.progress.getNutrition({ context, currentDate }); break;
        case "activity": data = await readers.progress.getActivity({ context, currentDate }); break;
        case "energy": data = await readers.progress.getEnergy({ context, currentDate }); break;
        case "dexa": data = await readers.progress.getDEXA({ context, currentDate }); break;
        case "photos": data = await readers.photos.getPhotosTimeline({ context, currentDate }); break;
        case "briefing-history": data = await readers.briefings.listNativeHistory({
          limit: boundedBriefingLimit(input.limit),
          cursor: optional(input.cursor),
        }); break;
        case "briefing": data = await readers.briefings.getArtifact({ artifactId: required(input.artifactId, "artifactId"), version: input.version || null }); break;
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
      return executeCommand({ commandType, principal, metadata, payload });
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
function optional(value) { const candidate = String(value ?? "").trim(); return candidate || null; }
function pathParts(value) { return String(value ?? "").split("/").map((item) => item.trim()).filter(Boolean).slice(0, 4); }
function validation(field, detail) {
  return new ApplicationProblem({ status: 400, code: "CONTRACT_VALIDATION_FAILED", title: "The Native request contract is invalid.", fieldErrors: [{ field, code: "invalid", detail }] });
}
function unavailableResource() {
  return new ApplicationProblem({ status: 404, code: "RESOURCE_NOT_FOUND", title: "The requested resource is unavailable." });
}
