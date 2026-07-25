import { FounderRepositories } from "../../../data/repositories/founderRepositories";
import { createDailyBriefingService } from "../../../domain/services/DailyBriefingService";
import DailyBriefingScreen from "../../../screens/DailyBriefingScreen";

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
          <h1 className="mt-3 text-3xl font-extrabold text-[var(--text-primary)]">Daily Briefings are now historical.</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">Coaching now arrives on Wednesday and Sunday. Previous Daily Briefings remain available in Briefing History.</p>
        </div>
      </main>
    );
  }

  return <DailyBriefingScreen briefing={briefing} />;
}
