import { FounderRepositories } from "../../../data/repositories/founderRepositories";
import { createDailyBriefingService } from "../../../domain/services/DailyBriefingService";
import DailyBriefingScreen from "../../../screens/DailyBriefingScreen";
import BriefingGenerationButton from "../../../components/cards/BriefingGenerationButton";
import { generateScheduledDailyBriefing } from "./actions";

export const dynamic = "force-dynamic";

export default async function DailyBriefingPage() {
  const service = createDailyBriefingService({
    repositories: FounderRepositories,
  });
  const briefing = await service.getPersistedDailyBriefing();

  if (!briefing) {
    return (
      <main className="app-surface min-h-screen">
        <div className="mx-auto max-w-[393px] px-4 py-12">
          <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[var(--primary)]">Daily Briefing</p>
          <h1 className="mt-3 text-3xl font-extrabold text-[var(--text-primary)]">Today&apos;s briefing is not ready yet.</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">Prepare it from the most recently completed evidence window, or return later.</p>
          <form action={generateScheduledDailyBriefing}>
            <BriefingGenerationButton />
          </form>
        </div>
      </main>
    );
  }

  return <DailyBriefingScreen briefing={briefing} />;
}
