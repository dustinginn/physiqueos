import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { scanProviderArtifact } from "./scanProviderArtifact.mjs";

const temporaryRoots = [];
afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("provider artifact privacy scanner", () => {
  it("enforces the repository and Docker tmp privacy boundary", () => {
    const repositoryRoot = process.cwd();
    const trackedTmp = execFileSync("git", ["ls-files", "--", "tmp"], { cwd: repositoryRoot, encoding: "utf8" }).trim();
    expect(trackedTmp).toBe("");
    expect(fsSync(".gitignore")).toMatch(/^\/tmp\/$/m);
    expect(fsSync(".dockerignore")).toMatch(/^tmp$/m);
    expect(fsSync("next.config.mjs")).toContain('"tmp/**/*"');
    expect(fsSync("Dockerfile.product")).toContain("node scripts/scanProviderArtifact.mjs");
    expect(fsSync("Dockerfile.provider-worker")).toContain("node scripts/scanProviderArtifact.mjs");
  });

  it("accepts a minimal safe runtime", async () => {
    const root = await fixture({ "server.js": "console.log('safe');", "public/icon.svg": "<svg/>" });
    await expect(scanProviderArtifact({ roots: [root] })).resolves.toMatchObject({ status: "PASS", fileCount: 2 });
  });

  it.each([
    ["tmp/playwright-founder-runtime.json", "{}"],
    [".tmp/database.credential.clixml", "encrypted"],
    ["private/founder/photo.jpg", "private-image"],
    ["screenshots/founder.png", "private-image"],
    ["runtime-store.json", "{}"],
    ["migration-control.json", "{}"],
    ["recovery-packet.zip", "archive"],
    [".env.local", "SECRET=value"],
  ])("rejects forbidden artifact path %s", async (relativePath, contents) => {
    const root = await fixture({ [relativePath]: contents });
    await expect(scanProviderArtifact({ roots: [root] })).rejects.toMatchObject({ code: "PROVIDER_ARTIFACT_PRIVACY_REJECTED" });
  });

  it("rejects credential URIs, supplied secrets, owner identifiers, and production hashes", async () => {
    const owner = "founder-owner-private-identifier";
    const secret = "operations-secret-value";
    const root = await fixture({
      "server.js": `postgresql://user:password@database.invalid/app ${owner} ${secret}`,
      "media.bin": "production-media-bytes",
    });
    const crypto = await import("node:crypto");
    const forbiddenHash = crypto.createHash("sha256").update("production-media-bytes").digest("hex");
    await expect(scanProviderArtifact({
      roots: [root], forbiddenValues: [secret], founderOwnerIdentifiers: [owner], forbiddenSha256: [forbiddenHash],
    })).rejects.toMatchObject({ code: "PROVIDER_ARTIFACT_PRIVACY_REJECTED" });
  });
});

function fsSync(relativePath) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

async function fixture(files) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "provider-artifact-scan-"));
  temporaryRoots.push(root);
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(root, relativePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, contents);
  }
  return root;
}
