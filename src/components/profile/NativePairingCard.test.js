import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("NativePairingCard", () => {
  const source = fs.readFileSync(new URL("./NativePairingCard.jsx", import.meta.url), "utf8");

  it("keeps pairing explicit, short-lived, one-time, and Founder-web initiated", () => {
    expect(source).toContain("Pair Native Device");
    expect(source).toContain("Generate Pairing Code");
    expect(source).toContain("expires in 10 minutes");
    expect(source).toContain("cannot be used twice");
    expect(source).toContain('/api/v1/native/auth/pairing-credentials');
  });

  it("does not persist or log the raw pairing credential", () => {
    expect(source).not.toMatch(/localStorage|sessionStorage|console\.|indexedDB/);
  });
});
