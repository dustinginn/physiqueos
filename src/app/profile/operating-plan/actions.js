"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FounderRepositories } from "../../../data/repositories/founderRepositories";

const PROTOCOL_IDS = [
  "protocol_retatrutide_founder",
  "protocol_tesamorelin_founder",
  "protocol_tongkat_ali_founder",
  "protocol_fadogia_agrestis_founder",
  "protocol_multivitamin_founder",
  "protocol_electrolytes_founder",
];

const REMINDER_IDS = [
  "reminder_morning_weight",
  "reminder_front_progress_photos",
  "reminder_rear_progress_photos",
  "reminder_retatrutide",
  "reminder_tesamorelin",
  "reminder_foam_roll_daily",
];

export async function saveOperatingPlan(formData) {
  const user = await FounderRepositories.users.getCurrentUser();

  if (!user) throw new Error("Founder user is not available.");

  const [goals, operatingPlan, nutritionContext] = await Promise.all([
    FounderRepositories.goals.listGoals(user.id),
    FounderRepositories.operatingPlan.getOperatingPlan(user.id),
    FounderRepositories.nutritionContext.getNutritionContext(user.id),
  ]);
  const now = new Date().toISOString();

  await Promise.all(
    goals.map((goal) =>
      FounderRepositories.goals.updateGoal(goal.id, {
        title: text(formData, `goal_${goal.id}_title`) ?? goal.title,
      })
    )
  );

  await Promise.all(
    PROTOCOL_IDS.map(async (protocolId) => {
      const protocol = await FounderRepositories.protocols.getProtocolById(protocolId);
      if (!protocol) return null;
      const doseValue = number(formData, `${protocolId}_dose`);

      return FounderRepositories.protocols.updateProtocol(protocolId, {
        status: text(formData, `${protocolId}_status`) ?? protocol.status,
        dose: {
          value: doseValue ?? protocol.dose?.value ?? null,
          unit: text(formData, `${protocolId}_doseUnit`) ?? protocol.dose?.unit ?? "",
        },
        doseUnit: text(formData, `${protocolId}_doseUnit`) ?? protocol.doseUnit,
        schedule: {
          ...protocol.schedule,
          timeOfDay: text(formData, `${protocolId}_timeOfDay`) ?? protocol.schedule?.timeOfDay,
          dayOfWeek: text(formData, `${protocolId}_dayOfWeek`) ?? protocol.schedule?.dayOfWeek,
        },
        notes: text(formData, `${protocolId}_notes`) ?? protocol.notes,
      });
    })
  );

  await Promise.all(
    REMINDER_IDS.map(async (reminderId) => {
      const reminder = await FounderRepositories.reminders.getReminderById(reminderId);
      if (!reminder) return null;

      return FounderRepositories.reminders.saveReminder({
        ...reminder,
        active: formData.get(`${reminderId}_active`) === "on",
        persistenceMode:
          text(formData, `${reminderId}_persistenceMode`) ?? reminder.persistenceMode,
        adaptiveAssistance: {
          ...reminder.adaptiveAssistance,
          userDecision:
            text(formData, `${reminderId}_adaptiveDecision`) ??
            reminder.adaptiveAssistance?.userDecision ??
            null,
        },
        schedule: {
          ...reminder.schedule,
          timeOfDay: text(formData, `${reminderId}_timeOfDay`) ?? reminder.schedule?.timeOfDay,
          dayOfWeek: text(formData, `${reminderId}_dayOfWeek`) ?? reminder.schedule?.dayOfWeek,
          daysOfWeek: csv(formData, `${reminderId}_daysOfWeek`) ?? reminder.schedule?.daysOfWeek,
        },
        notes: text(formData, `${reminderId}_notes`) ?? reminder.notes,
        updatedAt: now,
      });
    })
  );

  if (nutritionContext) {
    await FounderRepositories.nutritionContext.updateNutritionContext(user.id, {
      estimatedDailyCaloricIntake: {
        ...nutritionContext.estimatedDailyCaloricIntake,
        min: number(formData, "nutrition_minCalories"),
        max: number(formData, "nutrition_maxCalories"),
        unit: "kcal",
      },
      estimatedDailyActiveCalorieBurn: {
        ...nutritionContext.estimatedDailyActiveCalorieBurn,
        value: number(formData, "nutrition_activeBurn"),
        marginOfErrorPercent: number(formData, "nutrition_burnMargin"),
      },
    });
  }

  if (operatingPlan) {
    await FounderRepositories.operatingPlan.updateOperatingPlan(user.id, {
      nutrition: {
        ...operatingPlan.nutrition,
        estimatedDailyCaloricIntake: {
          min: number(formData, "nutrition_minCalories"),
          max: number(formData, "nutrition_maxCalories"),
          unit: "kcal",
        },
        proteinPriority: text(formData, "nutrition_proteinPriority"),
      },
      training: {
        ...operatingPlan.training,
        estimatedWorkoutDurationMinutes: number(formData, "training_duration"),
        notes: text(formData, "training_notes") ?? "",
      },
      reminderPreferences: {
        ...operatingPlan.reminderPreferences,
        notificationOwnership: text(formData, "reminder_notificationOwnership") ?? "",
        avoidDuplicatingSources: csv(formData, "reminder_avoidSources") ?? [],
      },
    });
  }

  await FounderRepositories.users.updateUser(user.id, {
    preferences: {
      ...user.preferences,
      defaultWeighInContext: {
        timing: text(formData, "default_timing"),
        nutritionState: text(formData, "default_nutritionState"),
        intakeState: text(formData, "default_intakeState"),
        scale: text(formData, "default_scale"),
        confidence: text(formData, "default_confidence"),
      },
    },
  });

  revalidatePath("/");
  revalidatePath("/profile/operating-plan");
  revalidatePath("/briefing/daily");
  redirect("/profile/operating-plan?saved=1");
}

function text(formData, key) {
  const value = String(formData.get(key) ?? "").trim();

  return value.length > 0 ? value : null;
}

function number(formData, key) {
  const value = text(formData, key);
  if (!value) return null;

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function csv(formData, key) {
  const value = text(formData, key);
  if (!value) return null;

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
