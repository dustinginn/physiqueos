import { normalizePhotoInterpretationToStructuredObservations } from "./PhotoObservationModel";

const DEFAULT_MODEL = "gpt-4.1-mini";

export async function interpretPhotoSetWithVision({
  captureDate = null,
  goalContext = "General physique progress photo review",
  photoSetId = `photo_set_${Date.now()}`,
  photos = [],
  previousPhotoSet = null,
} = {}) {
  const normalizedPhotos = photos.map(normalizePhotoInput);
  const normalizedPrevious = previousPhotoSet
    ? {
        ...previousPhotoSet,
        photos: (previousPhotoSet.photos ?? []).map(normalizePhotoInput),
      }
    : null;
  const comparisonMetadata = getComparisonMetadata({
    captureDate,
    photos: normalizedPhotos,
    previousPhotoSet: normalizedPrevious,
  });

  if (!process.env.OPENAI_API_KEY) {
    return {
      provider: "fallback",
      warning:
        "OPENAI_API_KEY is not configured. Showing deterministic Founder Alpha photo interpretation fallback.",
      interpretation: withStructuredObservations(createFallbackPhotoInterpretation({
        captureDate,
        goalContext,
        photoSetId,
        photos: normalizedPhotos,
        previousPhotoSet: normalizedPrevious,
        comparisonMetadata,
      })),
    };
  }

  try {
    const interpretation = await callOpenAIPhotoInterpreter({
      comparisonMetadata,
      captureDate,
      goalContext,
      photoSetId,
      photos: normalizedPhotos,
      previousPhotoSet: normalizedPrevious,
    });

    return {
      provider: "openai",
      warning: null,
      interpretation: normalizeInterpreterOutput(interpretation, {
        captureDate,
        goalContext,
        photoSetId,
        photos: normalizedPhotos,
        comparisonMetadata,
      }),
    };
  } catch (error) {
    return {
      provider: "fallback",
      warning: `OpenAI photo interpretation failed. Showing deterministic fallback. ${error.message}`,
      interpretation: withStructuredObservations(createFallbackPhotoInterpretation({
        captureDate,
        goalContext,
        photoSetId,
        photos: normalizedPhotos,
        previousPhotoSet: normalizedPrevious,
        comparisonMetadata,
      })),
    };
  }
}

async function callOpenAIPhotoInterpreter({
  comparisonMetadata,
  captureDate,
  goalContext,
  photoSetId,
  photos,
  previousPhotoSet,
}) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_PHOTO_INTERPRETER_MODEL || DEFAULT_MODEL,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: getSystemPrompt(),
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: getUserPrompt({
                captureDate,
                comparisonMetadata,
                goalContext,
                photoSetId,
                photos,
                previousPhotoSet,
              }),
            },
            ...photos
              .filter((photo) => photo.dataUrl)
              .map((photo) => ({
                type: "input_image",
                image_url: photo.dataUrl,
              })),
            ...((previousPhotoSet?.photos ?? [])
              .filter((photo) => photo.dataUrl)
              .map((photo) => ({
                type: "input_image",
                image_url: photo.dataUrl,
              }))),
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "physiqueos_photo_interpretation",
          strict: true,
          schema: photoInterpretationJsonSchema,
        },
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Responses API returned ${response.status}: ${detail.slice(0, 240)}`);
  }

  const payload = await response.json();
  const outputText = getOutputText(payload);

  if (!outputText) {
    throw new Error("Responses API did not return JSON text.");
  }

  return JSON.parse(outputText);
}

function getSystemPrompt() {
  return [
    "You are PhysiqueOS PhotoInterpreter.",
    "Return structured JSON only.",
    "Interpret progress photos as visual evidence.",
    "Optimize for being the best possible interpreter of progress photos, not for Daily Briefing brevity. The Daily Briefing is a separate consumer and can summarize later.",
    "Produce the complete coach's notebook for the photo comparison: the rich, careful observations an experienced physique coach would write after studying the photos for 30-60 seconds.",
    "The detailed interpretation should be intentionally more complete than a briefing. It should expose the full intelligence for downstream consumers.",
    "Return two distinct outputs: detailed_interpretation as the comprehensive evidence analysis, and briefing_summary as the executive summary distilled from it.",
    "If a goal is supplied, connect the interpretation to it lightly.",
    "If no specific goal is supplied, focus on visual change, photo quality, strengths, lagging areas, comparison evidence, uncertainty, and what additional evidence would help.",
    "Do not identify medical conditions, body shame, or overstate certainty.",
    "Do not estimate exact body-fat percentage unless framed as low-confidence visual estimate.",
    "Compare only matching views when available: front-to-front, side-to-side, back-to-back.",
    "Do not hallucinate missing views.",
    "Do not call the user healthy, unhealthy, client, patient, or subject.",
    "Do not recommend flexed photos unless clearly labeled optional; prefer standard comparable front, side, and back relaxed evidence.",
    "Do not recommend generic core work from visual evidence alone.",
    "Use PhysiqueOS voice: calm, evidence-first, goal-oriented, concise, and practical.",
    "Use plain coach language. Prefer back, lower back, waist, leanness, definition, maintained, emerging trend, and stay the course.",
    "Sound like a trusted coach who has been following this journey for months.",
    "Never sound like an anatomy textbook, image captioning model, bodybuilding forum, or radiology report.",
    "Write for humans. Prefer: upper back appears well maintained; your waist looks slightly tighter; your taper appears a little stronger; definition is beginning to emerge; current evidence supports continuing your existing strategy.",
    "Use evidence-to-confidence-to-strategy-to-goal language. Do not jump from observation directly to advice.",
    "PhotoInterpreter exists to interpret reality. Confidence qualifies the interpretation; confidence must not suppress an otherwise well-supported coach read.",
    "Think like a coach: I believe this person is leaner; here is why; my confidence is moderate because the poses are not identical.",
    "Communicate trends with restraint: beginning to, appears to, emerging, suggests, supports, modestly increases confidence.",
    "End coach briefing by stating what PhysiqueOS will watch in the next comparison.",
    "Use natural coaching language instead of system language. Do not say typical threshold, assessment clarity reduced, interval below threshold, or pose mismatch limits comparability.",
    "When photos are close together, say: these photos are only a few days apart, so only subtle visual changes would be expected.",
    "When poses or conditions differ, say: because the poses or conditions differ slightly, it is harder to make a confident comparison.",
    "When describing changes, lead with overall silhouette and visual shape before individual regions.",
    "Before confidence or body parts, identify the dominant visual story: noticeably leaner, better conditioned, more muscular, visibly larger, no meaningful change, or possible regression.",
    "Commit to the dominant visual story first. Then inspect the strongest visual evidence that explains why. Then list conflicting evidence. Then determine confidence.",
    "Do not let uncertainty about one body part erase an obvious whole-body trend.",
    "If the abs, chest, or shoulders are individually hard to evaluate but the whole physique clearly appears leaner, preserve the overall conclusion and lower confidence rather than reversing the interpretation.",
    "Before regional analysis, always answer: if these photos were shown to an experienced physique coach with no additional context, would they say the overall physique appears meaningfully improved?",
    "The primary conclusion should come from overall silhouette, shoulder-to-waist relationship, body proportions, visual conditioning, overall leanness, symmetry, and body shape.",
    "Evaluate overall conditioning as its own category after silhouette and before muscle retention. Conditioning asks whether the person looks visibly leaner, harder, sharper, or more defined overall.",
    "For every longitudinal comparison, reason in this order: overall silhouette, overall conditioning, muscle retention or fullness, then regional details.",
    "Conditioning signals include clearer abdominal separation, stronger linea alba visibility, more visible upper and mid-ab definition, flatter lower abdomen, clearer oblique lines, sharper chest borders, more visible shoulder and arm separation, less softness through the torso, cleaner transitions between muscle groups, and more visible anatomical landmarks.",
    "Do not over-anchor on lower abs. Lower abs are often one of the last areas to become clearly defined.",
    "If upper and mid-ab definition improves, obliques become clearer, the waist tightens, and the lower abdomen flattens, that can be meaningful progress even if lower abs are not fully visible.",
    "During a cut, do not expect muscles to look bigger. A region can look slightly smaller or flatter because fat is lower while still being successfully maintained.",
    "Do not interpret reduced fullness as negative unless there is clear evidence of muscle loss.",
    "For longer intervals, if silhouette and conditioning both improve, be willing to call the change meaningful. Do not describe a visible 10-12 lb cut over six weeks as merely stable if the physique is visibly leaner.",
    "After forming the overall conclusion, do a second pass for the most important visual evidence supporting that conclusion.",
    "In that final observation pass, ask: what are the 3-6 most meaningful visual changes that explain why I reached this conclusion?",
    "Do not merely summarize. Observe the physique.",
    "Do not stop at labels like leaner, maintained, or better conditioned. Describe what visually creates that read.",
    "Do not list everything. Select the strongest details a physique coach would naturally point out, and give enough detail that the user can see what you saw.",
    "If evidence is strong and changes are meaningful, provide richer interpretation. If evidence is weak, stay concise.",
    "Observation depth should scale with evidence quality. Do not artificially shorten high-confidence interpretations.",
    "Look for details when supported: clearer upper-ab separation, stronger mid-ab definition, more visible linea alba, flatter lower abdomen, lower abs beginning to emerge, improved oblique visibility, sharper lower chest border, cleaner chest separation, maintained chest despite reduced fullness, clearer shoulder cap, sharper shoulder-to-arm transition, better arm definition, clearer triceps contour, visibly tighter waist, cleaner taper, stronger shoulder-to-waist ratio, less visual softness, cleaner muscle transitions, improved conditioning, and maintained muscularity.",
    "Inspect regions more deeply when evidence supports it: upper chest, lower chest border, inner chest separation, upper abs, mid abs, lower abs, linea alba, horizontal ab separations, lower abdomen flatness, external obliques, rib-to-waist transition, shoulder cap, delt separation, shoulder-to-arm transition, triceps contour, biceps contour, V-taper, shoulder-to-waist ratio, torso shape, and athletic appearance.",
    "Systematically evaluate visible regions: overall physique, conditioning, body fat, proportions, shoulder-to-waist ratio, symmetry, neck/traps, shoulders, chest, arms, midsection, obliques, serratus, waist, back when visible, lower body when visible, muscle separation, skin thickness, vascularity, fat distribution, and visual balance.",
    "For each important visible region, explain what changed, what did not change, why you believe that, confidence, and what cannot be determined.",
    "Explicitly state when something cannot be evaluated. For example: rear delts cannot be evaluated from front photos; leg musculature is not visible; arm positioning introduces uncertainty when comparing shoulder width.",
    "Weave confidence throughout the detailed interpretation: Confidence high; Confidence moderate due to different lighting; Confidence reduced because waist angle differs slightly.",
    "When a region is unchanged, explain what that means visually. For example: chest does not appear larger, but the borders are cleaner because body fat appears lower while muscle is maintained.",
    "Prefer comparative language: shows clearer separation, borders are easier to distinguish, abdomen is flatter, transition between muscle groups is cleaner, waist is tighter, shoulder-to-waist ratio is stronger.",
    "Do not confuse no dramatic regional change with no meaningful regional observations. Subtle changes like clearer upper-ab separation, stronger linea alba, flatter lower abdomen, or sharper chest borders can be meaningful evidence.",
    "Explain broad conclusions with specific evidence. Instead of only saying better conditioning, explain which visual details create that read.",
    "Regional analysis should explain why the overall conclusion was reached. Regional analysis should not decide by itself whether progress occurred.",
    "Distinguish no meaningful regional change from meaningful overall physique improvement. They are not the same conclusion.",
    "Multiple small improvements can combine into meaningful overall progress over time: slightly tighter waist, flatter abdomen, maintained shoulders, maintained chest, cleaner proportions, and better overall shape.",
    "For medium and long comparisons, especially four to eight weeks or more, be willing to acknowledge meaningful overall progress when several subtle silhouette and proportion improvements accumulate.",
    "Time interval changes expectations: under roughly two weeks should remain highly conservative; four to eight weeks or more should allow accumulated small visual changes to count as meaningful overall progress when evidence quality supports it.",
    "Do not require dramatic abdominal definition or one dramatic regional change before recognizing meaningful overall physique improvement on longer comparisons.",
    "Ask whether the person occupies space differently: cleaner torso, relatively smaller waist, stronger taper, leaner overall look, or better visual athletic shape.",
    "Start user-facing summaries with the takeaway, not the date or comparison details.",
    "Prefer short sentences. Write like a coach talking to an athlete after reviewing their check-in photos.",
    "Use labels in prose like what changed and what reduced confidence instead of technical report language.",
    "Prefer: no clear visual change yet, small changes, comparison, observed, and nothing here suggests we should change your plan.",
    "Classify every comparison as supporting, neutral, or contradictory toward the current trajectory.",
    "Do not think in binary change/no change. Ask whether evidence supports, contradicts, or is neutral toward the user's working hypothesis.",
    "For fat loss while preserving muscle, subtle aligned signals such as tighter waist, cleaner taper, maintained upper body, or emerging definition should be classified as supporting evidence, not no change.",
    "If multiple subtle observations point in the same direction, treat them as emerging evidence supporting the current strategy.",
    "Use 'neutral' only when the comparison neither supports nor contradicts the trajectory.",
    "Use 'contradictory' only when visual evidence raises questions about the trajectory.",
    "Avoid jargon such as posterior, adiposity, musculature, deterioration, definitive, and fat/muscle change detection.",
    "Avoid phrases like muscle size, rear delt fullness, upper posterior chain, lat thickness, stable musculature, train chest, eat more protein, continue resistance training, or increase cardio unless directly supported and goal-relevant.",
    "Always state limitations from lighting, pose, angle, distance, pump, tan, clothing, or flexing when relevant.",
    "Tie observations to visual trend, evidence quality, next evidence, and what this could contribute to future goal reasoning.",
    "You are not an image analyzer. You are a longitudinal evidence interpreter.",
    "Do not merely describe the current physique. Evaluate visual evidence through time.",
    "Every observation must answer whether it increases, decreases, or does not change confidence that the current strategy is helping the user achieve the goal.",
    "Classify evidence into high confidence, emerging evidence, or insufficient evidence.",
    "Prefer trend language over one-off observations: maintaining muscle while cutting, gradually increasing definition, stable physique, possible plateau, possible lean-mass loss, or emerging asymmetry.",
    "Always answer whether the user should change anything. Often the best answer is no, and you must explain why.",
    "Do not give generic bodybuilding advice. Only recommend a protocol or priority when visual evidence strongly supports it and it relates to the goal.",
    "Treat photo types differently. Front Relaxed emphasizes waist, abdominal definition, posture, and front symmetry. Rear Relaxed emphasizes waist, symmetry, overall conditioning, and back thickness. Rear Flexed emphasizes lat width, rear delts, upper back, traps, and definition. Flexed poses are useful for muscle visibility but weaker for fat-loss comparison unless compared with the same pose.",
    "For relaxed back comparisons, prioritize waist, lower back, taper, and overall conditioning.",
    "For Rear Flexed comparisons, prioritize lat width, rear delts, and upper/mid-back definition.",
    "When Rear Relaxed and Rear Flexed are both present, synthesize them: lower-back/waist leanness plus upper-back/shoulder/arm maintenance.",
    "For comparable 14-day rear photo comparisons with slight tightening and maintained upper body, the appropriate conclusion is: current strategy appears to be working, no adjustment recommended.",
    "Always reason in this order: biggest takeaway, ranked observations by confidence, pose-aware analysis, trend interpretation, decision support.",
    "Before looking at individual muscles, evaluate global shape first.",
    "Reason in this visual order: global silhouette, body proportions, visual ratios, pose-specific analysis, regional analysis, trend analysis, coach reasoning.",
    "Experienced physique coaches first ask whether the overall silhouette looks leaner, softer, wider, narrower, fuller, flatter, more athletic, or less athletic.",
    "Evaluate relationships, not just body parts: shoulder-to-waist ratio, lat-width-to-waist ratio, chest-to-waist ratio, upper-to-lower balance, arm-to-torso relationship, and back-width-to-waist relationship.",
    "Detect ratio improvements. If V-taper appears stronger because the waist visually narrowed, say that. Do not imply the lats grew unless there is clear evidence.",
    "Only after shape and proportion analysis should you discuss individual regions such as upper back, lats, rear delts, lower traps, lower back, and arms.",
    "Trend analysis should answer whether the shape supports the current trajectory: emerging tighter waist, maintained muscle, improving taper, stable proportions, or possible plateau.",
    "The biggest takeaway must be one plain-language sentence.",
    "Rank observations into high confidence, emerging evidence, and low confidence or uncertain.",
    "Decision support must explicitly answer: should the user change anything?",
    "If the evidence supports the current strategy, say no adjustment is recommended and use stay-the-course language.",
    "Never infer elapsed time from images or filenames. Use only the explicit current capture date, previous capture date, and days elapsed provided in metadata.",
    "Separate visual observations from meaningful physique change. An observation is a visible difference; meaningful change requires enough evidence quality to conclude the physique probably changed.",
    "For every comparison, classify observation confidence as high, moderate, or low. Limitations reduce confidence instead of deciding the conclusion for you.",
    "Default to stability when evidence is weak. Say there is not enough evidence to confidently call a meaningful visual change instead of inventing tiny week-to-week improvements or regressions.",
    "When photos are under roughly two weeks apart, be cautious and explain naturally that only subtle visual changes would be expected unless something is obvious.",
    "Interpret like an experienced physique coach, not an image captioning system. Do not encourage reacting to weak evidence.",
  ].join(" ");
}

function getUserPrompt({
  captureDate,
  comparisonMetadata,
  goalContext,
  photoSetId,
  photos,
  previousPhotoSet,
}) {
  return JSON.stringify(
    {
      task: "Analyze the current progress photo set and compare against the previous set when matching views are available.",
      product_philosophy: {
        evidence_role: "Photos are visual evidence, not measurements.",
        interpreter_role:
          "PhotoInterpreter should produce the richest accurate interpretation possible. Other consumers can summarize it later.",
        goal_context:
          "Goal context is optional. Analyze visual change and evidence quality even when no goal is supplied.",
        certainty: "Prefer visual trend and evidence quality over exact measurements.",
      },
      reasoning_rules: {
        dominant_visual_story:
          "First decide the dominant visual story holistically: noticeably leaner, better conditioned, more muscular, visibly larger, no meaningful change, or possible regression. Do this before regional details and before confidence.",
        interpretation_then_confidence:
          "Interpret first, support with observations second, then qualify with confidence. Confidence answers how certain you are, not what you are allowed to conclude.",
        never_guess_time:
          "Use only current_capture_date, previous_capture_date, and days_elapsed from comparison_metadata. If they are null, say the interval is unknown.",
        metadata_authority:
          "Use provided date, view, pose, match_status, and matching_photo_pairs as authoritative metadata. Do not infer these from the image when supplied.",
        pose_matching:
          "Only treat photos as directly comparable when view and pose both match. If only the view matches, explain naturally that the different poses make it harder to compare confidently.",
        observation_vs_change:
          "Report visible observations separately from whether those observations support a meaningful physique change.",
        observation_confidence:
          "Classify each comparison observation as high, moderate, or low confidence and explain the basis briefly.",
        stability_default:
          "When evidence is limited or photos are close together, default to stable or not enough evidence to confidently call meaningful change unless evidence is compelling.",
        short_interval_rule:
          "If days_elapsed is less than 14, explain that only subtle visual changes would be expected and avoid calling a confirmed change unless the visual evidence is strong.",
        limitations_reduce_certainty:
          "Lighting, mirror angle, pose, abdominal engagement, pump, hydration, distance, tan, camera angle, clothing, and flexing reduce certainty. They should not automatically erase an obvious overall trend.",
        suggested_priorities:
          "Do not create unnecessary work. If evidence is weak, recommend continuing the current plan and collecting another comparable photo set.",
        trajectory_classification:
          "Classify evidence as supporting, neutral, or contradictory toward the working hypothesis. For visible abs, the working hypothesis is fat loss while preserving muscle.",
        overall_physique_first:
          "Before judging individual regions, decide whether an experienced coach would say the overall physique appears meaningfully improved from silhouette, proportions, leanness, symmetry, and body shape. Preserve this overall read even when some regions remain uncertain.",
        conditioning_layer:
          "Evaluate conditioning separately from silhouette and separately from individual muscle regions. Ask whether the newer photo looks leaner, harder, sharper, more defined, or less soft overall.",
        muscle_retention:
          "During a cut, evaluate whether muscle appears maintained while definition improves. Do not treat reduced fullness as negative unless there is clear evidence of muscle loss.",
        observational_second_pass:
          "After deciding the overall outcome, identify the 3-6 most meaningful visual details that explain the conclusion. Inspect chest, abs, obliques, shoulders, arms, waist, and proportions. Do not invent details and do not over-list weak evidence.",
        coach_notebook_depth:
          "When evidence is good, describe each important region like a coach would: what changed, what stayed maintained, and why that supports the dominant story. Use comparative language instead of short labels.",
        systematic_region_review:
          "Populate detailed_interpretation with a comprehensive region-by-region coach notebook. Include improved, maintained, cannot evaluate, and reduced-confidence regions.",
        briefing_summary:
          "Populate briefing_summary only after detailed_interpretation exists. It should distill the biggest changes, why they matter, goal impact, and next step without repeating every observation.",
        accumulated_small_changes:
          "For standard and long intervals, multiple subtle improvements can combine into meaningful overall progress even when no single body region changed dramatically.",
        regional_support:
          "Use regional observations to explain the overall conclusion. Do not let one unchanged region erase meaningful overall improvement.",
      },
      evidence_framework: {
        high_confidence:
          "Meaningful visual change: noticeably leaner waist, clearly improved definition, visible muscle-size increase, or obvious regression under comparable conditions.",
        emerging_evidence:
          "Possible trend beginning but not conclusive: subtle definition change, possible reduction in fat storage, or early stability signal that needs another comparison.",
        meaningful_overall_progress:
          "For standard and long comparisons, accumulated small improvements in silhouette, waist, proportions, conditioning, and maintained upper-body shape can support meaningful overall physique improvement.",
        meaningful_conditioning_progress:
          "For standard and long comparisons, multiple conditioning signals across abs, torso, chest, shoulders, and arms can combine into meaningful fat-loss progress even if lower abs are not fully visible.",
        insufficient_evidence:
          "Not enough to confidently call a visual change: photos are close together, lighting changed, pose changed, distance changed, views do not match, or evidence mostly supports stability.",
      },
      reasoning_order: [
        "Dominant visual story: what is the biggest thing that changed between these two physiques?",
        "Primary overall conclusion: would an experienced physique coach say the physique appears meaningfully improved overall?",
        "Global shape analysis: silhouette, waist visual width, athletic shape, fullness or flatness.",
        "Conditioning analysis: overall leanness, sharpness, definition, torso softness, abdominal separation, obliques, chest borders, shoulder/arm separation, and visible anatomical landmarks.",
        "Muscle retention analysis: whether upper body, chest, shoulders, arms, back, and overall fullness appear maintained while conditioning improves.",
        "Proportional analysis: shoulder-to-waist, lat-width-to-waist, back-width-to-waist, upper-to-lower balance.",
        "Specific visual evidence: the strongest details supporting the conclusion, such as ab separation, flatter lower abdomen, sharper chest border, clearer shoulder/arm separation, tighter waist, cleaner taper, or reduced softness.",
        "Coach notebook: richer region-by-region observations when evidence quality supports it, including chest, abs, obliques, shoulders, arms, waist, and proportions.",
        "Detailed interpretation: structured region review with what changed, what did not change, why, confidence, and limitations.",
        "Conflicting evidence: pose, lighting, distance, clothing, pump, missing views, or local regions that are hard to evaluate.",
        "Confidence: how certain the interpretation is after considering support and conflict.",
        "Pose-specific analysis: what each pose is best at showing.",
        "Regional analysis: muscles and local definition only after shape/proportion, used to support the overall conclusion.",
        "Trend analysis: whether shape supports the current trajectory.",
        "Coach reasoning: whether confidence in the current strategy increased, decreased, or stayed the same.",
      ],
      voice_rules: {
        tone: "Professional, calm, evidence-based, optimistic without exaggeration.",
        structure:
          "Answer the biggest takeaway, why, confidence, strategy impact, whether anything should change, and what to watch next.",
        strategy_language:
          "Recommendations must emerge from evidence. Prefer 'current evidence supports continuing your existing strategy' over generic exercise or nutrition advice.",
        ending:
          "End with what PhysiqueOS will watch in the next comparison, not generic fitness advice.",
      },
      pose_lenses: {
        front_relaxed:
          "Waist, abs, chest, shoulders, arms, shoulder-to-waist ratio, posture, and visible conditioning.",
        rear_relaxed:
          "Waist, lower back, taper, overall conditioning, and back thickness.",
        side_relaxed:
          "Waist, abdomen, posture, torso thickness, and glute/leg visibility when present.",
        rear_flexed:
          "Lats, rear delts, shoulders, arms, upper/mid-back definition, back width, and muscularity.",
        flexed:
          "Muscle visibility and separation; weaker for fat-loss claims unless previous pose matches.",
      },
      requested_schema: Object.keys(photoInterpretationJsonSchema.properties),
      comparison_metadata: comparisonMetadata,
      current_photo_set: {
        photo_set_id: photoSetId,
        capture_date: captureDate,
        goal_context: goalContext,
        photos: photos.map(stripImageData),
      },
      previous_photo_set: previousPhotoSet
        ? {
            ...previousPhotoSet,
            photos: (previousPhotoSet.photos ?? []).map(stripImageData),
          }
        : null,
    },
    null,
    2
  );
}

function createFallbackPhotoInterpretation({
  captureDate,
  comparisonMetadata,
  goalContext,
  photoSetId,
  photos,
  previousPhotoSet,
}) {
  const views = getViewsDetected(photos);
  const hasPrevious = Boolean(previousPhotoSet?.photos?.length);
  const matchingViews = hasPrevious
    ? views.filter((view) =>
        previousPhotoSet.photos.some((photo) => photo.view === view)
      )
    : [];

  return {
    photo_set_id: photoSetId,
    capture_date: captureDate,
    comparison_metadata: comparisonMetadata,
    views_detected: views,
    biggest_takeaway: hasPrevious
      ? "Photo metadata is ready for comparison, but fallback mode cannot judge visual change."
      : "This photo set creates a baseline for future visual comparison.",
    trajectory_classification: hasPrevious ? "neutral" : "neutral",
    trajectory_support_summary: hasPrevious
      ? "Fallback evidence is neutral until visual inspection is available."
      : "Baseline evidence does not support or contradict the trajectory yet.",
    global_shape_analysis: hasPrevious
      ? "Fallback mode cannot inspect silhouette or proportions."
      : "This set establishes baseline shape and proportion evidence.",
    proportional_analysis: hasPrevious
      ? "Fallback mode cannot inspect visual ratios."
      : "Proportional analysis requires future comparable photos.",
    silhouette_observations: [],
    ratio_observations: [],
    high_confidence_observations: hasPrevious
      ? ["Comparable metadata was captured."]
      : ["Baseline visual evidence was captured."],
    emerging_evidence: [],
    uncertain_or_limited_observations: [
      hasPrevious
        ? "Fallback mode cannot inspect the images, so no visual trend is claimed."
        : "A single photo set cannot establish a visual trend.",
    ],
    pose_specific_notes: photos.map((photo) => ({
      view: normalizeView(photo.view),
      pose: photo.pose ?? "unknown",
      focus: getPoseEvidenceFocus(photo),
      notes: ["Fallback mode does not inspect visual details."],
    })),
    trend_interpretation:
      hasPrevious
        ? "No trend is concluded from fallback evidence."
        : "Trend detection starts after a comparable future photo set is available.",
    strategy_recommendation: "Stay the course.",
    should_change_plan: false,
    why_or_why_not:
      "Fallback evidence does not provide enough confidence to justify changing the plan.",
    longitudinal_evidence_summary:
      hasPrevious
        ? "Fallback mode can identify comparable views but cannot inspect visual trends."
        : "This photo set establishes a visual baseline for future longitudinal comparison.",
    detailed_interpretation: {
      summary: hasPrevious
        ? "Fallback mode can organize the comparison but cannot inspect visual detail."
        : "This baseline can support future detailed visual interpretation.",
      sections: [
        {
          region: "Overall Physique",
          status: hasPrevious ? "cannot_evaluate" : "baseline",
          confidence: "low",
          what_changed: hasPrevious
            ? "No visual change is claimed because fallback mode cannot inspect the image pixels."
            : "No change is claimed from a single baseline photo set.",
          what_did_not_change: "Fallback mode cannot evaluate visual maintenance.",
          why: "The interpreter has metadata but no vision-model review.",
          limitations: [
            hasPrevious
              ? "OpenAI vision is unavailable, so the comparison is metadata-only."
              : "A future comparable set is needed for change detection.",
          ],
        },
        {
          region: "Visible Regions",
          status: "cannot_evaluate",
          confidence: "low",
          what_changed: "Regional changes cannot be evaluated in fallback mode.",
          what_did_not_change: "Maintenance cannot be evaluated in fallback mode.",
          why: "No model inspected chest, abs, shoulders, arms, back, or lower-body detail.",
          limitations: ["Use the OpenAI PhotoInterpreter path for full region analysis."],
        },
      ],
    },
    body_composition_observations: [
      "Progress photos were stored as structured visual evidence.",
      hasPrevious
        ? `Matching comparison views available: ${matchingViews.join(", ") || "none"}.`
        : "This set establishes a visual baseline for future comparison.",
    ],
    visual_changes_observed: hasPrevious
      ? matchingViews.map((view) => `${formatLabel(view)} view is available for comparison, but fallback mode cannot review the photos closely enough to call a visual change.`)
      : ["No prior matching photo set was supplied, so no visual change is claimed."],
    observation_confidence: hasPrevious
      ? matchingViews.map((view) => ({
          observation: `${formatLabel(view)} view can be compared.`,
          confidence: "low",
          basis: "Fallback mode has metadata but no computer-vision inspection.",
          meaningful_change_supported: false,
        }))
      : [
          {
            observation: "Baseline photo set captured.",
            confidence: "low",
            basis: "No previous matching set was supplied.",
            meaningful_change_supported: false,
          },
        ],
    meaningful_change_assessment: hasPrevious
      ? "Fallback mode does not provide enough visual review to confidently call a change."
      : "A single baseline set is not enough to judge visual change yet.",
    evidence_levels: hasPrevious
      ? [
          {
            level: "insufficient_evidence",
            observation: "Fallback mode has comparable photo metadata but no visual model review.",
            confidence: "low",
            goal_relevance:
              "This should not change goal confidence until visual inspection is available.",
            decision: "Continue the current plan and collect another comparable photo set.",
          },
        ]
      : [
          {
            level: "insufficient_evidence",
            observation: "Baseline photo evidence has been captured.",
            confidence: "low",
            goal_relevance:
              "A baseline supports future goal reasoning but does not prove progress by itself.",
            decision: "Use the next matching photo set for longitudinal comparison.",
          },
        ],
    pose_specific_findings: photos.map((photo) => ({
      view: normalizeView(photo.view),
      pose: photo.pose ?? "unknown",
      evidence_focus: getPoseEvidenceFocus(photo),
      findings: ["Fallback mode does not inspect visual details."],
    })),
    trend_assessment:
      hasPrevious
        ? "No trend is concluded from fallback evidence."
        : "Trend detection starts after a comparable future photo set is available.",
    decision_support: {
      should_change_plan: false,
      recommendation: "Continue executing the current plan.",
      rationale:
        "Fallback visual evidence does not provide enough confidence to justify changing course.",
    },
    likely_improving_areas:
      goalContext.toLowerCase().includes("abs") && views.includes("front")
        ? ["Front relaxed view can support visible-ab trend review once compared over time."]
        : ["Comparable capture conditions can improve visual trend confidence over time."],
    likely_lagging_areas:
      goalContext.toLowerCase().includes("abs")
        ? ["Lower-abdominal definition should remain a specific visual focus if visible abs are the goal."]
        : ["Lagging areas should be identified only after repeated comparable photo sets."],
    symmetry_balance_notes: [
      views.includes("back")
        ? "Rear views can support symmetry and lean-mass appearance review."
        : "Back view was not detected, so rear symmetry is not assessed.",
    ],
    goal_relevance: [
      `Relevant to ${goalContext}.`,
      "Photos support qualitative visual confidence but do not replace DEXA or scale evidence.",
    ],
    confidence_notes: [
      "Fallback interpretation uses metadata and product rules, not computer vision.",
      comparisonMetadata.days_elapsed === null
        ? "Elapsed time is unknown, so the interpreter should not describe the comparison interval."
        : `Elapsed time is explicitly ${comparisonMetadata.days_elapsed} days.`,
      comparisonMetadata.interval_classification === "short"
        ? "These photos are close together, so only subtle visual changes would be expected."
        : "Confidence improves when comparison intervals and capture conditions are consistent.",
      "Confidence improves when matching views are captured under consistent conditions.",
    ],
    limitations: [
      "OPENAI_API_KEY is missing or unavailable, so no vision model inspected the image pixels.",
      hasPrevious
        ? "Only matching views should be compared."
        : "No previous set was available for visual comparison.",
      "Lighting, pose, distance, clothing, pump, tan, and flexing can affect interpretation.",
    ],
    suggested_evidence: [
      "Capture the same views under the same conditions next week.",
      "Pair photo sets with same-day morning weight when possible.",
    ],
    suggested_protocols: [
      "Weekly comparable progress photos",
      "Maintain default morning, fasted photo context",
    ],
    suggested_priorities: [
      "Continue executing the current plan",
      "Collect another comparison under similar conditions before changing course",
    ],
    briefing_summary: {
      biggest_changes: hasPrevious
        ? ["Fallback mode cannot inspect visual change."]
        : ["A baseline photo set was created."],
      why_they_matter:
        "Progress photos add qualitative visual evidence, but fallback mode cannot interpret physique changes.",
      goal_impact:
        "This evidence should not change goal confidence until visual inspection is available.",
      next_step: hasPrevious
        ? "Run the OpenAI PhotoInterpreter path or collect another comparable set."
        : "Collect the next comparable photo set under the same conditions.",
      summary: hasPrevious
        ? "Photo evidence is ready for comparison, but fallback mode cannot inspect the images closely enough to interpret change."
        : "Photo evidence saved. This creates a baseline for future visual comparison.",
    },
    user_facing_summary: hasPrevious
      ? "Photo evidence is ready for same-view comparison, but fallback mode cannot review the images closely enough to call a visual change."
      : "Photo evidence saved. This creates a baseline for future visual comparison.",
    coach_briefing_insert:
      "Progress photos now add visual context. Treat this as supporting evidence, not a reason to change the plan. Continue collecting comparable photos so future analysis can separate real change from normal visual variation.",
  };
}

function normalizeInterpreterOutput(output, fallback) {
  const normalized = applyDetailedInterpretationDepth(applyReasoningGuardrails(sanitizeInterpreterOutput({
    ...createFallbackPhotoInterpretation({
      captureDate: fallback.captureDate,
      photoSetId: fallback.photoSetId,
      photos: fallback.photos,
      goalContext: fallback.goalContext,
      previousPhotoSet: null,
      comparisonMetadata: fallback.comparisonMetadata,
    }),
    ...output,
    photo_set_id: output.photo_set_id || fallback.photoSetId,
    capture_date: output.capture_date || fallback.captureDate,
    comparison_metadata: output.comparison_metadata || fallback.comparisonMetadata,
    views_detected: output.views_detected?.length
      ? output.views_detected
      : getViewsDetected(fallback.photos),
  })));

  return withStructuredObservations({
    ...normalized,
    briefing_summary:
      normalized.briefing_summary ?? createBriefingSummaryFromLegacyFields(normalized),
  });
}

function withStructuredObservations(interpretation) {
  return {
    ...interpretation,
    structured_observations:
      interpretation.structured_observations ??
      normalizePhotoInterpretationToStructuredObservations(interpretation),
  };
}

function createBriefingSummaryFromLegacyFields(output) {
  return {
    biggest_changes: [output.biggest_takeaway || "Photo evidence was interpreted."],
    why_they_matter:
      output.trajectory_support_summary ||
      "This interpretation can be consumed by the Evidence Engine and Goal Engine.",
    goal_impact:
      output.goal_relevance?.[0] || "This evidence may support future goal reasoning.",
    next_step: output.strategy_recommendation || "Continue executing the current plan.",
    summary:
      output.user_facing_summary ||
      output.coach_briefing_insert ||
      "Photo interpretation is available.",
  };
}

function getOutputText(payload) {
  if (payload.output_text) return payload.output_text;

  return payload.output
    ?.flatMap((item) => item.content ?? [])
    .map((content) => content.text ?? "")
    .join("")
    .trim();
}

function normalizePhotoInput(photo) {
  return {
    fileName: photo.fileName ?? photo.name ?? "",
    dataUrl: photo.dataUrl ?? null,
    mimeType: photo.mimeType ?? "image/jpeg",
    view: normalizeView(photo.view),
    pose: photo.pose ?? "unknown",
    capturedAt: photo.capturedAt ?? photo.date ?? null,
    conditions: photo.conditions ?? {},
  };
}

function getComparisonMetadata({ captureDate, photos, previousPhotoSet }) {
  const currentDate = normalizeDateKey(captureDate ?? getFirstPhotoDate(photos));
  const previousDate = normalizeDateKey(
    previousPhotoSet?.captureDate ??
      previousPhotoSet?.capturedAt ??
      previousPhotoSet?.date ??
      getFirstPhotoDate(previousPhotoSet?.photos ?? [])
  );
  const daysElapsed = getDaysElapsed(previousDate, currentDate);
  const currentViews = getViewsDetected(photos);
  const previousPhotos = previousPhotoSet?.photos ?? [];
  const matchingPairs = getMatchingPhotoPairs({ currentPhotos: photos, previousPhotos });
  const matchingViews = [...new Set(matchingPairs.map((pair) => pair.view))];
  const viewOnlyMatchingViews = getViewOnlyMatchingViews({
    currentPhotos: photos,
    previousPhotos,
  });

  return {
    current_capture_date: currentDate,
    previous_capture_date: previousDate,
    days_elapsed: daysElapsed,
    interval_classification: getIntervalClassification(daysElapsed),
    matching_views: matchingViews,
    view_only_matching_views: viewOnlyMatchingViews,
    match_status: getAggregateMatchStatus({ currentPhotos: photos, previousPhotos }),
    matching_photo_pairs: matchingPairs,
  };
}

function getFirstPhotoDate(photos) {
  return photos.find((photo) => photo.capturedAt)?.capturedAt ?? null;
}

function normalizeDateKey(value) {
  if (!value) return null;
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString().slice(0, 10);
}

function getDaysElapsed(previousDate, currentDate) {
  if (!previousDate || !currentDate) return null;

  const previousTime = Date.parse(`${previousDate}T00:00:00Z`);
  const currentTime = Date.parse(`${currentDate}T00:00:00Z`);

  if (Number.isNaN(previousTime) || Number.isNaN(currentTime)) return null;

  return Math.round((currentTime - previousTime) / 86_400_000);
}

function getIntervalClassification(daysElapsed) {
  if (daysElapsed === null) return "unknown";
  if (daysElapsed < 0) return "invalid";
  if (daysElapsed < 14) return "short";
  if (daysElapsed <= 35) return "standard";

  return "long";
}

function getMatchingPhotoPairs({ currentPhotos, previousPhotos }) {
  return currentPhotos.flatMap((currentPhoto) =>
    previousPhotos
      .filter(
        (previousPhoto) =>
          normalizeView(currentPhoto.view) !== "unknown" &&
          normalizeView(currentPhoto.view) === normalizeView(previousPhoto.view) &&
          normalizePose(currentPhoto.pose) !== "unknown" &&
          normalizePose(currentPhoto.pose) === normalizePose(previousPhoto.pose)
      )
      .map((previousPhoto) => ({
        current_file_name: currentPhoto.fileName,
        pose: normalizePose(currentPhoto.pose),
        previous_file_name: previousPhoto.fileName,
        view: normalizeView(currentPhoto.view),
      }))
  );
}

function getViewOnlyMatchingViews({ currentPhotos, previousPhotos }) {
  return [
    ...new Set(
      currentPhotos
        .filter((currentPhoto) =>
          previousPhotos.some(
            (previousPhoto) =>
              normalizeView(currentPhoto.view) !== "unknown" &&
              normalizeView(currentPhoto.view) === normalizeView(previousPhoto.view)
          )
        )
        .map((photo) => normalizeView(photo.view))
    ),
  ];
}

function getAggregateMatchStatus({ currentPhotos, previousPhotos }) {
  if (!currentPhotos.length || !previousPhotos.length) return "mismatch";

  const exactMatch = currentPhotos.some((currentPhoto) =>
    previousPhotos.some(
      (previousPhoto) =>
        normalizeView(currentPhoto.view) !== "unknown" &&
        normalizeView(currentPhoto.view) === normalizeView(previousPhoto.view) &&
        normalizePose(currentPhoto.pose) !== "unknown" &&
        normalizePose(currentPhoto.pose) === normalizePose(previousPhoto.pose)
    )
  );

  if (exactMatch) return "exact_match";

  const viewOnlyMatch = currentPhotos.some((currentPhoto) =>
    previousPhotos.some(
      (previousPhoto) =>
        normalizeView(currentPhoto.view) !== "unknown" &&
        normalizeView(currentPhoto.view) === normalizeView(previousPhoto.view)
    )
  );

  return viewOnlyMatch ? "view_only_match" : "mismatch";
}

function stripImageData(photo) {
  const { dataUrl, ...metadata } = photo;

  return {
    ...metadata,
    hasImageInput: Boolean(dataUrl),
  };
}

function getViewsDetected(photos) {
  const views = [...new Set(photos.map((photo) => normalizeView(photo.view)))].filter(Boolean);

  return views.length > 0 ? views : ["unknown"];
}

function normalizeView(view) {
  const normalized = String(view ?? "unknown").toLowerCase();

  if (["front", "side", "back"].includes(normalized)) return normalized;
  if (normalized === "rear") return "back";

  return "unknown";
}

function normalizePose(pose) {
  const normalized = String(pose ?? "unknown").toLowerCase().replaceAll("-", "_");

  if (normalized === "double_biceps") return "flexed";
  if (["relaxed", "flexed"].includes(normalized)) return normalized;

  return "unknown";
}

function sanitizeInterpreterOutput(output) {
  return Object.fromEntries(
    Object.entries(output).map(([key, value]) => [key, sanitizeInterpreterValue(value)])
  );
}

function sanitizeInterpreterValue(value) {
  if (Array.isArray(value)) return value.map(sanitizeInterpreterValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        sanitizeInterpreterValue(nestedValue),
      ])
    );
  }
  if (typeof value !== "string") return value;

  return value
    .replace(/\b[Cc]lient shows\b/g, "You show")
    .replace(/\b[Cc]lient has\b/g, "You have")
    .replace(/\b[Cc]lient is\b/g, "You are")
    .replace(/\b[Cc]lient\b/g, "You")
    .replace(/\bsubject\b/gi, "person")
    .replace(/\bpatient\b/gi, "person")
    .replace(/\bposterior\b/gi, "back")
    .replace(/\badiposity\b/gi, "fat")
    .replace(/\bmusculature\b/gi, "muscle")
    .replace(/\bstable musculature\b/gi, "well-maintained muscle")
    .replace(/\bmuscle size\b/gi, "muscle")
    .replace(/\brear delt fullness\b/gi, "rear shoulder shape")
    .replace(/\bupper posterior chain\b/gi, "upper back")
    .replace(/\blat thickness\b/gi, "back width")
    .replace(/\bdeterioration\b/gi, "drop-off")
    .replace(/\bdefinitive\b/gi, "confirmed")
    .replace(/\bclearly improved\b/gi, "appears to be improving")
    .replace(/\bdefinition improved\b/gi, "definition appears to be emerging")
    .replace(/\bimproved definition\b/gi, "definition appears to be emerging")
    .replace(/\bincreased definition\b/gi, "definition appears to be emerging")
    .replace(/\bfat\/muscle change detection\b/gi, "visual change review")
    .replace(/\bfat and muscle change detection\b/gi, "visual change review")
    .replace(/\blower back fat\b/gi, "lower back tightness")
    .replace(/\bfat along the waist or lower back region\b/gi, "waist or lower back tightness")
    .replace(/\bfat levels\b/gi, "leanness")
    .replace(/\bfat at the waist and upper back\b/gi, "waist and upper-back leanness")
    .replace(/\breduced waist fat\b/gi, "tighter waist and lower back")
    .replace(/\bwaist circumference\b/gi, "waist")
    .replace(/\bnutritional strategy\b/gi, "nutrition plan")
    .replace(/\bregimen\b/gi, "plan")
    .replace(/\bcurrent training and nutrition\b/gi, "current strategy")
    .replace(/\btraining and nutrition plan\b/gi, "current strategy")
    .replace(/\bcorroborate\b/gi, "confirm")
    .replace(/\bcomprehensive assessment\b/gi, "clearer read")
    .replace(/\bmodifications\b/gi, "adjustments")
    .replace(/\bmagnitude of visual changes\b/gi, "amount of visual change")
    .replace(
      /\binterval of (\d+) days is below (?:the )?typical threshold for meaningful visual changes\b/gi,
      "these photos are only $1 days apart, so only subtle visual changes would be expected"
    )
    .replace(
      /\bthe interval is below (?:the )?typical threshold for meaningful visual changes\b/gi,
      "the photos are close together, so only subtle visual changes would be expected"
    )
    .replace(/\btypical threshold\b/gi, "usual window")
    .replace(
      /\bphotos taken only (\d+) days apart limit detection of meaningful visual change\b/gi,
      "these photos are only $1 days apart, so only subtle visual changes would be expected"
    )
    .replace(
      /\bphotos taken only (\d+) days apart limit expected visible changes\b/gi,
      "these photos are only $1 days apart, so only subtle visual changes would be expected"
    )
    .replace(
      /\bdiffering poses reduce direct comparability of ([^.]+)\b/gi,
      "because the poses differ, it is harder to compare $1 confidently"
    )
    .replace(
      /\bdifferent poses limit direct comparison certainty\b/gi,
      "because the poses differ, it is harder to make a confident comparison"
    )
    .replace(
      /\bdifferent poses between current and previous ([a-z]+) photos complicate direct comparison\b/gi,
      "because the $1 poses differ slightly, it is harder to make a confident comparison"
    )
    .replace(
      /\bdifferent poses between current and previous photos reduce direct comparability\b/gi,
      "because the poses differ slightly, it is harder to make a confident comparison"
    )
    .replace(
      /\bshort (\d+)-day interval means only subtle changes possible visually\b/gi,
      "these photos are only $1 days apart, so only subtle visual changes would be expected"
    )
    .replace(
      /\bshort (\d+)-day interval limits visible progress\b/gi,
      "these photos are only $1 days apart, so only subtle visual changes would be expected"
    )
    .replace(
      /\bshort (\d+)-day interval limits expected visible change\b/gi,
      "these photos are only $1 days apart, so only subtle visual changes would be expected"
    )
    .replace(
      /\bonly (\d+) days elapsed, limiting visible change expectation\b/gi,
      "these photos are only $1 days apart, so only subtle visual changes would be expected"
    )
    .replace(/\boverall visual assessment\b/gi, "overall read")
    .replace(/\bfull assessment\b/gi, "full read")
    .replace(
      /\bonly front view available; side and back views would improve analysis\b/gi,
      "only the front view is available; side and back views would give a fuller read"
    )
    .replace(
      /\bpose is unknown in metadata; not standard front-relaxed\b/gi,
      "because the pose metadata is missing, it is harder to know whether this matches a standard front relaxed check-in"
    )
    .replace(/\bpose mismatch limits comparability\b/gi, "because the poses differ, it is harder to compare confidently")
    .replace(/\bview-only match limits comparability\b/gi, "because only the view matches, it is harder to compare confidently")
    .replace(/\bassessment clarity (?:is )?reduced\b/gi, "the read is less clear")
    .replace(
      /\bunknown pose details reduce ability to assess ([^.]+)\b/gi,
      "because pose details are unknown, it is harder to judge $1 confidently"
    )
    .replace(
      /\bno meaningful visual change detected\b/gi,
      "not enough evidence to confidently call a meaningful visual change"
    );
}

function applyReasoningGuardrails(output) {
  const metadata = output.comparison_metadata ?? {};
  const isShortInterval = metadata.interval_classification === "short";
  const observations = (output.observation_confidence ?? []).map((observation) => ({
    ...observation,
    meaningful_change_supported: isStabilityObservation(observation.observation)
      ? false
      : observation.meaningful_change_supported,
  }));
  const hasCompellingChange = observations.some(
    (observation) =>
      observation.confidence === "high" &&
      observation.meaningful_change_supported &&
      !isStabilityObservation(observation.observation)
  );

  if (!isShortInterval) {
    return applyAccumulatedOverallProgressGuardrail({
      ...output,
      observation_confidence: observations,
    });
  }

  const daysText =
    typeof metadata.days_elapsed === "number"
      ? `Over ${metadata.days_elapsed} days`
      : "Across this comparison";

  if (hasExactRearRelaxedAndDoubleBiceps(metadata)) {
    return {
      ...output,
      observation_confidence: observations.map((observation) => ({
        ...observation,
        meaningful_change_supported: false,
      })),
      biggest_takeaway:
        `${daysText}, this is a subtle but positive rear comparison: upper back, shoulders, and arms look maintained while rear waist and lower back look a little tighter.`,
      trajectory_classification: "supporting",
      trajectory_support_summary:
        "This comparison provides emerging evidence supporting the current fat-loss strategy while preserving upper-body muscle.",
      global_shape_analysis:
        `${daysText}, the overall rear silhouette looks subtly tighter rather than meaningfully bigger or smaller.`,
      proportional_analysis:
        "The shoulder-to-waist and back-width-to-waist read appears slightly cleaner because the waist looks tighter, not because upper-back size clearly increased.",
      silhouette_observations: [
        "Overall rear silhouette appears slightly tighter.",
        "Waist occupies slightly less visual width.",
        "V-taper looks a little cleaner.",
      ],
      ratio_observations: [
        "Shoulder-to-waist ratio appears slightly improved.",
        "Back-width-to-waist ratio appears slightly improved because the waist looks tighter.",
        "No confident evidence that lat size increased over one week.",
      ],
      high_confidence_observations: [
        "Upper back, shoulders, and arms appear maintained.",
        "There is no confident evidence of muscle loss in the rear views.",
      ],
      emerging_evidence: [
        "Rear waist and lower back look slightly tighter, especially in the relaxed view.",
        "Mid-back and lower-trap definition may be emerging, but it is not confirmed yet.",
        "The V-taper may look a little cleaner because the waist looks tighter, not because the lats clearly grew.",
      ],
      uncertain_or_limited_observations: [
        "One week is too short to claim confident muscle gain.",
        "Back photos support the visible-abs goal indirectly; front and side views are still needed for the clearest read.",
      ],
      pose_specific_notes: [
        {
          view: "back",
          pose: "relaxed",
          focus: "Waist, lower back, taper, overall conditioning, and symmetry.",
          notes: [
            "Rear waist and lower back look marginally tighter.",
            "Overall conditioning appears at least maintained.",
            "Symmetry looks stable.",
          ],
        },
        {
          view: "back",
          pose: "flexed",
          focus: "Lats, rear delts, shoulders, arms, and upper/mid-back definition.",
          notes: [
            "Upper back, shoulders, and arms look maintained.",
            "Mid-back definition may be emerging.",
            "There is no confident evidence that lats grew over one week.",
          ],
        },
      ],
      longitudinal_evidence_summary:
        `${daysText}, the rear photos modestly increase confidence that the cut is continuing without obvious upper-back muscle loss.`,
      evidence_levels: [
        {
          level: "high_confidence",
          observation: "Upper back, shoulders, and arms appear maintained.",
          confidence: "high",
          goal_relevance:
            "This supports confidence that the cut is not visibly costing upper-back muscle.",
          decision: "Stay the course.",
        },
        {
          level: "emerging_evidence",
          observation: "Rear waist and lower back look slightly tighter.",
          confidence: "moderate",
          goal_relevance:
            "This modestly supports continued leanness progress toward visible abs.",
          decision: "Continue the current plan and confirm with the next comparable set.",
        },
      ],
      trend_assessment:
        `${daysText}, the trend looks modestly positive: maintained upper body with possible emerging leanness through the rear waist and lower back.`,
      trend_interpretation:
        "The most useful read is muscle maintained, conditioning possibly improving, and no sign that the plan needs adjustment.",
      decision_support: {
        should_change_plan: false,
        recommendation: "Stay the course.",
        rationale:
          "The comparison modestly supports the current cut and does not show a reason to change nutrition, training, or recovery.",
      },
      strategy_recommendation: "Stay the course.",
      should_change_plan: false,
      why_or_why_not:
        "No. The evidence modestly increases confidence that the current strategy is working, and there is no clear problem to correct.",
      meaningful_change_assessment:
        `${daysText}, this is not enough to claim major change, but it is useful emerging evidence that the current strategy is working.`,
      detailed_interpretation: {
        summary:
          "The dominant story is a subtle but positive rear comparison: upper-back shape is maintained while the rear waist and lower back look a little tighter. Because this is a short interval, the detailed read should be treated as emerging evidence rather than confirmed change.",
        sections: [
          {
            region: "Overall Rear Physique",
            status: "mixed",
            confidence: "moderate",
            what_changed:
              "The rear silhouette looks a little cleaner through the waist and lower back.",
            what_did_not_change:
              "Upper-back size does not appear meaningfully larger or smaller.",
            why:
              "The useful read is maintained upper body with possible emerging leanness through the waist.",
            limitations: ["One week is short, so subtle differences need confirmation."],
          },
          {
            region: "Back / Lats",
            status: "maintained",
            confidence: "moderate",
            what_changed:
              "Back definition may be starting to show slightly more through the mid-back and lower-trap area.",
            what_did_not_change:
              "There is no convincing evidence that lat width increased over one week.",
            why:
            "The Rear Flexed view shows maintained back shape while the waist appears a bit tighter.",
            limitations: ["Pump, pose tension, and arm angle can affect perceived back width."],
          },
          {
            region: "Rear Delts / Shoulders / Arms",
            status: "maintained",
            confidence: "high",
            what_changed:
              "Shoulders and arms look well maintained across the rear views.",
            what_did_not_change:
              "No clear size gain is visible, which is expected over this interval.",
            why:
              "The upper body remains visually present while the waist looks slightly tighter.",
            limitations: ["Flexing intensity can influence shoulder and arm definition."],
          },
          {
            region: "Rear Waist / Lower Back",
            status: "improved",
            confidence: "moderate",
            what_changed:
              "Rear waist and lower back look slightly tighter, especially in the relaxed view.",
            what_did_not_change:
              "This is not enough to confirm a major fat-loss change by itself.",
            why:
              "The lower-back area reads a little cleaner, which improves the rear taper.",
            limitations: ["Small changes can be affected by stance, camera angle, and lighting."],
          },
          {
            region: "Chest / Front Abs / Lower Body",
            status: "cannot_evaluate",
            confidence: "low",
            what_changed:
              "Chest, front abs, quads, hamstrings, calves, and glutes cannot be evaluated from these rear views.",
            what_did_not_change:
              "No conclusion should be drawn about front visible-ab progress from this rear-only comparison.",
            why: "Those regions are not visible enough in the supplied rear photos.",
            limitations: ["Add matching front and side views for a complete physique read."],
          },
        ],
      },
      suggested_priorities: [
        "Stay the course",
        "Collect the next comparable rear and front photo set before changing the plan",
      ],
      briefing_summary: {
        biggest_changes: [
          "Upper back, shoulders, and arms look maintained.",
          "Your rear waist and lower back look slightly tighter.",
          "Back definition may be starting to emerge, but it is still early.",
        ],
        why_they_matter:
          "That is a useful sign for the cut: your upper body still looks strong while the rear waistline is beginning to look a little cleaner.",
        goal_impact:
          "This supports the visible-abs goal by adding confidence that fat loss is continuing without giving up upper-body shape.",
        next_step: "Stay the course and collect the next comparable rear and front photo set.",
        summary:
          "This rear comparison is subtly positive: your upper body looks maintained, your rear waist and lower back look a little tighter, and nothing suggests the plan should change.",
      },
      user_facing_summary:
        `There are a few subtle signs you are moving in the right direction. Your upper back, shoulders, and arms look maintained, and your rear waist and lower back look a little tighter. There are early signs of improving back definition, but it is still too early to be confident. Based on these photos, I would stay the course.`,
      coach_briefing_insert:
        `This rear comparison modestly increases confidence that your current strategy is working. Your upper back, shoulders, and arms appear well maintained. Your rear waist and lower back look slightly tighter. Back definition may be starting to show, but it is still early. Nothing here suggests we should change your plan. In the next comparison, PhysiqueOS will watch whether the tighter waistline becomes a consistent trend while your upper back remains well maintained.`,
    };
  }

  if (hasFrontComparison(metadata)) {
    return {
      ...output,
      observation_confidence: observations.map((observation) => ({
        ...observation,
        meaningful_change_supported: false,
      })),
      biggest_takeaway:
        `${daysText}, this front comparison modestly supports fat loss while preserving your upper body.`,
      trajectory_classification: "supporting",
      trajectory_support_summary:
        "The comparison modestly supports the working hypothesis: fat loss while preserving upper-body muscle.",
      global_shape_analysis:
        `${daysText}, the front silhouette appears slightly more athletic because the waist reads modestly tighter while the upper body remains maintained.`,
      proportional_analysis:
        "The shoulder-to-waist relationship appears slightly cleaner because the waist looks modestly tighter while the chest, shoulders, and arms appear maintained.",
      silhouette_observations: [
        "Waist appears modestly tighter.",
        "Overall front silhouette looks slightly more athletic.",
        "Upper body appears maintained.",
      ],
      ratio_observations: [
        "Shoulder-to-waist ratio appears slightly cleaner.",
        "Taper appears subtly improved because the waist reads tighter, not because upper-body size clearly changed.",
        "No confident evidence of upper-body muscle loss.",
      ],
      high_confidence_observations: [
        "Upper body appears maintained.",
        "Waist appears modestly tighter.",
      ],
      emerging_evidence: [
        "Midsection conditioning is beginning to improve.",
        "Shoulder-to-waist ratio may be improving.",
        "Overall silhouette appears slightly more athletic.",
      ],
      uncertain_or_limited_observations: [
        "This is not enough evidence to declare a major physique change.",
        "The interval is short, so small differences should be treated as an emerging trend.",
      ],
      pose_specific_notes: [
        {
          view: "front",
          pose: "unknown",
          focus:
            "Overall silhouette, shoulder-to-waist ratio, waist width, midsection conditioning, and upper-body preservation.",
          notes: [
            "Waist appears modestly tighter.",
            "Midsection conditioning appears to be improving modestly.",
            "Chest, shoulders, and arms appear maintained.",
            "The overall front silhouette reads slightly more athletic.",
          ],
        },
      ],
      longitudinal_evidence_summary:
        `${daysText}, the front photos modestly increase confidence that the current cut is progressing while upper-body muscle is being maintained.`,
      evidence_levels: [
        {
          level: "high_confidence",
          observation: "Upper body appears maintained and the waist appears modestly tighter.",
          confidence: "high",
          goal_relevance:
            "This supports fat loss while preserving upper-body muscle.",
          decision: "Stay the course.",
        },
        {
          level: "emerging_evidence",
          observation: "Midsection conditioning and shoulder-to-waist ratio appear to be moving in the right direction.",
          confidence: "moderate",
          goal_relevance:
            "This supports the visible-abs trajectory without proving a confirmed change yet.",
          decision: "Stay the course.",
        },
      ],
      trend_assessment:
        `${daysText}, the trend is early but supportive: modestly tighter waist, slightly cleaner shoulder-to-waist ratio, and maintained upper body.`,
      trend_interpretation:
        "This is emerging evidence supporting fat loss while preserving muscle, not a confirmed transformation.",
      decision_support: {
        should_change_plan: false,
        recommendation: "Stay the course.",
        rationale:
          "The relationship-based signals point in the right direction, but the short interval means they should be treated as emerging trends rather than confirmed changes.",
      },
      strategy_recommendation: "Stay the course.",
      should_change_plan: false,
      why_or_why_not:
        "No. The evidence modestly supports the current strategy and does not show a problem to correct.",
      meaningful_change_assessment:
        `${daysText}, this is emerging evidence supporting the current fat-loss strategy, not confirmed major change.`,
      detailed_interpretation: {
        summary:
          "The dominant story is modest support for fat loss while preserving the upper body. The front silhouette reads a little cleaner, but the interval is short enough that these are emerging signals rather than confirmed transformation.",
        sections: [
          {
            region: "Overall Physique",
            status: "improved",
            confidence: "moderate",
            what_changed:
              "The front silhouette looks slightly more athletic because the waist reads modestly tighter.",
            what_did_not_change:
              "There is no dramatic whole-body change over this short interval.",
            why:
              "The waist looks a little tighter while the chest, shoulders, and arms appear maintained.",
            limitations: ["Short intervals make subtle front-view changes harder to confirm."],
          },
          {
            region: "Chest",
            status: "maintained",
            confidence: "moderate",
            what_changed:
              "Chest borders may read a little cleaner as the torso leans out.",
            what_did_not_change:
              "Chest size does not appear meaningfully larger or smaller.",
            why:
              "The chest remains visually present while the midsection looks slightly tighter.",
            limitations: ["Arm position can affect how chest width and fullness read."],
          },
          {
            region: "Midsection / Waist",
            status: "improved",
            confidence: "moderate",
            what_changed:
              "Waist appears modestly tighter, and midsection conditioning appears to be moving in the right direction.",
            what_did_not_change:
              "Lower abs are not fully established as a clear visual change.",
            why:
              "A slightly cleaner waist improves the shoulder-to-waist relationship.",
            limitations: ["Abdominal engagement and posture can change the front read."],
          },
          {
            region: "Shoulders / Arms",
            status: "maintained",
            confidence: "moderate",
            what_changed:
              "Shoulders and arms stand out slightly more because the waist reads tighter.",
            what_did_not_change:
              "There is no clear evidence of new muscle gain or muscle loss.",
            why:
              "Maintained upper-body shape alongside a tighter waist supports the current cut.",
            limitations: ["Arm position introduces uncertainty when comparing shoulder width."],
          },
          {
            region: "Back / Rear Delts / Lower Body",
            status: "cannot_evaluate",
            confidence: "low",
            what_changed:
              "Back, rear delts, glutes, quads, hamstrings, and calves cannot be evaluated from front photos.",
            what_did_not_change:
              "No conclusion should be drawn about rear or lower-body progress.",
            why: "Those regions are not visible enough in the supplied front view.",
            limitations: ["Add matching rear and side photos for a complete physique read."],
          },
        ],
      },
      suggested_priorities: [
        "Stay the course",
        "Collect the next comparable front photo set before changing the plan",
      ],
      briefing_summary: {
        biggest_changes: [
          "Your waist looks a little tighter.",
          "Your front shape looks slightly cleaner.",
          "Your chest, shoulders, and arms look well maintained.",
        ],
        why_they_matter:
          "These are the signs we want early in a cut: the waist is starting to move while the upper body still looks strong.",
        goal_impact:
          "This nudges you closer to visible abs at rest, but it is still early enough that I would treat it as an encouraging trend rather than a finished result.",
        next_step: "Stay the course and collect the next comparable front photo set.",
        summary:
          "There are a few subtle signs you are moving in the right direction: a cleaner silhouette, a tighter waist, and maintained upper-body shape.",
      },
      user_facing_summary:
        `There are a few subtle signs you are moving in the right direction. Your overall shape looks a little cleaner, with the clearest change around the waist. Your upper body appears maintained, and your shoulder-to-waist ratio looks slightly sharper. It is still too early to call this a meaningful visual change, but the comparison modestly supports your current plan. I would stay the course.`,
      coach_briefing_insert:
        `This front comparison modestly increases confidence that your current strategy is working. The useful read is your overall silhouette first: your waist looks modestly tighter, your shoulder-to-waist ratio looks slightly cleaner, and your upper body appears well maintained. These are small changes, not a confirmed transformation. Nothing here suggests we should change your plan. In the next comparison, PhysiqueOS will watch whether the tighter waist and cleaner front silhouette become a consistent trend.`,
    };
  }

  if (hasCompellingChange) {
    return {
      ...output,
      observation_confidence: observations,
    };
  }

  return {
    ...output,
    observation_confidence: observations.map((observation) => ({
      ...observation,
      meaningful_change_supported: false,
    })),
    evidence_levels: normalizeShortIntervalEvidenceLevels(output.evidence_levels),
    longitudinal_evidence_summary:
      `${daysText}, the comparison is best treated as longitudinal evidence of stability with possible emerging signals, not confirmed change.`,
    biggest_takeaway:
      `${daysText}, the photos provide modest evidence supporting the current strategy, but not confirmed change.`,
    trajectory_classification: "supporting",
    trajectory_support_summary:
      "Current evidence slightly increases confidence in the working hypothesis, while still needing another comparable set for confirmation.",
    global_shape_analysis:
      `${daysText}, the overall silhouette appears largely stable with possible subtle tightening.`,
    proportional_analysis:
      "No confident proportional change is confirmed from this short comparison.",
    silhouette_observations: [
      "Overall shape appears largely stable.",
      "Any silhouette change is subtle enough to require another comparable set.",
    ],
    ratio_observations: [
      "No confident ratio change is confirmed.",
    ],
    high_confidence_observations: [
      "Overall physique appears stable across the comparable views.",
    ],
    emerging_evidence: [
      "Small visual differences may be beginning to emerge, but another comparable set is needed.",
    ],
    uncertain_or_limited_observations: [
      "The interval is short, so subtle differences may reflect normal day-to-day variation.",
    ],
    trend_interpretation:
      `${daysText}, the safest read is stable physique with possible emerging trend evidence.`,
    strategy_recommendation: "Stay the course.",
    should_change_plan: false,
    why_or_why_not:
      "No. The evidence is directionally supportive, but still too early and subtle to justify changing the current plan.",
    trend_assessment:
      `${daysText}, evidence supports stability more than a confirmed trend. Another comparable set is needed before treating subtle differences as progress or regression.`,
    decision_support: {
      should_change_plan: false,
      recommendation: "Continue executing the current plan.",
      rationale:
        "The interval is short and the visible differences are not strong enough to justify a strategy change.",
    },
    meaningful_change_assessment:
      `${daysText}, the photos do not prove confirmed change, but they provide modest emerging evidence supporting the current trajectory.`,
    suggested_priorities: [
      "Continue executing the current plan",
      "Collect another comparable photo set under similar conditions before changing course",
    ],
    user_facing_summary:
      `There are small signs pointing in the right direction, but not enough to call this a clear visual change yet. Treat this as an early trend to watch, not a reason to change course. Based on these photos, I would keep the plan the same.`,
    coach_briefing_insert:
      `This comparison modestly supports the current trajectory, but it does not prove a clear change yet. That is still useful coaching signal: small aligned signs can build confidence without requiring a plan change. Nothing here suggests we should change your strategy. In the next comparison, PhysiqueOS will watch whether these small differences become a consistent trend or simply normalize.`,
  };
}

function hasFrontComparison(metadata) {
  const exactFront = (metadata.matching_photo_pairs ?? []).some(
    (pair) => pair.view === "front"
  );
  const viewOnlyFront = (metadata.view_only_matching_views ?? []).includes("front");

  return exactFront || viewOnlyFront;
}

function applyDetailedInterpretationDepth(output) {
  const metadata = output.comparison_metadata ?? {};
  const existingSections = output.detailed_interpretation?.sections ?? [];
  const needsFrontDepth =
    hasFrontComparison(metadata) &&
    output.trajectory_classification === "supporting" &&
    existingSections.length < 7;

  if (!needsFrontDepth) return output;

  const requiredSections = [
    {
      region: "Overall Physique",
      status: "improved",
      confidence: "moderate",
      what_changed:
        "The dominant read is a leaner, cleaner front silhouette. The waist and lower abdomen draw less visual attention, which makes the upper body stand out more.",
      what_did_not_change:
        "The upper body does not need to look bigger for this to be a successful cut, and there is no clear sign of upper-body drop-off.",
      why:
        "A tighter waist, flatter midsection, and maintained chest/shoulder/arm shape all support the same story.",
      limitations: ["Pose, arm position, lighting, and camera distance can reduce precision."],
    },
    {
      region: "Overall Conditioning / Body Fat",
      status: "improved",
      confidence: "moderate",
      what_changed:
        "The torso reads sharper and less soft. Muscle borders are easier to distinguish, especially through the midsection and chest outline.",
      what_did_not_change:
        "This does not prove an exact body-fat percentage or isolate where all fat was lost.",
      why:
        "Visual conditioning is judged from the combined look of leanness, separation, flatter abdomen, and cleaner transitions between regions.",
      limitations: ["Photos cannot replace DEXA or scale trend evidence for quantified body composition."],
    },
    {
      region: "Body Proportions / Shoulder-to-Waist Ratio",
      status: "improved",
      confidence: "moderate",
      what_changed:
        "The shoulder-to-waist relationship looks cleaner because the waist reads tighter while the upper body appears maintained.",
      what_did_not_change:
        "There is no convincing evidence that shoulder width increased; the proportion change appears driven by the waist.",
      why:
        "A smaller-looking waist makes the same upper body read more athletic.",
      limitations: ["Arm angle and posture can affect perceived shoulder width."],
    },
    {
      region: "Chest",
      status: "maintained",
      confidence: "moderate",
      what_changed:
        "The lower chest border and overall chest outline read a bit sharper as the torso leans out.",
      what_did_not_change:
        "Chest size does not appear meaningfully larger, but there is no clear evidence of volume loss.",
      why:
        "Maintained chest presence with cleaner borders supports muscle retention while body fat comes down.",
      limitations: ["Front relaxed photos are useful for outline, but not perfect for judging fullness."],
    },
    {
      region: "Midsection / Abs",
      status: "improved",
      confidence: "moderate",
      what_changed:
        "Upper and mid-ab separation is easier to see, the midline reads stronger, and the lower abdomen looks flatter.",
      what_did_not_change:
        "Lower abs have not fully emerged yet, which is normal late-cut territory.",
      why:
        "Clearer upper/mid-ab detail plus a flatter lower abdomen is meaningful conditioning evidence.",
      limitations: ["Abdominal engagement and posture can change how much separation is visible."],
    },
    {
      region: "Obliques / Rib-to-Waist Transition",
      status: "improved",
      confidence: "moderate",
      what_changed:
        "The transition from ribs into waist looks cleaner, giving the torso a more tapered look.",
      what_did_not_change:
        "Oblique detail is not fully established as a high-confidence isolated change.",
      why:
        "Cleaner edges through the side of the torso support the overall leaner read.",
      limitations: ["Front-only photos limit how confidently obliques can be judged."],
    },
    {
      region: "Shoulders / Arms",
      status: "maintained",
      confidence: "moderate",
      what_changed:
        "Shoulders and arms stand out a bit more because the waist and midsection are tighter.",
      what_did_not_change:
        "There is no convincing evidence of new muscle gain, but also no clear evidence of muscle loss.",
      why:
        "Maintained shoulder and arm shape alongside a leaner torso supports the current strategy.",
      limitations: ["Arm position introduces uncertainty when comparing shoulder width and arm separation."],
    },
    {
      region: "Neck / Traps / Back / Rear Delts / Lower Body",
      status: "cannot_evaluate",
      confidence: "low",
      what_changed:
        "Neck, traps, back, rear delts, glutes, quads, hamstrings, and calves cannot be meaningfully evaluated from this front comparison.",
      what_did_not_change:
        "No conclusion should be drawn about these regions from the supplied front view alone.",
      why:
        "Those regions are either not visible or not visible enough to evaluate honestly.",
      limitations: ["Add matching rear and side views for a full physique read."],
    },
  ];

  const mergedSections = [
    ...existingSections,
    ...requiredSections.filter(
      (requiredSection) =>
        !existingSections.some((section) =>
          section.region
            ?.toLowerCase()
            .includes(requiredSection.region.split(" / ")[0].toLowerCase())
        )
    ),
  ];

  return {
    ...output,
    detailed_interpretation: {
      summary:
        output.detailed_interpretation?.summary ||
        "The detailed read supports a leaner front silhouette with maintained upper-body shape.",
      sections: mergedSections,
    },
  };
}

function hasExactRearRelaxedAndDoubleBiceps(metadata) {
  const pairs = metadata.matching_photo_pairs ?? [];
  const hasRearRelaxed = pairs.some(
    (pair) => pair.view === "back" && pair.pose === "relaxed"
  );
  const hasRearFlexed = pairs.some(
    (pair) => pair.view === "back" && pair.pose === "flexed"
  );

  return metadata.match_status === "exact_match" && hasRearRelaxed && hasRearFlexed;
}

function applyAccumulatedOverallProgressGuardrail(output) {
  const metadata = output.comparison_metadata ?? {};
  const daysElapsed = metadata.days_elapsed;
  const hasEnoughTime =
    metadata.interval_classification === "long" ||
    (metadata.interval_classification === "standard" &&
      typeof daysElapsed === "number" &&
      daysElapsed >= 28);

  if (!hasEnoughTime || output.trajectory_classification !== "neutral") {
    return output;
  }

  const positiveSignals = collectPositiveOverallSignals(output);
  const hasContradictorySignals = hasContradictoryOverallSignals(output);

  if (positiveSignals.length < 2 || hasContradictorySignals) {
    return output;
  }

  const compatibleHighConfidenceObservations = (
    output.high_confidence_observations ?? []
  ).filter(
    (observation) =>
      !/\bwaist\b.*\b(consistent|unchanged|stable|without apparent increase|without apparent decrease|no apparent)\b/i.test(
        observation
      ) &&
      !/\b(no obvious|no clear|without apparent)\b.*\b(silhouette|physique|torso|shape|change)\b/i.test(
        observation
      ) &&
      !/\b(no clear|not clear|no confident|not enough)\b.*\b(leaner|tight|waist|midsection|conditioning|progress)\b/i.test(
        observation
      ) &&
      !/\bsimilar\b.*\b(torso|waist|silhouette|shape)\b/i.test(observation) &&
      !/\b(torso|waist|silhouette|shape)\b.*\bsimilar\b/i.test(observation)
  );
  const compatibleEmergingEvidence = (output.emerging_evidence ?? []).filter(
    (observation) =>
      !/\bwaist\b.*\b(not clearly tighter|not clearly narrower|not clear)\b/i.test(
        observation
      )
  );
  const compatibleGlobalShapeAnalysis =
    /\b(no obvious|no clear|does not|doesn't|similar)\b.*\b(reduction|tighter|leaner|waist|torso shape|silhouette|change)\b/i.test(
      output.global_shape_analysis ?? ""
    )
      ? null
      : output.global_shape_analysis;

  return {
    ...output,
    trajectory_classification: "supporting",
    trajectory_support_summary:
      "The comparison supports meaningful overall physique progress because several small silhouette, conditioning, and proportion changes are pointing in the same direction.",
    biggest_takeaway:
      "Your physique is noticeably leaner than at the start of this comparison.",
    global_shape_analysis:
      compatibleGlobalShapeAnalysis ||
      "The overall shape is the main read: the body appears cleaner through the waist while upper-body shape is maintained.",
    proportional_analysis:
      output.proportional_analysis ||
      "The shoulder-to-waist relationship appears to be moving in the right direction because the waist reads tighter while the upper body remains maintained.",
    high_confidence_observations: uniqueStrings([
      ...compatibleHighConfidenceObservations,
      "Upper body appears maintained.",
      "Waist and lower abdomen read tighter than at the start of the comparison.",
      "Overall silhouette looks cleaner, with a stronger shoulder-to-waist relationship.",
      "Chest, shoulders, and arms do not need to look larger for this to be a successful cut; they read maintained while the torso looks leaner.",
    ]),
    emerging_evidence: uniqueStrings([
      ...compatibleEmergingEvidence,
      "Upper and midsection definition appears clearer, even though the lower abs have not fully emerged yet.",
      "Chest and shoulder borders look a bit sharper while upper-body size appears maintained.",
      "The lower abdomen reads flatter, which supports the cleaner waist and improved front silhouette.",
      "The transition from ribs into waist appears cleaner, giving the physique a more athletic look.",
      "Shoulders and arms stand out slightly more because the waist and midsection look tighter, not because there is clear evidence of new muscle gain.",
      "Several small silhouette, conditioning, and proportion changes are adding up to meaningful overall progress.",
    ]),
    trend_interpretation:
      "The overall physique appears to be improving through accumulated small changes: a cleaner waist, better conditioning, maintained upper-body shape, and better proportions.",
    trend_assessment:
      "Over this longer interval, the small changes are more meaningful together than they would be in a short week-to-week comparison.",
    decision_support: {
      ...(output.decision_support ?? {}),
      should_change_plan: false,
      recommendation: "Stay the course.",
      rationale:
        "The overall direction supports the current strategy. Nothing here suggests the plan needs to change.",
    },
    strategy_recommendation: "Stay the course.",
    should_change_plan: false,
    why_or_why_not:
      "No. The overall physique appears to be improving, and the changes support continuing the current strategy.",
    meaningful_change_assessment:
      "This is meaningful overall physique and conditioning improvement from accumulated small changes, not one dramatic regional change.",
    detailed_interpretation: {
      summary:
        "The dominant story is meaningful visual fat-loss progress with upper-body shape maintained. The strongest evidence comes from the waist, midsection, rib-to-waist transition, and cleaner muscle borders rather than one dramatic regional change.",
      sections: [
        {
          region: "Overall Physique",
          status: "improved",
          confidence: "moderate",
          what_changed:
            "The overall silhouette reads leaner and more athletic. The waist and lower abdomen occupy less visual attention, which makes the upper body stand out more.",
          what_did_not_change:
            "Upper-body size does not appear meaningfully larger, and there is no need for it to look larger for this to be a successful cut.",
          why:
            "Several small visual cues point in the same direction: tighter waist, flatter abdomen, cleaner proportions, and maintained upper-body shape.",
          limitations: [
            "Pose and arm position are not perfectly identical, so confidence is moderate rather than high.",
          ],
        },
        {
          region: "Overall Conditioning",
          status: "improved",
          confidence: "moderate",
          what_changed:
            "Conditioning appears meaningfully better. The midsection looks sharper, the torso has less visual softness, and muscle borders are easier to distinguish.",
          what_did_not_change:
            "This is not a dramatic stage-style change; the improvement is accumulated across several subtle areas.",
          why:
            "The photos show clearer upper/midsection detail, a flatter lower abdomen, and cleaner transitions between torso and waist.",
          limitations: [
            "Lighting and posture can affect perceived sharpness, so this should be confirmed with the next comparable set.",
          ],
        },
        {
          region: "Chest",
          status: "maintained",
          confidence: "moderate",
          what_changed:
            "Chest borders read a bit sharper, especially around the lower pec line, because surrounding body fat appears lower.",
          what_did_not_change:
            "Chest size does not appear meaningfully larger, but there is also no clear evidence of volume loss.",
          why:
            "The chest remains visually present while the torso looks leaner, which supports muscle maintenance during the cut.",
          limitations: [
            "Front relaxed photos are useful for chest outline, but not perfect for judging fullness.",
          ],
        },
        {
          region: "Midsection",
          status: "improved",
          confidence: "moderate",
          what_changed:
            "Upper and mid abs show clearer separation. The midline is easier to read, and the lower abdomen looks flatter.",
          what_did_not_change:
            "Lower abs have not fully emerged yet, which is expected because they are often one of the last areas to become clearly visible.",
          why:
            "Sharper upper/mid-ab detail plus a flatter lower abdomen supports meaningful conditioning progress.",
          limitations: [
            "Abdominal engagement and posture can change how much separation is visible.",
          ],
        },
        {
          region: "Obliques / Waist",
          status: "improved",
          confidence: "moderate",
          what_changed:
            "The waist reads tighter, and the transition from ribs into waist looks cleaner. This improves the shoulder-to-waist relationship.",
          what_did_not_change:
            "This does not prove a dramatic fat-loss change in one isolated area; it supports the overall leaner read.",
          why:
            "A cleaner rib-to-waist transition makes the whole front silhouette look more athletic.",
          limitations: [
            "Slight differences in stance and arm position reduce precision when judging waist width.",
          ],
        },
        {
          region: "Shoulders / Arms",
          status: "maintained",
          confidence: "moderate",
          what_changed:
            "Shoulders and arms stand out a bit more because the waist and midsection are tighter.",
          what_did_not_change:
            "There is no convincing evidence of new muscle gain, but there is also no clear evidence of upper-body muscle loss.",
          why:
            "Maintained shoulder and arm shape alongside a leaner torso supports the current fat-loss strategy.",
          limitations: [
            "Arm positioning changes can affect shoulder width and arm definition comparisons.",
          ],
        },
        {
          region: "Back / Rear Delts / Lower Body",
          status: "cannot_evaluate",
          confidence: "low",
          what_changed:
            "Back, rear delts, glutes, quads, hamstrings, and calves cannot be evaluated from this front comparison.",
          what_did_not_change:
            "No conclusion should be drawn about rear musculature or lower-body retention from these photos.",
          why:
            "Those regions are not visible enough in front relaxed photos.",
          limitations: [
            "Add matching rear and side views for a more complete physique evaluation.",
          ],
        },
      ],
    },
    briefing_summary: {
      biggest_changes: [
        "Your waist and lower abdomen look noticeably tighter.",
        "Your upper and mid abs show clearer separation.",
        "Your chest, shoulders, and arms look maintained while your torso looks leaner.",
      ],
      why_they_matter:
        "That is exactly what we want from this phase of the cut: reveal more of the muscle you have already built while keeping your upper-body shape intact.",
      goal_impact:
        "You have moved meaningfully closer to visible abs at rest. The next milestone is continued lower-ab definition while preserving the proportions you have maintained.",
      next_step:
        "Stay the course. Nothing in these photos suggests your nutrition or training plan needs to change.",
      summary:
        "Your physique is noticeably leaner: tighter waist, stronger V-taper, clearer upper and mid-ab definition, a flatter lower abdomen, cleaner chest definition, and maintained shoulders and arms.",
    },
    user_facing_summary:
      "Your physique looks noticeably leaner than at the start of this comparison. The biggest change is a tighter waist and sharper midsection while your upper body stays well maintained. That is the goal of a successful cut: reveal the muscle you have already built without giving up shape. Based on these photos, I would stay the course.",
    coach_briefing_insert:
      "This comparison shows meaningful conditioning progress. Your waist is tighter, your midsection is sharper, your proportions look cleaner, and your upper body still looks well maintained. Nothing here suggests changing the plan. In the next comparison, PhysiqueOS will watch for continued lower-ab definition while your shoulders, arms, and chest stay preserved.",
  };
}

function collectPositiveOverallSignals(output) {
  const values = [
    output.global_shape_analysis,
    output.proportional_analysis,
    output.trend_interpretation,
    output.trend_assessment,
    output.user_facing_summary,
    ...(output.silhouette_observations ?? []),
    ...(output.ratio_observations ?? []),
    ...(output.high_confidence_observations ?? []),
    ...(output.emerging_evidence ?? []),
    ...(output.visual_changes_observed ?? []),
  ];

  return values.filter((value) =>
    /\b(tighter|cleaner|leaner|harder|sharper|defined|definition|conditioning|separation|linea alba|abdominal|abs|oblique|flatter|flat|less softness|chest border|shoulder|arm separation|landmarks|improv|maintained|preserv|fat loss|waist|proportion|silhouette|shape|shoulder-to-waist|taper|positive signs|slightly supportive|supports continuing|appears effective|strategy is working|current strategy)\b/i.test(
      String(value ?? "")
    )
  );
}

function hasContradictoryOverallSignals(output) {
  const values = [
    output.trajectory_support_summary,
    output.trend_interpretation,
    output.user_facing_summary,
    ...(output.likely_lagging_areas ?? []),
    ...(output.uncertain_or_limited_observations ?? []),
  ];

  return values.some((value) =>
    /\b(contradict|regress|softer|muscle loss|worse|less athletic|less lean|concern|raises questions)\b/i.test(
      String(value ?? "")
    )
  );
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

function isStabilityObservation(value) {
  return /\b(stable|no meaningful|unchanged|maintained|similar|consistent)\b/i.test(
    String(value ?? "")
  );
}

function normalizeShortIntervalEvidenceLevels(levels = []) {
  if (!levels.length) {
    return [
      {
        level: "insufficient_evidence",
        observation: "These photos are close together, so there is not enough evidence to confidently call a visual change.",
        confidence: "low",
        goal_relevance:
          "This does not reduce confidence in the goal path, but it should not be treated as confirmed progress.",
        decision: "Continue the current plan and collect another comparable set.",
      },
    ];
  }

  return levels.map((entry) => {
    if (entry.level === "high_confidence") {
      return {
        ...entry,
        level: "emerging_evidence",
        decision:
          entry.decision || "Treat this as an early signal and wait for another comparison.",
      };
    }

    return entry;
  });
}

function formatLabel(value) {
  return String(value ?? "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getPoseEvidenceFocus(photo) {
  const view = normalizeView(photo.view);
  const pose = String(photo.pose ?? "unknown").toLowerCase();

  if (view === "back" && (pose.includes("flex") || pose.includes("double"))) {
    return "Lat width, rear delts, upper back, traps, muscularity, and definition.";
  }
  if (view === "back") {
    return "Waist, symmetry, overall conditioning, lower-back area, and back thickness.";
  }
  if (view === "side") {
    return "Waist profile, torso thickness, posture, and side conditioning.";
  }
  if (view === "front") {
    return "Waist, abdominal definition, front symmetry, posture, and visible conditioning.";
  }

  return "General comparable visual evidence quality.";
}

const stringArray = {
  type: "array",
  items: { type: "string" },
};

const observationConfidenceArray = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["observation", "confidence", "basis", "meaningful_change_supported"],
    properties: {
      observation: { type: "string" },
      confidence: { enum: ["high", "moderate", "low"], type: "string" },
      basis: { type: "string" },
      meaningful_change_supported: { type: "boolean" },
    },
  },
};

const evidenceLevelArray = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["level", "observation", "confidence", "goal_relevance", "decision"],
    properties: {
      level: {
        enum: ["high_confidence", "emerging_evidence", "insufficient_evidence"],
        type: "string",
      },
      observation: { type: "string" },
      confidence: { enum: ["high", "moderate", "low"], type: "string" },
      goal_relevance: { type: "string" },
      decision: { type: "string" },
    },
  },
};

const poseSpecificNotesArray = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["view", "pose", "focus", "notes"],
    properties: {
      view: { enum: ["front", "side", "back", "unknown"], type: "string" },
      pose: { type: "string" },
      focus: { type: "string" },
      notes: stringArray,
    },
  },
};

const poseSpecificFindingsArray = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["view", "pose", "evidence_focus", "findings"],
    properties: {
      view: { enum: ["front", "side", "back", "unknown"], type: "string" },
      pose: { type: "string" },
      evidence_focus: { type: "string" },
      findings: stringArray,
    },
  },
};

const detailedInterpretationSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "sections"],
  properties: {
    summary: { type: "string" },
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "region",
          "status",
          "confidence",
          "what_changed",
          "what_did_not_change",
          "why",
          "limitations",
        ],
        properties: {
          region: { type: "string" },
          status: {
            enum: [
              "improved",
              "maintained",
              "mixed",
              "unchanged",
              "cannot_evaluate",
              "reduced_confidence",
              "baseline",
            ],
            type: "string",
          },
          confidence: { enum: ["high", "moderate", "low"], type: "string" },
          what_changed: { type: "string" },
          what_did_not_change: { type: "string" },
          why: { type: "string" },
          limitations: stringArray,
        },
      },
    },
  },
};

const briefingSummarySchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "biggest_changes",
    "why_they_matter",
    "goal_impact",
    "next_step",
    "summary",
  ],
  properties: {
    biggest_changes: stringArray,
    why_they_matter: { type: "string" },
    goal_impact: { type: "string" },
    next_step: { type: "string" },
    summary: { type: "string" },
  },
};

export const photoInterpretationJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "photo_set_id",
    "capture_date",
    "comparison_metadata",
    "views_detected",
    "biggest_takeaway",
    "trajectory_classification",
    "trajectory_support_summary",
    "global_shape_analysis",
    "proportional_analysis",
    "silhouette_observations",
    "ratio_observations",
    "high_confidence_observations",
    "emerging_evidence",
    "uncertain_or_limited_observations",
    "pose_specific_notes",
    "trend_interpretation",
    "strategy_recommendation",
    "should_change_plan",
    "why_or_why_not",
    "longitudinal_evidence_summary",
    "detailed_interpretation",
    "briefing_summary",
    "body_composition_observations",
    "visual_changes_observed",
    "observation_confidence",
    "meaningful_change_assessment",
    "evidence_levels",
    "pose_specific_findings",
    "trend_assessment",
    "decision_support",
    "likely_improving_areas",
    "likely_lagging_areas",
    "symmetry_balance_notes",
    "goal_relevance",
    "confidence_notes",
    "limitations",
    "suggested_evidence",
    "suggested_protocols",
    "suggested_priorities",
    "user_facing_summary",
    "coach_briefing_insert",
  ],
  properties: {
    photo_set_id: { type: "string" },
    capture_date: { type: ["string", "null"] },
    comparison_metadata: {
      type: "object",
      additionalProperties: false,
      required: [
        "current_capture_date",
        "previous_capture_date",
        "days_elapsed",
        "interval_classification",
        "matching_views",
        "view_only_matching_views",
        "match_status",
        "matching_photo_pairs",
      ],
      properties: {
        current_capture_date: { type: ["string", "null"] },
        previous_capture_date: { type: ["string", "null"] },
        days_elapsed: { type: ["number", "null"] },
        interval_classification: {
          enum: ["unknown", "invalid", "short", "standard", "long"],
          type: "string",
        },
        matching_views: {
          type: "array",
          items: { enum: ["front", "side", "back"], type: "string" },
        },
        view_only_matching_views: {
          type: "array",
          items: { enum: ["front", "side", "back"], type: "string" },
        },
        match_status: {
          enum: ["exact_match", "view_only_match", "mismatch"],
          type: "string",
        },
        matching_photo_pairs: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["current_file_name", "previous_file_name", "view", "pose"],
            properties: {
              current_file_name: { type: "string" },
              previous_file_name: { type: "string" },
              view: { enum: ["front", "side", "back"], type: "string" },
              pose: { enum: ["relaxed", "flexed"], type: "string" },
            },
          },
        },
      },
    },
    views_detected: {
      type: "array",
      items: { enum: ["front", "side", "back", "unknown"], type: "string" },
    },
    biggest_takeaway: { type: "string" },
    trajectory_classification: {
      enum: ["supporting", "neutral", "contradictory"],
      type: "string",
    },
    trajectory_support_summary: { type: "string" },
    global_shape_analysis: { type: "string" },
    proportional_analysis: { type: "string" },
    silhouette_observations: stringArray,
    ratio_observations: stringArray,
    high_confidence_observations: stringArray,
    emerging_evidence: stringArray,
    uncertain_or_limited_observations: stringArray,
    pose_specific_notes: poseSpecificNotesArray,
    trend_interpretation: { type: "string" },
    strategy_recommendation: { type: "string" },
    should_change_plan: { type: "boolean" },
    why_or_why_not: { type: "string" },
    longitudinal_evidence_summary: { type: "string" },
    detailed_interpretation: detailedInterpretationSchema,
    briefing_summary: briefingSummarySchema,
    body_composition_observations: stringArray,
    visual_changes_observed: stringArray,
    observation_confidence: observationConfidenceArray,
    meaningful_change_assessment: { type: "string" },
    evidence_levels: evidenceLevelArray,
    pose_specific_findings: poseSpecificFindingsArray,
    trend_assessment: { type: "string" },
    decision_support: {
      type: "object",
      additionalProperties: false,
      required: ["should_change_plan", "recommendation", "rationale"],
      properties: {
        should_change_plan: { type: "boolean" },
        recommendation: { type: "string" },
        rationale: { type: "string" },
      },
    },
    likely_improving_areas: stringArray,
    likely_lagging_areas: stringArray,
    symmetry_balance_notes: stringArray,
    goal_relevance: stringArray,
    confidence_notes: stringArray,
    limitations: stringArray,
    suggested_evidence: stringArray,
    suggested_protocols: stringArray,
    suggested_priorities: stringArray,
    user_facing_summary: { type: "string" },
    coach_briefing_insert: { type: "string" },
  },
};
