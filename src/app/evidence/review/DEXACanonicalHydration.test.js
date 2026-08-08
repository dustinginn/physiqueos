import fs from "node:fs";
import { describe, expect, it } from "vitest";
const source = fs.readFileSync(new URL("./[reviewId]/actions.js", import.meta.url), "utf8");
const adapter = fs.readFileSync(new URL("../../../domain/services/DEXAReadModelAdapter.js", import.meta.url), "utf8");
describe("confirmed DEXA canonical read-model hydration", () => {
  it("uses one validated top-level canonical-to-read-model adapter", () => { expect(source).toContain("toDexaReadModel"); expect(adapter).toContain("assertValidDexaScan"); expect(adapter).not.toContain("object.metadata"); });
  it("uses the dedicated idempotent DEXA Event service", () => { expect(source).toContain("createFounderDEXAEventNarrativeService"); expect(source).toContain(".generate({ userId: user.id, scanId: canonicalId })"); });
});
