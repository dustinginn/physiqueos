"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Activity, AlertTriangle, Camera, Dumbbell, FileText, HeartPulse, Scale, Utensils } from "lucide-react";
import Card from "../components/ui/Card";
import EvidenceImage from "../components/progress/EvidenceImage";
import {
  createEvidenceReviewPresentation,
  toggleEvidenceReviewItemDecision,
} from "../domain/services/EvidenceReviewPresentationService";

const ICONS = { activity: Activity, dexa: FileText, nutrition: Utensils, photos: Camera, training: Dumbbell, weight: Scale };

export default function EvidenceReviewScreen({ confirmAction, discardAction, reprocessAction, review }) {
  const evidencePackage = review.interpretedEvidence ?? {};
  const [itemDecisions, setItemDecisions] = useState(() => review.itemDecisions ?? {});
  const presentation = createEvidenceReviewPresentation({ evidencePackage, itemDecisions });
  const status = review.status;
  const canEdit = ["pending", "commit_failed", "partially_committed"].includes(status);
  const blockingPhotoIssue = presentation.items.some((item) => item.included && hasIncompletePhotoSet(item.object));
  const toggleItem = (item) => {
    setItemDecisions((current) =>
      toggleEvidenceReviewItemDecision(current, item.object.id, item.included)
    );
  };

  return (
    <main className="app-surface min-h-screen">
      <div className="mx-auto max-w-[393px] px-4 pb-32 pt-8 sm:py-10">
        <Link className="inline-flex min-h-11 items-center text-sm font-bold text-[var(--primary)]" href="/log">← Back to Log</Link>
        <header className="mt-3">
          <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[var(--primary)]">Evidence Review</p>
          <h1 className="mt-2 text-3xl font-extrabold text-[var(--text-primary)]">Is this what you meant to log?</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">Check what PhysiqueOS detected. You can exclude anything that should not become part of your history.</p>
        </header>

        <div className="mt-6 space-y-4">
          {presentation.items.map((item) => (
            <EvidenceCard canEdit={canEdit} item={item} key={item.object.id} onToggle={toggleItem} />
          ))}
        </div>

        {hasCommitFailure(review) && (
          <Card className="mt-6" variant="warning">
            <div className="flex gap-3"><AlertTriangle aria-hidden="true" size={20} /><div><h2 className="font-extrabold">Processing paused safely</h2><p className="mt-1 text-sm text-[var(--text-secondary)]">Retry to continue. Steps that already completed will not run again.</p></div></div>
          </Card>
        )}

        {review.reprocessing?.status === "complete" && <Card className="mt-6" variant="soft"><p className="text-sm font-bold text-[var(--text-primary)]">Review refreshed from the original evidence.</p></Card>}
        {review.reprocessing?.status === "failed" && <Card className="mt-6" variant="warning"><p className="text-sm font-bold text-[var(--text-primary)]">The review could not be refreshed. Your previous review is still intact.</p></Card>}

        <Card className="mt-6 space-y-3" variant={presentation.summary.included ? "accent" : "soft"}>
          <h2 className="text-lg font-extrabold text-[var(--text-primary)]">Ready to add</h2>
          <p className="font-bold text-[var(--text-primary)]">
            {presentation.summary.included} evidence {presentation.summary.included === 1 ? "item" : "items"}
          </p>
          {presentation.summary.excluded > 0 && (
            <p className="text-sm text-[var(--text-secondary)]">
              {presentation.summary.excluded} evidence {presentation.summary.excluded === 1 ? "item" : "items"} excluded
            </p>
          )}
          {!presentation.summary.included && <p className="text-sm font-semibold text-[var(--text-secondary)]">Select at least one item to continue.</p>}
        </Card>

        <form action={confirmAction} className="mt-6">
          <input name="reviewId" type="hidden" value={review.id} />
          <textarea className="hidden" name="evidenceJson" readOnly value={JSON.stringify(evidencePackage)} />
          <textarea className="hidden" name="itemDecisionsJson" readOnly value={JSON.stringify(itemDecisions)} />
          {canEdit ? (
            <ConfirmButton disabled={!presentation.summary.included || blockingPhotoIssue} retry={status === "partially_committed"} />
          ) : <Card><p className="font-bold text-[var(--text-primary)]">This review was {status}.</p></Card>}
        </form>
        {canEdit && reprocessAction && <form action={reprocessAction} className="mt-3"><input name="reviewId" type="hidden" value={review.id} /><ReprocessButton /></form>}
        {canEdit && <div className="mt-3 grid grid-cols-2 gap-3">
          <Link className="flex min-h-12 items-center justify-center rounded-2xl border border-[var(--divider)] px-3 text-center text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100" href="/log">Save and return later</Link>
          <DiscardReviewControl action={discardAction} reviewId={review.id} />
        </div>}
      </div>
    </main>
  );
}

function EvidenceCard({ canEdit, item, onToggle }) {
  const Icon = ICONS[item.type] ?? HeartPulse;
  return (
    <Card className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-accent)] text-[var(--primary)]"><Icon aria-hidden="true" size={21} /></span>
          <div className="min-w-0"><p className="text-sm font-bold text-[var(--text-secondary)]">{item.date ?? "Date unavailable"}</p><h2 className="mt-0.5 text-lg font-extrabold text-[var(--text-primary)]">{item.title}</h2></div>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-extrabold ${item.included ? "bg-[var(--surface-success)] text-[var(--text-primary)]" : "bg-[var(--surface-muted)] text-[var(--text-secondary)]"}`}>{item.included ? "Included" : "Excluded"}</span>
      </div>

      {item.metrics.length > 0 && <dl className="grid grid-cols-2 gap-3">{item.metrics.map((metric) => <div className="rounded-xl bg-[var(--surface-muted)] p-3" key={metric.label}><dt className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)]">{metric.label}</dt><dd className="mt-1 text-sm font-extrabold text-[var(--text-primary)]">{metric.value}</dd></div>)}</dl>}

      {item.exercises?.length > 0 && <section><h3 className="text-sm font-extrabold text-[var(--text-primary)]">Exercises</h3><div className="mt-3 space-y-4">{item.exercises.map((exercise, index) => <div key={`${exercise.name}-${index}`}><p className="font-extrabold text-[var(--text-primary)]">{exercise.name}</p>{exercise.sets.length ? <ul className="mt-1 space-y-1 text-sm text-[var(--text-secondary)]">{exercise.sets.map((set, setIndex) => <li key={`${set}-${setIndex}`}>• {set}</li>)}</ul> : <p className="mt-1 text-sm text-[var(--text-muted)]">Set details unavailable</p>}</div>)}</div></section>}

      {item.type === "photos" && <PhotoPreviews object={item.object} />}
      {(item.sourceFiles.length > 0 || item.typedEvidence) && <details className="rounded-xl bg-[var(--surface-muted)]"><summary className="min-h-11 cursor-pointer px-3 py-3 text-sm font-extrabold text-[var(--text-secondary)]">Original details</summary><div className="space-y-3 border-t border-[var(--divider)] p-3">{item.sourceFiles.length > 0 && <div><p className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-muted)]">Source files</p><ul className="mt-1 space-y-1 text-sm text-[var(--text-secondary)]">{item.sourceFiles.map((file) => <li className="break-all" key={file}>{file}</li>)}</ul></div>}{item.typedEvidence && <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--text-secondary)]">{item.typedEvidence}</p>}</div></details>}

      <button
        aria-label={`${item.included ? "Exclude" : "Include"} ${item.title} ${item.date ?? ""}`.trim()}
        className="min-h-12 w-full cursor-pointer rounded-2xl border border-[var(--divider)] px-4 text-sm font-extrabold text-[var(--text-primary)] transition hover:border-[var(--primary)] hover:bg-[var(--surface-accent)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100 disabled:cursor-not-allowed disabled:opacity-40"
        disabled={!canEdit}
        onClick={() => onToggle(item)}
        type="button"
      >
        {item.included ? "Exclude from log" : "Include in log"}
      </button>
    </Card>
  );
}

function ConfirmButton({ disabled, retry }) {
  const { pending } = useFormStatus();
  return <button className="min-h-14 w-full cursor-pointer rounded-2xl bg-[var(--primary)] px-4 font-extrabold text-white transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40" disabled={disabled || pending} type="submit">{pending ? "Logging evidence..." : retry ? "Retry logging evidence" : "Log included evidence"}</button>;
}

function ReprocessButton() {
  const { pending } = useFormStatus();
  return <button className="min-h-12 w-full cursor-pointer rounded-2xl border border-[var(--divider)] px-4 text-sm font-bold text-[var(--text-secondary)] disabled:cursor-not-allowed disabled:opacity-40" disabled={pending} type="submit">{pending ? "Refreshing review..." : "Reprocess review"}</button>;
}

function DiscardReviewControl({ action, reviewId }) {
  const [open, setOpen] = useState(false);
  const cancelRef = useRef(null);
  const triggerRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKeyDown = (event) => { if (event.key === "Escape") { setOpen(false); triggerRef.current?.focus(); } };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);
  const close = () => { setOpen(false); queueMicrotask(() => triggerRef.current?.focus()); };
  return <>
    <button className="min-h-12 cursor-pointer rounded-2xl border border-[var(--divider)] px-3 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100" onClick={() => setOpen(true)} ref={triggerRef} type="button">Discard review</button>
    {open && <div aria-label="Discard review confirmation" className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-4 sm:items-center" data-testid="discard-review-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }} role="presentation">
      <section aria-describedby="discard-review-description" aria-modal="true" className="w-full max-w-[361px] rounded-3xl bg-white p-5 shadow-2xl" role="dialog">
        <h2 className="text-xl font-extrabold text-slate-950">Discard this review?</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600" id="discard-review-description">This review will not be added to your history. If you change your mind, you will need to start a new upload.</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button className="min-h-12 cursor-pointer rounded-2xl border border-slate-200 px-3 text-sm font-extrabold text-slate-900" onClick={close} ref={cancelRef} type="button">Cancel</button>
          <form action={action}><input name="reviewId" type="hidden" value={reviewId} /><DiscardSubmitButton /></form>
        </div>
      </section>
    </div>}
  </>;
}

function DiscardSubmitButton() {
  const { pending } = useFormStatus();
  return <button className="min-h-12 w-full cursor-pointer rounded-2xl bg-red-600 px-3 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={pending} type="submit">{pending ? "Discarding..." : "Discard review"}</button>;
}

function PhotoPreviews({ object }) { const photos = (object.photos ?? []).filter((photo) => photo.active !== false); return <div className="grid grid-cols-3 gap-2">{photos.map((photo, index) => <EvidenceImage alt={`${photo.view ?? "Photo"} ${photo.pose ?? ""}`} className="aspect-[3/4] w-full rounded-xl object-cover" key={photo.id ?? index} src={privateEvidenceUrl(photo.storage_path ?? photo.imagePath)} />)}</div>; }
function privateEvidenceUrl(value) { if (!value) return null; return `/api/private-evidence/${String(value).replace(/^private[\\/]founder[\\/]/, "").replaceAll("\\", "/")}`; }
function hasIncompletePhotoSet(object) { if (object.evidence_type !== "photo_session") return false; const poses = (object.photos ?? []).filter((photo) => photo.active !== false).map((photo) => `${photo.view}-${photo.pose}`.replace("rear-", "back-").replace("back-flexed", "back-flexed")); return new Set(poses).size !== poses.length || !["front-relaxed", "back-relaxed", "back-flexed"].every((pose) => poses.includes(pose)); }
function hasCommitFailure(review) { return ["commit_failed", "partially_committed"].includes(review.status); }
