import PageHeader from "@/components/layout/PageHeader";
import MetricCard from "@/components/cards/MetricCard";
import RecommendationCard from "@/components/cards/RecommendationCard";

import { mockUser } from "@/lib/mockData";
import { getTodaysRecommendation } from "@/services/recommendationEngine";

export default function Dashboard() {
  const recommendation = getTodaysRecommendation(mockUser);

  return (
    <>
      <PageHeader />

      <div className="px-4 space-y-6">

        <RecommendationCard recommendation={recommendation} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">

          <MetricCard
            title="Weight"
            value="171.5 lbs"
            subtitle="-6.5 lbs this month"
          />

          <MetricCard
            title="Body Fat"
            value="12.4%"
            subtitle="-0.8%"
          />

          <MetricCard
            title="Goal"
            value="10%"
            subtitle="Projected July 18"
          />

          <MetricCard
            title="Calories"
            value="2,140"
            subtitle="7-day average"
          />

        </div>
      </div>
    </>
  );
}