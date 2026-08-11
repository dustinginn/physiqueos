import fs from "node:fs/promises";
import path from "node:path";

const templatePath = path.join(import.meta.dirname, "app.template.yaml");
const outputPath = path.join(import.meta.dirname, "app.staging.yaml");
const required = ["DIGITALOCEAN_REGION", "GITHUB_REPOSITORY", "GITHUB_BRANCH", "FOUNDATION_DATABASE_URL", "SPACES_ENDPOINT", "SPACES_BUCKET", "SPACES_ACCESS_KEY_ID", "SPACES_SECRET_ACCESS_KEY", "CREDENTIAL_PEPPER", "BUILD_ID"];
const missing = required.filter((key) => !String(process.env[key] ?? "").trim());
if (missing.length > 0) throw new Error(`Missing app-spec inputs: ${missing.join(", ")}`);
let template = await fs.readFile(templatePath, "utf8");
for (const key of required) template = template.replaceAll(`\${${key}}`, yamlScalar(process.env[key]));
if (/\$\{[A-Z0-9_]+\}/.test(template)) throw new Error("The rendered app spec still contains unresolved variables.");
await fs.writeFile(outputPath, template, { encoding: "utf8", flag: "wx" });
process.stdout.write(`Rendered ${outputPath}. It contains secrets: do not commit it, and delete it after the bounded deployment command.\n`);

function yamlScalar(value) {
  return JSON.stringify(String(value));
}
