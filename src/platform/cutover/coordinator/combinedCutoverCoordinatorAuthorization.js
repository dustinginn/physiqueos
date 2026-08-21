import { createHash } from "node:crypto";
import {
  CoordinatorErrorCode, FOUNDER_AUTHORIZATION_STEPS, coordinatorError, freeze, requireRunId,
} from "./combinedCutoverCoordinatorContract.js";

export function validateCoordinatorAuthorization(decision, { run, step, priorStateDigest, now = new Date() } = {}) {
  if (!FOUNDER_AUTHORIZATION_STEPS.includes(step)) return null;
  if (!decision || decision.authorized !== true) throw authorizationRequired(step);
  const runId = requireRunId(decision.runId, "authorization.runId");
  const decisionStep = String(decision.step ?? "");
  const expectedVersion = Number(decision.expectedCoordinatorVersion);
  const authorizationId = String(decision.authorizationId ?? "").trim();
  const authorizedAt = exactIso(decision.authorizedAt, "authorization.authorizedAt");
  const expiresAt = exactIso(decision.expiresAt, "authorization.expiresAt");
  const digest = String(decision.priorStateDigest ?? "").toLowerCase();
  if (runId !== run.runId || decisionStep !== step || expectedVersion !== run.version ||
      !/^[a-zA-Z0-9][a-zA-Z0-9:_-]{7,127}$/.test(authorizationId) ||
      !/^[0-9a-f]{64}$/.test(digest) || digest !== priorStateDigest ||
      new Date(authorizedAt).getTime() > now.getTime() || new Date(expiresAt).getTime() <= now.getTime()) {
    throw coordinatorError(CoordinatorErrorCode.AUTHORIZATION_STALE, "Founder authorization is stale or bound to different coordinator state.", {
      runId: run.runId, step, expectedCoordinatorVersion: run.version,
    });
  }
  return freeze({
    authorizationId,
    fingerprint: hash({ runId, step, expectedVersion, authorizationId, authorizedAt, expiresAt, priorStateDigest: digest }),
    authorizedAt,
    expiresAt,
  });
}

export function coordinatorStateDigest(run, authority) {
  return hash({
    runId: run.runId,
    migrationOperationId: run.migrationOperationId,
    coordinatorVersion: run.version,
    currentStep: run.currentStep,
    stepStatus: run.stepStatus,
    completedSteps: run.completedSteps,
    authorityVersion: authority?.version ?? null,
    authority: authority?.authority ?? null,
    firstProviderCanonicalWriteAt: authority?.firstProviderCanonicalWriteAt ?? null,
    firstProviderCommandId: authority?.firstProviderCommandId ?? null,
  });
}

function authorizationRequired(step) {
  return coordinatorError(CoordinatorErrorCode.AUTHORIZATION_REQUIRED, `Founder authorization bound to this run and ${step} is required.`);
}
function exactIso(value, field) {
  let exact = false;
  try { exact = typeof value === "string" && Boolean(value.trim()) && new Date(value).toISOString() === value; } catch { exact = false; }
  if (!exact) {
    throw coordinatorError(CoordinatorErrorCode.AUTHORIZATION_STALE, `${field} must be an exact ISO timestamp.`);
  }
  return value;
}
function hash(value) { return createHash("sha256").update(stable(value)).digest("hex"); }
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
