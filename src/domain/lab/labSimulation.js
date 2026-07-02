const maturityStages = ["Beginner", "Building", "Operating", "Optimizing"];

export function createLabSimulation({
  conversation = "",
  homeMode = "Brand New User",
  integrations = [],
  persona,
  photoInterpretations = [],
  photoUploads = [],
  replayCount = 0,
}) {
  const text = conversation.trim();
  const maturity = getMaturity({ conversation: text, integrations, persona });
  const goal = inferGoal({ conversation: text, persona });
  const triathlonContext = getTriathlonContext({ conversation: text, goal, integrations, persona });
  const objectives = inferObjectives({ conversation: text, persona, goal });
  const evidence = inferEvidence({
    conversation: text,
    integrations,
    persona,
    photoInterpretations,
    photoUploads,
    triathlonContext,
  });
  const protocols = inferProtocols({ conversation: text, evidence, persona, triathlonContext });
  const missingPieces = inferMissingPieces({ evidence, persona, triathlonContext });
  const confidence = inferConfidence({ evidence, missingPieces, maturity, triathlonContext });
  const acumen = inferAcumen({ conversation: text, persona });
  const guidanceMode = inferGuidanceMode(persona);
  const nextBestStepDecision = inferNextBestStep({ missingPieces, protocols, persona, triathlonContext });
  const nextBestStep = nextBestStepDecision.label;

  return {
    id: `lab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    replayCount,
    maturity,
    persona,
    conversation: text,
    interpretation: {
      goal,
      objectives,
      timeline: inferTimeline(text),
      acumen,
      guidanceStyle: guidanceMode,
      missingPieces,
      evidence,
      protocols,
      reasoning: getReasoning({ confidence, evidence, goal, missingPieces, objectives, triathlonContext }),
      internalConfidence: confidence,
    },
    evidence,
    protocols: {
      suggested: protocols.filter((protocol) => protocol.status === "suggested"),
      established: protocols.filter((protocol) => protocol.status === "established"),
      maturity: getProtocolMaturity(protocols),
      reasoning: getProtocolReasoning(protocols, evidence),
      futureSuggestions: getFutureProtocolSuggestions({ missingPieces, persona }),
    },
    startingBriefing: getStartingBriefing({
      confidence,
      evidence,
      goal,
      missingPieces,
      nextBestStep,
      nextBestStepDecision,
      objectives,
      persona,
      photoInterpretations,
      triathlonContext,
    }),
    homePreview: getHomePreview({
      confidence,
      goal,
      homeMode,
      maturity,
      nextBestStep,
      objectives,
      protocols,
    }),
    debug: {
      goalEngine: getGoalEngineDebug({ goal, objectives }),
      evidenceEngine: getEvidenceEngineDebug(evidence, triathlonContext),
      reasoningEngine: getReasoning({ confidence, evidence, goal, missingPieces, objectives, triathlonContext }),
      missingPieces,
      nextBestStep,
      nextBestStepDecision,
      protocolGraph: getProtocolGraph(protocols),
      internalConfidence: confidence,
      acumen,
      guidanceMode,
      reasoningChain: getReasoningChain({
        evidence,
        goal,
        missingPieces,
        nextBestStep,
        nextBestStepDecision,
        protocols,
        triathlonContext,
      }),
    },
  };
}

export function createCustomPersona({ title, goal, background }) {
  return {
    id: `custom-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    title,
    level: "Custom",
    background,
    primaryGoal: goal,
    supportingObjectives: [],
    existingEvidence: [],
    missingEvidence: [],
    likelyProtocols: [],
    engagementStyle: "Adaptive and exploratory.",
    potentialIntegrations: [],
    briefingStyle: "Evidence-first and concise.",
    challenges: [],
    onboardingPriorities: "Clarify the goal, discover existing evidence, and build the first useful evidence loop.",
    inferenceOpportunities: "Infer only from the conversation until more evidence exists.",
    avoidAsking: "Avoid questions that do not improve goal understanding.",
    firstWowMoment: "The app turns a rough goal into an evidence-aware starting model.",
    firstBriefingEmphasis: "What PhysiqueOS understands, what remains missing, and what to do first.",
    sixWeekEvolution: "The briefing becomes more personal as evidence accumulates.",
  };
}

function inferGoal({ conversation, persona }) {
  const lower = conversation.toLowerCase();

  if (lower.includes("marathon")) return "Marathon performance";
  if (lower.includes("triathlon") || lower.includes("tri")) return "Sprint triathlon readiness";
  if (lower.includes("bulk") || lower.includes("muscle")) return "Lean muscle gain";
  if (lower.includes("fat loss") || lower.includes("lose weight")) return "Sustainable fat loss";
  if (lower.includes("abs")) return "Visible abs at rest";

  return persona?.primaryGoal || "Goal discovery needed";
}

function inferObjectives({ conversation, persona, goal }) {
  const objectives = new Set(persona?.supportingObjectives ?? []);
  const lower = conversation.toLowerCase();

  if (goal.toLowerCase().includes("abs")) {
    objectives.add("Preserve lean mass");
    objectives.add("Maintain photo consistency");
  }

  if (goal.toLowerCase().includes("marathon") || goal.toLowerCase().includes("triathlon")) {
    objectives.add("Discipline balance");
    objectives.add("Manage recovery");
    objectives.add("Fuel training");
  }

  if (lower.includes("sleep")) objectives.add("Improve sleep consistency");
  if (lower.includes("protein")) objectives.add("Maintain protein target");
  if (lower.includes("injury")) objectives.add("Protect injury recovery");

  return [...objectives].slice(0, 6);
}

function inferEvidence({
  conversation,
  integrations,
  persona,
  photoInterpretations,
  photoUploads,
  triathlonContext,
}) {
  const evidence = [];
  const lower = conversation.toLowerCase();

  for (const item of persona?.existingEvidence ?? []) {
    evidence.push({
      type: normalizeEvidenceType(item),
      label: item,
      source: "Persona history",
      confidence: "Medium",
      influence: "Initial model context",
    });
  }

  for (const integration of integrations) {
    evidence.push(...getIntegrationEvidence(integration, triathlonContext));
  }

  if (lower) {
    evidence.push({
      type: "Voice / Typed Conversation",
      label: "Goal initialization transcript",
      source: "Lab conversation",
      confidence: "Medium",
      influence: "Goal, preferences, missing pieces",
    });
  }

  for (const photo of photoUploads) {
    evidence.push({
      type: "Progress Photo",
      label: photo.name,
      source: "Lab photo upload",
      confidence: "Simulated",
      influence: "Visual goal interpretation",
    });
  }

  for (const result of photoInterpretations) {
    const interpretation = result.interpretation;

    if (!interpretation) continue;

    evidence.push({
      type: "Visual Evidence",
      label: `PhotoInterpreter ${interpretation.views_detected.join(", ")} set`,
      source: result.provider === "openai" ? "OpenAI PhotoInterpreter" : "PhotoInterpreter fallback",
      confidence: result.provider === "openai" ? "Medium" : "Low",
      influence: interpretation.user_facing_summary,
    });
    evidence.push({
      type: "Coach Briefing Insert",
      label: "PhotoInterpreter coach synthesis",
      source: result.provider === "openai" ? "OpenAI PhotoInterpreter" : "PhotoInterpreter fallback",
      confidence: result.provider === "openai" ? "Medium" : "Low",
      influence: interpretation.coach_briefing_insert,
    });
  }

  if (lower.includes("weight")) {
    evidence.push({
      type: "Weight",
      label: "Weight context mentioned",
      source: "Conversation",
      confidence: "Low until measured",
      influence: "Trajectory and goal confidence",
    });
  }

  return dedupeByLabel(evidence).slice(0, 12);
}

function inferProtocols({ conversation, evidence, persona, triathlonContext }) {
  const protocols = [];

  if (triathlonContext.isTriathlon) {
    if (triathlonContext.swimIsPrimaryGap) {
      protocols.push({
        title: "Establish Swimming Rhythm",
        status: "suggested",
        maturity: "Draft",
        reasoning: "Swimming is the stated bottleneck, so the first useful protocol is a repeatable swim baseline.",
      });
    }

    if (triathlonContext.runStrength) {
      protocols.push({
        title: "Run Consistency",
        status: "established",
        maturity: "Existing strength",
        reasoning: "The conversation and connected training evidence indicate running consistency already exists.",
      });
    }

    if (triathlonContext.bikeStrength) {
      protocols.push({
        title: "Bike Consistency",
        status: "established",
        maturity: "Existing strength",
        reasoning: "The conversation and connected training evidence indicate cycling consistency already exists.",
      });
    }

    protocols.push(
      {
        title: "Recovery Check-In",
        status: "suggested",
        maturity: "Support protocol",
        reasoning: "Recovery supports training adaptation but is not the first bottleneck.",
      },
      {
        title: "Fueling / Nutrition Baseline",
        status: "suggested",
        maturity: "Support protocol",
        reasoning: "Fueling matters for triathlon execution, but it supports the discipline gap unless nutrition is named as the main blocker.",
      }
    );
  }

  for (const protocol of persona?.likelyProtocols ?? []) {
    protocols.push({
      title: protocol,
      status: "established",
      maturity: "Known from persona",
      reasoning: "Likely operating plan element for this persona.",
    });
  }

  if (evidence.some((item) => item.type === "Progress Photo")) {
    protocols.push({
      title: "Comparable progress photos",
      status: "suggested",
      maturity: "Draft",
      reasoning: "Photo evidence becomes more useful when capture conditions are consistent.",
    });
  }

  if (conversation.toLowerCase().includes("protein")) {
    protocols.push({
      title: "Protein target",
      status: "suggested",
      maturity: "Draft",
      reasoning: "Protein context supports lean-mass and recovery objectives.",
    });
  }

  return dedupeByTitle(protocols).slice(0, 10);
}

function inferMissingPieces({ evidence, persona, triathlonContext }) {
  const missing = new Set(persona?.missingEvidence ?? []);
  const labels = evidence.map((item) => item.label.toLowerCase());

  for (const item of [...missing]) {
    if (labels.some((label) => label.includes(item.toLowerCase()))) {
      missing.delete(item);
    }
  }

  if (evidence.length < 3) missing.add("Baseline evidence");
  if (!evidence.some((item) => item.type.includes("Weight"))) missing.add("Current weight trend");
  if (triathlonContext.isTriathlon && triathlonContext.swimIsPrimaryGap) {
    missing.add("Swim baseline");
  }

  return [...missing].slice(0, 6);
}

function inferConfidence({ evidence, missingPieces, maturity, triathlonContext }) {
  const base = 28 + evidence.length * 4 - missingPieces.length * 5;
  const maturityBonus = maturityStages.indexOf(maturity) * 4;
  const rawConfidence = base + maturityBonus;

  if (triathlonContext.isTriathlon && triathlonContext.swimIsPrimaryGap) {
    return Math.max(28, Math.min(62, rawConfidence));
  }

  if (maturity === "Beginner" || maturity === "Building") {
    return Math.max(18, Math.min(68, rawConfidence));
  }

  return Math.max(18, Math.min(88, rawConfidence));
}

function getMaturity({ conversation, integrations, persona }) {
  const evidenceCount = (persona?.existingEvidence?.length ?? 0) + integrations.length;

  if (conversation.length > 0) {
    return evidenceCount >= 2 || conversation.length > 80 ? "Building" : "Beginner";
  }

  if (persona?.level === "Power user" || evidenceCount >= 8) return "Optimizing";
  if (evidenceCount >= 5) return "Operating";
  if (evidenceCount >= 2) return "Building";

  return "Beginner";
}

function inferAcumen({ conversation, persona }) {
  const text = `${conversation} ${persona?.background ?? ""}`.toLowerCase();

  if (text.includes("athlete") || text.includes("bodybuilder") || text.includes("powerlifter")) {
    return "High training acumen";
  }

  if (persona?.level === "Beginner" || persona?.level === "Empty profile") {
    return "Needs concept education";
  }

  return "Moderate health acumen";
}

function inferGuidanceMode(persona) {
  const style = `${persona?.engagementStyle ?? ""} ${persona?.title ?? ""}`.toLowerCase();

  if (style.includes("proactive")) return "Proactive";
  if (style.includes("minimal") || style.includes("concise")) return "Minimal";
  if (style.includes("detailed") || style.includes("data")) return "Detailed";

  return "Adaptive";
}

function inferTimeline(conversation) {
  const lower = conversation.toLowerCase();

  if (lower.includes("race") || lower.includes("show")) return "Event-based timeline detected";
  if (lower.includes("weeks")) return "Near-term timeline mentioned";
  if (lower.includes("months")) return "Multi-month goal horizon";

  return "Timeline not yet established";
}

function inferNextBestStep({ missingPieces, protocols, persona, triathlonContext }) {
  if (triathlonContext.isTriathlon && triathlonContext.swimIsPrimaryGap && !triathlonContext.nutritionIsPrimaryBlocker) {
    return {
      label: "Establish Swimming Rhythm",
      explanation: "Swimming is the direct goal bottleneck. Nutrition and recovery matter, but they support the first swim evidence loop rather than replacing it.",
      ranking: [
        "Direct goal bottleneck: swimming",
        "Existing strengths: running and cycling consistency",
        "Supporting protocols: recovery and fueling",
        "Generic missing evidence ranks below the weakest race discipline",
      ],
    };
  }

  if (missingPieces.length > 0) {
    return {
      label: `Clarify ${missingPieces[0]}.`,
      explanation: "The most important missing evidence should be clarified before adding less relevant protocols.",
      ranking: ["Highest missing evidence item selected as first clarification step."],
    };
  }
  if (protocols.some((protocol) => protocol.status === "suggested")) {
    const protocol = protocols.find((item) => item.status === "suggested");
    return {
      label: `Confirm ${protocol.title}.`,
      explanation: "A suggested protocol is the next repeatable evidence loop.",
      ranking: ["Suggested protocols outrank passive review when enough goal context exists."],
    };
  }

  return {
    label: persona?.firstWowMoment || "Generate the first Daily Briefing.",
    explanation: "No higher-priority missing evidence or protocol candidate was found.",
    ranking: ["Fallback to first useful Daily Briefing."],
  };
}

function getStartingBriefing({
  confidence,
  evidence,
  goal,
  missingPieces,
  nextBestStep,
  nextBestStepDecision,
  objectives,
  persona,
  photoInterpretations = [],
  triathlonContext,
}) {
  const latestPhotoInterpretation = photoInterpretations.find((result) => result.interpretation)
    ?.interpretation;

  if (triathlonContext.isTriathlon) {
    const integrationSummary = triathlonContext.integrationEffects.length > 0
      ? ` Apple Health, Apple Watch, and MyFitnessPal add early context around ${triathlonContext.integrationEffects.slice(0, 4).join(", ")}.`
      : "";

    return {
      title: "Starting Briefing",
      headline: "Your sprint triathlon model starts with the swim.",
      understanding: `You already have signs of workout consistency and a cardio base; running and cycling look like strengths. Swimming is the clearest gap to turn into evidence.${integrationSummary}`,
      whatMatters: "Build a simple swim rhythm first. Recovery and fueling should support that protocol, not distract from it.",
      confidence: `Building confidence / ${confidence}% internal confidence`,
      stillLearning:
        missingPieces.length > 0
          ? `Still learning: ${missingPieces.slice(0, 3).join(", ")}.`
          : "The starting model has enough context to create a useful first swim evidence loop.",
      nextStep: `${nextBestStep}. ${nextBestStepDecision.explanation}`,
    };
  }

  return {
    title: "Starting Briefing",
    headline: `${goal} is now the active operating model.`,
    understanding: `PhysiqueOS understands the primary goal, ${objectives.length} supporting objective${objectives.length === 1 ? "" : "s"}, and ${evidence.length} early evidence stream${evidence.length === 1 ? "" : "s"}.`,
    whatMatters:
      latestPhotoInterpretation?.coach_briefing_insert ??
      persona?.firstBriefingEmphasis ??
      "The first priority is organizing enough evidence to produce useful guidance.",
    confidence: `${confidence}% internal confidence`,
    stillLearning:
      missingPieces.length > 0
        ? `Still learning: ${missingPieces.slice(0, 3).join(", ")}.`
        : "The starting model has enough evidence to create a useful first operating loop.",
    nextStep: nextBestStep,
  };
}

function getHomePreview({ confidence, goal, homeMode, maturity, nextBestStep, objectives, protocols }) {
  const stageTone = {
    "Brand New User": "Learning the baseline.",
    "Building Stage": "Evidence is becoming useful.",
    "Established User": "The operating loop is active.",
    "Power User": "Optimization signals are available.",
  };

  const priorities = [
    nextBestStep,
    ...protocols
      .filter((protocol) => protocol.status === "suggested")
      .map((protocol) => protocol.title),
  ];

  return {
    mode: homeMode,
    trajectory: maturity === "Beginner" || maturity === "Building" ? "Building confidence." : "Goal model active.",
    primaryGoal: goal,
    confidence,
    context: stageTone[homeMode] ?? stageTone["Brand New User"],
    priorities: [...new Set(priorities)].slice(0, homeMode === "Power User" ? 4 : 3),
    objectives: objectives.slice(0, 3),
  };
}

function getReasoning({ confidence, evidence, goal, missingPieces, objectives, triathlonContext }) {
  const reasoning = [
    `Primary goal established as ${goal}.`,
    `${evidence.length} evidence stream${evidence.length === 1 ? "" : "s"} available for initial interpretation.`,
    `${objectives.length} supporting objective${objectives.length === 1 ? "" : "s"} identified.`,
    missingPieces.length > 0
      ? `Missing evidence limits confidence: ${missingPieces.slice(0, 3).join(", ")}.`
      : "No major missing evidence detected in this simulation.",
    `Internal confidence starts at ${confidence}%.`,
  ];

  if (triathlonContext.isTriathlon) {
    reasoning.push(
      "Triathlon goals are evaluated by discipline bottleneck before generic evidence gaps.",
      triathlonContext.swimIsPrimaryGap
        ? "Swimming is treated as the first protocol candidate because it is the stated weakest discipline."
        : "No single triathlon discipline was identified as the first bottleneck."
    );
  }

  return reasoning;
}

function getProtocolMaturity(protocols) {
  if (protocols.length === 0) return "No protocols established";
  if (protocols.some((protocol) => protocol.status === "suggested")) return "Drafting";

  return "Established";
}

function getProtocolReasoning(protocols, evidence) {
  if (protocols.length === 0) {
    return "No protocols yet. The Lab should identify the first useful repeatable action.";
  }

  return `${protocols.length} protocol${protocols.length === 1 ? "" : "s"} can generate tasks. Those tasks become evidence and improve confidence.`;
}

function getFutureProtocolSuggestions({ missingPieces, persona }) {
  return missingPieces.slice(0, 3).map((piece) => `Create a lightweight protocol for ${piece}.`).concat(
    persona?.level === "Power user" ? ["Add an experiment review cadence."] : []
  );
}

function getGoalEngineDebug({ goal, objectives }) {
  return {
    activeGoal: goal,
    supportingObjectives: objectives,
    scoringMode: "Evaluation before progress scoring",
  };
}

function getEvidenceEngineDebug(evidence, triathlonContext) {
  return {
    streams: evidence.length,
    strongestSources: evidence.slice(0, 4).map((item) => item.label),
    integrationEffects: triathlonContext.integrationEffects,
    boundary: "Interpretation creates evidence; Evidence Engine decides meaning.",
  };
}

function getProtocolGraph(protocols) {
  return protocols.map((protocol) => ({
    protocol: protocol.title,
    creates: "Task",
    validates: "Evidence",
    improves: "Confidence",
  }));
}

function getReasoningChain({
  evidence,
  goal,
  missingPieces,
  nextBestStep,
  nextBestStepDecision,
  protocols,
  triathlonContext,
}) {
  const chain = [
    "User intent initializes the goal.",
    "Conversation and persona context become interpreted evidence.",
    `${evidence.length} evidence objects inform the starting model.`,
    `${protocols.length} protocols define repeatable evidence loops.`,
    missingPieces.length > 0
      ? "Missing evidence constrains confidence."
      : "Evidence is sufficient for a first briefing.",
    `Next best step: ${nextBestStep}`,
    `Goal model: ${goal}`,
  ];

  if (triathlonContext.isTriathlon) {
    chain.push(
      triathlonContext.swimIsPrimaryGap
        ? "Swimming outranked nutrition because it is the direct race bottleneck and nutrition was not named as the main blocker."
        : "No discipline-specific bottleneck outranked generic missing evidence.",
      "Confidence remains in a building state because the journey is newly initialized and the swim protocol has not produced evidence yet.",
      "Recovery and fueling are supporting protocols because they improve training quality after the swim rhythm is established.",
      triathlonContext.integrationEffects.length > 0
        ? `Fake integrations contributed: ${triathlonContext.integrationEffects.join(", ")}.`
        : "No fake integrations materially changed this run.",
      nextBestStepDecision.explanation
    );
  }

  return chain;
}

function getTriathlonContext({ conversation, goal, integrations, persona }) {
  const lower = `${conversation} ${goal} ${persona?.primaryGoal ?? ""}`.toLowerCase();
  const isTriathlon = lower.includes("triathlon") || lower.includes("sprint tri") || /\btri\b/.test(lower);
  const swimMentioned = lower.includes("swim");
  const swimIsPrimaryGap =
    isTriathlon &&
    swimMentioned &&
    /(weak|weakest|new|missing|gap|need structure|needs structure|baseline|rhythm|bottleneck)/.test(lower);
  const runStrength =
    isTriathlon &&
    (/(run|running).{0,40}(consistent|strength|strong|competent|comfortable)/.test(lower) ||
      lower.includes("strava") ||
      lower.includes("trainingpeaks"));
  const bikeStrength =
    isTriathlon &&
    (/(bike|biking|cycling|cycle).{0,40}(consistent|strength|strong|competent|comfortable)/.test(lower) ||
      lower.includes("power data") ||
      lower.includes("trainingpeaks"));
  const nutritionIsPrimaryBlocker =
    isTriathlon &&
    /(nutrition|fueling).{0,50}(main blocker|biggest blocker|weakest|primary gap|primary issue)/.test(lower);

  return {
    isTriathlon,
    swimMentioned,
    swimIsPrimaryGap,
    runStrength,
    bikeStrength,
    nutritionIsPrimaryBlocker,
    integrationEffects: getIntegrationEffects(integrations),
  };
}

function getIntegrationEvidence(integration, triathlonContext) {
  const lower = integration.toLowerCase();

  if (lower === "apple health") {
    return [
      {
        type: "Activity Rhythm",
        label: "Apple Health activity rhythm",
        source: "Fake integration",
        confidence: "Simulated",
        influence: triathlonContext.isTriathlon
          ? "Supports workout consistency and daily activity context for triathlon readiness."
          : "Supports activity rhythm and health context.",
      },
    ];
  }

  if (lower === "apple watch") {
    return [
      {
        type: "Training",
        label: "Apple Watch workout consistency",
        source: "Fake integration",
        confidence: "Simulated",
        influence: triathlonContext.isTriathlon
          ? "Supports cardio base, training history, and discipline consistency."
          : "Supports workout consistency and activity history.",
      },
      {
        type: "Cardio Base",
        label: "Apple Watch cardio base",
        source: "Fake integration",
        confidence: "Simulated",
        influence: "Creates early context for endurance readiness.",
      },
    ];
  }

  if (lower === "myfitnesspal") {
    return [
      {
        type: "Nutrition",
        label: "MyFitnessPal nutrition familiarity",
        source: "Fake integration",
        confidence: "Simulated",
        influence: triathlonContext.isTriathlon
          ? "Shows nutrition evidence availability and future fueling baseline potential."
          : "Shows nutrition evidence availability.",
      },
    ];
  }

  return [
    {
      type: integration,
      label: integration,
      source: "Fake integration",
      confidence: "Simulated",
      influence: "Integration readiness test",
    },
  ];
}

function getIntegrationEffects(integrations) {
  const effects = new Set();

  for (const integration of integrations) {
    const lower = integration.toLowerCase();

    if (lower === "apple health") {
      effects.add("activity rhythm");
      effects.add("training history");
    }

    if (lower === "apple watch") {
      effects.add("workout consistency");
      effects.add("cardio base");
    }

    if (lower === "myfitnesspal") {
      effects.add("nutrition familiarity");
      effects.add("nutrition evidence availability");
      effects.add("fueling baseline potential");
    }
  }

  return [...effects];
}

function normalizeEvidenceType(value) {
  const lower = value.toLowerCase();

  if (lower.includes("weight")) return "Weight";
  if (lower.includes("photo")) return "Progress Photo";
  if (lower.includes("dexa")) return "DEXA";
  if (lower.includes("nutrition") || lower.includes("macro")) return "Nutrition";
  if (lower.includes("sleep") || lower.includes("recovery")) return "Recovery";
  if (lower.includes("lab") || lower.includes("blood")) return "Blood Work";
  if (lower.includes("training") || lower.includes("workout")) return "Training";

  return value;
}

function dedupeByLabel(items) {
  return [...new Map(items.map((item) => [item.label, item])).values()];
}

function dedupeByTitle(items) {
  return [...new Map(items.map((item) => [item.title, item])).values()];
}
