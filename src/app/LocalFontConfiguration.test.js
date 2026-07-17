import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const layout = readFileSync(new URL("./layout.js", import.meta.url), "utf8");
const globals = readFileSync(new URL("./globals.css", import.meta.url), "utf8");

describe("deterministic Plus Jakarta Sans configuration", () => {
  it("uses the bundled variable font through next/font/local", () => {
    expect(layout).toContain('import localFont from "next/font/local"');
    expect(layout).toContain("plus-jakarta-sans-latin-wght-normal.woff2");
    expect(layout).toContain('variable: "--font-sans"');
    expect(layout).toContain('weight: "200 800"');
    expect(layout).toContain('style: "normal"');
    expect(layout).not.toContain("next/font/google");
  });

  it("preserves the global font contract and maps black to the real maximum weight", () => {
    expect(globals).toContain("font-family: var(--font-sans)");
    expect(globals).toContain("--font-weight-black: 800");
  });
});
