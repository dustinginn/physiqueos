import { createElement } from "react";
import { FounderRepositories } from "../../../../../data/repositories/founderRepositories";
import { monthlyPreviewFixtures } from "../../../../../fixtures/monthlyBriefingPreview";
import { createMonthlyBriefingPreviewService } from "../../../../../domain/services/MonthlyBriefingPreviewService";
import { composeMonthlyBriefingPresentation } from "../../../../../domain/services/MonthlyBriefingPresentationService";
import MonthlyBriefingScreen from "../../../../../screens/MonthlyBriefingScreen";

export const dynamic = "force-dynamic";

export default async function MonthlyBriefingPreviewPage() {
  const fixture = monthlyPreviewFixtures.julyContinuation;
  const user = await FounderRepositories.users.getCurrentUser();
  const narrative = await createMonthlyBriefingPreviewService({
    repositories: FounderRepositories,
  }).preview({
    userId: user.id,
    orchestration: {
      ...fixture,
      generatedAt: "2026-07-30T20:00:00.000Z",
    },
  });
  const evidenceFixture = narrative.evidenceFixture;
  const presentation = composeMonthlyBriefingPresentation({
    narrative,
    decision: narrative.editorialDecision,
    fixture: evidenceFixture,
  });
  return createElement(MonthlyBriefingScreen, { presentation });
}
