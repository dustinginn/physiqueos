import { createSpacesBucketProvisioner } from "../src/platform/object-storage/SpacesBucketProvisioner.js";

const config = Object.freeze({
  region: required("PHYSIQUEOS_SPACES_REGION"),
  endpoint: required("PHYSIQUEOS_SPACES_ENDPOINT"),
  bucket: required("PHYSIQUEOS_SPACES_BUCKET"),
  accessKeyId: required("PHYSIQUEOS_SPACES_ACCESS_KEY_ID"),
  secretAccessKey: required("PHYSIQUEOS_SPACES_SECRET_ACCESS_KEY"),
});
const provisioner = createSpacesBucketProvisioner(config);
try {
  const result = process.argv[2] === "verify" ? await provisioner.verify() : await provisioner.create();
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  provisioner.close();
}

function required(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
