// The Founder-approved retroactive durable performance events (Sep 14 = 5, Sep 17 = 2,
// Sep 18 = 4, Sep 20 = 1). Each was proven by dry run against live production authority and
// the 11 for Sep 14/17/18 match the PR descriptors persisted in their confirmation-time
// analyses. The runner refuses to write anything that differs from this exact set.
export const APPROVED_RETROACTIVE_TRAINING_EVENTS = Object.freeze([
  {
    "id": "training_performance_event_45353ee59d7644a7b034c591e84bc392",
    "date": "2026-09-14",
    "exercise": "leg_press_feet_middle",
    "type": "reps_at_load_pr",
    "load": 270,
    "prior": 12,
    "value": 15
  },
  {
    "id": "training_performance_event_5d98d9cdf257ec3268a7f66ada1a1056",
    "date": "2026-09-14",
    "exercise": "leg_press_feet_middle",
    "type": "reps_at_load_pr",
    "load": 315,
    "prior": 7,
    "value": 10
  },
  {
    "id": "training_performance_event_982bc483d0068c911da5141aa2ceacce",
    "date": "2026-09-14",
    "exercise": "leg_press_feet_middle",
    "type": "session_volume_pr",
    "load": null,
    "prior": 11520,
    "value": 13725
  },
  {
    "id": "training_performance_event_110e2076988b20f966dbb6feea5061b7",
    "date": "2026-09-14",
    "exercise": "pendulum_squat_machine",
    "type": "reps_at_load_pr",
    "load": 55,
    "prior": 10,
    "value": 11
  },
  {
    "id": "training_performance_event_66bc1458b03a9ddf3a38974ac3680421",
    "date": "2026-09-14",
    "exercise": "pendulum_squat_machine",
    "type": "session_volume_pr",
    "load": null,
    "prior": 2190,
    "value": 2420
  },
  {
    "id": "training_performance_event_226a637a29e22cc0b64860adf2252111",
    "date": "2026-09-17",
    "exercise": "hip_thrusts",
    "type": "session_volume_pr",
    "load": null,
    "prior": 3640,
    "value": 4050
  },
  {
    "id": "training_performance_event_aa1d850a4297acfccc5df5a9f1e1578e",
    "date": "2026-09-17",
    "exercise": "hyperextension_machine",
    "type": "session_volume_pr",
    "load": null,
    "prior": 4800,
    "value": 5700
  },
  {
    "id": "training_performance_event_0a9a826ef5139af69055cb8ad434d99a",
    "date": "2026-09-18",
    "exercise": "incline_dumbbell_press",
    "type": "reps_at_load_pr",
    "load": 50,
    "prior": 12,
    "value": 14
  },
  {
    "id": "training_performance_event_70c15dab38032028511584e02229e25a",
    "date": "2026-09-18",
    "exercise": "incline_dumbbell_press",
    "type": "reps_at_load_pr",
    "load": 50,
    "prior": 12,
    "value": 13
  },
  {
    "id": "training_performance_event_29d30a1ee527b4a9110d16ad208ad4cd",
    "date": "2026-09-18",
    "exercise": "incline_dumbbell_press",
    "type": "session_volume_pr",
    "load": null,
    "prior": 2475,
    "value": 2550
  },
  {
    "id": "training_performance_event_64096c93391d3b2c2b2d2727af20f2e7",
    "date": "2026-09-18",
    "exercise": "plated_chest_fly_machine",
    "type": "session_volume_pr",
    "load": null,
    "prior": 3000,
    "value": 3730
  },
  {
    "id": "training_performance_event_22ead7206ff4bf02e6de1234cd1858f5",
    "date": "2026-09-20",
    "exercise": "pull_up",
    "type": "session_volume_pr",
    "load": null,
    "prior": 675,
    "value": 700
  }
].map((event) => Object.freeze(event)));
