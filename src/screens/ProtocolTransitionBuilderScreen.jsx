"use client";

import { startTransition, useState } from "react";
import ProtocolBuilderShell from "../components/protocol-builder/ProtocolBuilderShell";
import StructuredCadenceSelector from "../components/protocol-builder/StructuredCadenceSelector";
import {
  buildDexaCadencePayload,
  buildPhotoCadencePayload,
  DAYPART_OPTIONS,
  DEXA_INTERVAL_OPTIONS,
  PHOTO_FREQUENCY_OPTIONS,
  recommendedCadence,
  validateDexaCadencePayload,
  validatePhotoCadencePayload,
  WEEKDAY_OPTIONS,
} from "../presentation/protocolCadencePresentation";
import { presentProtocolTransitionPlan } from "../presentation/protocolTransitionReviewPresentation";

const TOTAL_STEPS = 2;

export default function ProtocolTransitionBuilderScreen({ action, initialStep = 1, protocolDraft, review, transitionContext }) {
  const [payload, setPayload] = useState(() => prefillPayload(review, protocolDraft, transitionContext));
  const [step, setStep] = useState(() => canSaveProtocol(review.category, prefillPayload(review, protocolDraft, transitionContext))
    ? Math.max(1, Math.min(TOTAL_STEPS, initialStep))
    : 1);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const content = contentFor({ payload, review, setPayload, step, transitionContext });

  function submit() {
    if (!canSaveProtocol(review.category, payload)) {
      setError(validationMessage(review.category));
      return;
    }
    setError("");
    setIsSubmitting(true);
    startTransition(async () => {
      try {
        await action({ reviewId: review.id, payload });
        window.location.assign(transitionContext.returnRoute);
      } catch (submissionError) {
        setError(submissionError.message);
        setIsSubmitting(false);
      }
    });
  }

  return (
    <ProtocolBuilderShell
      backHref={transitionContext.detailRoute}
      backLabel={review.displayName}
      canContinue={canSaveProtocol(review.category, payload)}
      currentStep={step}
      eyebrow={`${review.displayName} · New Goal`}
      isSubmitting={isSubmitting}
      onBack={step > 1 ? () => setStep((value) => value - 1) : () => window.location.assign(transitionContext.detailRoute)}
      onContinue={step < TOTAL_STEPS ? () => setStep((value) => value + 1) : submit}
      primaryLabel={step === TOTAL_STEPS ? `Save ${review.displayName} Plan` : "Continue"}
      submittingLabel="Saving..."
      title={content.title}
      totalSteps={TOTAL_STEPS}
    >
      {content.body}
      {error && <p className="rounded-xl bg-[var(--surface-warning)] p-3 text-sm font-bold text-[var(--text-primary)]">{error}</p>}
    </ProtocolBuilderShell>
  );
}

function contentFor({ payload, review, setPayload, step, transitionContext }) {
  if (step === 1) return { title: editorTitle(review.category), body: <Editor category={review.category} payload={payload} setPayload={setPayload} transitionContext={transitionContext}/> };
  const presentation = presentProtocolTransitionPlan(review.category, payload, { displayName: review.displayName, openingBaseline: transitionContext.openingBaseline });
  return { title: presentation.title, body: <PlanReview presentation={presentation}/> };
}

function Editor({ category, payload, setPayload, transitionContext }) {
  const set = (key, value) => setPayload({ ...payload, [key]: value });
  if (transitionContext.selectedDisposition === "replace") return <Stack><Summary label="New plan" value="Choose a fundamentally different strategy for the new goal rather than carrying the current plan forward."/><ChoiceGroup label="Starting direction" value={payload.replacementDirection ?? "new_goal_aligned"} set={(value)=>set("replacementDirection",value)} options={[["new_goal_aligned","Build a new goal-aligned plan","Recommended"]]}/></Stack>;
  if (category === "energy") return <Stack><Summary label="How we’ll begin" value="Maintenance calibration"/><ChoiceGroup label="Calories" value={payload.calorieStrategy} set={(value)=>set("calorieStrategy",value)} options={[["increase_gradually","Increase gradually","Recommended"],["estimated_maintenance","Begin near estimated maintenance"]]}/><ChoiceGroup label="Activity" value={payload.activityStrategy} set={(value)=>set("activityStrategy",value)} options={[["keep_current","Keep current while observing response","Recommended"],["reduce_slightly","Reduce cardio slightly"]]}/><Summary label="How we’ll review it" value="We’ll evaluate the overall trend each week rather than reacting to individual days."/></Stack>;
  if (category === "nutrition") return <ProteinEditor payload={payload} setPayload={setPayload} transitionContext={transitionContext}/>;
  if (category === "activity") return <Stack><ChoiceGroup label="Activity approach" value={payload.activityStrategy} set={(value)=>set("activityStrategy",value)} options={[["keep_current","Keep current during calibration","Recommended"],["reduce_slightly","Reduce cardio slightly"],["flexible","Use a flexible weekly target"]]}/><ChoiceGroup label="Cardio frequency" value={payload.cardioFrequency} set={(value)=>set("cardioFrequency",value)} options={[["as_needed","As needed","Recommended"],["two","2 sessions per week"],["three","3 sessions per week"]]}/><ChoiceGroup label="Cardio duration" value={payload.cardioDuration} set={(value)=>set("cardioDuration",value)} options={[["flexible","Flexible","Recommended"],["20","20 minutes"],["30","30 minutes"],["45","45 minutes"]]}/><Summary label="When we’ll adjust" value="When weight trend, training performance, or recovery shows the current level is no longer a good fit."/></Stack>;
  if (category === "training") {
    const options = transitionContext.supportingObjectives.map((item)=>item.title);
    return <Stack><Summary label="Current structure" value={payload.structure}/><Copy>Keep the current split and add emphasis only where it helps the new goal.</Copy><div><p className="mb-2 text-sm font-extrabold text-[var(--text-primary)]">Priority areas</p><div className="flex flex-wrap gap-2">{options.map((option)=>{const active=payload.priorities.includes(option);return <button aria-pressed={active} className={`min-h-11 rounded-xl border px-3 text-sm font-extrabold ${active?"border-[var(--primary)] bg-[var(--surface-accent)] text-[var(--primary)]":"border-[var(--divider)] text-[var(--text-secondary)]"}`} key={option} onClick={()=>set("priorities",active?payload.priorities.filter((item)=>item!==option):[...payload.priorities,option])} type="button">{option}</button>})}</div></div><ChoiceGroup label="Training emphasis" value={payload.trainingEmphasis} set={(value)=>set("trainingEmphasis",value)} options={[["keep_structure","Keep the current structure","Recommended"],["targeted_volume","Add targeted weekly volume"],["exercise_selection","Adjust exercise selection"]]}/></Stack>;
  }
  if (category === "briefings") return <Stack><Summary label="Coaching updates" value="Wednesday and Sunday"/><Copy>Daily evidence collection continues. This changes only how often PhysiqueOS brings the evidence together into recurring coaching interpretation.</Copy></Stack>;
  if (category === "photos") {
    const selection = payload.recurrence ?? {};
    const recommendation = recommendedCadence("photos", transitionContext);
    return <StructuredCadenceSelector daypartOptions={DAYPART_OPTIONS} frequencyLabel="How often would you like to take progress photos?" frequencyOptions={PHOTO_FREQUENCY_OPTIONS} recommendedFrequency={recommendation.frequency} selection={selection} setSelection={(next)=>setPayload(buildPhotoCadencePayload(next,transitionContext))} weekdayOptions={WEEKDAY_OPTIONS}/>;
  }
  if (category === "dexa") {
    const selection = payload.recurrence ?? {};
    const recommendation = recommendedCadence("dexa", transitionContext);
    return <StructuredCadenceSelector frequencyLabel="How often would you like to schedule a DEXA scan?" frequencyOptions={DEXA_INTERVAL_OPTIONS} recommendedFrequency={recommendation.frequency} selection={selection} setSelection={(next)=>setPayload(buildDexaCadencePayload(next,transitionContext))}/>;
  }
  if (category === "peptide") return <Stack><Summary label="Plan" value={transitionContext.sourceSnapshot?.name ?? "Peptide"}/><ChoiceGroup label="Schedule" value={payload.scheduleChoice ?? "keep_current"} set={(value)=>set("scheduleChoice",value)} options={[["keep_current","Keep the current schedule","Recommended"],["weekly","Once weekly"],["five_nights","Sunday through Thursday nights"]]}/></Stack>;
  if (category === "supplement") return <Stack><Summary label="Supplement" value={transitionContext.sourceSnapshot?.name ?? "Supplement"}/><ChoiceGroup label="Schedule" value={payload.scheduleChoice ?? "keep_current"} set={(value)=>set("scheduleChoice",value)} options={[["keep_current","Keep the current schedule","Recommended"],["daily","Daily"],["every_other_day","Every other day"]]}/></Stack>;
  return <Stack><ChoiceGroup label="Strategy for the new goal" value={payload.strategyChoice} set={(value)=>set("strategyChoice",value)} options={[["carry_forward","Carry the current approach forward","Recommended"],["review_later","Pause and review later"]]}/></Stack>;
}

function prefillPayload(review, protocolDraft, transitionContext) {
  const source = protocolDraft?.payload ?? {};
  if (review.category === "energy") return { mode: "Maintenance Calibration", calorieStrategy: source.calorieStrategy ?? "increase_gradually", activityStrategy: source.activityStrategy ?? "keep_current", evaluationCadence: source.evaluationCadence ?? "Weekly", adjustmentSize: source.adjustmentSize ?? "small", signals: source.signals ?? ["Weight trend","Training performance","Recovery","Progress photos"], uncertainty: "True maintenance intake is not known yet" };
  if (review.category === "nutrition") return { proteinBasis: source.proteinBasis ?? "body_weight", proteinRatio: source.proteinRatio ?? 1, proteinTarget: Math.round((transitionContext.openingBaseline.dexaWeight ?? 180) * (source.proteinRatio ?? 1)), fixedProtein: source.fixedProtein ?? 180, calorieStrategy: source.calorieStrategy ?? "increase_gradually", carbohydrateStrategy: source.carbohydrateStrategy ?? "performance", fatStrategy: source.fatStrategy ?? "sustainable_minimum", trainingDayFlexibility: source.trainingDayFlexibility ?? true, restDayFlexibility: source.restDayFlexibility ?? true };
  if (review.category === "activity") return { activityStrategy: source.activityStrategy ?? "keep_current", cardioFrequency: source.cardioFrequency ?? "as_needed", cardioDuration: source.cardioDuration ?? "flexible", adjustmentSignals: source.adjustmentSignals ?? ["Weight trend","Training performance","Recovery"] };
  if (review.category === "training") return { structure: source.structure ?? "Keep current split", priorities: transitionContext.supportingObjectives.filter((item)=>item.accepted).map((item)=>item.title), trainingEmphasis: source.trainingEmphasis ?? "keep_structure" };
  if (review.category === "briefings") return { cadence: "Twice weekly", days: ["Wednesday","Sunday"], dailyEvidenceCollection: true };
  if (review.category === "photos") {
    if (source.recurrence) return structuredClone(source);
    return buildPhotoCadencePayload(recommendedCadence("photos", transitionContext), transitionContext);
  }
  if (review.category === "dexa") {
    if (source.recurrence) return structuredClone(source);
    return buildDexaCadencePayload(recommendedCadence("dexa", transitionContext), transitionContext);
  }
  if (Object.keys(source).length) return structuredClone(source);
  return { strategyChoice: "carry_forward" };
}

function editorTitle(category) {
  return ({energy:"Begin with maintenance calibration",nutrition:"Shape nutrition around calibration",activity:"Make activity flexible",training:"Add only the emphasis you need",briefings:"Use the accepted coaching rhythm",photos:"Set your Progress Photos rhythm",dexa:"Set your DEXA rhythm"})[category] ?? "Prepare the strategy for your new goal";
}

function canSaveProtocol(category, payload) {
  if (category === "photos") return validatePhotoCadencePayload(payload).valid;
  if (category === "dexa") return validateDexaCadencePayload(payload).valid;
  if (category !== "energy") return Object.keys(payload).length > 0;
  return ["increase_gradually", "estimated_maintenance"].includes(payload.calorieStrategy)
    && ["keep_current", "reduce_slightly"].includes(payload.activityStrategy);
}
function validationMessage(category) {
  if (category === "photos") return validatePhotoCadencePayload({}).message;
  if (category === "dexa") return validateDexaCadencePayload({}).message;
  return "Choose a supported calorie and activity approach before saving.";
}
function PlanReview({presentation}){return <Stack>{presentation.sections.map((section)=><div className="rounded-2xl bg-[var(--surface-muted)] p-4" key={section.id}><p className="text-xs font-extrabold text-[var(--text-muted)]">{section.label}</p><p className="mt-1 text-sm font-extrabold leading-6 text-[var(--text-primary)]">{section.primaryValue}</p>{section.supportingText&&<p className="mt-1 text-sm font-semibold leading-6 text-[var(--text-secondary)]">{section.supportingText}</p>}</div>)}<Copy>{presentation.footer}</Copy></Stack>;}
function ProteinEditor({payload,setPayload,transitionContext}){const weight=transitionContext.openingBaseline.dexaWeight??180;const result=payload.proteinBasis==="fixed"?payload.fixedProtein:Math.round(weight*payload.proteinRatio);const set=(key,value)=>setPayload({...payload,[key]:value,proteinTarget:key==="proteinRatio"?Math.round(weight*value):key==="fixedProtein"?value:result});return <Stack><ChoiceGroup label="Protein target" value={payload.proteinBasis} set={(value)=>set("proteinBasis",value)} options={[["body_weight","Grams per pound of body weight","Recommended"],["fixed","Fixed grams","Advanced"]]}/>{payload.proteinBasis==="body_weight"?<><ChoiceGroup label="Grams per pound" value={String(payload.proteinRatio)} set={(value)=>set("proteinRatio",Number(value))} options={[["0.8","0.8 g/lb"],["0.9","0.9 g/lb"],["1","1.0 g/lb","Recommended"],["1.1","1.1 g/lb"]]}/><Summary label="Current result" value={`${result} g/day based on ${weight} lb`}/></>:<NumberInput label="Fixed protein target" value={payload.fixedProtein} set={(value)=>set("fixedProtein",value)} suffix="g"/>}<ChoiceGroup label="Calories" value={payload.calorieStrategy} set={(value)=>set("calorieStrategy",value)} options={[["increase_gradually","Increase gradually with calibration","Recommended"],["estimated_maintenance","Begin near estimated maintenance"],["custom","Custom range"]]}/><ChoiceGroup label="Carbohydrates" value={payload.carbohydrateStrategy} set={(value)=>set("carbohydrateStrategy",value)} options={[["performance","Support training performance","Recommended"],["balanced","Balanced"],["lower","Lower carbohydrate"]]}/><ChoiceGroup label="Fat" value={payload.fatStrategy} set={(value)=>set("fatStrategy",value)} options={[["sustainable_minimum","Sustainable minimum","Recommended"],["fixed","Fixed target"]]}/><Toggle label="Allow training-day flexibility" value={payload.trainingDayFlexibility} set={(value)=>set("trainingDayFlexibility",value)}/><Toggle label="Allow rest-day flexibility" value={payload.restDayFlexibility} set={(value)=>set("restDayFlexibility",value)}/></Stack>;}
function ChoiceGroup({label,options,set,value}){return <div><p className="mb-2 text-sm font-extrabold text-[var(--text-primary)]">{label}</p><div className="space-y-2">{options.map(([id,text,badge])=><button aria-pressed={String(value)===String(id)} className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border p-3 text-left text-sm font-extrabold ${String(value)===String(id)?"border-[var(--primary)] bg-[var(--surface-accent)] text-[var(--primary)]":"border-[var(--divider)] text-[var(--text-primary)]"}`} key={id} onClick={()=>set(id)} type="button"><span>{text}</span>{badge&&<span className="text-[10px] uppercase tracking-[.06em] text-[var(--text-muted)]">{badge}</span>}</button>)}</div></div>;}
function Stack({children}){return <div className="space-y-4">{children}</div>;}
function Copy({children}){return <p className="text-sm font-semibold leading-6 text-[var(--text-secondary)]">{children}</p>;}
function Summary({label,value}){return <div className="rounded-2xl bg-[var(--surface-muted)] p-4"><p className="text-xs font-extrabold text-[var(--text-muted)]">{label}</p><p className="mt-1 text-sm font-extrabold leading-6 text-[var(--text-primary)]">{value}</p></div>;}
function NumberInput({label,set,suffix,value}){return <label className="block text-sm font-extrabold text-[var(--text-primary)]">{label}<span className="mt-2 flex items-center rounded-xl border border-[var(--divider)] bg-[var(--input-bg)] px-3"><input className="min-h-12 flex-1 bg-transparent text-base font-extrabold outline-none" onChange={(event)=>set(Number(event.target.value))} type="number" value={value??""}/><span className="text-sm font-bold text-[var(--text-muted)]">{suffix}</span></span></label>;}
function Toggle({label,set,value}){return <button aria-pressed={value} className={`flex min-h-12 w-full items-center justify-between rounded-xl border p-3 text-left text-sm font-extrabold ${value?"border-[var(--primary)] bg-[var(--surface-accent)]":"border-[var(--divider)]"}`} onClick={()=>set(!value)} type="button">{label}<span>{value?"Yes":"No"}</span></button>;}
