import { createDEXAScan } from "../models/dexaScan";
import { assertValidDexaScan, isValidDexaScan } from "./DEXAContract";

export function toDexaReadModel(object, { canonicalId = null, now = new Date().toISOString(), userId } = {}) {
  assertValidDexaScan(object, { production: true });
  const sourceFileId =
    object.sourceFileId ??
    object.source?.source_artifact_refs?.[0] ??
    object.provenance?.source_artifact_refs?.[0] ??
    null;
  const scan = createDEXAScan({
    ...object,
    id: object.id,
    userId: object.userId ?? userId,
    measuredAt: object.measuredAt ?? object.observed_at,
    sourceFileId,
    rawReportPath: object.rawReportPath ?? sourceFileId,
    canonicalId,
    canonicalLifecycleStatus: "current",
    createdAt: object.createdAt ?? now,
    updatedAt: now,
  });
  assertValidDexaScan(scan, { production: true });
  return scan;
}

export function selectValidDexaScans(scans = []) {
  const sorted = scans
    .filter((scan) => scan?.canonicalLifecycleStatus !== "failed")
    .filter((scan) => scan?.canonicalLifecycleStatus !== "superseded")
    .filter((scan) => isValidDexaScan(scan, { production: false }))
    .slice()
    .sort((left, right) =>
      String(left.measuredAt).localeCompare(String(right.measuredAt)) ||
      String(left.updatedAt ?? left.id).localeCompare(String(right.updatedAt ?? right.id))
    );
  return [...new Map(sorted.map((scan) => [scan.measuredAt, scan])).values()];
}
