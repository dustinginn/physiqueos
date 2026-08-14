import fs from "node:fs/promises";
import path from "node:path";

const templatePath = path.join(import.meta.dirname, "app.template.yaml");
const outputPath = path.join(import.meta.dirname, "app.staging.yaml");
const streamToStdout = process.env.PHYSIQUEOS_APP_SPEC_OUTPUT === "-";
const required = ["DIGITALOCEAN_REGION", "GIT_REPOSITORY_URL", "GIT_BRANCH", "FOUNDATION_DATABASE_URL", "MIGRATION_DATABASE_URL", "DATABASE_CA_CERT", "SPACES_REGION", "SPACES_ENDPOINT", "SPACES_BUCKET", "SPACES_ACCESS_KEY_ID", "SPACES_SECRET_ACCESS_KEY", "CREDENTIAL_PEPPER", "OPERATIONS_TOKEN", "DATABASE_READ_TOKEN", "DATABASE_CLUSTER_ID", "CANONICAL_OWNER_USER_ID", "MIGRATION_RECOVERY_SHA256", "MIGRATION_CONTROL_SHA256", "MIGRATION_OPERATOR_ID", "EXPECTED_PRODUCTION_SOURCE_COMMIT", "EXPECTED_PRODUCTION_BUILD_ID", "EXPECTED_FOUNDER_REVISION", "EXPECTED_FOUNDER_SHA256", "EXPECTED_MEDIA_COUNT", "EXPECTED_MEDIA_BYTES", "EXPECTED_MEDIA_INVENTORY_SHA256", "EXPECTED_ROLLBACK_SOURCE_COMMIT", "EXPECTED_ROLLBACK_BUILD_ID", "BUILD_ID", "GIT_SHA", "WORKER_ID"];
const missing = required.filter((key) => !String(process.env[key] ?? "").trim());
if (missing.length > 0) throw new Error(`Missing app-spec inputs: ${missing.join(", ")}`);
let template = await fs.readFile(templatePath, "utf8");
for (const key of required) template = template.replaceAll(`\${${key}}`, yamlScalar(process.env[key]));
if (/\$\{[A-Z0-9_]+\}/.test(template)) throw new Error("The rendered app spec still contains unresolved variables.");
if (streamToStdout) {
  process.stdout.write(template);
} else {
  await fs.writeFile(outputPath, template, { encoding: "utf8", flag: "wx" });
  process.stdout.write(`Rendered ${outputPath}. It contains secrets: do not commit it, and delete it after the bounded deployment command.\n`);
}

function yamlScalar(value) {
  return JSON.stringify(String(value));
}
