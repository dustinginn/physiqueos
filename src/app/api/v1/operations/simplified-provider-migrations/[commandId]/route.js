import { NextResponse } from "next/server";
import { authorizeProviderMigrationDryRun } from "../../../../../../platform/cutover/ProviderMigrationDryRunProductComposition.js";
import {
  getSimplifiedProviderMigrationProductController,
  safeSimplifiedProviderMigrationCode,
  simplifiedProviderMigrationHttpStatus,
} from "../../../../../../platform/cutover/simplified/SimplifiedProviderMigrationProductComposition.js";

export const runtime = "nodejs";

export async function GET(request, { params }) {
  try {
    if (!authorizeProviderMigrationDryRun(request.headers.get("authorization"))) return json(401, { code: "AUTHENTICATION_REQUIRED" });
    const controller = getSimplifiedProviderMigrationProductController();
    if (!controller) return json(503, { code: "SIMPLIFIED_PROVIDER_NOT_CONFIGURED" });
    const { commandId } = await params;
    const result = await controller.status(commandId);
    return json(result.status, result.body);
  } catch (error) {
    return json(simplifiedProviderMigrationHttpStatus(error), { code: safeSimplifiedProviderMigrationCode(error) });
  }
}

function json(status, body) { return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } }); }
