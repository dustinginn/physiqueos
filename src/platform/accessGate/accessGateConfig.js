// Temporary migration-security scaffolding (see docs/COMBINED_APP_PLATFORM_AND_PERSISTENCE_CUTOVER.md).
// Not the future Native V1 Founder authentication architecture - this exists
// solely to prevent real Founder data from being publicly reachable on the
// provider deployment during and after cutover, until real auth is built.

const MINIMUM_SECRET_LENGTH = 32;

// The gate activates under exactly the same flag that already distinguishes
// provider/full-runtime behavior everywhere else in this codebase (see
// next.config.mjs's webpack fixture-swap and the media routes' own gating).
// Deliberately not a second, separately-forgettable "enabled" flag: any
// deployment that turns on the provider runtime automatically expects this
// gate, and if its secret is absent that deployment must fail closed, not
// silently run ungated.
export function isAccessGateExpected(env = process.env) {
  return env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME === "1";
}

export function readAccessGateSecret(env = process.env) {
  const secret = String(env.PHYSIQUEOS_ACCESS_GATE_SECRET ?? "").trim();
  return secret.length >= MINIMUM_SECRET_LENGTH ? secret : null;
}

export function getAccessGateStatus(env = process.env) {
  const expected = isAccessGateExpected(env);
  const configured = expected ? readAccessGateSecret(env) !== null : true;
  return Object.freeze({ expected, configured, ready: !expected || configured });
}

export { MINIMUM_SECRET_LENGTH };
