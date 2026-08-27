import { NextResponse } from "next/server";
import { authorizeProviderMigrationDryRun } from "../../../../../platform/cutover/ProviderMigrationDryRunProductComposition.js";
import {
  getSimplifiedProviderMigrationProductController,
  safeSimplifiedProviderMigrationCode,
  simplifiedProviderMigrationHttpStatus,
} from "../../../../../platform/cutover/simplified/SimplifiedProviderMigrationProductComposition.js";

export const runtime = "nodejs";
const MAXIMUM_BODY_BYTES = 32 * 1024;

export async function POST(request) {
  try {
    if (!authorizeProviderMigrationDryRun(request.headers.get("authorization"))) return json(401, { code: "AUTHENTICATION_REQUIRED" });
    if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") ?? "")) return json(400, { code: "SIMPLIFIED_PROVIDER_CONTENT_TYPE_REQUIRED" });
    const bytes = Buffer.from(await request.arrayBuffer());
    if (bytes.length > MAXIMUM_BODY_BYTES) return json(413, { code: "SIMPLIFIED_PROVIDER_PAYLOAD_TOO_LARGE" });
    let payload;
    try { payload = JSON.parse(bytes.toString("utf8")); }
    catch { return json(400, { code: "SIMPLIFIED_PROVIDER_PAYLOAD_INVALID" }); }
    const controller = getSimplifiedProviderMigrationProductController();
    if (!controller) return json(503, { code: "SIMPLIFIED_PROVIDER_NOT_CONFIGURED" });
    const result = await controller.submit(payload);
    return json(result.status, result.body);
  } catch (error) {
    return json(simplifiedProviderMigrationHttpStatus(error), { code: safeSimplifiedProviderMigrationCode(error) });
  }
}

function json(status, body) { return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } }); }
