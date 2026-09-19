import { createHash } from "node:crypto";
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
import { assertEvidenceCanonicalCommitReady } from
  "../../domain/services/EvidenceCanonicalCommitReadinessService.js";

const RESOURCES = new Set(Object.values(NativeProductionResource));
const CONTEXTS = new Set(["all", "build-lean-mass", "visible-abs"]);
const NATIVE_EVIDENCE_REVIEW_TYPES = new Set([
  "nutrition", "activity", "activity_day", "training", "dexa", "dexa_scan", "body_composition",
  "photo_session", "progress_photo",
]);
const NATIVE_WRITE_COMMANDS = new Set([
  Phase3Command.SUBMIT_WEIGHT,
  Phase3Command.SUBMIT_CHECK_IN,
  Phase3Command.COMPLETE_PRIORITY,
  Phase3Command.COMMIT_TRAINING_SESSION,
  Phase3Command.UPSERT_NUTRITION_DAY,
  Phase3Command.UPSERT_ACTIVITY_DAY,
  Phase3Command.INGEST_HEALTHKIT_OBSERVATIONS,
  Phase3Command.EDIT_DEXA_REVIEW,
  Phase3Command.COMMIT_EVIDENCE_REVIEW,
  Phase3Command.DISPOSE_EVIDENCE_REVIEW,
  Phase3Command.SAVE_RECURRING_SUPPORT,
  Phase3Command.SAVE_NUTRITION_STRATEGY,
  Phase3Command.ADD_TO_MY_LIBRARY,
  Phase3Command.CREATE_CANONICAL_EXERCISE,
  Phase3Command.SAVE_TRAINING_STRATEGY,
  Phase3Command.SAVE_PEPTIDE_SUPPORT,
  Phase3Command.SAVE_SUPPLEMENT_SUPPORT,
  Phase3Command.SAVE_SUPPLEMENT_STRATEGY,
  Phase3Command.CHANGE_SUPPLEMENT_LIFECYCLE,
  Phase3Command.SAVE_COACHING_UPDATES,
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
  logger = null,
  performanceClock = () => performance.now(),
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
        case "home": data = projectHomePresentation(
          await readers.core.getHome(), input.presentationVersion,
        ); break;
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
        case "training-library": {
          const libraryScope = input.libraryScope ?? "my-library";
          if (!["my-library", "all"].includes(libraryScope)) throw validation("libraryScope", "Choose My Library or All Exercises.");
          const [library, myLibraryExerciseIds] = await Promise.all([
            readers.training.getLibrary({ context, currentDate, path: pathParts(input.path) }),
            readers.core.getTrainingMyLibrary(),
          ]);
          if (!library || !Array.isArray(myLibraryExerciseIds)) throw unavailableResource();
          const membership = new Set(myLibraryExerciseIds);
          data = {
            ...library,
            myLibraryExerciseIds,
            report: {
              ...library.report,
              canonicalExercises: library.report.canonicalExercises.filter((exercise) =>
                libraryScope === "all" || membership.has(exercise.canonicalExerciseId)),
            },
          };
          break;
        }
        case "training-day": data = await readers.training.getDay({ date: dateKey(input.date, "date"), timeZone: input.timeZone || null }); break;
        case "training-session": data = await readers.training.getSession({ sessionId: required(input.sessionId, "sessionId") }); break;
        case "training-exercise": data = await readers.training.getExercise({ context, currentDate, exerciseSlug: required(input.exerciseId, "exerciseId") }); break;
        case "nutrition": data = await readers.progress.getNutrition({ context, currentDate }); break;
        case "activity": data = await readers.progress.getActivity({ context, currentDate }); break;
        case "healthkit-activity-canary": data = await readers.healthKitCanary.getActivityValidation({
          startDate: required(input.startDate, "startDate"),
          endDate: required(input.endDate, "endDate"),
        }); break;
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
        case "operating-plan-recurring-support": data = await readers.core.getRecurringSupport({
          executionId: required(input.executionId, "executionId"),
        }); break;
        case "operating-plan-nutrition-strategy": data = await readers.core.getNutritionStrategyDetail({
          strategyId: required(input.strategyId, "strategyId"),
        }); break;
        case "operating-plan-training-strategy": data = await readers.core.getTrainingStrategyDetail({
          strategyId: required(input.strategyId, "strategyId"),
        }); break;
        case "operating-plan-peptide-support": data = await readers.core.getPeptideSupport({
          protocolId: required(input.protocolId, "protocolId"),
        }); break;
        case "operating-plan-protocol-domain": data = await readers.core.getOperatingPlanProtocolDomain({
          protocolId: required(input.protocolId, "protocolId"),
        }); break;
        case "operating-plan-supplement-support": data = await readers.core.getSupplementSupport({
          protocolId: required(input.protocolId, "protocolId"),
        }); break;
        case "operating-plan-supplement-strategy-editor": data = await readers.core.getSupplementStrategyEditor({
          protocolId: input.protocolId ?? null,
        }); break;
        case "operating-plan-energy-strategy": data = await readers.core.getEnergyStrategyDetail({
          strategyId: required(input.strategyId, "strategyId"),
        }); break;
        case "operating-plan-coaching-updates": data = await readers.core.getCoachingUpdatesDetail({
          strategyId: required(input.strategyId, "strategyId"),
        }); break;
        default: throw unavailableResource();
      }
      if (data == null) throw unavailableResource();
      return envelope(resource, data);
    },

    async command({ request, commandType, metadata, payload }) {
      const commandStartedAt = performanceClock();
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
        const allowedTypes = NATIVE_EVIDENCE_REVIEW_TYPES;
        if (evidenceTypes.size === 0 || [...evidenceTypes].some((type) => !allowedTypes.has(type))) {
          throw new ApplicationProblem({
            status: 400,
            code: "NATIVE_EVIDENCE_REVIEW_UNAVAILABLE",
            title: "This Evidence Review is not available to the Native production workflow.",
          });
        }
        if (commandType === Phase3Command.COMMIT_EVIDENCE_REVIEW) {
          try {
            assertEvidenceCanonicalCommitReady(review.interpretedEvidence);
          } catch (error) {
            throw new ApplicationProblem({
              status: 400,
              code: error?.code ?? "EVIDENCE_REVIEW_NOT_COMMITTABLE",
              title: "This Evidence Review needs a correction before it can be confirmed.",
              detail: error?.message,
              fieldErrors: (error?.fields ?? []).map((field) => ({
                field: `dailyTotals.${field}`,
                code: "conflicts_with_meal_totals",
                detail: "The summary value conflicts with the complete meal total.",
              })),
            });
          }
        }
      }
      const result = await executeCommand({ commandType, principal, metadata, payload });
      logger?.info?.("native.command.receipt_committed", {
        commandType,
        durationMs: elapsed(performanceClock, commandStartedAt),
        commandState: result?.outcome ?? "committed",
        durable: result?.receipt?.result?.trainingSessionDurable === true || undefined,
        idempotencyFingerprint: safeIdentityFingerprint(metadata.idempotencyKey),
      });
      if (![Phase3Command.COMMIT_EVIDENCE_REVIEW, Phase3Command.COMMIT_TRAINING_SESSION].includes(commandType)) return result;
      if (commandType === Phase3Command.COMMIT_TRAINING_SESSION &&
          result?.receipt?.result?.trainingSessionDurable === true) {
        const confirmation = Object.freeze({
          state: "confirmed",
          accepted: true,
          trainingSessionDurable: true,
          canonicalId: result.receipt.result.canonicalId ?? null,
        });
        logger?.info?.("native.command.durable_acknowledgement", {
          commandType,
          durationMs: elapsed(performanceClock, commandStartedAt),
          confirmationDurationMs: 0,
          durable: true,
          finalOutcome: "durable",
          idempotencyFingerprint: safeIdentityFingerprint(metadata.idempotencyKey),
          stages: result.receipt.result.stageDurations ?? undefined,
        });
        return Object.freeze({ ...result, confirmation });
      }
      if (typeof confirmEvidenceReview !== "function") throw unavailableResource();
      const reviewId = payload.reviewId ?? result.receipt?.result?.reviewId;
      let confirmation;
      try {
        const durableStartedAt = performanceClock();
        confirmation = await confirmEvidenceReview({
          principal,
          reviewId,
          commandId: result.receipt?.commandId ?? metadata.commandId,
        });
        logger?.info?.("native.command.durable_acknowledgement", {
          commandType,
          durationMs: elapsed(performanceClock, commandStartedAt),
          confirmationDurationMs: elapsed(performanceClock, durableStartedAt),
          durable: confirmation?.state === "confirmed" || confirmation?.trainingSessionDurable === true,
        });
      } catch (error) {
        if (commandType === Phase3Command.COMMIT_TRAINING_SESSION) {
          throw new ApplicationProblem({ status: 503, code: "TRAINING_SESSION_NOT_DURABLE", title: "Your workout has not been confirmed yet.", detail: "Retry the same workout submission to check its saved result." });
        }
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
      if (commandType === Phase3Command.COMMIT_TRAINING_SESSION &&
          confirmation?.state !== "confirmed" && confirmation?.trainingSessionDurable !== true) {
        throw new ApplicationProblem({ status: 503, code: "TRAINING_SESSION_NOT_DURABLE", title: "Your workout has not been confirmed yet.", detail: "Retry the same workout submission to check its saved result." });
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
      data: projectClientSafeValue(projectNativeMediaReferences(data), {
        canonicalGoalDestinations: true,
      }),
    });
  }
}

// Build 38's non-optional Home icon enums predate the canonical `pills`
// identity. Keep the server-first rollout safe by projecting a neutral icon
// for clients that do not explicitly advertise the forward-compatible v2
// decoder. V2 and later receive the canonical icon unchanged; this is a
// transport compatibility boundary, not a second source of domain meaning.
function projectHomePresentation(home, presentationVersion) {
  if (String(presentationVersion ?? "") === "2") return home;
  const legacyFocus = (home?.todaysFocus ?? []).map((item) =>
    projectLegacyPresentationItem(item, LEGACY_HOME_FOCUS_ICONS));
  const legacyNotifications = Array.isArray(home?.notificationOccurrences)
    ? home.notificationOccurrences.map((item) =>
        projectLegacyPresentationItem(item, LEGACY_HOME_FOCUS_ICONS))
    : home?.notificationOccurrences;
  const legacyGoals = Array.isArray(home?.goals)
    ? home.goals.map((item) => projectLegacyPresentationItem(item, LEGACY_HOME_GOAL_ICONS))
    : home?.goals;
  return Object.freeze({
    ...home,
    ...(home?.nextBestAction
      ? { nextBestAction: projectLegacyPresentationItem(home.nextBestAction, LEGACY_HOME_ACTION_ICONS) }
      : {}),
    ...(Array.isArray(home?.goals) ? { goals: Object.freeze(legacyGoals) } : {}),
    ...(Array.isArray(home?.todaysFocus) ? { todaysFocus: Object.freeze(legacyFocus) } : {}),
    ...(Array.isArray(home?.notificationOccurrences)
      ? { notificationOccurrences: Object.freeze(legacyNotifications) }
      : {}),
  });
}

const LEGACY_HOME_ACTION_ICONS = new Set([
  "activity", "analysis", "camera", "check", "moon", "scale", "syringe", "target", "utensils",
]);
const LEGACY_HOME_FOCUS_ICONS = new Set([
  "activity", "camera", "moon", "scale", "syringe", "target", "utensils",
]);
const LEGACY_HOME_GOAL_ICONS = new Set(["activity", "compass", "dumbbell", "shield", "target"]);
const LEGACY_HOME_COLORS = new Set([
  "primary", "success", "evidence", "effort", "warning", "danger", "muted", "surface", "plain",
]);

function projectLegacyPresentationItem(item, allowedIcons) {
  if (!item || typeof item !== "object") return item;
  const icon = allowedIcons.has(item.icon) ? item.icon : "target";
  const color = item.color == null || LEGACY_HOME_COLORS.has(item.color) ? item.color : "muted";
  if (icon === item.icon && color === item.color) return item;
  return Object.freeze({ ...item, icon, ...(item.color == null ? {} : { color }) });
}

function safeIdentityFingerprint(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex").slice(0, 16);
}

function elapsed(clock, startedAt) {
  return Math.max(0, Math.round((clock() - startedAt) * 100) / 100);
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
