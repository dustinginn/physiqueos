import fs from "node:fs/promises";
import path from "node:path";

const variant = process.env.PHYSIQUEOS_APP_SPEC_VARIANT === "product" ? "product" : "foundation";
const templatePath = path.join(import.meta.dirname, variant === "product" ? "app.product.template.yaml" : "app.template.yaml");
const outputPath = path.join(import.meta.dirname, variant === "product" ? "app.product.staging.yaml" : "app.staging.yaml");
const streamToStdout = process.env.PHYSIQUEOS_APP_SPEC_OUTPUT === "-";
const templateSource = await fs.readFile(templatePath, "utf8");
const required = [...new Set([...templateSource.matchAll(/\$\{([A-Z0-9_]+)\}/g)].map((match) => match[1]))];
const missing = required.filter((key) => !String(process.env[key] ?? "").trim());
if (missing.length > 0) throw new Error(`Missing app-spec inputs: ${missing.join(", ")}`);
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
