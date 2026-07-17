import PageHeader from "../components/layout/PageHeader";
import HomeHeroCard from "../components/cards/HomeHeroCard";
import NextBestAction from "../components/cards/NextBestAction";
import LatestAnalysisCard from "../components/cards/LatestAnalysisCard";
import GoalsCard from "../components/cards/GoalsCard";
import TodaysFocusCard from "../components/cards/TodaysFocusCard";
import { HomeBriefingService } from "../domain/services/HomeBriefingService";
import { completeHomePriority } from "../app/actions";
import { generateScheduledDailyBriefing } from "../app/briefing/daily/actions";

export default async function HomeScreen() {
  const briefing = await HomeBriefingService.getHomeBriefing();

  return (
    <main className="app-surface relative min-h-screen overflow-x-hidden">
      <div className="relative z-10 mx-auto max-w-[393px]">
        <div className="space-y-2.5 px-4 pt-12 pb-32">
          <PageHeader
            avatar={briefing.header.avatar}
            greeting={briefing.header.greeting}
            name={briefing.header.name}
          />

          <HomeHeroCard {...briefing.hero} />

          <NextBestAction {...briefing.nextBestAction} />

          {briefing.latestAnalysis && (
            <LatestAnalysisCard
              {...briefing.latestAnalysis}
              action={briefing.latestAnalysis.actionKind === "generate_daily"
                ? generateScheduledDailyBriefing
                : undefined}
            />
          )}

          <GoalsCard goals={briefing.goals} />

          <TodaysFocusCard
            completeAction={completeHomePriority}
            items={briefing.todaysFocus}
          />
        </div>

      </div>
    </main>
  );
}
