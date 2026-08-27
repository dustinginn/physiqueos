import { NextResponse } from "next/server";
import {
  authorizeProviderMigrationDryRun,
  getProviderMigrationDryRunProductController,
  providerMigrationDryRunHttpStatus,
  safeProviderMigrationDryRunCode,
} from "../../../../../../platform/cutover/ProviderMigrationDryRunProductComposition.js";

export const runtime = "nodejs";

export async function GET(request, { params }) {
  try {
    if (!authorizeProviderMigrationDryRun(request.headers.get("authorization"))) return json(401, { code: "AUTHENTICATION_REQUIRED" });
    const controller = getProviderMigrationDryRunProductController();
    if (!controller) return json(503, { code: "REMOTE_DRY_RUN_NOT_CONFIGURED" });
    const { operationId } = await params;
    const result = await controller.status(operationId);
    return json(result.status, result.body);
  } catch (error) {
    return json(providerMigrationDryRunHttpStatus(error), { code: safeProviderMigrationDryRunCode(error) });
  }
}

function json(status, body) { return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } }); }
