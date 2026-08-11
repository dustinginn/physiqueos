export function readBuildIdentity(env = process.env) {
  return Object.freeze({
    application: "physiqueos",
    applicationVersion: String(env.npm_package_version ?? "0.1.0"),
    buildId: String(env.PHYSIQUEOS_BUILD_ID ?? "development"),
    gitSha: normalizeOptional(env.PHYSIQUEOS_GIT_SHA),
    apiVersion: "v1",
    contractVersion: "1",
  });
}

function normalizeOptional(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}
