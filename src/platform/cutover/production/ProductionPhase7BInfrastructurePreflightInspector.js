const CATEGORIES = Object.freeze([
  "backups", "routingZone", "routingLeaf", "windowsTarget", "providerTarget", "customDomains",
  "tlsSni", "deploymentBuild", "routingReadback", "workerControl",
]);

/** Read-only Phase A infrastructure/restore evidence join, bound to exact configured identities. */
export function createProductionPhase7BInfrastructurePreflightInspector({ configuration, inspectors, now = () => new Date(), maximumEvidenceAgeMs = 5 * 60_000 } = {}) {
  const typed = Object.freeze(Object.fromEntries(CATEGORIES.map((name) => [name, requireInspector(inspectors?.[name], name)])));
  if (!configuration?.provider || !configuration?.routing) throw new Error("Infrastructure preflight requires Phase7BProductionConfiguration.");
  if (!Number.isInteger(maximumEvidenceAgeMs) || maximumEvidenceAgeMs < 1_000 || maximumEvidenceAgeMs > 60 * 60_000) throw new Error("Infrastructure preflight evidence age is invalid.");
  return Object.freeze({ inspect });

  async function inspect({ run, input } = {}) {
    const categories = {};
    const failures = [];
    for (const name of CATEGORIES) {
      let result;
      try { result = await typed[name].inspect({ run, input, configuration }); } catch { result = null; }
      const valid = validate(name, result, configuration, input, now(), maximumEvidenceAgeMs);
      categories[name] = valid;
      if (!valid) failures.push(`${name}:evidence-invalid`);
    }
    return Object.freeze({ ready: failures.length === 0, categories: Object.freeze(categories), blockingPreconditions: Object.freeze(failures) });
  }
}

function validate(name, value, config, input, now, maximumAge) {
  if (!value || value.ready !== true || !exactFresh(value.checkedAt, now, maximumAge)) return false;
  const common = value.providerDeploymentId === config.provider.deploymentId && value.providerBuildId === config.provider.buildId;
  return ({
    backups: () => value.windowsEncryptedRestoreVerified === true && value.windowsIndependentReplicaVerified === true && value.postgresManagedBackupCurrent === true && value.postgresIsolatedRestoreVerified === true && value.spacesIndependentRestoreVerified === true && validReference(value.windowsBackupRef) && validReference(value.postgresBackupRef) && validReference(value.spacesBackupRef) && value.windowsHostId === input?.windowsHostId && value.postgresDatabaseClusterId === input?.target?.databaseClusterId && value.postgresDatabaseName === input?.target?.databaseName && value.spacesBucket === input?.target?.spacesBucket && value.spacesPrefix === input?.target?.spacesPrefix,
    routingZone: () => value.zone === config.routing.delegatedZone && value.authoritativeDelegationVerified === true,
    routingLeaf: () => value.leaf === config.routing.publicLeaf && value.recordType === config.routing.recordType && Number(value.ttl) === config.routing.ttl,
    windowsTarget: () => value.target === config.routing.windowsTarget && value.publicHttpsReady === true && value.hostSniReady === true && value.buildIdentityReady === true,
    providerTarget: () => value.target === config.routing.providerTarget && value.publicHttpsReady === true && common,
    customDomains: () => value.windowsCustomDomainReady === true && value.providerCustomDomainReady === true && value.domain === config.routing.publicLeaf,
    tlsSni: () => value.domain === config.routing.publicLeaf && value.windowsTlsSniReady === true && value.providerTlsSniReady === true,
    deploymentBuild: () => common && value.providerSourceCommit === config.provider.sourceCommit,
    routingReadback: () => value.role === "windows" && value.zone === config.routing.delegatedZone && value.leaf === config.routing.publicLeaf && value.target === config.routing.windowsTarget,
    workerControl: () => common && value.providerWorkerId === input?.providerWorkerId && value.providerWorkerStatus === "paused_authority" && value.windowsIdentityReady === true && value.windowsHostId === input?.windowsHostId,
  })[name]();
}
function exactFresh(value, now, maximumAge) { try { const timestamp = new Date(value); return timestamp.toISOString() === value && now instanceof Date && now.getTime() - timestamp.getTime() >= -5_000 && now.getTime() - timestamp.getTime() <= maximumAge; } catch { return false; } }
function validReference(value) { return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9:._/-]{7,255}$/.test(value) && !value.includes(".."); }
function requireInspector(value, name) { if (typeof value?.inspect !== "function") throw new Error(`Infrastructure preflight requires inspectors.${name}.inspect.`); return value; }
