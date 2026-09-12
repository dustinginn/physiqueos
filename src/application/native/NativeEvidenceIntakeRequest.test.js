import { describe, expect, it } from "vitest";
import { parseNativeEvidenceIntakeRequest } from "./NativeEvidenceIntakeRequest.js";

const ID = "01999999-9999-7999-8999-999999999999";

describe("Native production Evidence intake", () => {
  it("accepts an exact BodySpec PDF submission identity", async () => {
    const file = new File([Buffer.from("%PDF-1.7\nbody")], "BodySpec.pdf", { type: "application/pdf" });
    const result = await parseNativeEvidenceIntakeRequest(request("dexa_scan", file));
    expect(result).toMatchObject({ submissionIdentity: ID, effectiveDate: "2026-09-11", expectedEvidenceType: "dexa_scan" });
    expect(result.artifactManifest.files).toEqual([
      { ordinal: 1, name: "BodySpec.pdf", size: file.size, type: "application/pdf" },
    ]);
  });

  it.each(["nutrition", "activity_day", "training"])("accepts a valid %s screenshot", async (type) => {
    const file = new File([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1])], "screen.png", { type: "image/png" });
    await expect(parseNativeEvidenceIntakeRequest(request(type, file)))
      .resolves.toMatchObject({ expectedEvidenceType: type, files: [file] });
  });

  it("rejects mismatched idempotency identity and disguised screenshots", async () => {
    const badIdentity = request("nutrition", new File(["not png"], "screen.png", { type: "image/png" }), "different");
    await expect(parseNativeEvidenceIntakeRequest(badIdentity)).rejects.toMatchObject({ code: "IDEMPOTENCY_IDENTITY_MISMATCH" });
    const badImage = request("activity_day", new File(["not png"], "screen.png", { type: "image/png" }));
    await expect(parseNativeEvidenceIntakeRequest(badImage)).rejects.toMatchObject({ code: "SCREENSHOT_INVALID" });
  });
});

function request(type, file, key = ID) {
  const body = new FormData();
  body.set("submissionIdentity", ID);
  body.set("effectiveDate", "2026-09-11");
  body.set("expectedEvidenceType", type);
  body.append("evidenceFiles", file);
  return new Request("https://physiqueos.example/api/v1/native/evidence/intakes", {
    method: "POST", headers: { authorization: `Bearer ${"x".repeat(43)}`, "idempotency-key": key }, body,
  });
}
