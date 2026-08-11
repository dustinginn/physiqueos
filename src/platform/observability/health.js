export function createLivenessModel({ buildIdentity, startedAt }) {
  return Object.freeze({ status: "ok", buildId: buildIdentity.buildId, apiVersion: buildIdentity.apiVersion, startedAt });
}

export function createReadinessModel({ checks = [], buildIdentity }) {
  const normalized = checks.map((check) => Object.freeze({ name: String(check.name), ready: check.ready === true, code: String(check.code ?? (check.ready ? "READY" : "NOT_READY")) }));
  return Object.freeze({
    status: normalized.every((check) => check.ready) ? "ready" : "not_ready",
    buildId: buildIdentity.buildId,
    apiVersion: buildIdentity.apiVersion,
    checks: Object.freeze(normalized),
  });
}

export function createWorkerHeartbeat({ workerId, buildId, observedAt, status = "healthy" }) {
  if (!workerId || !buildId || !observedAt) throw new Error("Worker heartbeat identity, build, and time are required.");
  return Object.freeze({ workerId: String(workerId), buildId: String(buildId), observedAt: String(observedAt), status: String(status) });
}
