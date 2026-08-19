import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PROVIDER_MIDDLEWARE_ARTIFACT_ERROR, verifyProviderMiddlewareArtifact } from "./verifyProviderMiddlewareArtifact.mjs";

const temporaryRoots = [];
afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

const LIVE_DEPLOYED_EMPTY_MANIFEST = {
  version: 3,
  middleware: {},
  functions: {},
  sortedMiddleware: [],
};

function validManifest(overrides = {}) {
  return {
    version: 3,
    middleware: {
      "/": {
        files: ["server/edge-runtime-webpack.js", "server/src/middleware.js"],
        entrypoint: "server/src/middleware.js",
        name: "src/middleware",
        page: "/",
        matchers: [
          {
            regexp: "^(?:\\/(_next\\/data\\/[^/]{1,}))?(?:\\/((?!_next\\/static|favicon\\.ico).*))(\\.json|\\.rsc|\\.segments\\/.+\\.segment\\.rsc)?[\\/#\\?]?$",
            originalSource: "/((?!_next/static|favicon\\.ico).*)",
          },
        ],
        wasm: [],
        assets: [],
        env: { __NEXT_BUILD_ID: "test-build-id" },
        ...overrides.rootEntryOverrides,
      },
    },
    functions: {},
    sortedMiddleware: ["/"],
    ...overrides.manifestOverrides,
  };
}

describe("provider middleware artifact acceptance gate", () => {
  it("is wired into the provider product build immediately after the build completes", () => {
    const dockerfile = readFileSync(path.join(process.cwd(), "Dockerfile.product"), "utf8");
    expect(dockerfile).toContain("node scripts/verifyProviderMiddlewareArtifact.mjs");
    expect(dockerfile).toMatch(/test -f src\/middleware\.js/);
  });

  it("accepts a representative valid Next.js 16 `--webpack` middleware manifest/artifact shape", async () => {
    const root = await fixture({
      "server/middleware-manifest.json": JSON.stringify(validManifest()),
      "server/src/middleware.js": "// compiled middleware bundle",
      "server/edge-runtime-webpack.js": "// edge runtime chunk",
    });
    await expect(Promise.resolve(verifyProviderMiddlewareArtifact({ nextDir: root }))).resolves.toMatchObject({
      status: "PASS",
      entrypoint: "server/src/middleware.js",
      matcherCount: 1,
    });
  });

  it("rejects a missing middleware-manifest.json", async () => {
    const root = await fixture({ "server/src/middleware.js": "// compiled middleware bundle" });
    expect(() => verifyProviderMiddlewareArtifact({ nextDir: root }))
      .toThrow(expect.objectContaining({ code: PROVIDER_MIDDLEWARE_ARTIFACT_ERROR.MANIFEST_MISSING }));
  });

  it("rejects a manifest that is not valid JSON", async () => {
    const root = await fixture({ "server/middleware-manifest.json": "{not valid json" });
    expect(() => verifyProviderMiddlewareArtifact({ nextDir: root }))
      .toThrow(expect.objectContaining({ code: PROVIDER_MIDDLEWARE_ARTIFACT_ERROR.MANIFEST_PARSE_FAILED }));
  });

  it("rejects the exact empty-middleware shape observed on the live deployed image", async () => {
    const root = await fixture({ "server/middleware-manifest.json": JSON.stringify(LIVE_DEPLOYED_EMPTY_MANIFEST) });
    expect(() => verifyProviderMiddlewareArtifact({ nextDir: root }))
      .toThrow(expect.objectContaining({ code: PROVIDER_MIDDLEWARE_ARTIFACT_ERROR.ROOT_ENTRY_MISSING }));
  });

  it("rejects a manifest missing the root (\"/\") middleware entry even if other entries exist", async () => {
    const manifest = { version: 3, middleware: { "/api/other": { matchers: [{ regexp: "^/api/other$" }] } }, functions: {}, sortedMiddleware: ["/api/other"] };
    const root = await fixture({ "server/middleware-manifest.json": JSON.stringify(manifest) });
    expect(() => verifyProviderMiddlewareArtifact({ nextDir: root }))
      .toThrow(expect.objectContaining({ code: PROVIDER_MIDDLEWARE_ARTIFACT_ERROR.ROOT_ENTRY_MISSING }));
  });

  it("rejects a root middleware entry with empty matchers", async () => {
    const root = await fixture({
      "server/middleware-manifest.json": JSON.stringify(validManifest({ rootEntryOverrides: { matchers: [] } })),
      "server/src/middleware.js": "// compiled middleware bundle",
    });
    expect(() => verifyProviderMiddlewareArtifact({ nextDir: root }))
      .toThrow(expect.objectContaining({ code: PROVIDER_MIDDLEWARE_ARTIFACT_ERROR.MATCHERS_EMPTY }));
  });

  it("rejects a root middleware entry with no matchers field at all", async () => {
    const manifest = validManifest();
    delete manifest.middleware["/"].matchers;
    const root = await fixture({
      "server/middleware-manifest.json": JSON.stringify(manifest),
      "server/src/middleware.js": "// compiled middleware bundle",
    });
    expect(() => verifyProviderMiddlewareArtifact({ nextDir: root }))
      .toThrow(expect.objectContaining({ code: PROVIDER_MIDDLEWARE_ARTIFACT_ERROR.MATCHERS_EMPTY }));
  });

  it("rejects a root middleware entry with no entrypoint reference", async () => {
    const manifest = validManifest();
    delete manifest.middleware["/"].entrypoint;
    const root = await fixture({
      "server/middleware-manifest.json": JSON.stringify(manifest),
      "server/src/middleware.js": "// compiled middleware bundle",
    });
    expect(() => verifyProviderMiddlewareArtifact({ nextDir: root }))
      .toThrow(expect.objectContaining({ code: PROVIDER_MIDDLEWARE_ARTIFACT_ERROR.ENTRYPOINT_MISSING }));
  });

  it("rejects a manifest that references a compiled middleware file that does not exist on disk", async () => {
    const root = await fixture({
      "server/middleware-manifest.json": JSON.stringify(validManifest()),
      // server/src/middleware.js deliberately not written
    });
    expect(() => verifyProviderMiddlewareArtifact({ nextDir: root }))
      .toThrow(expect.objectContaining({ code: PROVIDER_MIDDLEWARE_ARTIFACT_ERROR.ARTIFACT_MISSING }));
  });

  it("rejects a build whose manifest points elsewhere but the known contract path is absent", async () => {
    const manifest = validManifest({ rootEntryOverrides: { entrypoint: "server/src/other-middleware.js", files: ["server/src/other-middleware.js"] } });
    const root = await fixture({
      "server/middleware-manifest.json": JSON.stringify(manifest),
      "server/src/other-middleware.js": "// compiled middleware bundle under a different name",
    });
    expect(() => verifyProviderMiddlewareArtifact({ nextDir: root }))
      .toThrow(expect.objectContaining({ code: PROVIDER_MIDDLEWARE_ARTIFACT_ERROR.KNOWN_PATH_MISSING }));
  });
});

async function fixture(files) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "provider-middleware-artifact-"));
  temporaryRoots.push(root);
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(root, relativePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, contents);
  }
  return root;
}
