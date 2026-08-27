import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalJson, createPayloadHash } from "./canonicalJson";
import { createCommandMetadata } from "./command";
import { createDestination, DestinationId } from "./destination";
import { createUuidV7, isUuidV7, preserveLegacyId } from "./identifiers";
import { decodeCursor, encodeCursor, normalizePageLimit } from "./pagination";
import { ApplicationProblem, toProblemDetails } from "./problem";
import { resolveCorrelationId } from "../../platform/observability/correlation";

describe("Phase 1 application contracts", () => {
  it("serializes command metadata without bigint loss", () => {
    const metadata = createCommandMetadata({ idempotencyKey: "foundation-command-0001", expectedVersion: 9n });
    expect(isUuidV7(metadata.commandId)).toBe(true);
    expect(JSON.parse(JSON.stringify(metadata))).toMatchObject({ expectedVersion: "9", payloadVersion: "1" });
  });

  it("hashes canonical JSON independently of object key order", () => {
    expect(canonicalJson({ z: 1, a: { y: 2, x: 3 } })).toBe('{"a":{"x":3,"y":2},"z":1}');
    expect(createPayloadHash({ b: 2, a: 1 })).toBe(createPayloadHash({ a: 1, b: 2 }));
  });

  it("streams canonical hashing without constructing the complete canonical JSON string", () => {
    const value = {
      records: Array.from({ length: 8_000 }, (_, index) => ({
        id: `record-${index}`,
        nested: { z: index, a: `payload-${index}-${"x".repeat(128)}` },
      })),
    };
    const expected = createHash("sha256").update(canonicalJson(value)).digest("hex");
    expect(createPayloadHash(value)).toBe(expected);
    const source = fs.readFileSync(new URL("./canonicalJson.js", import.meta.url), "utf8");
    const implementation = source.slice(source.indexOf("export function createPayloadHash"), source.indexOf("function updateCanonicalHash"));
    expect(implementation).not.toContain("canonicalJson(value)");
  });

  it("returns stable problem details and hides unclassified error details", () => {
    const known = toProblemDetails(new ApplicationProblem({ status: 409, code: "CONFLICT", title: "Conflict", detail: "safe" }), { requestId: "request-1" });
    expect(known).toMatchObject({ problemVersion: "1", status: 409, code: "CONFLICT", detail: "safe", requestId: "request-1" });
    expect(toProblemDetails(new Error("secret SQL"))).toMatchObject({ status: 500, code: "INTERNAL_ERROR", detail: null });
  });

  it("creates UUIDv7 IDs, preserves legacy IDs exactly, and sanitizes correlation input", () => {
    expect(isUuidV7(createUuidV7())).toBe(true);
    expect(preserveLegacyId("legacy_Founder-ID:01")).toBe("legacy_Founder-ID:01");
    expect(resolveCorrelationId("safe-request:123")).toBe("safe-request:123");
    expect(isUuidV7(resolveCorrelationId("bad\nrequest"))).toBe(true);
  });

  it("round-trips opaque cursors, bounds page sizes, and validates destinations", () => {
    const cursor = encodeCursor({ sort: "2026-08-10T00:00:00Z", id: "legacy-id" });
    expect(decodeCursor(cursor)).toEqual({ sort: "2026-08-10T00:00:00Z", id: "legacy-id" });
    expect(normalizePageLimit(null)).toBe(25);
    expect(() => normalizePageLimit(101)).toThrow(/between 1 and 100/);
    expect(createDestination(DestinationId.OPERATION_DETAIL, { operationId: "op" })).toEqual({ id: "operation.detail", parameters: { operationId: "op" } });
  });

  it("keeps OpenAPI limited to implemented foundation routes", () => {
    const document = JSON.parse(fs.readFileSync(path.join(process.cwd(), "openapi", "physiqueos-v1.json"), "utf8"));
    expect(document.openapi).toBe("3.1.0");
    expect(Object.keys(document.paths).sort()).toEqual(["/capabilities", "/health/live", "/health/ready", "/platform"]);
    expect(document.components.schemas.CommandMetadata.properties.expectedVersion).toBeDefined();
    for (const route of ["health/live", "health/ready", "platform", "capabilities"]) {
      expect(fs.existsSync(path.join(process.cwd(), "src", "app", "api", "v1", ...route.split("/"), "route.js"))).toBe(true);
    }
  });
});
