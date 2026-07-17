import fs from "node:fs";
import { describe, expect, it } from "vitest";
const source = fs.readFileSync(new URL("./MorningCheckInScreen.jsx", import.meta.url), "utf8");
describe("focused Morning Check-In", () => {
  it("keeps the 393px fast numeric workflow", () => { expect(source).toContain("max-w-[393px]"); expect(source).toContain('inputMode="decimal"'); expect(source).toContain('step="0.1"'); expect(source).toContain("Save Weight"); expect(source).toContain("pb-32"); expect(source).toContain("overflow-x-hidden"); });
  it("blocks repeat submission and excludes universal intake controls", () => { expect(source).toContain("useFormStatus"); expect(source).toContain("disabled={pending}"); expect(source).not.toMatch(/file upload|evidence type|evidenceNote|Quick Actions|supplements|Quick Notes/i); });
  it("explains same-day correction behavior", () => { expect(source).toMatch(/already exists for today.*correct today’s entry.*same value will make no change/s); });
});
