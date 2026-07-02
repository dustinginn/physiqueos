# PhysiqueOS Evidence Catalog

## Purpose

This document is the living encyclopedia of every evidence type PhysiqueOS can understand.

It should continue expanding for years.

Every future integration, AI model, wearable, sensor, document type, and logging feature should fit naturally into this framework.

The catalog is not a database schema.

It is not an implementation document.

It is not an AI prompt.

It defines the kinds of evidence PhysiqueOS should recognize, how that evidence can support goals, and how the operating system should reason about its value.

Evidence is intentionally broad.

The product should not ask:

> Is this a metric?

It should ask:

> Can this help PhysiqueOS understand the user, explain progress, improve confidence, or recommend the next best action?

---

# Evidence Value

Evidence value depends on context.

Weight may be highly valuable for fat loss.

Sleep may be highly valuable for recovery.

Blood work may become critical for health optimization.

Progress photos may be essential for visual goals and almost irrelevant for some performance goals.

No evidence type is universally important.

The Evidence Engine should evaluate evidence according to:

* relevance to the user's active goals
* reliability of the source
* freshness
* historical consistency
* agreement with related evidence
* effort required from the user
* ability to reduce uncertainty
* ability to change today's recommendation

PhysiqueOS should always prioritize evidence that produces the greatest increase in understanding for the least user effort.

More evidence is not automatically better.

Better understanding is better.

---

# Evidence Categories

This catalog is organized into broad categories:

* Body
* Training
* Nutrition
* Recovery
* Health
* Lifestyle
* Habits and Protocols

Categories should remain flexible.

Many evidence types belong to more than one category.

For example, walking can be training, recovery, lifestyle, or fat-loss evidence depending on the user's goal.

---

# Body Evidence

## Weight

Description:

Body weight is a high-frequency signal that helps PhysiqueOS understand trend direction, energy balance, hydration shifts, and progress toward body-composition goals.

Possible Sources:

Manual, smart scale, Apple Health, Garmin, wearables, imported CSV, voice.

Supports Which Goals:

Fat loss, muscle gain, maintenance, visible abs, general health, performance fueling.

Supports Which Objectives:

Trend monitoring, adherence assessment, calorie adjustment, body-composition estimation, maintenance stability.

Can Influence:

Daily Briefing, Goals, Priorities, Recommendations, Predictions, Confidence.

Typical Frequency:

Daily or weekly.

Interpretation Notes:

Single weigh-ins are noisy. Trends matter more than isolated values. Weigh-in context, timing, scale source, hydration, travel, sodium, training soreness, and illness can affect interpretation.

Inference Opportunities:

Weight velocity, plateau detection, rebound detection, post-event water shifts, adherence confidence, expected fluctuation range.

Potential Related Evidence:

Nutrition, training, sleep, travel, DEXA, progress photos, medication changes.

## Body Fat Percentage

Description:

Body fat percentage estimates the proportion of body mass that is fat tissue.

Possible Sources:

DEXA, body-composition scale, skinfolds, visual assessment, lab reports, imported documents.

Supports Which Goals:

Visible abs, fat loss, maintenance, bodybuilding, longevity, metabolic health.

Supports Which Objectives:

Body-composition tracking, fat-loss quality, maintenance range, calibration.

Can Influence:

Goals, Predictions, Confidence, Daily Briefing, Recommendations.

Typical Frequency:

Monthly, quarterly, or event-based.

Interpretation Notes:

Different methods vary significantly. DEXA is usually stronger calibration evidence than consumer scales. Estimated body fat should not overwrite measured sources.

Inference Opportunities:

Estimated current range between calibration events, goal completion forecast, maintenance readiness.

Potential Related Evidence:

DEXA, weight trend, progress photos, circumference, training, nutrition.

## Lean Mass

Description:

Lean mass represents non-fat mass, including muscle, organs, water, and other tissues.

Possible Sources:

DEXA, body-composition scans, smart scales, clinical reports.

Supports Which Goals:

Muscle gain, fat loss quality, visible abs, strength performance, healthy aging.

Supports Which Objectives:

Lean-mass preservation, hypertrophy, strength maintenance, cut quality.

Can Influence:

Goals, Confidence, Recommendations, Predictions, Daily Briefing.

Typical Frequency:

Monthly, quarterly, or event-based.

Interpretation Notes:

Lean mass can be affected by hydration and glycogen. DEXA is useful but should still be interpreted in context.

Inference Opportunities:

Lean-mass preservation confidence, over-cutting risk, adequacy of protein and resistance training.

Potential Related Evidence:

DEXA, strength training, protein, sleep, medication, progress photos.

## Fat Mass

Description:

Fat mass estimates the absolute amount of fat tissue.

Possible Sources:

DEXA, body-composition scans, smart scales.

Supports Which Goals:

Fat loss, visible abs, metabolic health, body recomposition.

Supports Which Objectives:

Fat-loss progress, calibration, risk reduction, maintenance transition.

Can Influence:

Goals, Predictions, Confidence, Daily Briefing.

Typical Frequency:

Monthly, quarterly, or event-based.

Interpretation Notes:

Fat mass is often more actionable than body fat percentage because it separates tissue change from total mass fluctuation.

Inference Opportunities:

Required fat loss to target, trend velocity, goal forecast.

Potential Related Evidence:

Weight, DEXA, nutrition, training, progress photos.

## DEXA

Description:

DEXA is high-quality body-composition calibration evidence.

Possible Sources:

BodySpec, clinical DEXA providers, PDFs, imported reports.

Supports Which Goals:

Visible abs, fat loss, lean-mass preservation, longevity, metabolic health.

Supports Which Objectives:

Calibration, body-fat range, lean-mass preservation, VAT monitoring, bone density awareness.

Can Influence:

Goals, Confidence, Predictions, Daily Briefing, Recommendations.

Typical Frequency:

Monthly, quarterly, or event-based.

Interpretation Notes:

DEXA is authoritative for calibration but not perfect. It should be used to anchor trends, not replace daily evidence.

Inference Opportunities:

Between-scan estimates, body-composition trajectory, confidence calibration.

Potential Related Evidence:

Weight, photos, training, nutrition, protocols, labs.

## Circumference

Description:

Circumference measurements track body-shape changes at specific sites.

Possible Sources:

Manual tape measure, smart tape, coach entry, voice.

Supports Which Goals:

Fat loss, muscle gain, recomposition, bodybuilding, general health.

Supports Which Objectives:

Waist reduction, hypertrophy, symmetry, progress validation.

Can Influence:

Goals, Confidence, Daily Briefing, Recommendations.

Typical Frequency:

Weekly or monthly.

Interpretation Notes:

Measurement technique matters. Consistent conditions improve value.

Inference Opportunities:

Waist-to-weight trend, visual progress support, muscle-gain distribution.

Potential Related Evidence:

Weight, photos, DEXA, nutrition, training.

## Progress Photos

Description:

Progress photos provide visual evidence for qualitative and appearance-based goals.

Possible Sources:

Manual upload, camera, photo library, coach uploads, future computer vision.

Supports Which Goals:

Visible abs, bodybuilding, fat loss, muscle gain, symmetry, posture, conditioning.

Supports Which Objectives:

Visual confirmation, lean-mass appearance, photo cadence, calibration between measurements.

Can Influence:

Goals, Confidence, Daily Briefing, Priorities, Recommendations.

Typical Frequency:

Weekly, monthly, or event-based.

Interpretation Notes:

Comparable conditions matter. Lighting, pose, time of day, pump, mirror, and framing affect interpretation.

Inference Opportunities:

Visual trajectory, consistency scoring, comparison readiness, missing view detection.

Potential Related Evidence:

Weight, DEXA, training, nutrition, hydration, protocol changes.

## Measurements, Skinfolds, and Body Scans

Description:

Additional body measurements can support body-composition interpretation when collected consistently.

Possible Sources:

Manual, coach, body scanner, skinfold caliper, imported documents.

Supports Which Goals:

Fat loss, muscle gain, body recomposition, bodybuilding, health monitoring.

Supports Which Objectives:

Shape tracking, body-composition estimation, symmetry, fat-distribution monitoring.

Can Influence:

Goals, Confidence, Predictions, Recommendations.

Typical Frequency:

Weekly, monthly, or event-based.

Interpretation Notes:

Method consistency is essential. Measurements should be treated according to source reliability.

Inference Opportunities:

Regional change, trend confirmation, discrepancy detection.

Potential Related Evidence:

Weight, photos, DEXA, training.

---

# Training Evidence

## Strength Training

Description:

Strength training evidence describes resistance training activity, volume, intensity, progression, and adherence.

Possible Sources:

Workout apps, manual logging, voice, Garmin, Apple Health, Strong, Hevy, coach notes.

Supports Which Goals:

Muscle gain, strength, fat-loss quality, lean-mass preservation, healthy aging.

Supports Which Objectives:

Progressive overload, training consistency, lean-mass preservation, recovery management.

Can Influence:

Goals, Priorities, Protocols, Recommendations, Daily Briefing, Confidence.

Typical Frequency:

Daily, weekly, or program-based.

Interpretation Notes:

Training quality matters more than session count. Volume, intensity, exercise selection, and recovery context affect interpretation.

Inference Opportunities:

Adherence, strength trend, fatigue risk, deload need, muscle-retention confidence.

Potential Related Evidence:

Protein, sleep, soreness, HRV, weight, DEXA, progress photos.

## Running, Walking, Cycling, Swimming, and Sports

Description:

Endurance and activity evidence describes movement volume, intensity, consistency, and performance.

Possible Sources:

Apple Health, Garmin, Strava, workout apps, wearables, manual logging.

Supports Which Goals:

Endurance performance, fat loss, cardiovascular health, longevity, sport performance.

Supports Which Objectives:

Activity consistency, energy expenditure, aerobic capacity, recovery balance.

Can Influence:

Daily Briefing, Priorities, Recommendations, Predictions, Confidence.

Typical Frequency:

Daily, weekly, or event-based.

Interpretation Notes:

Intensity distribution matters. Activity can support goals or interfere with recovery depending on context.

Inference Opportunities:

Training load, energy expenditure, fatigue risk, performance trajectory.

Potential Related Evidence:

Sleep, HRV, nutrition, weight, soreness, travel.

## Mobility, Stretching, and Recovery Sessions

Description:

Mobility and recovery sessions describe intentional work to improve movement quality, recovery, or pain management.

Possible Sources:

Manual logging, voice, habit completion, wearable recovery apps.

Supports Which Goals:

Injury recovery, training consistency, longevity, athletic performance, general wellbeing.

Supports Which Objectives:

Recovery adherence, movement quality, injury prevention, pain reduction.

Can Influence:

Priorities, Protocols, Daily Briefing, Recommendations.

Typical Frequency:

Daily, weekly, or protocol-based.

Interpretation Notes:

Completion may matter more than quantitative detail. User-reported effect can improve interpretation.

Inference Opportunities:

Adherence, recovery support, symptom response, reminder optimization.

Potential Related Evidence:

Training, soreness, sleep, pain notes, HRV.

## Personal Records and Workout Adherence

Description:

Performance milestones and adherence patterns provide evidence of capability, consistency, and adaptation.

Possible Sources:

Workout apps, manual logging, coach notes, wearables.

Supports Which Goals:

Strength, endurance, muscle gain, sport performance, healthy aging.

Supports Which Objectives:

Performance progression, adherence, maintenance, training quality.

Can Influence:

Goals, Daily Briefing, Recommendations, Confidence.

Typical Frequency:

Event-based or weekly.

Interpretation Notes:

PRs require context. A new best effort during high fatigue may mean something different from a routine progression.

Inference Opportunities:

Progress detection, readiness impact, plateau recognition, program adjustment prompts.

Potential Related Evidence:

Sleep, nutrition, training load, body weight, recovery.

---

# Nutrition Evidence

## Calories and Macronutrients

Description:

Calories, protein, carbohydrates, and fat describe energy intake and nutrition structure.

Possible Sources:

Cronometer, MacroFactor, MyFitnessPal, manual estimates, voice, meal plans.

Supports Which Goals:

Fat loss, muscle gain, performance, maintenance, metabolic health.

Supports Which Objectives:

Energy balance, protein adherence, fueling, recovery, body-composition change.

Can Influence:

Daily Briefing, Goals, Recommendations, Predictions, Confidence, Priorities.

Typical Frequency:

Daily.

Interpretation Notes:

Nutrition data varies in accuracy. Estimated ranges can still be useful when interpreted honestly.

Inference Opportunities:

Deficit/surplus estimation, adherence, trend explanation, energy availability.

Potential Related Evidence:

Weight, training, sleep, hunger, performance, body composition.

## Fiber, Hydration, and Meal Timing

Description:

Nutrition quality and timing signals help interpret satiety, recovery, weight fluctuation, digestion, and performance.

Possible Sources:

Nutrition apps, manual notes, voice, wearables, smart bottles, future integrations.

Supports Which Goals:

Fat loss, performance, digestive health, metabolic health, recovery.

Supports Which Objectives:

Satiety, hydration, fueling, consistency, recovery.

Can Influence:

Daily Briefing, Recommendations, Priorities, Confidence.

Typical Frequency:

Daily or event-based.

Interpretation Notes:

These signals are often contextual rather than primary. They can explain anomalies.

Inference Opportunities:

Water retention, hunger patterns, performance readiness, digestive disruption.

Potential Related Evidence:

Weight, training, sleep, stress, travel.

## Food Photos and Meal Plans

Description:

Food photos and meal plans provide nutrition context when full tracking is unavailable or unnecessary.

Possible Sources:

Photo upload, camera, coach notes, meal planning apps, voice.

Supports Which Goals:

Fat loss, muscle gain, performance, habit improvement, nutrition consistency.

Supports Which Objectives:

Meal quality, protein sufficiency, consistency, adherence.

Can Influence:

Daily Briefing, Recommendations, Confidence, Priorities.

Typical Frequency:

Daily or event-based.

Interpretation Notes:

Photos can support pattern recognition but should not pretend to be precise nutrition logs unless validated.

Inference Opportunities:

Meal structure, protein presence, consistency, coaching prompts.

Potential Related Evidence:

Weight, macros, hunger, training, goals.

## Supplements

Description:

Supplement evidence describes planned or completed supplement use.

Possible Sources:

Manual logging, voice, reminders, supplement apps, notes.

Supports Which Goals:

Recovery, performance, general health, muscle gain, sleep, longevity.

Supports Which Objectives:

Protocol adherence, context tracking, recovery support, health optimization.

Can Influence:

Protocols, Daily Briefing, Recommendations, Confidence.

Typical Frequency:

Daily, weekly, or protocol-based.

Interpretation Notes:

Supplements provide context. They should not be overinterpreted without supporting evidence.

Inference Opportunities:

Adherence, side-effect context, interaction with symptoms or performance.

Potential Related Evidence:

Sleep, training, blood work, symptoms, medications.

---

# Recovery Evidence

## Sleep

Description:

Sleep evidence describes duration, consistency, timing, and quality.

Possible Sources:

Oura, WHOOP, Apple Health, Garmin, manual notes, voice.

Supports Which Goals:

Recovery, performance, fat loss, muscle gain, longevity, mood.

Supports Which Objectives:

Recovery readiness, adaptation, appetite control, stress resilience.

Can Influence:

Daily Briefing, Priorities, Recommendations, Confidence, Predictions.

Typical Frequency:

Daily.

Interpretation Notes:

Sleep evidence is highly valuable but device estimates vary. Trends are often more useful than individual scores.

Inference Opportunities:

Recovery risk, appetite changes, training readiness, priority adjustment.

Potential Related Evidence:

Training, HRV, resting heart rate, stress, nutrition, weight.

## HRV, Resting Heart Rate, Readiness, and Recovery Score

Description:

Physiological recovery signals help estimate stress, adaptation, illness, and readiness.

Possible Sources:

Oura, WHOOP, Garmin, Apple Watch, wearables, future sensors.

Supports Which Goals:

Performance, recovery, longevity, training consistency, illness detection.

Supports Which Objectives:

Readiness, fatigue management, training load adjustment.

Can Influence:

Daily Briefing, Recommendations, Priorities, Confidence.

Typical Frequency:

Daily.

Interpretation Notes:

Wearable scores are estimates. PhysiqueOS should interpret trends and agreement with subjective evidence.

Inference Opportunities:

Fatigue risk, illness warning, deload prompt, stress pattern.

Potential Related Evidence:

Sleep, training, illness, alcohol, stress, travel.

## Stress, Fatigue, Illness, Travel, and Jet Lag

Description:

Contextual recovery evidence explains disruptions that affect performance, weight, appetite, sleep, and adherence.

Possible Sources:

Manual notes, voice, wearables, calendar, travel apps, future integrations.

Supports Which Goals:

Recovery, fat loss, performance, health optimization, adherence.

Supports Which Objectives:

Context awareness, anomaly explanation, priority adjustment.

Can Influence:

Daily Briefing, Recommendations, Priorities, Confidence.

Typical Frequency:

Event-based.

Interpretation Notes:

Context often explains otherwise confusing data. PhysiqueOS should make it easy to add without creating daily burden.

Inference Opportunities:

Temporary weight fluctuation, reduced readiness, adherence disruption, reminder changes.

Potential Related Evidence:

Sleep, weight, HRV, training, nutrition, symptoms.

---

# Health Evidence

## Blood Work

Description:

Blood work provides clinical and biomarker evidence for health status and optimization.

Possible Sources:

Lab PDFs, provider portals, manual entry, health records, future integrations.

Supports Which Goals:

Longevity, metabolic health, hormone optimization, performance, general health.

Supports Which Objectives:

Risk monitoring, deficiency detection, medication context, recovery, nutrition adequacy.

Can Influence:

Confidence, Recommendations, Daily Briefing, Goals, Protocols.

Typical Frequency:

Quarterly, annually, or event-based.

Interpretation Notes:

Clinical interpretation requires caution. PhysiqueOS should organize evidence and encourage appropriate professional context.

Inference Opportunities:

Trend detection, out-of-range awareness, evidence freshness, protocol relevance.

Potential Related Evidence:

Medications, supplements, nutrition, sleep, symptoms, body composition.

## Blood Pressure and Glucose

Description:

Cardiometabolic signals help evaluate health risk, energy regulation, and response to lifestyle change.

Possible Sources:

Manual, Apple Health, continuous glucose monitor, blood pressure cuff, medical devices.

Supports Which Goals:

General health, diabetes management, longevity, weight loss, cardiovascular health.

Supports Which Objectives:

Risk reduction, metabolic control, medication context, lifestyle response.

Can Influence:

Daily Briefing, Recommendations, Confidence, Priorities.

Typical Frequency:

Daily, weekly, monthly, or event-based.

Interpretation Notes:

Measurement conditions matter. Medical signals should be handled conservatively.

Inference Opportunities:

Trend direction, response to weight loss or nutrition changes, risk awareness.

Potential Related Evidence:

Nutrition, weight, medication, sleep, stress, activity.

## Hormones, Medications, Peptides, and Symptoms

Description:

Health context evidence describes interventions, symptoms, and physiological factors that may affect interpretation.

Possible Sources:

Manual logging, voice, medication lists, provider reports, lab work, notes.

Supports Which Goals:

Body composition, recovery, health optimization, chronic condition management.

Supports Which Objectives:

Protocol adherence, side-effect tracking, context interpretation, confidence.

Can Influence:

Protocols, Daily Briefing, Recommendations, Confidence.

Typical Frequency:

Daily, weekly, or event-based.

Interpretation Notes:

PhysiqueOS should treat this evidence as context, not medical advice. It should be traceable and handled carefully.

Inference Opportunities:

Adherence, side-effect patterns, appetite changes, recovery changes, trend explanation.

Potential Related Evidence:

Weight, nutrition, blood work, symptoms, sleep, training.

## Doctor Reports, Medical Imaging, and Lifestyle Risk Factors

Description:

Clinical documents and risk context can improve long-term health understanding.

Possible Sources:

PDFs, provider portals, user uploads, notes, future health record integrations.

Supports Which Goals:

Longevity, health optimization, rehabilitation, chronic disease management.

Supports Which Objectives:

Risk awareness, professional context, evidence organization.

Can Influence:

Confidence, Recommendations, Goals, Daily Briefing.

Typical Frequency:

Event-based.

Interpretation Notes:

Clinical evidence should be organized with caution and should not replace professional medical judgment.

Inference Opportunities:

Evidence freshness, relevant follow-ups, risk context.

Potential Related Evidence:

Blood work, medications, symptoms, activity, nutrition.

---

# Lifestyle Evidence

## Mood, Energy, Stress, and Daily Routines

Description:

Subjective and routine evidence helps explain adherence, recovery, motivation, and performance.

Possible Sources:

Voice, journal, manual check-in, wearable prompts, future conversational input.

Supports Which Goals:

Recovery, performance, fat loss, general health, mental wellbeing.

Supports Which Objectives:

Consistency, stress management, recovery interpretation, adherence support.

Can Influence:

Daily Briefing, Priorities, Recommendations, Confidence.

Typical Frequency:

Daily or event-based.

Interpretation Notes:

Subjective evidence is valuable when it explains objective patterns. It should be lightweight.

Inference Opportunities:

Adherence risk, overreaching, schedule friction, recovery needs.

Potential Related Evidence:

Sleep, training, nutrition, HRV, travel.

## Work Schedule, Family Events, Vacations, Alcohol, and Smoking

Description:

Lifestyle context helps PhysiqueOS understand disruptions, routines, and risk factors.

Possible Sources:

Manual notes, voice, calendar, future integrations.

Supports Which Goals:

Adherence, recovery, fat loss, performance, longevity, health optimization.

Supports Which Objectives:

Context awareness, behavior planning, risk reduction.

Can Influence:

Daily Briefing, Priorities, Recommendations, Confidence.

Typical Frequency:

Event-based.

Interpretation Notes:

The product should not moralize lifestyle evidence. It should use context to improve guidance.

Inference Opportunities:

Travel mode, disrupted routine, hydration needs, recovery risk, adherence planning.

Potential Related Evidence:

Weight, sleep, training, nutrition, recovery, mood.

---

# Habits and Protocols Evidence

## Medication and Supplement Adherence

Description:

Adherence evidence records whether planned health interventions were completed.

Possible Sources:

Manual completion, voice, reminders, medication apps, future integrations.

Supports Which Goals:

Health optimization, body composition, recovery, chronic condition management.

Supports Which Objectives:

Protocol adherence, context awareness, safety, confidence.

Can Influence:

Protocols, Daily Briefing, Priorities, Recommendations.

Typical Frequency:

Daily, weekly, or protocol-based.

Interpretation Notes:

Completion evidence should remain user-controlled. The system should recommend reminder adjustments, not silently assume behavior.

Inference Opportunities:

Adherence streaks, missed dose context, reminder fatigue, friction reduction.

Potential Related Evidence:

Symptoms, weight, sleep, blood work, notes.

## Foam Rolling, Sauna, Cold Exposure, Stretching, Breathwork, and Meditation

Description:

Recovery and lifestyle protocols provide context for readiness, stress, soreness, and adherence.

Possible Sources:

Manual completion, voice, reminders, habit apps, future integrations.

Supports Which Goals:

Recovery, performance, longevity, stress management, training consistency.

Supports Which Objectives:

Recovery adherence, stress reduction, mobility, readiness.

Can Influence:

Priorities, Daily Briefing, Recommendations, Confidence.

Typical Frequency:

Daily, weekly, or protocol-based.

Interpretation Notes:

These actions often matter because of consistency, not precise measurement.

Inference Opportunities:

Adherence patterns, reminder optimization, recovery correlation, friction detection.

Potential Related Evidence:

Training, HRV, sleep, soreness, mood.

## Daily Weigh-ins and Weekly Photos

Description:

Evidence-collection protocols ensure the system has sufficient information to interpret goals.

Possible Sources:

Manual logging, reminders, camera, smart scales, Apple Health.

Supports Which Goals:

Fat loss, visible abs, maintenance, body recomposition.

Supports Which Objectives:

Evidence freshness, confidence, trend quality, calibration.

Can Influence:

Priorities, Daily Briefing, Goals, Recommendations, Confidence.

Typical Frequency:

Daily for weigh-ins, weekly for photos.

Interpretation Notes:

Evidence protocols should become quieter as the user demonstrates consistency. They should not become busywork.

Inference Opportunities:

Freshness, missing evidence, confidence limits, adaptive reminders.

Potential Related Evidence:

Weight, photos, DEXA, nutrition, training.

## Custom Protocols

Description:

Custom protocols allow users to define repeatable actions that matter for their goals.

Possible Sources:

Manual setup, voice, coaching input, future templates.

Supports Which Goals:

Any goal, depending on user intent.

Supports Which Objectives:

Adherence, context, intervention tracking, behavior planning.

Can Influence:

Protocols, Daily Briefing, Priorities, Recommendations, Confidence.

Typical Frequency:

Daily, weekly, monthly, or event-based.

Interpretation Notes:

Custom protocols should preserve user intent. PhysiqueOS should learn how they relate to outcomes over time.

Inference Opportunities:

Adherence patterns, correlation with outcomes, reminder recommendations.

Potential Related Evidence:

Depends on protocol type.

---

# Future Evidence

The catalog is intentionally open-ended.

The ontology should remain stable as technology evolves.

New sensors, AI models, wearables, documents, integrations, and interpretation methods should fit into the same evidence framework.

Future evidence types should answer:

* What does this tell PhysiqueOS?
* Where did it come from?
* How reliable is it?
* How fresh is it?
* Which goals does it support?
* Which objectives does it support?
* What can it influence?
* How often should it appear?
* What related evidence gives it meaning?
* What should PhysiqueOS infer from it?

The Evidence Catalog succeeds if PhysiqueOS can add new evidence types for years without fragmenting the product.

The operating system should become more capable without becoming more complicated.
