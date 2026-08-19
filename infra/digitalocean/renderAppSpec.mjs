import fs from "node:fs/promises";
import path from "node:path";
import { isFounderOwnerIdentifier } from "../../src/platform/identity/founderOwnerIdentity.js";

const variant = process.env.PHYSIQUEOS_APP_SPEC_VARIANT === "product" ? "product" : "foundation";
const templatePath = path.join(import.meta.dirname, variant === "product" ? "app.product.template.yaml" : "app.template.yaml");
const outputPath = path.join(import.meta.dirname, variant === "product" ? "app.product.staging.yaml" : "app.staging.yaml");
const streamToStdout = process.env.PHYSIQUEOS_APP_SPEC_OUTPUT === "-";
const templateSource = await fs.readFile(templatePath, "utf8");
const required = [...new Set([...templateSource.matchAll(/\$\{([A-Z0-9_]+)\}/g)].map((match) => match[1]))];
const missing = required.filter((key) => !String(process.env[key] ?? "").trim());
if (missing.length > 0) throw new Error(`Missing app-spec inputs: ${missing.join(", ")}`);

// A provider-compatibility rendering must never silently inherit a Founder-owner identity from
// whatever happens to be set in the operator's shell. This is deliberately checked here - the one
// place every rendered spec (foundation or product variant) passes through - rather than trusted to
// be caught later by the deployed app's own runtime guard, so a misconfigured render never even
// produces a spec that could be deployed.
if (String(process.env.PROVIDER_COMPATIBILITY_MODE ?? "") === "1" && isFounderOwnerIdentifier(process.env.CANONICAL_OWNER_USER_ID)) {
  throw new Error("Refusing to render a provider-compatibility app spec with a Founder-owner CANONICAL_OWNER_USER_ID.");
}

let template = templateSource;
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
