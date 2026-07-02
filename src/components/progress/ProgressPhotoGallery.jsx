"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
        <PhotoSetCard
          label="Latest Photo Set"
          photoSet={latestPhotoSet}
          size="large"
        />
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
          next={records[(selectedIndex + 1) % records.length]}
          onClose={closeGallery}
          onShowRecord={showRecord}
          previous={records[(selectedIndex - 1 + records.length) % records.length]}
          showNavigation={records.length > 1}
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
        </div>
        <p className="self-start rounded-full bg-[color-mix(in_srgb,var(--primary)_14%,transparent)] px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-[var(--primary)]">
          {photoSet.views.length} views
        </p>
      </div>
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
    return <EvidenceImage alt="" className={className} src={photoSet.thumbnailHref} />;
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

        <div className="grid gap-3">
          <div className="overflow-hidden rounded-[18px] bg-[var(--surface-muted)]">
            <EvidenceImage
              alt={entry.label}
              className="max-h-[54vh] w-full object-contain"
              src={entry.imageHref}
            />
          </div>

          <TagList tags={entry.tags} />

          {entry.previousImageHref && (
            <div className="grid grid-cols-2 gap-2">
              <ComparisonImage label="Previous" record={entry} src={entry.previousImageHref} />
              <ComparisonImage label="Current" record={entry} src={entry.imageHref} />
            </div>
          )}

          <GallerySection accent="accent" title="Compared to Previous Check-in" values={entry.observedChanges} />
          <GallerySection accent="success" title="Biggest Improvements" values={entry.strengths} />
          <GallerySection accent="focus" title="Remaining Focus" values={entry.remainingFocus} />
          <GallerySection accent="warning" title="Confidence Impact" values={[entry.confidenceContribution]} />
          <GallerySection title="Timeline Placement" values={[entry.timelinePlacement]} />
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

function ComparisonImage({ label, record, src }) {
  return (
    <div className="overflow-hidden rounded-[14px] bg-[var(--surface-muted)]">
      <EvidenceImage
        alt={`${label} ${record.label}`}
        className="aspect-[3/4] w-full object-cover"
        src={src}
      />
      <p className="px-2 py-2 text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </p>
    </div>
  );
}

function GallerySection({ accent = "neutral", title, values = [] }) {
  const visibleValues = values.filter(Boolean);
  const accentClasses = {
    accent: "text-[var(--primary)]",
    focus: "text-sky-600",
    neutral: "text-slate-400",
    success: "text-emerald-600",
    warning: "text-amber-600",
  };

  if (visibleValues.length === 0) return null;

  return (
    <section className="rounded-[14px] bg-[var(--surface-muted)] p-3">
      <h3 className={`text-[10px] font-extrabold uppercase tracking-[0.08em] ${accentClasses[accent] ?? accentClasses.neutral}`}>
        {title}
      </h3>
      <div className="mt-2 space-y-1">
        {visibleValues.map((value) => (
          <p className="text-xs font-semibold leading-5 text-slate-600" key={value}>
            {value}
          </p>
        ))}
      </div>
    </section>
  );
}

function TagList({ tags = [] }) {
  const visibleTags = tags.filter(Boolean);

  if (visibleTags.length === 0) return null;

  return (
    <span className="mt-2 flex flex-wrap gap-1.5">
      {visibleTags.map((tag) => (
        <span
          className="rounded-full bg-[var(--surface-elevated)] px-2 py-0.5 text-[10px] font-extrabold capitalize text-slate-500 ring-1 ring-[var(--divider)]"
          key={tag}
        >
          {tag}
        </span>
      ))}
    </span>
  );
}
