import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { GET } from "./route";

describe("/api/health", () => {
  it("returns a non-sensitive ok payload", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(body.buildId ?? null).not.toBe("");
    expect(body.gitHead ?? null).not.toBe("");
    expect(body.runtimeMode).toBeDefined();
    expect(JSON.stringify(body)).not.toMatch(/password|secret|token|Founder/i);
  });

  it("reads build identity from the configured isolated dist directory", async () => {
    const directory = fs.mkdtempSync(path.join(process.cwd(), ".tmp-health-dist-"));
    const previous = process.env.PHYSIQUEOS_BUILD_DIST_DIR;
    fs.writeFileSync(path.join(directory, "BUILD_ID"), "isolated-build\n");
    fs.writeFileSync(path.join(directory, "SOURCE_COMMIT"), "isolated-source\n");
    process.env.PHYSIQUEOS_BUILD_DIST_DIR = path.relative(process.cwd(), directory);

    try {
      const response = await GET();
      expect(await response.json()).toMatchObject({ buildId: "isolated-build", gitHead: "isolated-source" });
    } finally {
      if (previous === undefined) delete process.env.PHYSIQUEOS_BUILD_DIST_DIR;
      else process.env.PHYSIQUEOS_BUILD_DIST_DIR = previous;
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
