import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { auditEmbeddedRepositories } from "./auditEmbeddedRepositories.mjs";

export function evaluateBackupCompleteness({ repositoryRoot, policyPath, env = process.env }) {
  const policy = JSON.parse(fs.readFileSync(policyPath, "utf8"));
  const nestedAudit = auditEmbeddedRepositories({ repositoryRoot, policyPath });
  const violations = [...nestedAudit.violations];
  const externalArtifacts = (policy.externalArtifacts ?? []).map((artifact) => {
    const configuredPath = artifact.manifestPath ??
      (artifact.manifestPathEnvironmentVariable ? env[artifact.manifestPathEnvironmentVariable] : null);
    if (!configuredPath) {
      if (artifact.requiredForSourceRecovery) {
        violations.push(`${artifact.id}: required external preservation manifest path is not configured`);
      }
      return {
        ...artifact,
        manifestPath: null,
        actualSha256: null,
        verificationStatus: artifact.requiredForSourceRecovery ? "missing_required" : "reference_only_not_required",
      };
    }
    const resolvedPath = path.resolve(configuredPath);
    if (!fs.existsSync(resolvedPath)) {
      if (artifact.requiredForSourceRecovery) violations.push(`${artifact.id}: required external preservation manifest is missing: ${resolvedPath}`);
      return { ...artifact, manifestPath: resolvedPath, actualSha256: null, verificationStatus: artifact.requiredForSourceRecovery ? "missing_required" : "optional_missing" };
    }
    const actualSha256 = crypto.createHash("sha256").update(fs.readFileSync(resolvedPath)).digest("hex").toUpperCase();
    const expectedSha256 = String(artifact.manifestSha256).toUpperCase();
    if (actualSha256 !== expectedSha256) {
      violations.push(`${artifact.id}: external preservation manifest hash mismatch`);
    }
    return { ...artifact, manifestPath: resolvedPath, actualSha256, verificationStatus: actualSha256 === expectedSha256 ? "verified" : "hash_mismatch" };
  });
  return {
    schemaVersion: "physiqueos_backup_completeness_v1",
    evaluatedAtUtc: new Date().toISOString(),
    nestedAudit,
    externalArtifacts,
    violations,
    passed: violations.length === 0,
  };
}

function parseArguments(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) result[argv[index]] = argv[index + 1];
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const repositoryRoot = path.resolve(options["--repository-root"] ?? process.cwd());
    const policyPath = path.resolve(options["--policy"] ?? path.join(repositoryRoot, "config/embedded-repository-policy.json"));
    const report = evaluateBackupCompleteness({ repositoryRoot, policyPath });
    const serialized = `${JSON.stringify(report, null, 2)}\n`;
    if (options["--output"]) fs.writeFileSync(path.resolve(options["--output"]), serialized, "utf8");
    process.stdout.write(`${JSON.stringify({ passed: report.passed, repositoryCount: report.nestedAudit.repositoryCount, externalArtifacts: report.externalArtifacts.map(({ id, verificationStatus }) => ({ id, verificationStatus })), violations: report.violations }, null, 2)}\n`);
    process.exitCode = report.passed ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  }
}
