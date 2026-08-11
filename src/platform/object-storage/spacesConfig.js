export function readSpacesConfig(env = process.env) {
  const enabled = env.PHYSIQUEOS_OBJECT_STORAGE_ENABLED === "1";
  const config = {
    enabled,
    region: normalize(env.PHYSIQUEOS_SPACES_REGION),
    endpoint: normalize(env.PHYSIQUEOS_SPACES_ENDPOINT),
    bucket: normalize(env.PHYSIQUEOS_SPACES_BUCKET),
    accessKeyId: normalize(env.PHYSIQUEOS_SPACES_ACCESS_KEY_ID),
    secretAccessKey: normalize(env.PHYSIQUEOS_SPACES_SECRET_ACCESS_KEY),
  };
  if (enabled) {
    for (const key of ["region", "endpoint", "bucket", "accessKeyId", "secretAccessKey"]) {
      if (!config[key]) throw new Error(`PHYSIQUEOS_SPACES_${toEnvironmentSuffix(key)} is required when object storage is enabled.`);
    }
    if (!/^https:\/\//.test(config.endpoint)) throw new Error("The Spaces endpoint must use HTTPS.");
  }
  return Object.freeze(config);
}

function normalize(value) { return String(value ?? "").trim() || null; }
function toEnvironmentSuffix(key) { return key.replace(/[A-Z]/g, (value) => `_${value}`).toUpperCase(); }
