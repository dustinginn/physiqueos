import fs from "node:fs";
import path from "node:path";
import { projectRoot } from "./operationsPaths.mjs";

const GENERATED_ROOT_PATTERNS = [
  /^controlled-restart.*\.log$/i,
  /^daily-briefing-lifecycle-.*\.log$/i,
  /^final-controlled-restart.*\.log$/i,
  /^final-restoration.*\.log$/i,
  /^founder-alpha-resume.*\.log$/i,
  /^log-evidence-cleanup.*\.log$/i,
  /^pending-review-reprocess.*\.log$/i,
  /^tmp-.*\.log$/i,
  /^debug\.log$/i,
  /^storybook\.log$/i,
];

const offenders = fs.readdirSync(projectRoot, { withFileTypes: true })
  .filter((entry) => entry.isFile() && GENERATED_ROOT_PATTERNS.some((pattern) => pattern.test(entry.name)))
  .map((entry) => entry.name)
  .sort();

if (offenders.length) {
  console.error("Generated operational files found in the repository root:");
  offenders.forEach((name) => console.error(`- ${name}`));
  console.error(`Move them under ${path.relative(projectRoot, path.join(projectRoot, "private", "founder", "logs"))}.`);
  process.exitCode = 1;
} else {
  console.log("Repository root operations check passed.");
}
