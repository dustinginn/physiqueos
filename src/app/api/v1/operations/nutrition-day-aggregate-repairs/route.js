import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  getProductionApplicationCanonicalCommitComposition,
  loadProductionBoundedFounderReadContext,
} from "../../../../../application/composition/productionApplicationComposition.js";
import {
  createNutritionDayAggregateRepairService,
  inspectNutritionDayAggregateRepair,
} from "../../../../../domain/services/NutritionDayAggregateRepairService.js";
import { authorizeProviderMigrationDryRun } from
  "../../../../../platform/cutover/ProviderMigrationDryRunProductComposition.js";

export const runtime = "nodejs";
const MAXIMUM_BODY_BYTES = 4 * 1024;

export async function POST(request) {
  try {
    if (!authorizeProviderMigrationDryRun(request.headers.get("authorization"))) {
      return json(401, { code: "AUTHENTICATION_REQUIRED" });
    }
    if (process.env.PHYSIQUEOS_PROVIDER_COMPATIBILITY_MODE === "1") {
      return json(403, { code: "NUTRITION_AGGREGATE_REPAIR_PRODUCTION_ONLY" });
    }
    if (!/^application\/json(?:;|$)/i.test(
      request.headers.get("content-type") ?? ""
    )) {
      return json(400, { code: "NUTRITION_AGGREGATE_REPAIR_CONTENT_TYPE_REQUIRED" });
    }
    const bytes = Buffer.from(await request.arrayBuffer());
    if (bytes.length > MAXIMUM_BODY_BYTES) {
      return json(413, { code: "NUTRITION_AGGREGATE_REPAIR_PAYLOAD_TOO_LARGE" });
    }
    let payload;
    try {
      payload = JSON.parse(bytes.toString("utf8"));
    } catch {
      return json(400, { code: "NUTRITION_AGGREGATE_REPAIR_PAYLOAD_INVALID" });
    }
    const userId = required(
      process.env.PHYSIQUEOS_CANONICAL_OWNER_USER_ID,
      "PHYSIQUEOS_CANONICAL_OWNER_USER_ID"
    );
    if (payload.mode === "inspect") {
      const context = await loadProductionBoundedFounderReadContext({
        collections: ["canonicalEvidenceObjects"],
        includeApplicationContext: false,
        includeImportMetadata: false,
      });
      return json(200, inspectNutritionDayAggregateRepair({
        canonicalObjects: context.runtime.canonicalEvidenceObjects,
        date: payload.date,
        userId,
      }));
    }
    if (payload.mode !== "execute") {
      return json(400, { code: "NUTRITION_AGGREGATE_REPAIR_MODE_INVALID" });
    }
    const composition = await getProductionApplicationCanonicalCommitComposition();
    const service = createNutritionDayAggregateRepairService({
      mutateCanonicalRuntime: (input) => composition.mutateRuntimeBounded(input),
    });
    const result = await service.repair({
      commandId: payload.commandId ?? randomUUID(),
      date: payload.date,
      expectedCanonicalId: payload.expectedCanonicalId,
      expectedPriorSemanticFingerprint: payload.expectedPriorSemanticFingerprint,
      userId,
    });
    return json(200, result);
  } catch (error) {
    return json(httpStatus(error), { code: safeCode(error) });
  }
}

function json(status, body) {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function httpStatus(error) {
  if (/AMBIGUOUS|MISMATCH|STALE|REQUIRES_REVIEW|MEALS_INCOMPLETE/.test(
    String(error?.code ?? "")
  )) return 409;
  if (/INVALID|REQUIRED/.test(String(error?.code ?? ""))) return 400;
  return 500;
}

function safeCode(error) {
  const code = String(error?.code ?? "INTERNAL_ERROR");
  return /^[A-Z0-9_]{3,100}$/.test(code) ? code : "INTERNAL_ERROR";
}

function required(value, field) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw Object.assign(new Error(`${field} is required.`), {
      code: "NUTRITION_AGGREGATE_REPAIR_NOT_CONFIGURED",
    });
  }
  return normalized;
}
