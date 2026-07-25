"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, HelpCircle, TrendingUp } from "lucide-react";
import ConfidenceRing from "../ui/ConfidenceRing";
import FloatingSheet from "../ui/FloatingSheet";

export default function HomeConfidenceDetail({ confidence, detail }) {
  const [open, setOpen] = useState(false);

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
    <button aria-label={`View why goal confidence is ${confidence} percent`} className="group justify-self-end rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--primary)] active:scale-[0.97]" onClick={showDetail} type="button">
      <ConfidenceRing label="Goal" size={82} value={confidence} />
    </button>
    <FloatingSheet description="The evidence currently supporting and limiting the overall trajectory." onOpenChange={changeOpen} open={open} title={`Why confidence is ${confidence}%`}>
      <div className="space-y-4 px-1 py-2" data-testid="home-confidence-detail">
        <p className="text-sm font-extrabold text-[var(--text-primary)]">Current confidence: {detail.qualitativeLevel}</p>
        <DetailGroup icon={CheckCircle2} items={detail.supportingFactors} title="What supports confidence" />
        <DetailGroup icon={HelpCircle} items={detail.limitingFactors} title="What limits confidence" />
        <DetailGroup icon={TrendingUp} items={detail.clarifyingFactors} title="What will make confidence clearer" />
        <p className="rounded-xl bg-[var(--surface-muted)] p-3 text-xs font-semibold leading-5 text-[var(--text-secondary)]">{detail.uncertaintyStatement}</p>
      </div>
    </FloatingSheet>
  </>;
}

function DetailGroup({ icon: Icon, items = [], title }) {
  return <section><div className="flex items-center gap-2"><Icon aria-hidden className="text-[var(--primary)]" size={16}/><h3 className="text-sm font-extrabold text-[var(--text-primary)]">{title}</h3></div><ul className="mt-2 space-y-1.5 pl-6 text-xs font-semibold leading-5 text-[var(--text-secondary)]">{items.map((item) => <li className="list-disc" key={item}>{item}</li>)}</ul></section>;
}
