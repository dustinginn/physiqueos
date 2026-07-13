"use client";

import { startTransition, useState } from "react";
import ProtocolBuilderShell from "../components/protocol-builder/ProtocolBuilderShell";
import ProtocolReview from "../components/protocol-builder/ProtocolReview";
import { deriveWeeklyActivityTarget } from "../domain/services/ActivityProtocolBuilderService";

const TOTAL_STEPS = 8;
const PRIMARY_LABELS = {
  3: "Use this target",
  5: "Sounds good",
  6: "Review my strategy",
  8: "Activate Activity",
};

export default function ActivityProtocolBuilderScreen({ action, context }) {
  const [step, setStep] = useState(1);
  const [strategyChoice, setStrategyChoice] = useState(null);
  const [dailyTarget, setDailyTarget] = useState(context.defaultDailyTarget);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const weeklyTarget = deriveWeeklyActivityTarget(dailyTarget);
  const stepContent = getStepContent({ context, dailyTarget, setDailyTarget, setStrategyChoice, step, strategyChoice, weeklyTarget });
  const canContinue = step === 2 ? strategyChoice !== null : step === 3 ? Number(dailyTarget) >= 100 : true;

  function submit() {
    setError("");
    setIsSubmitting(true);
    const formData = new FormData();
    formData.set("founderConfirmed", strategyChoice ? "yes" : "no");
    formData.set("strategyChoice", strategyChoice ?? "");
    formData.set("dailyTarget", String(dailyTarget));
    startTransition(async () => {
      try {
        await action(formData);
      } catch (submissionError) {
        setError(submissionError.message);
        setIsSubmitting(false);
      }
    });
  }

  return (
    <form action={action} onSubmit={(event) => event.preventDefault()}>
      <ProtocolBuilderShell
        backHref="/profile/operating-plan"
        canContinue={canContinue}
        currentStep={step}
        isSubmitting={isSubmitting}
        onBack={step > 1 ? () => setStep((value) => value - 1) : null}
        onContinue={step < TOTAL_STEPS ? () => setStep((value) => value + 1) : submit}
        primaryLabel={PRIMARY_LABELS[step] ?? "Continue"}
        title={stepContent.title}
        totalSteps={TOTAL_STEPS}
      >
        {stepContent.content}
        {error && <p aria-live="assertive" className="rounded-[14px] bg-[var(--surface-warning)] p-3 text-sm font-bold text-[var(--text-primary)]">{error}</p>}
      </ProtocolBuilderShell>
    </form>
  );
}

function getStepContent({ context, dailyTarget, setDailyTarget, setStrategyChoice, step, strategyChoice, weeklyTarget }) {
  const recentAverage = context.evidenceSummary.recentAverageActiveCalories ?? context.defaultDailyTarget;
  const commonContext = <div className="flex flex-wrap gap-2"><Chip>Visible Abs at Rest</Chip><Chip>Late-stage cut</Chip><Chip>Founder-authored</Chip></div>;
  const steps = {
    1: { title: "Let’s add Activity to your Operating Plan.", content: <div className="space-y-4">{commonContext}<Copy>You’ve been following an activity strategy that’s clearly helping your cut.</Copy><Copy>Now let’s make it part of your Operating Plan so PhysiqueOS can coach against it going forward.</Copy><Copy>Because you’re already well into your cut, PhysiqueOS will use what it has seen recently and ask you to confirm the parts it can’t know yet.</Copy></div> },
    2: { title: "Is this a fair description of what you’ve been doing?", content: <div className="space-y-4"><Copy>Over the past week, your activity has averaged about {Number(recentAverage).toLocaleString("en-US")} active calories per day.</Copy><Copy>PhysiqueOS only has recent Activity evidence, so it can’t assume that’s how you’ve trained throughout the entire cut. Did this generally reflect the approach you’ve been following?</Copy><Choice active={strategyChoice === "reflects"} label="Yes, that’s been my approach" onClick={() => setStrategyChoice("reflects")} /><Choice active={strategyChoice === "adjust"} label="Not quite" onClick={() => setStrategyChoice("adjust")} /></div> },
    3: { title: "What should your daily Activity target be?", content: <div className="space-y-4"><Copy>Your recent activity has been close to {Number(recentAverage).toLocaleString("en-US")} active calories per day. If that reflects the level you want to keep following, use it as your daily target.</Copy><label className="block text-sm font-extrabold text-[var(--text-primary)]" htmlFor="daily-activity-target">Daily active calories</label><input id="daily-activity-target" inputMode="numeric" min="100" max="5000" className="min-h-14 w-full rounded-[16px] border border-[var(--divider)] bg-[var(--surface-muted)] px-4 text-2xl font-black text-[var(--text-primary)]" onChange={(event) => setDailyTarget(Number(event.target.value))} type="number" value={dailyTarget} /><Copy>This includes training, cardio, walking, and normal daily movement recorded by Apple Watch.</Copy></div> },
    4: { title: "One day doesn’t tell the whole story.", content: <div className="space-y-4"><Copy>Some days you’ll train harder. Some days you’ll be busier. That’s normal.</Copy><Copy>Rather than reacting to every single day, PhysiqueOS will pay attention to how the week is trending.</Copy><div className="grid grid-cols-2 gap-3"><Metric label="Daily target" value={`About ${Number(dailyTarget).toLocaleString("en-US")} active calories`} /><Metric label="Weekly target" value={`About ${weeklyTarget.toLocaleString("en-US")} active calories`} /></div><Copy>That way, a lower day doesn’t become a problem if the rest of the week brings you back on track.</Copy></div> },
    5: { title: "Here’s how PhysiqueOS will coach this.", content: <div className="space-y-4"><Copy>PhysiqueOS will stay out of the way when you’re on track.</Copy><Copy>If you begin falling behind for the week, it will point that out early enough that you can recover without overreacting.</Copy><Copy>A fuller Activity review is planned for a future Sunday Weekly Review, so you’ll eventually be able to see how the entire week came together.</Copy><p className="text-xs font-bold text-[var(--text-muted)]">Push alerts will stay off for now.</p></div> },
    6: { title: "Here’s what PhysiqueOS knows so far.", content: <div className="space-y-4"><Copy>You’ve confirmed that this reflects the strategy you’ve been following, so PhysiqueOS can be confident about the plan itself.</Copy><Copy>What it knows less about is exactly how much Activity you accumulated earlier in the cut, since direct Activity evidence only started arriving recently.</Copy><Copy>That’s okay. As more Activity Days are collected, the picture will become more complete.</Copy><div className="grid grid-cols-2 gap-3"><Metric label="Strategy" value="Confirmed by you" /><Metric label="Activity history" value="Still building" /></div></div> },
    7: { title: "Your Activity Strategy", content: <ProtocolReview footer="Founder-authored · Begins upon activation" sections={reviewSections({ dailyTarget })} /> },
    8: { title: "Ready to add Activity to your Operating Plan?", content: <div className="space-y-4"><Copy>Once you activate it, PhysiqueOS will use this strategy to understand your Activity evidence, follow your weekly trajectory, and let you know when something is worth your attention.</Copy><Metric label="Starts today" value={context.effectiveDateLabel} /></div> },
  };
  return steps[step] ?? steps[1];
}

function reviewSections({ dailyTarget }) { return [
  { label: "Purpose", value: "Support your cut through consistent daily activity while preserving recovery." },
  { label: "Expectation", value: `Around ${Number(dailyTarget).toLocaleString("en-US")} active calories each day.` },
  { label: "How PhysiqueOS will evaluate it", value: "It will look at the week as a whole instead of overreacting to individual days." },
  { label: "What counts", value: "Strength training, cardio, walking, and normal daily movement recorded by Apple Watch." },
  { label: "When we’ll revisit it", value: "If your goal changes, recovery starts slipping, or this strategy stops matching your progress." },
  { label: "What PhysiqueOS knows today", value: "You’ve confirmed that this reflects the approach you’ve been using, even though direct Activity evidence only covers the recent part of your cut." },
]; }
function Choice({ active, label, onClick }) { return <button aria-pressed={active} className={`min-h-12 w-full rounded-[16px] border px-4 text-left text-sm font-extrabold ${active ? "border-[var(--primary)] bg-[var(--surface-accent)] text-[var(--primary)]" : "border-[var(--divider)] bg-[var(--surface-muted)] text-[var(--text-primary)]"}`} onClick={onClick} type="button">{label}</button>; }
function Chip({ children }) { return <span className="rounded-full bg-[var(--surface-muted)] px-3 py-1.5 text-xs font-extrabold text-[var(--text-secondary)]">{children}</span>; }
function Copy({ children }) { return <p className="text-sm font-semibold leading-6 text-[var(--text-secondary)]">{children}</p>; }
function Metric({ label, value }) { return <div className="rounded-[16px] bg-[var(--surface-muted)] p-4"><p className="text-xs font-extrabold text-[var(--text-muted)]">{label}</p><p className="mt-1 text-base font-black text-[var(--text-primary)]">{value}</p></div>; }
