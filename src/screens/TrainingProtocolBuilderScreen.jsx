"use client";

import { startTransition, useState } from "react";
import ProtocolBuilderShell from "../components/protocol-builder/ProtocolBuilderShell";
import ProtocolReview from "../components/protocol-builder/ProtocolReview";

const TOTAL_STEPS = 11;
const AREA_LABELS = { arms: "Arms", core: "Core", lower_body: "Lower body", back: "Back", chest: "Chest", shoulders: "Shoulders" };
const DAY_LABELS = { monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday", thursday: "Thursday", friday: "Friday", saturday: "Saturday", sunday: "Sunday" };
const PRIMARY_LABELS = { 2: "Use this objective", 3: "Use these priorities", 4: "Use these frequencies", 5: "Use this rhythm", 6: "Use this pace", 7: "Use this rule", 8: "Use maintenance", 9: "Use these safeguards", 10: "Continue", 11: "Activate Training" };

export default function TrainingProtocolBuilderScreen({ action, context }) {
  const [step, setStep] = useState(1);
  const [objective, setObjective] = useState("preserve_lean_mass");
  const [priorities, setPriorities] = useState(["arms", "core", "lower_body"]);
  const [frequencies, setFrequencies] = useState(context.defaultFrequencies);
  const [preferredRhythm, setPreferredRhythm] = useState(context.defaultRhythm);
  const [progressionPace, setProgressionPace] = useState("moderate");
  const [nutritionPhase, setNutritionPhase] = useState("maintenance");
  const [recoveryGates, setRecoveryGates] = useState(["recovery_declines", "pain_develops", "performance_regresses", "evidence_incomplete"]);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const strategy = { frequencies, nutritionPhase, objective, preferredRhythm, priorities, progressionPace, recoveryGates };
  const content = getStepContent({ context, setObjective, setPriorities, setFrequencies, setPreferredRhythm, setProgressionPace, setNutritionPhase, setRecoveryGates, step, strategy });
  const canContinue = step === 3 ? priorities.length > 0 : step === 9 ? recoveryGates.length > 0 : true;

  function submit() {
    setError("");
    setIsSubmitting(true);
    const formData = new FormData();
    formData.set("founderConfirmed", "yes");
    formData.set("strategy", JSON.stringify(strategy));
    startTransition(async () => {
      try { await action(formData); }
      catch (submissionError) { setError(submissionError.message); setIsSubmitting(false); }
    });
  }

  return <form action={action} onSubmit={(event) => event.preventDefault()}><ProtocolBuilderShell backHref="/profile/operating-plan" canContinue={canContinue} currentStep={step} eyebrow="Training Protocol Builder" isSubmitting={isSubmitting} onBack={step > 1 ? () => setStep((value) => value - 1) : null} onContinue={step < TOTAL_STEPS ? () => setStep((value) => value + 1) : submit} primaryLabel={PRIMARY_LABELS[step] ?? "Continue"} title={content.title} totalSteps={TOTAL_STEPS}>{content.body}{error && <p aria-live="assertive" className="rounded-[14px] bg-[var(--surface-warning)] p-3 text-sm font-bold">{error}</p>}</ProtocolBuilderShell></form>;
}

function getStepContent({ context, setObjective, setPriorities, setFrequencies, setPreferredRhythm, setProgressionPace, setNutritionPhase, setRecoveryGates, step, strategy }) {
  const { frequencies, nutritionPhase, objective, preferredRhythm, priorities, progressionPace, recoveryGates } = strategy;
  const steps = {
    1: { title: "Let’s define how Training supports what comes next.", body: <Stack><Chips values={["Visible Abs at Rest", "Late-stage cut", "Maintenance next"]} /><Copy>Training has helped preserve lean mass through your cut. The next strategy should carry that forward while giving performance room to return in maintenance.</Copy><Copy>This sets the weekly structure and progression philosophy PhysiqueOS will coach against. Individual workouts can still move when life requires it.</Copy></Stack> },
    2: { title: "What matters most from your training right now?", body: <Stack><Copy>Choose the outcome that should guide the plan as you move out of the cut.</Copy><Choices value={objective} onChange={setObjective} options={[
      { id: "preserve_lean_mass", label: "Preserve lean mass", description: "Maintain the muscle and strength you already have while limiting losses during a deficit or transition.", impact: "Progression can be slower, and maintaining performance may count as success." },
      { id: "recomposition", label: "Recomposition", description: "Gradually add muscle while keeping body fat relatively stable.", impact: "Progress is slower than a dedicated bulk, but it fits well near maintenance calories." },
      { id: "maximize_muscle_growth", label: "Maximize muscle growth", description: "Prioritize adding muscle as efficiently as possible.", impact: "This usually requires a calorie surplus, stronger recovery, and some tolerance for fat gain." },
      { id: "improve_performance", label: "Improve performance", description: "Prioritize strength, work capacity, or athletic output over physique change.", impact: "Exercise selection and progression will be judged primarily by performance outcomes." },
    ]} /></Stack> },
    3: { title: "Which areas deserve the most attention?", body: <Stack><Copy>Priorities tell PhysiqueOS where progression deserves extra attention. They don’t make the rest of your training optional.</Copy><ToggleGrid values={Object.keys(AREA_LABELS)} selected={priorities} labels={AREA_LABELS} onChange={setPriorities} /></Stack> },
    4: { title: "How often should each area be trained?", body: <Stack><Copy>Weekly frequency is the commitment. The exact training day can move without turning a rescheduled session into a miss.</Copy><div className="space-y-2">{Object.entries(AREA_LABELS).map(([area, label]) => <label className="flex min-h-12 items-center justify-between rounded-[14px] bg-[var(--surface-muted)] px-4 text-sm font-extrabold" key={area}>{label}<select aria-label={`${label} weekly frequency`} className="rounded-lg bg-[var(--surface-elevated)] px-3 py-2" value={frequencies[area]} onChange={(event) => setFrequencies({ ...frequencies, [area]: Number(event.target.value) })}>{[0,1,2,3,4].map((value) => <option key={value} value={value}>{value}x</option>)}</select></label>)}</div></Stack> },
    5: { title: "Build your preferred weekly rhythm.", body: <Stack><Copy>Choose what you prefer to train each day. Combine areas when that fits. This schedule can move—the weekly frequency targets remain the commitment.</Copy><WeeklySplitEditor rhythm={preferredRhythm} onChange={setPreferredRhythm} /></Stack> },
    6: { title: "How quickly should progression move?", body: <Stack><Copy>Maintenance should restore performance and support steady progress without forcing load increases before they’re earned.</Copy><Choices value={progressionPace} onChange={setProgressionPace} options={[
      { id: "conservative", label: "Conservative", description: "Increase load or difficulty only after repeated, consistent success.", impact: "More time is spent mastering each level, with fewer failed attempts and lower recovery demand." },
      { id: "moderate", label: "Moderate", description: "Progress after repeated evidence shows the current load is controlled and repeatable.", impact: "Balances steady improvement with recovery and is the intended pace for maintenance.", recommended: true },
      { id: "aggressive", label: "Aggressive", description: "Attempt progression as soon as performance suggests the next step may be possible.", impact: "Creates more opportunities for rapid progress, with more failed attempts and higher recovery demand." },
    ]} /></Stack> },
    7: { title: "Here’s the default progression rule.", body: <Stack><Copy>Reach the top of the rep range across two successful sessions before increasing load.</Copy><Copy>This keeps progression deliberate. Exercise-specific exceptions can come later when PhysiqueOS has enough evidence to support them.</Copy><Summary label="Default rule" value="Two successful sessions · then increase load" /></Stack> },
    8: { title: "Which nutrition phase should shape expectations?", body: <Stack><Copy>Energy availability changes what productive training looks like.</Copy><Choices value={nutritionPhase} onChange={setNutritionPhase} options={[
      { id: "deficit", label: "Deficit", description: "Calories are below maintenance, so training is mainly protecting muscle and strength.", impact: "Progression may slow, and maintaining performance can still represent a successful phase." },
      { id: "maintenance", label: "Maintenance", description: "Calories are near energy balance, allowing performance to recover and gradual progression to resume.", impact: "Muscle gain is possible, but rapid increases in lean mass should not be assumed.", recommended: true },
      { id: "surplus", label: "Surplus", description: "Calories are above maintenance to provide more energy for recovery and growth.", impact: "Volume and progression can be pushed more aggressively, with some potential body-fat gain accepted." },
    ]} /></Stack> },
    9: { title: "When should progression pause?", body: <Stack><Copy>Progress is useful only when your body is ready to support it. An enabled safeguard tells PhysiqueOS to hold progression until the signal improves.</Copy><ToggleGrid values={["recovery_declines", "pain_develops", "performance_regresses", "evidence_incomplete"]} selected={recoveryGates} labels={{ recovery_declines: "Recovery declines", pain_develops: "Pain develops", performance_regresses: "Performance regresses", evidence_incomplete: "The evidence is incomplete" }} descriptions={{ recovery_declines: "Hold increases when your recovery trend no longer supports more demand.", pain_develops: "Avoid progressing through a new or worsening pain signal.", performance_regresses: "Pause when repeated sessions show performance moving backward.", evidence_incomplete: "Wait when there isn’t enough reliable training evidence to judge readiness." }} onChange={setRecoveryGates} singleColumn /></Stack> },
    10: { title: "Your Training Strategy", body: <ProtocolReview footer="Founder-authored · Begins upon activation" sections={reviewSections({ ...strategy })} /> },
    11: { title: "Ready to add Training to your Operating Plan?", body: <Stack><Copy>PhysiqueOS will use this strategy to understand your weekly training rhythm, keep progression aligned with recovery, and focus future coaching on what matters most.</Copy><Summary label="Starts today" value={context.effectiveDateLabel} /></Stack> },
  };
  return steps[step] ?? steps[1];
}

function reviewSections({ frequencies, nutritionPhase, objective, preferredRhythm, priorities, progressionPace, recoveryGates }) { return [
  { label: "Purpose", value: objectiveLabel(objective) },
  { label: "Training priorities", value: priorities.map((item) => AREA_LABELS[item]).join(" · ") },
  { label: "Weekly expectations", value: Object.entries(frequencies).filter(([, value]) => value > 0).map(([area, value]) => `${AREA_LABELS[area]} ${value}x`).join(" · ") },
  { label: "Preferred weekly rhythm", value: preferredRhythm.map(formatRhythmDay).join("\n") },
  { label: "Progression philosophy", value: `${titleCase(progressionPace)} pace. Reach the top of the rep range across two successful sessions before increasing load.` },
  { label: "Recovery philosophy", value: recoveryGates.map((item) => titleCase(item)).join(" · ") },
  { label: "Nutrition context", value: `${titleCase(nutritionPhase)}. Restore performance and build gradual progression.` },
  { label: "How PhysiqueOS will coach this", value: "Prioritize the training day, reference Training selectively in future coaching, and keep push alerts off." },
  { label: "When we’ll revisit it", value: "When your goal or nutrition phase changes, recovery slips, performance regresses, or the strategy stops matching your progress." },
]; }
function objectiveLabel(value) { return ({ preserve_lean_mass: "Preserve lean mass through the end of the cut, then restore performance in maintenance.", recomposition: "Improve body composition while building steady training performance.", maximize_muscle_growth: "Make muscle growth the primary outcome of the training plan.", improve_performance: "Make measurable training performance the primary outcome." })[value]; }
function Choices({ onChange, options, value }) { return <div aria-label="Choose one option" className="space-y-2" role="radiogroup">{options.map((option) => <Choice active={value === option.id} description={option.description} impact={option.impact} key={option.id} label={option.label} onClick={() => onChange(option.id)} recommended={option.recommended} role="radio" />)}</div>; }
function ToggleGrid({ descriptions = {}, labels, onChange, selected, singleColumn = false, values }) { return <div aria-label="Choose all that apply" className={singleColumn ? "space-y-2" : "grid grid-cols-2 gap-2"} role="group">{values.map((value) => { const active = selected.includes(value); return <Choice active={active} description={descriptions[value]} key={value} label={labels[value]} onClick={() => onChange(active ? selected.filter((item) => item !== value) : [...selected, value])} />; })}</div>; }
function WeeklySplitEditor({ onChange, rhythm }) {
  function updateDay(day, updater) { onChange(rhythm.map((item) => item.day === day ? updater(item) : item)); }
  return <div className="space-y-3">{rhythm.map((entry) => {
    const flexible = entry.mode === "flexible_recovery";
    return <section className="rounded-[16px] border border-[var(--divider)] bg-[var(--surface-muted)] p-3" key={entry.day}>
      <div className="flex items-center justify-between gap-3"><h2 className="text-sm font-extrabold text-[var(--text-primary)]">{DAY_LABELS[entry.day]}</h2><button aria-pressed={flexible} className={`min-h-10 rounded-full px-3 text-xs font-extrabold ${flexible ? "bg-[var(--surface-accent)] text-[var(--primary)]" : "bg-[var(--surface-elevated)] text-[var(--text-secondary)]"}`} onClick={() => updateDay(entry.day, (item) => ({ ...item, focus: flexible ? [] : item.focus, mode: flexible ? undefined : "flexible_recovery" }))} type="button">Flexible / Recovery</button></div>
      <div aria-label={`${DAY_LABELS[entry.day]} training areas`} className="mt-3 flex flex-wrap gap-2" role="group">{Object.entries(AREA_LABELS).map(([area, label]) => { const active = entry.focus.includes(area); return <button aria-pressed={active} className={`min-h-10 rounded-full border px-3 text-xs font-extrabold ${active ? "border-[var(--primary)] bg-[var(--surface-accent)] text-[var(--primary)]" : "border-[var(--divider)] bg-[var(--surface-elevated)] text-[var(--text-secondary)]"}`} key={area} onClick={() => updateDay(entry.day, (item) => ({ ...item, focus: active ? item.focus.filter((value) => value !== area) : [...item.focus, area], mode: undefined }))} type="button">{label}</button>; })}</div>
      <p className="mt-2 text-xs font-semibold text-[var(--text-muted)]">{formatRhythmDay(entry).replace(`${DAY_LABELS[entry.day]} · `, "")}</p>
    </section>;
  })}</div>;
}
function formatRhythmDay(entry) { const focus = entry.focus.map((area) => AREA_LABELS[area]).join(" / "); return `${DAY_LABELS[entry.day]} · ${entry.mode === "flexible_recovery" ? "Flexible / Recovery" : focus || "Open"}`; }
function Choice({ active, description, impact, label, onClick, recommended = false, role }) { return <button aria-checked={role === "radio" ? active : undefined} aria-pressed={role ? undefined : active} className={`min-h-12 w-full rounded-[16px] border px-4 py-3 text-left ${active ? "border-[var(--primary)] bg-[var(--surface-accent)]" : "border-[var(--divider)] bg-[var(--surface-muted)]"}`} onClick={onClick} role={role} type="button"><span className="flex items-center justify-between gap-3"><span className={`text-sm font-extrabold ${active ? "text-[var(--primary)]" : "text-[var(--text-primary)]"}`}>{label}</span>{recommended && <span className="rounded-full bg-[var(--surface-elevated)] px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.06em] text-[var(--primary)]">Recommended</span>}</span>{description && <span className="mt-1.5 block text-xs font-semibold leading-5 text-[var(--text-secondary)]">{description}</span>}{impact && <span className="mt-1 block text-xs font-semibold leading-5 text-[var(--text-muted)]">What this means: {impact}</span>}</button>; }
function Stack({ children }) { return <div className="space-y-4">{children}</div>; }
function Copy({ children }) { return <p className="text-sm font-semibold leading-6 text-[var(--text-secondary)]">{children}</p>; }
function Chips({ values }) { return <div className="flex flex-wrap gap-2">{values.map((value) => <span className="rounded-full bg-[var(--surface-muted)] px-3 py-1.5 text-xs font-extrabold text-[var(--text-secondary)]" key={value}>{value}</span>)}</div>; }
function Summary({ label, value }) { return <div className="rounded-[16px] bg-[var(--surface-muted)] p-4"><p className="text-xs font-extrabold text-[var(--text-muted)]">{label}</p><p className="mt-1 text-sm font-black leading-6 text-[var(--text-primary)]">{value}</p></div>; }
function titleCase(value) { return String(value).replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
