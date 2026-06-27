"use client";

import { useState } from "react";

import PageHeader from "@/components/layout/PageHeader";
import MetricCard from "@/components/cards/MetricCard";
import RecommendationCard from "@/components/cards/RecommendationCard";
import TodayChecklistCard from "@/components/cards/TodayChecklistCard";
import WeightEntryDialog from "@/components/forms/WeightEntryDialog";

import { getTodaysRecommendation } from "@/services/recommendationEngine";
import { getDailyChecklist } from "@/services/goalEngine";

export default function Dashboard() {
  const [user, setUser] = useState({
    name: "Dustin",

    goal: {
      type: "fatLoss",
      targetBodyFat: 10,
    },

    weight: 171.5,

    today: {
      weightLogged: false,
      calorieGoalMet: false,
      activeCaloriesMet: false,
      proteinGoalMet: false,
      workoutCompleted: false,
      sleepGoalMet: false,
    },
  });

  const [weightDialogOpen, setWeightDialogOpen] = useState(false);

  const recommendation = getTodaysRecommendation(user);
  const checklist = getDailyChecklist(user);

  function logWeight(weight) {
    setUser({
      ...user,

      weight,

      today: {
        ...user.today,
        weightLogged: true,
      },
    });
  }

  return (
    <>
      <PageHeader />

      <div className="space-y-6 px-4">

        <RecommendationCard
          recommendation={recommendation}
          onPrimaryAction={() => setWeightDialogOpen(true)}
        />

        <TodayChecklistCard
          checklist={checklist}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">

          <MetricCard
            title="Weight"
            value={`${user.weight} lbs`}
            subtitle="Current Weight"
          />

          <MetricCard
            title="Body Fat"
            value="12.4%"
            subtitle="Current Estimate"
          />

          <MetricCard
            title="Goal"
            value={`${user.goal.targetBodyFat}%`}
            subtitle="Target Body Fat"
          />

          <MetricCard
            title="Calories"
            value="2,140"
            subtitle="7-Day Average"
          />

        </div>

      </div>

      <WeightEntryDialog
        open={weightDialogOpen}
        onOpenChange={setWeightDialogOpen}
        onSave={logWeight}
      />

    </>
  );
}