window.EVENT_BRIEFING_FIXTURES = {
  dexa: {
    id: "dexa_event_dexa-fixture-005",
    eventDate: "Aug 30, 2026",
    generatedAt: "Aug 31, 2026",
    attribution: { goal: "Build Lean Mass", phase: "Lean Mass Build" },
    confidence: {
      score: 63,
      band: "Developing",
      prior: 70,
      delta: -7,
      movement: "Decreased",
      primaryReason: "Lean mass continued climbing but fat mass grew alongside it faster than the modeled surplus predicted, widening the uncertainty band on how clean this gain is.",
      supporting: ["Lean tissue is trending upward for the second scan in a row."],
      limiting: ["Fat mass grew 1.0 lb in two weeks — above the modeled rate for this surplus size.", "Regional fat gain concentrated in the trunk, worth watching."],
      unresolved: ["Whether the next scan confirms this as a real trend or normal scan-to-scan noise."]
    },
    hero: {
      title: "Two weeks into the surplus, the gain is real — and mostly lean.",
      body: "This scan compares against your August 16 baseline, the day the lean mass phase began. Weight is up 2.4 lb, and just over 60% of that gain measured as lean tissue.",
      results: [
        { label: "DEXA Weight", value: "179.4 lb", detail: "+2.4 lb vs Aug 16" },
        { label: "Body Fat", value: "9.4%", detail: "+0.4 pts" },
        { label: "Lean Tissue", value: "159.5 lb", detail: "+1.5 lb" },
        { label: "Fat Mass", value: "16.9 lb", detail: "+1.0 lb" }
      ]
    },
    snapshot: { date: "Aug 30", window: "14 days", scans: "2 scans", rmr: "2,240 kcal/day" },
    headlineChanges: [
      { label: "Weight", before: "177.0", after: "179.4", delta: "+2.4 lb", percent: 76 },
      { label: "Body Fat", before: "9.0%", after: "9.4%", delta: "+0.4 pts", percent: 62 },
      { label: "Fat Mass", before: "15.9", after: "16.9", delta: "+1.0 lb", percent: 67 },
      { label: "Lean Tissue", before: "158.0", after: "159.5", delta: "+1.5 lb", percent: 82 }
    ],
    regionalFat: [
      { label: "Arms", before: "1.8", after: "1.9", delta: "+0.1" },
      { label: "Legs", before: "5.1", after: "5.4", delta: "+0.3" },
      { label: "Trunk", before: "7.6", after: "8.1", delta: "+0.5" },
      { label: "Android", before: "1.0", after: "1.1", delta: "+0.1" },
      { label: "Gynoid", before: "1.9", after: "2.0", delta: "+0.1" }
    ],
    regionalLean: [
      { label: "Arms", before: "18.3", after: "18.6", delta: "+0.3" },
      { label: "Legs", before: "54.6", after: "55.1", delta: "+0.5" },
      { label: "Trunk", before: "72.9", after: "73.7", delta: "+0.8" },
      { label: "Android", before: "10.5", after: "10.6", delta: "+0.1" },
      { label: "Gynoid", before: "18.1", after: "18.3", delta: "+0.2" }
    ],
    supplemental: [
      { label: "Visceral Fat", before: "1.0", after: "1.1", delta: "+0.1" },
      { label: "A:G", before: "1.41", after: "1.43", delta: "+0.02" },
      { label: "RMR", before: "2,220", after: "2,240", delta: "+20" }
    ],
    timeline: { label: "Since Starting the Lean Mass Phase", start: "Aug 16", end: "Aug 30", days: "14 days", scans: "2 scans", summary: "14 days into the lean mass phase, weight is up 2.4 lb and lean tissue accounts for about 60% of that — right in line with the modeled surplus." },
    interpretation: {
      opening: "This is the second scan since the lean mass phase began, and the surplus is producing measurable tissue gain rather than just scale weight.",
      fatLoss: "Fat mass grew slightly faster than modeled over these two weeks — not a guardrail breach, but worth watching if it continues at this rate.",
      leanMass: "Lean tissue gained 1.5 lb, consistent with the training progression logged over the same window.",
      regional: "Most of the fat gain concentrated in the trunk; lean gain was distributed fairly evenly across arms, legs, and trunk.",
      phaseMeaning: "The lean mass phase calls for exactly this kind of controlled gain — the question going forward is whether the fat-to-lean ratio holds as the surplus continues.",
      supporting: "Fourteen days of consistent nutrition and training logging back this comparison.",
      uncertainty: "One more scan is needed to know whether the trunk fat gain is a real trend or normal scan-to-scan noise."
    },
    coach: {
      win: "Lean tissue is climbing for the second scan in a row.",
      protect: "Keep the current surplus size — don't cut calories over one slightly-faster-than-modeled fat gain.",
      watch: "Trunk fat gain rate at the next scan.",
      next: "Hold intake steady and reassess at the next DEXA."
    },
    revision: {
      priorPublicationId: "dexa_event_dexa-fixture-005",
      priorVersion: "Aug 31, 2026 · 9:00 AM",
      replacement: "Aug 31, 2026 · 2:00 PM",
      reason: "A confirmed training-evidence review arrived after the initial publish and updated the regional fat-change figures.",
      replacedHeadline: "Two weeks into the surplus, growth continues.",
      replacedReason: "A training-evidence confirmation updated the regional breakdown."
    }
  },
  photo: {
    id: "event_briefing_progress_photo_photo-set-fixture-005",
    eventDate: "Aug 30, 2026",
    session: "photo-set-fixture-005",
    completion: "4 of 4 · Complete",
    weight: "No same-day weight",
    conditions: "Evening, post-workout, pump present.",
    hero: {
      title: "Four poses in, the visual story matches the scan.",
      body: "This session adds a new Side Relaxed pose to your rotation. Across all four poses, the two-week trend since your last check-in looks controlled — no signs of the surplus showing up as excess fat."
    },
    activeViews: [
      { pose: "Front Relaxed", headline: "Controlled, gradual change since Aug 16.", observation: "Waist appears stable, no excess softness.", comparability: "Primary comparison" },
      { pose: "Back Relaxed", headline: "Shoulder and back width trending up slightly.", observation: "Consistent with logged upper-body training progression.", comparability: "Primary comparison" },
      { pose: "Back Flexed", headline: "Definition holding under flex despite the surplus.", observation: "", comparability: "Primary comparison" },
      { pose: "Side Relaxed", headline: "First Side Relaxed photo on file.", observation: "Establishes a new baseline for waist-line tracking going forward.", comparability: "No prior · establishes baseline" }
    ],
    progress: {
      title: "What Changed",
      body: "Matching historical views show what changed and what remained stable.",
      comparisons: [
        { pose: "Front Relaxed", prior: "Aug 16", current: "Aug 30", narrative: "Two weeks in, the midsection looks stable — no visible softening from the surplus." },
        { pose: "Back Relaxed", prior: "Aug 16", current: "Aug 30", narrative: "Back width looks marginally fuller, consistent with the logged training volume." },
        { pose: "Back Flexed", prior: "Aug 16", current: "Aug 30", narrative: "Flexed definition holds steady — no loss of sharpness under the surplus." }
      ]
    },
    interpretation: {
      title: "What This Comparison Shows",
      paragraphs: [
        "Front, back, and back-flexed views all show the controlled, gradual changes expected from a lean-mass-building surplus — no excess softness or rapid fat accumulation visible.",
        "The new Side Relaxed pose gives a clearer read on waist definition going forward and will be the baseline for every future comparison."
      ]
    },
    coach: {
      insight: "The visual read backs up the DEXA numbers from this same window — steady lean gain, nothing concerning in the photos.",
      nextMilestone: "October 31 DEXA scan"
    },
    presentationConfidence: "Persisted in the artifact but intentionally omitted by Build 85 Native Photo Briefing presentation.",
    mediaAuthority: {
      mode: "app-rendered-founder-media-reference",
      source: "Authenticated app render supplied by the current repo; raw media is intentionally unavailable outside the production proxy.",
      safeReferenceMapping: "Back Relaxed · Jun 20 → Jun 27",
      fixtureMapping: "Canonical event copy remains Aug 16 → Aug 30. The safe media reference is not asserted to be the fixture's underlying photo pair."
    }
  }
};

