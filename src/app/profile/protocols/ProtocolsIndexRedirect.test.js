import fs from "node:fs";
import { describe, expect, it } from "vitest";

const route = fs.readFileSync(new URL("./page.js", import.meta.url), "utf8");

describe("legacy Protocols index", () => {
  it("redirects to the canonical Operating Plan without reading protocol data", () => {
    expect(route).toContain('redirect("/profile/operating-plan")');
    expect(route).not.toContain("ProtocolsHubScreen");
    expect(route).not.toContain("FounderRepositories");
    expect(route).not.toContain("listProtocols");
  });
});
