"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Card from "../ui/Card";
import EvidenceImage from "./EvidenceImage";
import ReportDrawer from "./ReportDrawer";

export default function ProgressPhotoGallery({
  latestPhotoSet = null,
  records = [],
  sets = [],
}) {
  const galleryRef = useRef(null);
  const visibleSets = useMemo(
    () => (sets.length > 0 ? sets : records.map(createSetFromRecord)),
    [records, sets]
  );
  const [selectedRecordId, setSelectedRecordId] = useState(null);
  const selectedIndex = records.findIndex((entry) => entry.id === selectedRecordId);
  const selectedRecord = selectedIndex >= 0 ? records[selectedIndex] : null;
  const selectedSessionRecords = selectedRecord?.photoSessionId
    ? records.filter((entry) => entry.photoSessionId === selectedRecord.photoSessionId)
    : records;
  const selectedSessionIndex = selectedSessionRecords.findIndex((entry) => entry.id === selectedRecordId);

  const openPhotoSet = useCallback((photoSetId) => {
    const photoSet = visibleSets.find((set) => set.id === photoSetId);
    const recordId = photoSet?.primaryRecordId ?? photoSet?.id;
    const record = records.find((entry) => entry.id === recordId) ?? records[0];

    if (record) setSelectedRecordId(record.id);
  }, [records, visibleSets]);

  function closeGallery() {
    setSelectedRecordId(null);
  }

  function showRecord(record) {
    if (record) setSelectedRecordId(record.id);
  }

  useEffect(() => {
    const gallery = galleryRef.current;
    if (!gallery) return undefined;

    function handleOpen(event) {
      const trigger = event.target.closest("[data-photo-set-id]");
      if (!trigger || !gallery.contains(trigger)) return;

      event.preventDefault();
      openPhotoSet(trigger.dataset.photoSetId);
    }

    gallery.addEventListener("click", handleOpen);

    return () => {
      gallery.removeEventListener("click", handleOpen);
    };
  }, [openPhotoSet]);

  return (
    <div ref={galleryRef}>
      {latestPhotoSet && (
        <><PhotoSetCard label="Latest Photo Set" photoSet={latestPhotoSet} size="large" />
        {latestPhotoSet.sourceMode === "canonical" && <Link className="mt-2 flex w-full items-center justify-center rounded-[14px] bg-[var(--primary)] px-4 py-3 text-sm font-extrabold text-white" href={`/briefings/photo/${latestPhotoSet.photoSessionId ?? latestPhotoSet.id}`}>Read Photo Briefing</Link>}</>
      )}

      <div className="mt-4">
        <ReportDrawer
          description="Tap any record to inspect the original image and comparison context."
          preview={
            <PhotoSetRows
              sets={visibleSets.slice(0, 3)}
              variant="preview"
            />
          }
          title="Uploaded Photos"
        >
          <div className="space-y-2" id="photo-records">
            <PhotoSetRows sets={visibleSets} />
          </div>
        </ReportDrawer>
      </div>

      {selectedRecord && (
        <PhotoModal
          entry={selectedRecord}
          next={selectedSessionRecords[(selectedSessionIndex + 1) % selectedSessionRecords.length]}
          onClose={closeGallery}
          onShowRecord={showRecord}
          previous={selectedSessionRecords[(selectedSessionIndex - 1 + selectedSessionRecords.length) % selectedSessionRecords.length]}
          showNavigation={selectedSessionRecords.length > 1}
        />
      )}
    </div>
  );
}

function PhotoSetRows({ sets = [], variant = "full" }) {
  return (
    <div className="space-y-2">
      {sets.map((set) => (
        <PhotoSetRow
          key={set.id}
          set={set}
          variant={variant}
        />
      ))}
    </div>
  );
}

function PhotoSetCard({ label, photoSet, size = "compact" }) {
  const imageSize = size === "large" ? "w-[72px] rounded-[14px]" : "w-14 rounded-[10px]";

  return (
    <Card
      as="button"
      className="mt-4 block w-full text-left transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]"
      data-photo-set-id={photoSet.id}
      type="button"
    >
      <div className="grid grid-cols-[72px_1fr_auto] gap-3">
        <PhotoThumbnail className={`aspect-[3/4] ${imageSize} object-cover`} photoSet={photoSet} />
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-indigo-600">
            {label}
          </p>
          <h2 className="mt-1 text-lg font-extrabold text-slate-950">
            {photoSet.date}
          </h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            {photoSet.weight}
          </p>
          <p className="mt-1 text-xs font-bold text-slate-400">
            Compared against: {photoSet.comparedAgainst}
          </p>
          <p className="mt-2 text-xs font-extrabold text-[var(--primary)]">
            Open gallery &rarr;
          </p>
          {photoSet.completionLabel && <p className="mt-1 text-[11px] font-bold text-emerald-600">{photoSet.completionLabel}</p>}
        </div>
        <p className="self-start rounded-full bg-[color-mix(in_srgb,var(--primary)_14%,transparent)] px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-[var(--primary)]">
          {photoSet.views.length} views
        </p>
      </div>
      {photoSet.sourceMode === "canonical" && photoSet.duplicateRetryCount > 0 && <details className="mt-3 rounded-[12px] bg-[var(--surface-muted)] p-3 text-xs"><summary className="cursor-pointer font-extrabold text-slate-600">Source history</summary><p className="mt-2 text-slate-500">{photoSet.activeViewCount} visible views · {photoSet.provenanceSourceCount} source images · {photoSet.duplicateRetryCount} additional source retained in history</p></details>}
    </Card>
  );
}

function PhotoSetRow({ set, variant }) {
  const imageWidth = variant === "preview" ? "w-11 rounded-[9px]" : "w-14 rounded-[10px]";

  return (
    <button
      className="grid w-full grid-cols-[56px_1fr_auto] items-center gap-3 rounded-[12px] bg-[var(--surface-muted)] p-2 text-left transition hover:border-[var(--border-strong)] hover:bg-[color-mix(in_srgb,var(--surface-muted)_72%,var(--surface-elevated))]"
      data-testid="progress-photo-record"
      data-photo-set-id={set.id}
      type="button"
    >
      <PhotoThumbnail className={`aspect-[3/4] ${imageWidth} object-cover`} photoSet={set} />
      <span className="min-w-0">
        <span className="block text-sm font-bold text-slate-700">
          {set.date ?? set.value}
        </span>
        <span className="mt-0.5 block text-xs font-semibold text-slate-500">
          {set.weight ?? "No same-day weight"} / {set.views?.length ?? 1} view{(set.views?.length ?? 1) === 1 ? "" : "s"}
        </span>
        {variant !== "preview" && (
          <span className="mt-0.5 block text-[11px] font-bold text-slate-400">
            Compared: {set.comparedAgainst ?? "Pending"}
          </span>
        )}
      </span>
      <span className="text-right text-sm font-extrabold text-slate-950">
        View
      </span>
    </button>
  );
}

function PhotoThumbnail({ className, photoSet }) {
  if (photoSet.thumbnailHref) {
    return <EvidenceImage alt="" className={className} diagnostic={photoSet.thumbnailHydrationDiagnostic} src={photoSet.thumbnailHref} />;
  }

  return (
    <span className={`flex items-center justify-center bg-[var(--surface-elevated)] text-[10px] font-extrabold text-slate-400 ${className}`}>
      IMG
    </span>
  );
}

function PhotoModal({
  entry,
  next,
  onClose,
  onShowRecord,
  previous,
  showNavigation,
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-[var(--modal-backdrop)] p-3 backdrop-blur-sm sm:items-center"
      role="dialog"
    >
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-[24px] border border-[var(--divider)] bg-[var(--surface-elevated)] p-4 shadow-[0_28px_80px_rgba(2,6,23,0.36)]">
        <div className="sticky top-0 z-10 -mx-4 -mt-4 mb-3 flex items-start justify-between gap-3 border-b border-[var(--divider)] bg-[var(--surface-elevated)] px-4 py-4">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[var(--primary)]">
              Progress Photo Evidence
            </p>
            <h2 className="mt-1 text-xl font-extrabold text-slate-950">
              {entry.label}
            </h2>
            <p className="text-sm font-semibold text-slate-500">
              {entry.value}
            </p>
          </div>
          <button
            className="rounded-full bg-[var(--surface-muted)] px-3 py-1 text-xs font-extrabold text-slate-600"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>

        <div className="grid gap-2">
          {entry.previousImageHref && (
            <div className="grid grid-cols-2 gap-2">
              <ComparisonImage date={entry.comparison?.previousDate} label="Previous" record={entry} src={entry.previousImageHref} />
              <ComparisonImage date={entry.captureDate} label="Current" record={entry} src={entry.imageHref} />
            </div>
          )}
          {!entry.previousImageHref && <div className="overflow-hidden rounded-[18px] bg-[var(--surface-muted)]"><EvidenceImage alt={entry.label} className="max-h-[54vh] w-full object-contain" diagnostic={entry.hydrationDiagnostic} src={entry.imageHref}/></div>}
          <section className="rounded-[14px] bg-[var(--surface-muted)] p-3"><h3 className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[var(--primary)]">Interpretation</h3><p className="mt-1.5 text-xs font-semibold leading-5 text-slate-600">{entry.galleryInterpretation?.summary}</p><ul className="mt-1.5 space-y-1">{(entry.galleryInterpretation?.comparisonBullets??[]).map((value)=><li className="text-xs font-semibold leading-5 text-slate-600" key={value}>• {value}</li>)}</ul></section>
          <section className="rounded-[14px] bg-[var(--surface-muted)] p-3"><h3 className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-500">Capture Conditions</h3><p className="mt-2 text-xs font-semibold leading-5 text-slate-600">{entry.galleryInterpretation?.conditionSummary}</p></section>
          <details className="rounded-[14px] bg-[var(--surface-muted)] p-3"><summary className="cursor-pointer text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-500">Source History</summary><p className="mt-2 text-xs font-semibold leading-5 text-slate-600">{entry.sourceHistory}</p></details>
        </div>

        {showNavigation && (
          <div className="sticky bottom-0 -mx-4 -mb-4 mt-4 grid grid-cols-2 gap-2 border-t border-[var(--divider)] bg-[var(--surface-elevated)] p-4">
            <button
              className="rounded-[14px] bg-[var(--surface-muted)] px-3 py-3 text-center text-sm font-extrabold text-slate-700"
              onClick={() => onShowRecord(previous)}
              type="button"
            >
              Previous
            </button>
            <button
              className="rounded-[14px] bg-[var(--surface-muted)] px-3 py-3 text-center text-sm font-extrabold text-slate-700"
              onClick={() => onShowRecord(next)}
              type="button"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function createSetFromRecord(record) {
  return {
    id: `photo-set-${record.id}`,
    date: record.value,
    weight: record.weight,
    views: [record.label],
    thumbnailHref: record.imageHref,
    primaryRecordId: record.id,
    comparedAgainst: record.comparedAgainst,
  };
}

function ComparisonImage({ date, label, record, src }) {
  return (
    <div className="overflow-hidden rounded-[14px] bg-[var(--surface-muted)]">
      <EvidenceImage
        alt={`${label} ${record.label}`}
        className="aspect-[3/4] w-full object-cover"
        diagnostic={label === "Previous" ? record.previousHydrationDiagnostic : record.hydrationDiagnostic}
        src={src}
      />
      <p className="px-2 py-1.5 text-slate-500">
        <span className="block text-xs font-extrabold text-slate-700">{formatGalleryDate(date)}</span>
        <span className="block text-[9px] font-bold uppercase tracking-[0.08em]">{label}</span>
      </p>
    </div>
  );
}

function formatGalleryDate(value) { if(!value)return "Date unavailable";const [year,month,day]=String(value).slice(0,10).split("-").map(Number);return new Date(year,month-1,day).toLocaleDateString("en-US",{month:"short",day:"numeric"}); }
