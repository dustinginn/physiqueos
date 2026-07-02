import { createOperatingRhythm } from "../../domain/models/operatingRhythm";

export const founderOperatingRhythm = createOperatingRhythm({
  id: "operating_rhythm_founder_alpha",
  userId: "user_founder_001",
  typicalWakeTime: "06:00",
  typicalBedtime: null,
  fastingWindow: {
    startsAt: "19:00",
    endsAt: "morning_weight_complete",
    notes: "Evening fast supports nighttime peptide timing when applicable.",
  },
  weekday: {
    wakeTime: "06:00",
    workoutWindow: "before_work",
    evidenceTiming: [
      {
        evidenceType: "weight",
        timing: "morning",
      },
      {
        evidenceType: "nutrition_context",
        timing: "during_day",
      },
      {
        evidenceType: "protocol",
        timing: "night",
      },
    ],
    notes:
      "Weekdays normally include wake, morning weight, protein, electrolytes, and gym before work.",
  },
  weekend: {
    wakeTime: null,
    workoutWindow: "afternoon",
    evidenceTiming: [
      {
        evidenceType: "weight",
        timing: "morning",
      },
      {
        evidenceType: "progress_photo",
        timing: "morning",
      },
      {
        evidenceType: "protocol",
        timing: "night",
      },
    ],
    notes:
      "Weekends normally include morning weight, consistent diet, and afternoon workouts.",
  },
  protocolTiming: [
    {
      protocolId: "protocol_retatrutide_founder",
      timing: "thursday_night_fasted_before_bed",
    },
    {
      protocolId: "protocol_tesamorelin_founder",
      timing: "sunday_through_thursday_night_fasted_before_bed",
    },
  ],
  shouldLearnAutomatically: true,
  source: {
    type: "manual",
    name: "Founder",
    externalId: null,
    importedAt: null,
    confidence: "high",
    notes: "Founder-provided operating rhythm. Future versions should infer this from evidence.",
  },
  fieldProvenance: {
    imported: [
      "typicalWakeTime",
      "fastingWindow",
      "weekday",
      "weekend",
      "protocolTiming",
    ],
    computed: ["shouldLearnAutomatically"],
  },
  createdAt: null,
  updatedAt: null,
});
