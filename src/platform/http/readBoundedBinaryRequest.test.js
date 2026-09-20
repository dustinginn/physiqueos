import { describe, expect, it } from "vitest";
import { readBoundedBinaryRequest } from "./readBoundedBinaryRequest.js";

const URL_ = "https://physiqueos.example/api/v1/native/evidence/intakes/x/artifacts/y";
const IMAGE = /^image\/(?:jpeg|png|webp|heic|heif)$/;

function request(body, headers = {}, init = {}) {
  return new Request(URL_, { method: "PUT", headers: { "content-type": "image/jpeg", ...headers }, body, ...init });
}

describe("bounded binary request reader", () => {
  it("returns the exact bytes and normalized content type within the ceiling", async () => {
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    const result = await readBoundedBinaryRequest(request(bytes, { "content-type": "Image/JPEG; charset=binary", "content-length": String(bytes.length) }), { maximumBytes: 64, contentType: IMAGE });
    expect(Buffer.compare(result.bytes, bytes)).toBe(0);
    expect(result.contentType).toBe("image/jpeg");
  });

  it("refuses a declared length above the ceiling before reading any byte", async () => {
    let pulled = 0;
    const stream = new ReadableStream({ pull(controller) { pulled += 1; controller.enqueue(new Uint8Array(16)); if (pulled > 8) controller.close(); } });
    await expect(readBoundedBinaryRequest(new Request(URL_, { method: "PUT", headers: { "content-type": "image/png", "content-length": "65" }, body: stream, duplex: "half" }), { maximumBytes: 64, contentType: IMAGE }))
      .rejects.toMatchObject({ status: 413, code: "REQUEST_TOO_LARGE" });
    // A ReadableStream pulls once to prime its queue on construction; the
    // reader itself never asked for a byte.
    expect(pulled).toBeLessThanOrEqual(1);
  });

  it("aborts a chunked body the moment it passes the ceiling", async () => {
    let pulled = 0;
    let cancelled = false;
    const stream = new ReadableStream({
      pull(controller) { pulled += 1; controller.enqueue(new Uint8Array(1024)); if (pulled >= 64) controller.close(); },
      cancel() { cancelled = true; },
    });
    await expect(readBoundedBinaryRequest(new Request(URL_, { method: "PUT", headers: { "content-type": "image/png" }, body: stream, duplex: "half" }), { maximumBytes: 4096, contentType: IMAGE, requireContentLength: false }))
      .rejects.toMatchObject({ status: 413 });
    expect(cancelled).toBe(true);
    expect(pulled).toBeLessThan(8);
  });

  it("requires a length by default, and requires the body to honor it", async () => {
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(8)); controller.close(); } });
    await expect(readBoundedBinaryRequest(new Request(URL_, { method: "PUT", headers: { "content-type": "image/png" }, body: stream, duplex: "half" }), { maximumBytes: 64, contentType: IMAGE }))
      .rejects.toMatchObject({ status: 411, code: "CONTENT_LENGTH_REQUIRED" });
    const mismatched = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(8)); controller.close(); } });
    await expect(readBoundedBinaryRequest(new Request(URL_, { method: "PUT", headers: { "content-type": "image/png", "content-length": "9" }, body: mismatched, duplex: "half" }), { maximumBytes: 64, contentType: IMAGE }))
      .rejects.toMatchObject({ status: 400, code: "CONTENT_LENGTH_MISMATCH" });
    await expect(readBoundedBinaryRequest(request(Buffer.alloc(0), { "content-length": "0" }), { maximumBytes: 64, contentType: IMAGE }))
      .rejects.toMatchObject({ status: 400, code: "REQUEST_EMPTY" });
    await expect(readBoundedBinaryRequest(request(Buffer.alloc(4), { "content-length": "-1" }), { maximumBytes: 64, contentType: IMAGE }))
      .rejects.toMatchObject({ status: 400, code: "CONTENT_LENGTH_INVALID" });
  });

  it("rejects content types outside the accepted set and a missing type", async () => {
    await expect(readBoundedBinaryRequest(request(Buffer.alloc(4), { "content-type": "application/pdf", "content-length": "4" }), { maximumBytes: 64, contentType: IMAGE }))
      .rejects.toMatchObject({ status: 400, code: "CONTENT_TYPE_REQUIRED" });
    await expect(readBoundedBinaryRequest(request(Buffer.alloc(4), { "content-type": "multipart/form-data; boundary=x", "content-length": "4" }), { maximumBytes: 64, contentType: IMAGE }))
      .rejects.toMatchObject({ status: 400, code: "CONTENT_TYPE_REQUIRED" });
    await expect(readBoundedBinaryRequest(request(Buffer.alloc(4)), { maximumBytes: 0 })).rejects.toThrow(TypeError);
  });
});
