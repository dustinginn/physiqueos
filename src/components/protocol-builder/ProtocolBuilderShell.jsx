"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import Card from "../ui/Card";

export default function ProtocolBuilderShell({
  backHref,
  children,
  currentStep,
  eyebrow = "Protocol Builder",
  onBack,
  onContinue,
  primaryLabel = "Continue",
  secondaryLabel = "Back",
  title,
  totalSteps,
  canContinue = true,
  isSubmitting = false,
}) {
  const headingRef = useRef(null);
  const progress = Math.round((currentStep / totalSteps) * 100);

  useEffect(() => {
    headingRef.current?.focus();
  }, [currentStep]);

  return (
    <main className="app-surface min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-[393px] flex-col px-4 pt-8 pb-8">
        <Link
          className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-semibold text-[var(--text-secondary)]"
          href={backHref}
        >
          <ArrowLeft size={18} />
          Operating Plan
        </Link>

        <div className="mt-5" aria-label={`Step ${currentStep} of ${totalSteps}`} role="progressbar" aria-valuemin={1} aria-valuemax={totalSteps} aria-valuenow={currentStep}>
          <div className="flex items-center justify-between text-xs font-extrabold text-[var(--text-muted)]">
            <span>{eyebrow}</span>
            <span>Step {currentStep} of {totalSteps}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--surface-muted)]">
            <div className="h-full rounded-full bg-[var(--primary)] transition-[width]" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <Card className="mt-5 flex-1 space-y-5" padding="lg">
          <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-black leading-tight text-[var(--text-primary)] outline-none">
            {title}
          </h1>
          {children}
        </Card>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            className="min-h-12 rounded-[16px] bg-[var(--surface-muted)] px-4 text-sm font-extrabold text-[var(--text-primary)] disabled:opacity-40"
            disabled={!onBack || isSubmitting}
            onClick={onBack}
            type="button"
          >
            {secondaryLabel}
          </button>
          <button
            className="min-h-12 rounded-[16px] bg-[var(--primary)] px-4 text-sm font-extrabold text-white disabled:opacity-40"
            disabled={!canContinue || isSubmitting}
            onClick={onContinue}
            type={currentStep === totalSteps ? "submit" : "button"}
          >
            {isSubmitting ? "Activating..." : primaryLabel}
          </button>
        </div>
      </div>
    </main>
  );
}
