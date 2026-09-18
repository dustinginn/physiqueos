"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, HelpCircle, RefreshCw, TrendingUp } from "lucide-react";
import ConfidenceRing from "../ui/ConfidenceRing";
import FloatingSheet from "../ui/FloatingSheet";

export default function HomeConfidenceDetail({ confidence, detail }) {
  const [open, setOpen] = useState(false);
  const richV3 = detail?.schemaVersion === "home_confidence_presentation_v3";
  const movement = movementPresentation(detail);

  useEffect(() => {
    if (!open) return undefined;
    const closeFromHistory = () => setOpen(false);
    window.addEventListener("popstate", closeFromHistory);
    return () => window.removeEventListener("popstate", closeFromHistory);
  }, [open]);

  function showDetail() {
    window.history.pushState({ ...window.history.state, homeConfidenceDetail: true }, "");
    setOpen(true);
  }

  function changeOpen(next) {
    if (next) return setOpen(true);
    setOpen(false);
    if (window.history.state?.homeConfidenceDetail) window.history.back();
  }

  return <>
    <button aria-label={`View why Goal Confidence is ${confidence} percent, ${detail.qualitativeLevel}${movement ? `, ${movement.spoken}` : ""}`} className="group justify-self-end rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--primary)] active:scale-[0.97]" onClick={showDetail} type="button">
      <span className="flex w-[82px] flex-col items-center">
        <ConfidenceRing label={richV3 ? "Goal confidence" : detail.qualitativeLevel} size={82} value={confidence} />
        {movement && <span className="mt-1 text-[9px] font-extrabold text-[var(--primary)]" data-testid="home-confidence-movement">{movement.visible}</span>}
      </span>
    </button>
    <FloatingSheet description={richV3
      ? detail.sections?.result ?? detail.whyConfidence
      : "The evidence currently supporting and limiting the overall trajectory."} onOpenChange={changeOpen} open={open} title={`Why Confidence is ${confidence}%`}>
      <HomeConfidenceDetailBody detail={detail} />
    </FloatingSheet>
  </>;
}

// Extracted so the final rendered explanation strings can be tested directly — the Radix
// Dialog above never mounts its Portal content while closed, so this is the only way to
// assert on what the modal actually renders rather than only on the presentation-model output.
export function HomeConfidenceDetailBody({ detail }) {
  if (detail?.schemaVersion === "home_confidence_presentation_v3") {
    return <RichV3ConfidenceDetail detail={detail}/>;
  }
  return <div className="space-y-4 px-1 py-2" data-testid="home-confidence-detail">
    <p className="text-sm font-extrabold text-[var(--text-primary)]">Current Confidence: {detail.qualitativeLevel}</p>
    <DetailGroup icon={CheckCircle2} items={detail.supportingFactors} title="What supports Confidence" />
    <DetailGroup icon={HelpCircle} items={detail.limitingFactors} title="What limits Confidence" />
    <DetailGroup icon={RefreshCw} items={detail.movementFactors} title="What changed" />
    <DetailGroup icon={TrendingUp} items={detail.clarifyingFactors} title="What we need next" />
    {detail.evidenceContextNote && <p className="rounded-xl bg-[var(--surface-muted)] p-3 text-xs font-semibold leading-5 text-[var(--text-secondary)]">{detail.evidenceContextNote}</p>}
    {detail.historicalContext && <p className="rounded-xl bg-[var(--surface-muted)] p-3 text-xs font-semibold leading-5 text-[var(--text-secondary)]">{detail.historicalContext}</p>}
    {detail.uncertaintyStatement && <p className="rounded-xl bg-[var(--surface-muted)] p-3 text-xs font-semibold leading-5 text-[var(--text-secondary)]">{detail.uncertaintyStatement}</p>}
  </div>;
}

function DetailGroup({ icon: Icon, items = [], title }) {
  if (!items.length) return null;
  return <section><div className="flex items-center gap-2"><Icon aria-hidden className="text-[var(--primary)]" size={16}/><h3 className="text-sm font-extrabold text-[var(--text-primary)]">{title}</h3></div><ul className="mt-2 space-y-1.5 pl-6 text-xs font-semibold leading-5 text-[var(--text-secondary)]">{items.map((item) => <li className="list-disc" key={item}>{item}</li>)}</ul></section>;
}

function RichV3ConfidenceDetail({ detail }) {
  return <div className="space-y-5 px-1 py-2" data-testid="home-confidence-detail" data-version="v3">
    <div>
      <p className="text-sm font-extrabold text-[var(--text-primary)]">{detail.qualitativeLevel} Confidence · {detail.currentPercentage}%</p>
      {detail.whyConfidence && <p className="mt-2 text-sm font-semibold leading-6 text-[var(--text-secondary)]">{detail.whyConfidence}</p>}
    </div>
    <DetailGroup icon={RefreshCw} items={detail.whatIncreasedIt} title="What moved Confidence" />
    <DetailGroup icon={CheckCircle2} items={detail.whatSupportsItNow} title="What supports the outlook" />
    <DetailGroup icon={HelpCircle} items={detail.whatIsHoldingItBack} title="What still limits the outlook" />
    <DetailGroup icon={TrendingUp} items={detail.whatCouldRaiseIt} title="What could raise Confidence" />
    <DetailGroup icon={HelpCircle} items={detail.whatCouldLowerIt} title="What could lower Confidence" />
    {detail.nextEvidence && <DetailParagraph title="What happens next" value={detail.nextEvidence}/>}
    {detail.coachTake && <DetailParagraph title="Coach’s Take" value={detail.coachTake}/>}
    {(detail.goal?.label || detail.phase?.label) && <p className="border-t border-[var(--divider)] pt-3 text-[10px] font-semibold leading-4 text-[var(--text-muted)]">{[detail.goal?.label, detail.phase?.label].filter(Boolean).join(" · ")}</p>}
  </div>;
}

function DetailParagraph({ title, value }) {
  return <section><h3 className="text-sm font-extrabold text-[var(--text-primary)]">{title}</h3><p className="mt-2 text-xs font-semibold leading-5 text-[var(--text-secondary)]">{value}</p></section>;
}

function movementPresentation(detail) {
  if (!Number.isFinite(detail?.delta)) return null;
  if (detail.movement === "increased" && detail.delta > 0) {
    return { visible: `↑ Up ${detail.delta} points`,
      spoken: `up ${detail.delta} points` };
  }
  if (detail.movement === "decreased" && detail.delta < 0) {
    return { visible: `↓ Down ${Math.abs(detail.delta)} points`,
      spoken: `down ${Math.abs(detail.delta)} points` };
  }
  if (detail.movement === "held") {
    return { visible: "— Held", spoken: "held" };
  }
  return null;
}
