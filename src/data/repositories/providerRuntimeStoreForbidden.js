const FORBIDDEN_CODE = "PROVIDER_LEGACY_RUNTIME_FORBIDDEN";

export function createFounderRuntimeStore(persisted = {}) {
  return structuredClone(persisted);
}

export function getFounderRuntimeStore() {
  if (process.env.NEXT_PHASE === "phase-production-build") return emptyBuildStore();
  throw forbidden("read");
}

export function persistFounderRuntimeStore() {
  throw forbidden("write");
}

export function resolveFounderRuntimeStorePath() {
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return "/tmp/physiqueos-provider-build-store.json";
  }
  throw forbidden("path resolution");
}

export function mergeRuntimeStoreForPersistence({ incoming = {} } = {}) {
  return structuredClone(incoming);
}

function forbidden(operation) {
  const error = new Error(`Provider full runtime forbids legacy Founder JSON ${operation}.`);
  error.code = FORBIDDEN_CODE;
  return error;
}

function emptyBuildStore() {
  return {
    user: null,
    goals: [],
    weightEntries: [],
    dexaScans: [],
    protocols: [],
    milestones: [],
    dailyCheckIns: [],
    analyses: [],
  };
}
