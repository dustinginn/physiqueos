import fs from "node:fs";
import { describe, expect, it } from "vitest";

const config = fs.readFileSync(new URL("../../../../next.config.mjs", import.meta.url), "utf8");

describe("PhysiqueOS upload request ceiling", () => {
  it("uses one bounded 50 MB ceiling for proxy and Server Action uploads", () => {
    expect(config).toContain('const uploadBodySizeLimit = "50mb"');
    expect(config).toContain("proxyClientMaxBodySize: uploadBodySizeLimit");
    expect(config).toContain("bodySizeLimit: uploadBodySizeLimit");
    expect(config).not.toMatch(/proxyClientMaxBodySize:\s*(?:true|Infinity|undefined|null)/);
  });
});
