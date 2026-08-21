import {
  RouteState,
  RoutingErrorCode,
  routingControlError,
} from "./combinedCutoverRoutingControl.js";
import {
  ProviderReadbackClassification,
  ProviderResultClassification,
  redactProviderEvidence,
} from "../../provider/digitalocean/DigitalOceanProviderContract.js";
import { createDigitalOceanMutationReconciler } from "../../provider/digitalocean/DigitalOceanMutationReconciler.js";

export const PHASE7B_ROUTING_ZONE = "cutover.dustinginn.com";
export const PHASE7B_ROUTING_LEAF = "app.cutover.dustinginn.com";
export const PHASE7B_ROUTING_RECORD_TYPE = "CNAME";
export const PHASE7B_ROUTING_TTL_SECONDS = 60;

const EXTERNAL_TRAFFIC_PROOFS = Object.freeze([
  "authoritative-dns-answer",
  "public-dns-answer",
  "windows-custom-domain-edge-readiness",
  "provider-custom-domain-attachment",
  "tls-certificate-readiness",
  "host-sni-routing",
  "https-provider-build-identity",
]);

/**
 * Production routing-control implementation for one already-prepared DigitalOcean DNS CNAME.
 * Zone creation, App Platform custom-domain attachment, TLS preparation, authority transitions,
 * and public DNS/HTTPS proof remain higher-level Phase A/L responsibilities.
 */
export function createProductionDigitalOceanRoutingControl({
  client,
  mutationReconciler = createDigitalOceanMutationReconciler(),
  zone,
  leafFqdn,
  windowsTarget,
  providerTarget,
  expectedTtl = PHASE7B_ROUTING_TTL_SECONDS,
} = {}) {
  assertClient(client);
  assertReconciler(mutationReconciler);
  const config = normalizeConfiguration({ zone, leafFqdn, windowsTarget, providerTarget, expectedTtl });
  const resourceKey = `digitalocean-dns:${config.zone}:${config.leafFqdn}:${PHASE7B_ROUTING_RECORD_TYPE}`;

  async function inspectCurrentRoute({ routingTarget } = {}) {
    if (routingTarget != null) assertProviderRoutingTarget(routingTarget, config);
    let domainResult;
    try {
      domainResult = await client.getDomain(config.zone);
    } catch (error) {
      return providerReadFailureState(error, config, "zone-read");
    }

    let recordList;
    try {
      recordList = await client.listDomainRecords({
        domainName: config.zone,
        name: config.leafFqdn,
        page: 1,
        perPage: 200,
      });
    } catch (error) {
      return providerReadFailureState(error, config, "record-list-read");
    }

    const providerZoneIdentity = domainResult.providerIdentity?.resourceId ?? config.zone;
    const providerIdentityEvidence = { providerZoneIdentity };
    const records = recordList.value.records;
    const providerTotal = numeric(recordList.value.meta?.total);
    if (providerTotal != null && providerTotal > records.length) {
      return routeInspection(RouteState.MULTIPLE_MATCHING_RECORDS, config, {
        reason: "provider-pagination-indicates-additional-records",
        matchingRecordCount: providerTotal,
        providerReadClassification: recordList.classification,
        ...providerIdentityEvidence,
      });
    }
    const matching = records.filter((record) => recordNameMatches(record?.name, config));
    if (matching.length !== records.length) {
      return routeInspection(RouteState.RECORD_IDENTITY_MISMATCH, config, {
        reason: "provider-returned-a-record-outside-the-exact-leaf",
        matchingRecordCount: matching.length,
        returnedRecordCount: records.length,
        providerReadClassification: recordList.classification,
        ...providerIdentityEvidence,
      });
    }
    if (matching.length === 0) {
      return routeInspection(RouteState.UNPREPARED, config, {
        reason: "routing-record-missing",
        matchingRecordCount: 0,
        providerReadClassification: recordList.classification,
        ...providerIdentityEvidence,
      });
    }
    if (matching.length !== 1) {
      return routeInspection(RouteState.MULTIPLE_MATCHING_RECORDS, config, {
        reason: "multiple-exact-routing-records",
        matchingRecordCount: matching.length,
        providerReadClassification: recordList.classification,
        ...providerIdentityEvidence,
      });
    }

    const record = matching[0];
    if (record.id == null || !String(record.id).trim()) {
      return routeInspection(RouteState.RECORD_IDENTITY_MISMATCH, config, {
        reason: "routing-record-id-missing",
        matchingRecordCount: 1,
        providerReadClassification: recordList.classification,
        ...providerIdentityEvidence,
      });
    }
    if (String(record.type ?? "").toUpperCase() !== PHASE7B_ROUTING_RECORD_TYPE) {
      return routeInspection(RouteState.UNEXPECTED_RECORD_TYPE, config, recordEvidence(record, config, {
        reason: "routing-record-type-is-not-cname",
        observedTargetRole: classifyTargetRole(record.data, config),
        providerReadClassification: recordList.classification,
        ...providerIdentityEvidence,
      }));
    }

    const observedTargetRole = classifyTargetRole(record.data, config);
    if (observedTargetRole === "unexpected") {
      return routeInspection(RouteState.UNEXPECTED_TARGET, config, recordEvidence(record, config, {
        reason: "routing-record-target-is-not-approved",
        observedTargetRole,
        providerReadClassification: recordList.classification,
        ...providerIdentityEvidence,
      }));
    }
    if (Number(record.ttl) !== config.expectedTtl) {
      return routeInspection(RouteState.TTL_MISMATCH, config, recordEvidence(record, config, {
        reason: "routing-record-ttl-does-not-match-cutover-contract",
        observedTargetRole,
        providerReadClassification: recordList.classification,
        ...providerIdentityEvidence,
      }));
    }
    return routeInspection(observedTargetRole === "windows" ? RouteState.WINDOWS_ACTIVE : RouteState.PROVIDER_ACTIVE, config, recordEvidence(record, config, {
      reason: "exact-provider-record-state-proven",
      observedTargetRole,
      providerReadClassification: recordList.classification,
      ...providerIdentityEvidence,
    }));
  }

  async function activateProviderRoute({ routingTarget, operationIdentity } = {}) {
    assertProviderRoutingTarget(routingTarget, config);
    const identity = normalizeOperationIdentity(operationIdentity);
    const current = await inspectCurrentRoute({ routingTarget });
    if (current.routeState === RouteState.PROVIDER_ACTIVE) {
      return mutationSuccess("idempotent-replay", current, identity, "provider", null);
    }
    assertMutationPrecondition(current, RouteState.WINDOWS_ACTIVE, RoutingErrorCode.ACTIVATION_FAILED, "Provider route activation");
    return mutateRoute({
      action: "activate-provider",
      identity,
      current,
      expectedPriorState: RouteState.WINDOWS_ACTIVE,
      intendedState: RouteState.PROVIDER_ACTIVE,
      intendedRole: "provider",
      target: config.providerTarget,
      failureCode: RoutingErrorCode.ACTIVATION_FAILED,
    });
  }

  async function verifyProviderRoute({ routingTarget, expectedRecordId } = {}) {
    assertProviderRoutingTarget(routingTarget, config);
    const current = await inspectCurrentRoute({ routingTarget });
    if (current.routeState !== RouteState.PROVIDER_ACTIVE) {
      throw routingFailureForState(RoutingErrorCode.VERIFICATION_FAILED, "Provider route verification", current);
    }
    if (expectedRecordId != null && String(current.recordId) !== String(expectedRecordId)) {
      throw routingControlError(RoutingErrorCode.IDENTITY_MISMATCH, "Provider route record identity changed during verification.", safeEvidence({
        expectedRecordId: String(expectedRecordId), observedRecordId: String(current.recordId), routeState: current.routeState,
      }));
    }
    return freeze({
      ready: true,
      routeState: current.routeState,
      recordId: current.recordId,
      evidence: current.evidence,
      verificationScope: "provider-record-state-only",
      providerRecordStateVerified: true,
      externalTrafficProofsRequired: EXTERNAL_TRAFFIC_PROOFS,
    });
  }

  async function restoreWindowsRoute({ routingTarget, operationIdentity } = {}) {
    if (routingTarget != null) assertProviderRoutingTarget(routingTarget, config);
    const identity = normalizeOperationIdentity(operationIdentity);
    const current = await inspectCurrentRoute({ routingTarget: config.providerTarget });
    if (current.routeState === RouteState.WINDOWS_ACTIVE) {
      return mutationSuccess("idempotent-replay", current, identity, "windows", null);
    }
    assertMutationPrecondition(current, RouteState.PROVIDER_ACTIVE, RoutingErrorCode.RESTORE_FAILED, "Windows route restoration");
    return mutateRoute({
      action: "restore-windows",
      identity,
      current,
      expectedPriorState: RouteState.PROVIDER_ACTIVE,
      intendedState: RouteState.WINDOWS_ACTIVE,
      intendedRole: "windows",
      target: config.windowsTarget,
      failureCode: RoutingErrorCode.RESTORE_FAILED,
    });
  }

  async function mutateRoute({ action, identity, current, expectedPriorState, intendedState, intendedRole, target, failureCode }) {
    let reconciliation;
    try {
      reconciliation = await mutationReconciler.execute({
        resourceKey,
        operationIdentity: identity,
        mutate: () => client.updateDomainRecord({
          domainName: config.zone,
          recordId: current.recordId,
          record: {
            type: PHASE7B_ROUTING_RECORD_TYPE,
            name: config.relativeRecordName,
            data: target,
            ttl: config.expectedTtl,
          },
          operationIdentity: identity,
        }),
        readCurrent: async () => ({ value: await inspectCurrentRoute({ routingTarget: config.providerTarget }) }),
        classifyReadback: (inspection) => {
          if (inspection?.routeState === intendedState && String(inspection.recordId) === String(current.recordId)) {
            return ProviderReadbackClassification.PROVEN_APPLIED;
          }
          if (inspection?.routeState === expectedPriorState && String(inspection.recordId) === String(current.recordId)) {
            return ProviderReadbackClassification.PROVEN_NOT_APPLIED;
          }
          return ProviderReadbackClassification.STILL_AMBIGUOUS;
        },
      });
    } catch (error) {
      const ambiguous = [
        ProviderResultClassification.MUTATION_AMBIGUOUS,
        ProviderResultClassification.MUTATION_UNRESOLVED,
        ProviderResultClassification.IDENTITY_MISMATCH,
      ].includes(error?.classification);
      throw routingControlError(ambiguous ? RoutingErrorCode.AMBIGUOUS : failureCode,
        ambiguous ? `${action} remains ambiguous and no second mutation is permitted.` : `${action} was rejected before routing readback succeeded.`,
        safeEvidence({
          mutationAttempted: ambiguous,
          operationIdentity: identity,
          zone: config.zone,
          leafFqdn: config.leafFqdn,
          recordId: current.recordId,
          attemptedTargetRole: intendedRole,
          providerMutationClassification: error?.classification,
          providerEvidence: error?.evidence,
        }));
    }

    const evidence = safeEvidence({
      mutationAttempted: true,
      operationIdentity: identity,
      zone: config.zone,
      leafFqdn: config.leafFqdn,
      recordType: PHASE7B_ROUTING_RECORD_TYPE,
      recordId: current.recordId,
      attemptedTargetRole: intendedRole,
      priorRouteState: current.routeState,
      providerMutationClassification: reconciliation.mutationEvidence?.classification,
      providerMutationEvidence: reconciliation.mutationEvidence?.evidence,
      readbackClassification: reconciliation.readbackClassification,
      readAttempts: reconciliation.readAttempts,
    });
    if (reconciliation.readbackClassification !== ProviderReadbackClassification.PROVEN_APPLIED) {
      const unresolved = reconciliation.readbackClassification === ProviderReadbackClassification.STILL_AMBIGUOUS;
      throw routingControlError(unresolved ? RoutingErrorCode.AMBIGUOUS : failureCode,
        unresolved ? `${action} outcome remains ambiguous after bounded readback.` : `${action} was proven not applied by bounded readback.`, evidence);
    }
    const verified = await inspectCurrentRoute({ routingTarget: config.providerTarget });
    if (verified.routeState !== intendedState || String(verified.recordId) !== String(current.recordId)) {
      throw routingControlError(
        RoutingErrorCode.AMBIGUOUS,
        `${action} was proven applied by bounded readback but final provider-state verification diverged.`,
        safeEvidence({
          mutationAttempted: true,
          operationIdentity: identity,
          zone: config.zone,
          leafFqdn: config.leafFqdn,
          recordId: current.recordId,
          intendedRouteState: intendedState,
          finalRouteState: verified.routeState,
          finalProviderEvidence: verified.evidence,
        }),
      );
    }
    return mutationSuccess(action === "activate-provider" ? "activated" : "restored", verified, identity, intendedRole, evidence);
  }

  return Object.freeze({
    kind: "production-digitalocean-routing-control",
    inspectCurrentRoute,
    activateProviderRoute,
    verifyProviderRoute,
    restoreWindowsRoute,
  });
}

function providerReadFailureState(error, config, stage) {
  const missing = error?.classification === ProviderResultClassification.READ_FAILED && error?.evidence?.status === 404;
  return routeInspection(missing ? RouteState.UNPREPARED : RouteState.AMBIGUOUS, config, {
    reason: missing ? `${stage}-not-found` : `${stage}-failed`,
    providerReadClassification: error?.classification ?? ProviderResultClassification.READ_FAILED,
    providerEvidence: error?.evidence,
  });
}

function routeInspection(routeState, config, details = {}) {
  return freeze({
    routeState,
    recordId: details.recordId ?? null,
    targetRole: details.observedTargetRole ?? null,
    ttl: details.ttl ?? null,
    evidence: safeEvidence({
      zone: config.zone,
      leafFqdn: config.leafFqdn,
      expectedRecordType: PHASE7B_ROUTING_RECORD_TYPE,
      expectedTtl: config.expectedTtl,
      observedRouteState: routeState,
      ...details,
    }),
    verificationScope: "provider-record-state-only",
    externalTrafficProofsRequired: EXTERNAL_TRAFFIC_PROOFS,
  });
}

function recordEvidence(record, config, extra) {
  return {
    recordId: String(record.id),
    observedRecordType: String(record.type ?? "").toUpperCase(),
    ttl: numeric(record.ttl),
    expectedTtl: config.expectedTtl,
    ...extra,
  };
}

function mutationSuccess(outcome, inspection, operationIdentity, targetRole, mutationEvidence) {
  return freeze({
    routeState: inspection.routeState,
    outcome,
    recordId: inspection.recordId,
    evidence: safeEvidence({
      operationIdentity,
      attemptedTargetRole: targetRole,
      providerMutationClassification: mutationEvidence?.providerMutationClassification ?? null,
      readbackClassification: mutationEvidence?.readbackClassification ?? null,
      providerRecordEvidence: inspection.evidence,
      ...(mutationEvidence ?? {}),
    }),
    verificationScope: "provider-record-state-only",
    externalTrafficProofsRequired: EXTERNAL_TRAFFIC_PROOFS,
  });
}

function assertMutationPrecondition(current, expectedState, failureCode, action) {
  if (current.routeState === expectedState) return;
  if (current.routeState === RouteState.UNPREPARED) {
    throw routingControlError(RoutingErrorCode.NOT_PREPARED, `${action} requires one prepared exact CNAME record.`, current.evidence);
  }
  throw routingFailureForState(failureCode, action, current);
}

function routingFailureForState(defaultCode, action, current) {
  const code = current.routeState === RouteState.MULTIPLE_MATCHING_RECORDS
    ? RoutingErrorCode.MULTIPLE_RECORDS
    : current.routeState === RouteState.UNEXPECTED_RECORD_TYPE
      ? RoutingErrorCode.RECORD_TYPE_UNEXPECTED
      : [RouteState.AMBIGUOUS, RouteState.RECORD_IDENTITY_MISMATCH].includes(current.routeState)
        ? RoutingErrorCode.AMBIGUOUS
        : defaultCode;
  return routingControlError(code, `${action} refused the observed routing state ${current.routeState}.`, current.evidence);
}

function assertProviderRoutingTarget(value, config) {
  if (normalizeDnsTarget(value, "routingTarget") !== config.providerTarget) {
    throw routingControlError(RoutingErrorCode.IDENTITY_MISMATCH, "routingTarget does not match the configured provider target role.", safeEvidence({
      expectedTargetRole: "provider", observedTargetRole: classifyTargetRole(value, config),
    }));
  }
}

function normalizeConfiguration({ zone, leafFqdn, windowsTarget, providerTarget, expectedTtl }) {
  const normalizedZone = normalizeDnsName(zone, "zone");
  const normalizedLeaf = normalizeDnsName(leafFqdn, "leafFqdn");
  if (normalizedLeaf === normalizedZone || !normalizedLeaf.endsWith(`.${normalizedZone}`)) {
    throw new Error("leafFqdn must be a non-apex name inside the configured zone.");
  }
  const windows = normalizeDnsTarget(windowsTarget, "windowsTarget");
  const provider = normalizeDnsTarget(providerTarget, "providerTarget");
  if (windows === provider) throw new Error("windowsTarget and providerTarget must be distinct.");
  if (!Number.isInteger(expectedTtl) || expectedTtl < 30 || expectedTtl > 604_800) {
    throw new Error("expectedTtl must be an integer from 30 through 604800 seconds.");
  }
  return Object.freeze({
    zone: normalizedZone,
    leafFqdn: normalizedLeaf,
    relativeRecordName: normalizedLeaf.slice(0, -(normalizedZone.length + 1)),
    windowsTarget: windows,
    providerTarget: provider,
    expectedTtl,
  });
}

function normalizeDnsName(value, field) {
  const candidate = String(value ?? "").trim().toLowerCase().replace(/\.$/, "");
  if (!candidate || candidate.length > 253 || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(candidate)) {
    throw new Error(`${field} must be a valid DNS name.`);
  }
  return candidate;
}

function normalizeDnsTarget(value, field) {
  const candidate = String(value ?? "").trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate) || /[/?#@]/.test(candidate)) {
    throw new Error(`${field} must be a DNS target without a scheme, path, query, fragment, or credentials.`);
  }
  return normalizeDnsName(candidate, field);
}

function recordNameMatches(value, config) {
  const candidate = String(value ?? "").trim().toLowerCase().replace(/\.$/, "");
  return candidate === config.leafFqdn || candidate === config.relativeRecordName;
}

function classifyTargetRole(value, config) {
  let target;
  try { target = normalizeDnsTarget(value, "record.data"); } catch { return "unexpected"; }
  if (target === config.windowsTarget) return "windows";
  if (target === config.providerTarget) return "provider";
  return "unexpected";
}

function normalizeOperationIdentity(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("operationIdentity must be an object.");
  const operationId = required(value.operationId, "operationIdentity.operationId");
  return Object.freeze({
    operationId,
    ...(value.commandId == null ? {} : { commandId: required(value.commandId, "operationIdentity.commandId") }),
  });
}

function assertClient(client) {
  for (const method of ["getDomain", "listDomainRecords", "updateDomainRecord"]) {
    if (typeof client?.[method] !== "function") throw new Error(`DigitalOcean routing requires client.${method}.`);
  }
}

function assertReconciler(reconciler) {
  if (typeof reconciler?.execute !== "function") throw new Error("DigitalOcean routing requires a mutation reconciler.");
}

function safeEvidence(value) {
  return freeze(redactProviderEvidence(value));
}

function required(value, field) {
  const candidate = String(value ?? "").trim();
  if (!candidate) throw new Error(`${field} is required.`);
  return candidate;
}

function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function freeze(value) {
  return Object.freeze(value);
}
