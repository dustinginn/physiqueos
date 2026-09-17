import {
  FounderStoreUnitOfWorkErrorCode,
  createFounderStoreUnitOfWork,
} from "../../data/repositories/FounderStoreUnitOfWork.js";
import {
  ActiveProtocolSuccessorOutcome,
  applyPreparedActiveProtocolSuccessor,
  prepareActiveProtocolSuccessorTransition,
} from "./ActiveProtocolSuccessorService.js";
import {
  COACHING_UPDATES_SCHEMA_VERSION,
  resolveCoachingUpdatesReadModel,
  validateCoachingUpdatesConfiguration,
} from "./CoachingUpdatesReadService.js";
import { resolveCoachingUpdatesGoalCadencePolicy } from "./CoachingUpdatesGoalCadencePolicyService.js";
import { selectScheduledBriefingCadence } from "./BriefingEvidenceWindowService.js";
import { getLocalDateKey, resolveLocalTimeZone } from "../utils/localDate.js";

export const CoachingUpdatesTransactionOutcome = Object.freeze({
  SUCCESS: "success",
  PROTOCOL_NOT_FOUND: "protocol_not_found",
  PROTOCOL_NOT_ACTIVE: "protocol_not_active",
  CURRENT_VERSION_MISSING: "current_version_missing",
  EXPECTED_VERSION_CONFLICT: "expected_version_conflict",
  INVALID_GOAL_POLICY: "invalid_goal_policy",
  INVALID_MIDWEEK_SCHEDULE: "invalid_midweek_schedule",
  INVALID_WEEKLY_SCHEDULE: "invalid_weekly_schedule",
  INVALID_MONTHLY_SCHEDULE: "invalid_monthly_schedule",
  INVALID_EVENT_BRIEFING_PREFERENCE: "invalid_event_briefing_preference",
  DAILY_NOT_PERMITTED: "daily_not_permitted",
  NO_ROUTINE_SURFACE: "no_routine_surface",
  INVALID_NOTIFICATION_PREFERENCE: "invalid_notification_preference",
  UNCHANGED_CONFIGURATION: "unchanged_configuration",
  DUPLICATE_CONFIGURATION: "duplicate_configuration",
  SCHEDULER_APPLICATION_FAILURE: "scheduler_application_failure",
  HOME_RESOLUTION_FAILURE: "home_resolution_failure",
  VERIFICATION_FAILURE: "verification_failure",
  CONCURRENCY_CONFLICT: "concurrency_conflict",
  PERSISTENCE_FAILURE: "persistence_failure",
  ROLLBACK_FAILURE: "rollback_failure",
});

export function createCoachingUpdatesTransactionService({
  runtimeStorePath,
  liveStore,
  now = () => new Date(),
  createUnitOfWork = (options) => createFounderStoreUnitOfWork(options),
  faults = {},
} = {}) {
  if (!runtimeStorePath || !liveStore) {
    throw new Error("Coaching Updates transaction requires a bound Founder store.");
  }
  return {
    async update(command = {}) {
      const unit = createUnitOfWork({ filePath: runtimeStorePath, liveStore, now, stageFrom: liveStore });
      const transaction = unit.begin();
      try {
        const staged = await transaction.mutate((store) => {
          const prepared = prepareCoachingUpdatesTransaction(store, command, now());
          if (!prepared.ok) throw new TransactionFailure(prepared.outcome, prepared.reason);
          applyPreparedCoachingUpdatesTransaction(store, prepared, faults);
          return {
            protocolId: prepared.protocol.id,
            previousVersionId: prepared.currentVersionId,
            successorVersionId: prepared.resultVersionId,
            transitionKind: prepared.transitionKind,
          };
        });
        const committed = await transaction.commit({
          validateFinalized(candidate) {
            try {
              faults.finalVerification?.(candidate);
            } catch {
              throw new TransactionFailure(CoachingUpdatesTransactionOutcome.VERIFICATION_FAILURE, "Final verification failed.");
            }
            if (!verifyTransaction(candidate, command, staged.successorVersionId)) {
              throw new TransactionFailure(CoachingUpdatesTransactionOutcome.VERIFICATION_FAILURE, "Final verification failed.");
            }
            return true;
          },
        });
        return Object.freeze({ outcome: CoachingUpdatesTransactionOutcome.SUCCESS, committed: true, ...staged, revision: committed.revision });
      } catch (error) {
        const typed = findFailure(error);
        if (typed) return failure(typed.outcome, typed.message);
        if (error?.committed === true) return failure(CoachingUpdatesTransactionOutcome.ROLLBACK_FAILURE, "Commit publication failed.");
        return failure(
          error?.code === FounderStoreUnitOfWorkErrorCode.REVISION_CONFLICT
            ? CoachingUpdatesTransactionOutcome.CONCURRENCY_CONFLICT
            : CoachingUpdatesTransactionOutcome.PERSISTENCE_FAILURE,
          "Coaching Updates transaction did not commit.",
        );
      }
    },
  };
}

export function prepareCoachingUpdatesTransaction(store, command, timestamp) {
  const protocol = store.protocols?.find((item) => item.id === command.protocolId);
  if (!protocol || (protocol.protocolType ?? protocol.category) !== "briefings") {
    return rejected(CoachingUpdatesTransactionOutcome.PROTOCOL_NOT_FOUND, "Coaching Updates protocol was not found.");
  }
  if (protocol.status !== "active") return rejected(CoachingUpdatesTransactionOutcome.PROTOCOL_NOT_ACTIVE, "Protocol is not active.");
  if (!protocol.currentVersionId) return rejected(CoachingUpdatesTransactionOutcome.CURRENT_VERSION_MISSING, "Current version is missing.");
  if (protocol.currentVersionId !== command.expectedCurrentVersionId) {
    return rejected(CoachingUpdatesTransactionOutcome.EXPECTED_VERSION_CONFLICT, "Current version changed.");
  }
  const current = store.protocolVersions.find((item) => item.id === protocol.currentVersionId);
  const goal = store.goals?.find((item) => item.id === command.goalAssociation?.goalId && item.status === "active");
  if (!goal) return rejected(CoachingUpdatesTransactionOutcome.INVALID_GOAL_POLICY, "Active Goal policy is unavailable.");
  const configuration = canonicalConfiguration(command);
  const invalid = validateCoachingUpdatesConfiguration(configuration);
  if (invalid) return rejected(invalid, "Requested Coaching Updates configuration is invalid.");
  const policy = resolveCoachingUpdatesGoalCadencePolicy(goal);
  if (configuration.daily.enabled && !policy.dailyUserActivationPermitted) {
    return rejected(CoachingUpdatesTransactionOutcome.DAILY_NOT_PERMITTED, "Routine Daily Briefings are not permitted.");
  }
  if (configuration.midweek.enabled && !policy.midweekSupported ||
      configuration.weekly.enabled && !policy.weeklySupported) {
    return rejected(CoachingUpdatesTransactionOutcome.INVALID_GOAL_POLICY, "Requested cadence is not supported by the active Goal.");
  }
  if (!configuration.midweek.enabled && !configuration.weekly.enabled &&
      !configuration.daily.enabled && !policy.noRoutineSurfacePermitted) {
    return rejected(CoachingUpdatesTransactionOutcome.NO_ROUTINE_SURFACE, "At least one routine coaching surface is required.");
  }
  const existing = resolveCoachingUpdatesReadModel({
    protocol, version: current, goal, timeZone: configuration.timeZone,
  });
  if (sameConfiguration(existing, configuration)) {
    return rejected(CoachingUpdatesTransactionOutcome.UNCHANGED_CONFIGURATION, "Configuration is unchanged.");
  }
  if (store.protocolVersions.some((version) =>
    version.protocolId === protocol.id &&
    String(version.effectiveAt).slice(0, 10) === command.effectiveDate &&
    sameConfiguration(version.coachingUpdates, configuration))) {
    return rejected(CoachingUpdatesTransactionOutcome.DUPLICATE_CONFIGURATION, "Equivalent configuration already exists.");
  }
  const currentEffectiveDate = String(current.effectiveAt).slice(0, 10);
  const currentLocalDate = getLocalDateKey(
    timestamp, resolveLocalTimeZone(configuration.timeZone)
  );
  // The editor owns one calendar-effective configuration. A second save for
  // that same current/future effective date amends that version with audited
  // provenance instead of inventing an impossible equal-date successor.
  // Historical versions remain immutable: an old effective date still enters
  // the successor validator and fails closed.
  if (currentEffectiveDate === command.effectiveDate &&
      command.effectiveDate >= currentLocalDate) {
    const amendment = prepareSameDateCoachingAmendment({
      store, protocol, current, command, configuration, timestamp,
    });
    if (!amendment.ok) return amendment;
    return {
      ok: true,
      protocol,
      goal,
      configuration,
      amendment,
      transitionKind: "same_day_amendment",
      currentVersionId: current.id,
      resultVersionId: current.id,
    };
  }
  const successor = prepareActiveProtocolSuccessorTransition(store, {
    ...command,
    successorVersion: {
      ...structuredClone(current),
      coachingUpdates: configuration,
      intent: current.intent?.summary ? current.intent : { summary: "Keep Goal coaching available on the selected cadence." },
      expectations: current.expectations ?? [],
      evaluationWindows: current.evaluationWindows ?? [],
      coachingPolicy: current.coachingPolicy ?? {},
      reviewTriggers: current.reviewTriggers ?? [],
      evidenceBasis: current.evidenceBasis ?? {},
    },
  }, timestamp);
  if (!successor.ok) return rejected(mapSuccessorOutcome(successor.outcome), successor.reason);
  return {
    ok: true,
    protocol,
    goal,
    configuration,
    successor,
    transitionKind: "successor",
    currentVersionId: successor.current.id,
    resultVersionId: successor.successor.id,
  };
}

export function applyPreparedCoachingUpdatesTransaction(store, prepared, faults = {}) {
  if (prepared.transitionKind === "same_day_amendment") {
    Object.assign(prepared.amendment.current, prepared.amendment.amended);
    Object.assign(prepared.protocol, { updatedAt: prepared.amendment.timestamp });
  } else {
    applyPreparedActiveProtocolSuccessor(store, prepared.successor);
  }
  try {
    faults.schedulerApplication?.(store, prepared);
  } catch {
    throw new TransactionFailure(CoachingUpdatesTransactionOutcome.SCHEDULER_APPLICATION_FAILURE, "Future schedule application failed.");
  }
  verifySchedulerApplication(store, prepared.resultVersionId);
  try {
    faults.homeResolution?.(store, prepared);
  } catch {
    throw new TransactionFailure(CoachingUpdatesTransactionOutcome.HOME_RESOLUTION_FAILURE, "Home cadence resolution failed.");
  }
  verifyHomeResolution(store, prepared);
}

export function verifyPreparedCoachingUpdatesTransaction(store, command, successorId) {
  return verifyTransaction(store, command, successorId);
}

function prepareSameDateCoachingAmendment({ store, protocol, current, command, configuration, timestamp }) {
  if (current.status !== "active" || current.endedAt) {
    return rejected(CoachingUpdatesTransactionOutcome.CURRENT_VERSION_MISSING, "The current version is not active.");
  }
  const active = store.protocolVersions.filter((item) =>
    item.protocolId === protocol.id && item.status === "active" && !item.endedAt);
  if (active.length !== 1 || active[0].id !== current.id) {
    return rejected(CoachingUpdatesTransactionOutcome.CURRENT_VERSION_MISSING,
      "The protocol does not have exactly one active version.");
  }
  const ownedGoals = new Set([...(protocol.currentGoalIds ?? []), ...(protocol.relatedGoalIds ?? [])]);
  if (!command.goalAssociation?.goalId || !command.goalAssociation?.relationship ||
      !ownedGoals.has(command.goalAssociation.goalId) ||
      !command.provenance?.author?.id || !command.provenance.author.displayName ||
      !command.provenance?.reason || command.provenance?.confirmation?.confirmedByUser !== true) {
    return rejected(CoachingUpdatesTransactionOutcome.INVALID_GOAL_POLICY,
      "Goal association and explicit author provenance are required.");
  }
  const amendedAt = timestamp.toISOString();
  const amendments = [
    ...(current.change?.sameDayAmendments ?? []),
    {
      amendedAt,
      reason: command.provenance.reason,
      author: structuredClone(command.provenance.author),
      provenance: structuredClone(command.provenance.details ?? {}),
    },
  ];
  return {
    ok: true,
    current,
    timestamp: amendedAt,
    amended: {
      ...structuredClone(current),
      coachingUpdates: configuration,
      change: {
        ...(current.change ?? {}),
        reason: command.provenance.reason,
        sameDayAmendments: amendments,
      },
      confirmation: structuredClone(command.provenance.confirmation),
      updatedAt: amendedAt,
    },
  };
}

function canonicalConfiguration(command) {
  return {
    schemaVersion: COACHING_UPDATES_SCHEMA_VERSION,
    timeZone: command.timeZone,
    midweek: structuredClone(command.midweek),
    weekly: structuredClone(command.weekly),
    monthly: structuredClone(command.monthly ?? { enabled: true, dayOfMonth: 1, localTime: "00:00" }),
    daily: structuredClone(command.daily ?? { enabled: false }),
    eventBriefings: structuredClone(command.eventBriefings ?? { photo: true, dexa: true }),
    // Preserve validation of unknown wire values while retiring the old
    // user-facing opt-out. Historical clients may still send the legacy
    // value; canonical storage always promotes it to notify_when_ready.
    notificationPreference: command.notificationPreference === "available_without_notification"
      ? "notify_when_ready"
      : command.notificationPreference,
    scheduleApplication: { status: "active", appliesTo: "future_eligible_runs" },
  };
}

function verifySchedulerApplication(store, successorId) {
  const version = store.protocolVersions.find((item) => item.id === successorId);
  if (version?.coachingUpdates?.scheduleApplication?.status !== "active") {
    throw new TransactionFailure(CoachingUpdatesTransactionOutcome.SCHEDULER_APPLICATION_FAILURE, "Future schedule application failed.");
  }
}

function verifyHomeResolution(store, prepared) {
  const model = currentModel(store, prepared.protocol.id, prepared.goal.id);
  if (!model || !sameConfiguration(model, prepared.configuration)) {
    throw new TransactionFailure(CoachingUpdatesTransactionOutcome.HOME_RESOLUTION_FAILURE, "Home could not resolve the staged cadence.");
  }
}

function verifyTransaction(store, command, successorId) {
  const model = currentModel(store, command.protocolId, command.goalAssociation?.goalId);
  return Boolean(
    verifyCurrentProtocolVersionState(store, command.protocolId, successorId) &&
    model &&
    sameConfiguration(model, canonicalConfiguration(command)) &&
    schedulerCanResolve(model),
  );
}

function verifyCurrentProtocolVersionState(store, protocolId, versionId) {
  const protocol = store.protocols.find((item) => item.id === protocolId);
  const versions = store.protocolVersions.filter((item) => item.protocolId === protocolId);
  const active = versions.filter((item) => item.status === "active" && !item.endedAt);
  return protocol?.status === "active" && protocol.currentVersionId === versionId &&
    active.length === 1 && active[0].id === versionId;
}

function currentModel(store, protocolId, goalId) {
  const protocol = store.protocols.find((item) => item.id === protocolId);
  const version = store.protocolVersions.find((item) => item.id === protocol?.currentVersionId);
  const goal = store.goals.find((item) => item.id === goalId);
  return resolveCoachingUpdatesReadModel({ protocol, version, goal, timeZone: version?.coachingUpdates?.timeZone });
}

function schedulerCanResolve(model) {
  const dates = {
    [model.midweek.day]: dateForDay(model.midweek.day),
    [model.weekly.day]: dateForDay(model.weekly.day),
  };
  return (!model.midweek.enabled || selectScheduledBriefingCadence({ now: dates[model.midweek.day], timeZone: model.timeZone, coachingUpdates: model }) === "midweek") &&
    (!model.weekly.enabled || selectScheduledBriefingCadence({ now: dates[model.weekly.day], timeZone: model.timeZone, coachingUpdates: model }) === "weekly");
}

function dateForDay(day) {
  const index = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].indexOf(day);
  return new Date(Date.UTC(2026, 6, 19 + index, 20));
}
function sameConfiguration(left, right) {
  const pick = (value) => ({
    schemaVersion: value?.schemaVersion,
    timeZone: value?.timeZone,
    midweek: value?.midweek,
    weekly: value?.weekly,
    monthly: value?.monthly ?? { enabled: true, dayOfMonth: 1, localTime: "00:00" },
    daily: value?.daily ?? { enabled: false },
    eventBriefings: value?.eventBriefings ?? { photo: true, dexa: true },
    notificationPreference: value?.notificationPreference,
    scheduleApplication: value?.scheduleApplication,
  });
  return stable(pick(left)) === stable(pick(right));
}
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function mapSuccessorOutcome(outcome) {
  return ({
    [ActiveProtocolSuccessorOutcome.PROTOCOL_NOT_FOUND]: CoachingUpdatesTransactionOutcome.PROTOCOL_NOT_FOUND,
    [ActiveProtocolSuccessorOutcome.PROTOCOL_NOT_ACTIVE]: CoachingUpdatesTransactionOutcome.PROTOCOL_NOT_ACTIVE,
    [ActiveProtocolSuccessorOutcome.CURRENT_VERSION_MISSING]: CoachingUpdatesTransactionOutcome.CURRENT_VERSION_MISSING,
    [ActiveProtocolSuccessorOutcome.CURRENT_VERSION_NOT_ACTIVE]: CoachingUpdatesTransactionOutcome.CURRENT_VERSION_MISSING,
    [ActiveProtocolSuccessorOutcome.EXPECTED_VERSION_CONFLICT]: CoachingUpdatesTransactionOutcome.EXPECTED_VERSION_CONFLICT,
    [ActiveProtocolSuccessorOutcome.UNCHANGED_SUCCESSOR]: CoachingUpdatesTransactionOutcome.UNCHANGED_CONFIGURATION,
    [ActiveProtocolSuccessorOutcome.DUPLICATE_SUCCESSOR]: CoachingUpdatesTransactionOutcome.DUPLICATE_CONFIGURATION,
  })[outcome] ?? CoachingUpdatesTransactionOutcome.VERIFICATION_FAILURE;
}
function findFailure(error) {
  let current = error;
  while (current) {
    if (current instanceof TransactionFailure) return current;
    current = current.cause;
  }
  return null;
}
function failure(outcome, reason) { return Object.freeze({ outcome, committed: false, reason }); }
function rejected(outcome, reason) { return { ok: false, outcome, reason }; }
class TransactionFailure extends Error {
  constructor(outcome, message) {
    super(message);
    this.name = "CoachingUpdatesTransactionFailure";
    this.outcome = outcome;
  }
}
