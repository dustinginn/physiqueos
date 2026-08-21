export const PHASE7B_PRODUCTION_APP_ID = "bf57cf56-48cc-4cd6-90e4-a23ee5381741";
export const PHASE7B_WEB_COMPONENT = "web";
export const PHASE7B_WORKER_COMPONENT = "worker";
export const PHASE7B_ROUTING_ZONE = "cutover.dustinginn.com";
export const PHASE7B_ROUTING_LEAF = "app.cutover.dustinginn.com";
export const PHASE7B_ROUTING_RECORD_TYPE = "CNAME";
export const PHASE7B_ROUTING_TTL = 60;

/** Loads only non-secret, exact production identities. Credentials stay at their transport edges. */
export function loadPhase7BProductionConfiguration({ env = process.env, expectedEnvironment } = {}) {
  if (!env || typeof env !== "object" || Array.isArray(env)) throw configError("PHASE7B_CONFIG_ENV_INVALID", "Phase 7B configuration requires an environment mapping.");
  const environment = exact(env.PHYSIQUEOS_PHASE7B_ENVIRONMENT, expectedEnvironment, "environment");
  const appId = exact(env.PHYSIQUEOS_PHASE7B_APP_ID, PHASE7B_PRODUCTION_APP_ID, "App ID");
  const webComponent = exact(env.PHYSIQUEOS_PHASE7B_WEB_COMPONENT, PHASE7B_WEB_COMPONENT, "web component");
  const workerComponent = exact(env.PHYSIQUEOS_PHASE7B_WORKER_COMPONENT, PHASE7B_WORKER_COMPONENT, "worker component");
  const routingZone = exactHostname(env.PHYSIQUEOS_PHASE7B_ROUTING_ZONE, PHASE7B_ROUTING_ZONE, "routing zone");
  const routingLeaf = exactHostname(env.PHYSIQUEOS_PHASE7B_ROUTING_LEAF, PHASE7B_ROUTING_LEAF, "routing leaf");
  const routingRecordType = exact(env.PHYSIQUEOS_PHASE7B_ROUTING_RECORD_TYPE, PHASE7B_ROUTING_RECORD_TYPE, "routing record type");
  const routingTtl = exactInteger(env.PHYSIQUEOS_PHASE7B_ROUTING_TTL, PHASE7B_ROUTING_TTL, "routing TTL");
  const providerDeploymentId = uuid(env.PHYSIQUEOS_PHASE7B_PROVIDER_DEPLOYMENT_ID, "provider deployment ID");
  const providerBuildId = identity(env.PHYSIQUEOS_PHASE7B_PROVIDER_BUILD_ID, "provider build ID");
  const providerSourceCommit = sha(env.PHYSIQUEOS_PHASE7B_PROVIDER_SOURCE_COMMIT, "provider source commit");
  const ownerUserId = identity(env.PHYSIQUEOS_PHASE7B_CANONICAL_OWNER_USER_ID, "canonical owner user ID");
  const windowsRoutingTarget = hostname(env.PHYSIQUEOS_PHASE7B_WINDOWS_ROUTING_TARGET, "Windows routing target");
  const providerRoutingTarget = hostname(env.PHYSIQUEOS_PHASE7B_PROVIDER_ROUTING_TARGET, "provider routing target");

  if (windowsRoutingTarget === providerRoutingTarget) throw configError("PHASE7B_CONFIG_TARGET_AMBIGUOUS", "Windows and provider routing targets must differ.");
  if ([routingZone, routingLeaf].includes(windowsRoutingTarget) || [routingZone, routingLeaf].includes(providerRoutingTarget)) {
    throw configError("PHASE7B_CONFIG_TARGET_AMBIGUOUS", "Routing targets cannot be the delegated zone or public routing leaf.");
  }
  if (windowsRoutingTarget.endsWith(".ngrok-free.dev")) {
    throw configError("PHASE7B_CONFIG_WINDOWS_EDGE_UNSUPPORTED", "The free ngrok edge cannot satisfy the Founder-owned custom-domain/TLS contract.");
  }
  if (env.PHYSIQUEOS_PHASE7B_WINDOWS_EDGE_CUSTOM_DOMAIN_READY !== "1") {
    throw configError("PHASE7B_CONFIG_WINDOWS_EDGE_UNPROVEN", "The Windows edge must be explicitly proven custom-domain/TLS/SNI capable.");
  }
  if (env.PHYSIQUEOS_PHASE7B_PROVIDER_CUSTOM_DOMAIN_READY !== "1") {
    throw configError("PHASE7B_CONFIG_PROVIDER_DOMAIN_UNPROVEN", "The provider App custom domain and certificate must be explicitly proven ready.");
  }

  return deepFreeze({
    schemaVersion: 1,
    environment,
    canonicalOwnerUserId: ownerUserId,
    provider: {
      appId,
      deploymentId: providerDeploymentId,
      buildId: providerBuildId,
      sourceCommit: providerSourceCommit,
      webComponent,
      workerComponent,
      customDomainReady: true,
    },
    routing: {
      parentDomain: "dustinginn.com",
      delegatedZone: routingZone,
      publicLeaf: routingLeaf,
      recordType: routingRecordType,
      ttl: routingTtl,
      windowsTarget: windowsRoutingTarget,
      providerTarget: providerRoutingTarget,
      windowsCustomDomainReady: true,
      providerCustomDomainReady: true,
    },
  });
}

function exact(value, expected, field) {
  const candidate = required(value, field);
  const exactExpected = required(expected, `expected ${field}`);
  if (candidate !== exactExpected) throw configError("PHASE7B_CONFIG_IDENTITY_MISMATCH", `Phase 7B ${field} is not the accepted exact value.`);
  return candidate;
}

function exactHostname(value, expected, field) {
  const candidate = hostname(value, field);
  if (candidate !== expected) throw configError("PHASE7B_CONFIG_IDENTITY_MISMATCH", `Phase 7B ${field} is not the accepted exact hostname.`);
  return candidate;
}

function hostname(value, field) {
  const candidate = required(value, field);
  if (candidate !== candidate.toLowerCase() || candidate.length > 253 || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(candidate)) {
    throw configError("PHASE7B_CONFIG_HOSTNAME_INVALID", `Phase 7B ${field} must be one exact lowercase DNS hostname.`);
  }
  return candidate;
}

function exactInteger(value, expected, field) {
  if (!/^\d+$/.test(String(value ?? "")) || Number(value) !== expected) throw configError("PHASE7B_CONFIG_VALUE_INVALID", `Phase 7B ${field} is invalid.`);
  return expected;
}

function uuid(value, field) {
  const candidate = required(value, field);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)) {
    throw configError("PHASE7B_CONFIG_IDENTITY_INVALID", `Phase 7B ${field} is invalid.`);
  }
  return candidate.toLowerCase();
}

function sha(value, field) {
  const candidate = required(value, field).toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(candidate)) throw configError("PHASE7B_CONFIG_IDENTITY_INVALID", `Phase 7B ${field} is invalid.`);
  return candidate;
}

function identity(value, field) {
  const candidate = required(value, field);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(candidate)) throw configError("PHASE7B_CONFIG_IDENTITY_INVALID", `Phase 7B ${field} is invalid.`);
  return candidate;
}

function required(value, field) {
  if (typeof value !== "string" || value !== value.trim() || !value) throw configError("PHASE7B_CONFIG_VALUE_MISSING", `Phase 7B ${field} is required without surrounding whitespace.`);
  return value;
}

function configError(code, message) {
  return Object.assign(new Error(message), { code });
}

function deepFreeze(value) {
  if (!value || typeof value !== "object") return value;
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, deepFreeze(entry)])));
}
