import { createSyntheticDexaV2Preview } from "../../../../../../domain/services/SyntheticDEXAV2PreviewService";

export const dynamic = "force-dynamic";

export function GET() {
  const preview = createSyntheticDexaV2Preview();
  return Response.json({
    schemaVersion: preview.schemaVersion,
    previewOnly: preview.previewOnly,
    deterministic: preview.deterministic,
    fixtureId: preview.fixtureId,
    diagnostics: preview.diagnostics,
  });
}
