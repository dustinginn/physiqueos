"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Dumbbell, FileText, FileUp, Utensils, Upload } from "lucide-react";
import Card from "../../../components/ui/Card";
import IconBadge from "../../../components/ui/IconBadge";
import {
  createEvidenceExperiencePreviewSequence,
  createPreviewNutritionDay,
  createPreviewWorkout,
  EVIDENCE_EXPERIENCE_OUTCOMES,
  EVIDENCE_EXPERIENCE_STATES,
  EVIDENCE_EXPERIENCE_TYPES,
  formatPreviewEvidenceDate,
  getPreviewOutcomeOptions,
  getPreviewOutcomeResult,
  isHistoricalPreviewDate,
  updatePreviewNutritionDay,
  updatePreviewWorkout,
} from "./EvidenceExperiencePreviewController";

export default function EvidenceExperiencePreview({ initialDate }) {
  const [view, setView] = useState(EVIDENCE_EXPERIENCE_STATES.CAPTURE);
  const [details, setDetails] = useState("");
  const [evidenceDate, setEvidenceDate] = useState(initialDate);
  const [workout, setWorkout] = useState(() => createPreviewWorkout(initialDate));
  const [nutritionDay, setNutritionDay] = useState(
    () => createPreviewNutritionDay(initialDate)
  );
  const [editDraft, setEditDraft] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [evidenceType, setEvidenceType] = useState(
    EVIDENCE_EXPERIENCE_TYPES.WORKOUT
  );
  const [previewOutcome, setPreviewOutcome] = useState(
    EVIDENCE_EXPERIENCE_OUTCOMES.PERSONAL_BEST
  );
  const fileInputRef = useRef(null);
  const sequenceRef = useRef(null);

  useEffect(() => {
    const sequence = createEvidenceExperiencePreviewSequence({
      onStateChange: setView,
    });
    sequenceRef.current = sequence;
    return () => {
      sequence.cancel();
      sequenceRef.current = null;
    };
  }, []);

  function submit(event) {
    event.preventDefault();
    if (evidenceType === EVIDENCE_EXPERIENCE_TYPES.NUTRITION) {
      setNutritionDay(createPreviewNutritionDay(evidenceDate));
    } else {
      setWorkout(createPreviewWorkout(evidenceDate));
    }
    setEditDraft(null);
    setConfirmed(false);
    sequenceRef.current?.start();
  }

  function reset() {
    sequenceRef.current?.cancel();
    setDetails("");
    setEvidenceDate(initialDate);
    setWorkout(createPreviewWorkout(initialDate));
    setNutritionDay(createPreviewNutritionDay(initialDate));
    setEditDraft(null);
    setConfirmed(false);
    setEvidenceType(EVIDENCE_EXPERIENCE_TYPES.WORKOUT);
    setPreviewOutcome(EVIDENCE_EXPERIENCE_OUTCOMES.PERSONAL_BEST);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setView(EVIDENCE_EXPERIENCE_STATES.CAPTURE);
  }

  function returnToCapture() {
    sequenceRef.current?.cancel();
    if (evidenceType === EVIDENCE_EXPERIENCE_TYPES.NUTRITION) {
      setNutritionDay(createPreviewNutritionDay(evidenceDate));
    } else {
      setWorkout(createPreviewWorkout(evidenceDate));
    }
    setEditDraft(null);
    setConfirmed(false);
    setView(EVIDENCE_EXPERIENCE_STATES.CAPTURE);
  }

  function confirmWorkout() {
    if (sequenceRef.current?.confirm()) setConfirmed(true);
  }

  function beginEditing() {
    const record = evidenceType === EVIDENCE_EXPERIENCE_TYPES.NUTRITION
      ? nutritionDay
      : workout;
    setEditDraft(structuredClone(record));
    setView(EVIDENCE_EXPERIENCE_STATES.EDIT);
  }

  function saveEdits() {
    const updated = evidenceType === EVIDENCE_EXPERIENCE_TYPES.NUTRITION
      ? updatePreviewNutritionDay(nutritionDay, editDraft)
      : updatePreviewWorkout(workout, editDraft);
    if (evidenceType === EVIDENCE_EXPERIENCE_TYPES.NUTRITION) {
      setNutritionDay(updated);
    } else {
      setWorkout(updated);
    }
    setEvidenceDate(updated.date);
    setEditDraft(null);
    setView(EVIDENCE_EXPERIENCE_STATES.CONFIRM);
  }

  function cancelEdits() {
    setEditDraft(null);
    setView(EVIDENCE_EXPERIENCE_STATES.CONFIRM);
  }

  function changeEvidenceType(nextType) {
    setEvidenceType(nextType);
    setEditDraft(null);
    setConfirmed(false);
    setWorkout(createPreviewWorkout(evidenceDate));
    setNutritionDay(createPreviewNutritionDay(evidenceDate));
    setPreviewOutcome(
      nextType === EVIDENCE_EXPERIENCE_TYPES.NUTRITION
        ? EVIDENCE_EXPERIENCE_OUTCOMES.PROTEIN_TARGET
        : EVIDENCE_EXPERIENCE_OUTCOMES.PERSONAL_BEST
    );
  }

  if (view === EVIDENCE_EXPERIENCE_STATES.CONFIRM) {
    return evidenceType === EVIDENCE_EXPERIENCE_TYPES.NUTRITION ? (
      <NutritionConfirmation
        nutritionDay={nutritionDay}
        onBack={returnToCapture}
        onConfirm={confirmWorkout}
        onEdit={beginEditing}
      />
    ) : (
      <WorkoutConfirmation
        onBack={returnToCapture}
        onConfirm={confirmWorkout}
        onEdit={beginEditing}
        workout={workout}
      />
    );
  }

  if (view === EVIDENCE_EXPERIENCE_STATES.EDIT && editDraft) {
    return evidenceType === EVIDENCE_EXPERIENCE_TYPES.NUTRITION ? (
      <NutritionEditor
        draft={editDraft}
        onCancel={cancelEdits}
        onChange={setEditDraft}
        onSave={saveEdits}
      />
    ) : (
      <WorkoutEditor
        draft={editDraft}
        onCancel={cancelEdits}
        onChange={setEditDraft}
        onSave={saveEdits}
      />
    );
  }

  if (view !== EVIDENCE_EXPERIENCE_STATES.CAPTURE) {
    return (
      <PreviewTransition
        confirmed={confirmed}
        evidenceDate={
          evidenceType === EVIDENCE_EXPERIENCE_TYPES.NUTRITION
            ? nutritionDay.date
            : workout.date
        }
        evidenceType={evidenceType}
        initialDate={initialDate}
        nutritionDay={nutritionDay}
        onContinue={reset}
        outcome={previewOutcome}
        state={view}
      />
    );
  }

  return (
    <main className="min-h-screen bg-[var(--surface)]">
      <div className="mx-auto max-w-[393px] px-4 pb-32 pt-10">
        <header className="mb-6 space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--primary)]">
            Log
          </p>
          <h1 className="text-3xl font-extrabold leading-tight text-[var(--text-primary)]">
            What happened?
          </h1>
          <p className="text-base leading-7 text-[var(--text-secondary)]">
            Upload a screenshot, photo, PDF, or note and PhysiqueOS will organize it.
          </p>
        </header>

        <fieldset className="mb-3 rounded-[14px] border border-[var(--divider)] bg-[var(--surface-soft)] p-3">
          <legend className="px-1 text-xs font-bold uppercase tracking-[0.1em] text-[var(--text-secondary)]">
            Preview evidence type
          </legend>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <PreviewSelectorOption
              checked={evidenceType === EVIDENCE_EXPERIENCE_TYPES.WORKOUT}
              label="Workout"
              name="previewEvidenceType"
              onChange={() => changeEvidenceType(EVIDENCE_EXPERIENCE_TYPES.WORKOUT)}
              value={EVIDENCE_EXPERIENCE_TYPES.WORKOUT}
            />
            <PreviewSelectorOption
              checked={evidenceType === EVIDENCE_EXPERIENCE_TYPES.NUTRITION}
              label="Nutrition"
              name="previewEvidenceType"
              onChange={() => changeEvidenceType(EVIDENCE_EXPERIENCE_TYPES.NUTRITION)}
              value={EVIDENCE_EXPERIENCE_TYPES.NUTRITION}
            />
          </div>
        </fieldset>

        <fieldset className="mb-4 rounded-[14px] border border-[var(--divider)] bg-[var(--surface-soft)] p-3">
          <legend className="px-1 text-xs font-bold uppercase tracking-[0.1em] text-[var(--text-secondary)]">
            Preview outcome
          </legend>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {getPreviewOutcomeOptions(evidenceType).map((option) => (
              <PreviewSelectorOption
                checked={previewOutcome === option.value}
                key={option.value}
                label={option.label}
                name="previewOutcome"
                onChange={() => setPreviewOutcome(option.value)}
                value={option.value}
              />
            ))}
          </div>
        </fieldset>

        <Card className="space-y-4">
          <div className="flex items-start gap-3">
            <IconBadge icon={Upload} color="primary" size="md" />
            <div>
              <h2 className="text-xl font-black leading-tight text-[var(--text-primary)]">
                Upload
              </h2>
              <p className="mt-1 text-sm font-medium leading-6 text-[var(--text-secondary)]">
                Add one file, several files, or just a note.
              </p>
            </div>
          </div>

          <form className="space-y-3" onSubmit={submit}>
            <label className="block rounded-[16px] border border-dashed border-[color-mix(in_srgb,var(--primary)_34%,var(--divider))] bg-[var(--surface-inset)] p-4">
              <span className="flex items-center gap-2 text-sm font-extrabold text-[var(--text-primary)]">
                <FileUp aria-hidden="true" size={18} />
                Upload files
              </span>
              <span className="mt-1 block text-xs font-medium leading-5 text-[var(--text-secondary)]">
                Choose screenshots, photos, or PDFs. You can select more than one.
              </span>
              <input
                accept="image/*,application/pdf,.pdf"
                className="mt-3 block w-full text-xs font-semibold text-[var(--text-secondary)] file:mr-3 file:rounded-full file:border-0 file:bg-[var(--primary)] file:px-3 file:py-2 file:text-xs file:font-bold file:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color-mix(in_srgb,var(--primary)_22%,transparent)]"
                multiple
                name="previewEvidenceFiles"
                ref={fileInputRef}
                type="file"
              />
            </label>

            <label className="block space-y-2 rounded-[16px] border border-[var(--divider)] bg-[var(--surface-inset)] p-4">
              <span className="flex items-center gap-2 text-sm font-extrabold text-[var(--text-primary)]">
                <FileText aria-hidden="true" size={18} />
                Add details
              </span>
              <span className="block text-xs font-medium leading-5 text-[var(--text-secondary)]">
                Add any details that help PhysiqueOS understand what you&apos;re logging.
              </span>
              <textarea
                className="min-h-24 w-full resize-none rounded-[12px] border border-[var(--divider)] bg-[var(--surface-elevated)] px-3 py-2 text-sm leading-6 text-[var(--text-primary)] outline-none focus:border-[var(--primary)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--primary)_18%,transparent)]"
                name="previewEvidenceNote"
                onChange={(event) => setDetails(event.target.value)}
                placeholder="Example: Did spider curls 4 x 13 @ 30 lb and EZ bar curls 2 x 12 @ 65 lb..."
                value={details}
              />
            </label>

            <label className="block space-y-2 rounded-[16px] border border-[var(--divider)] bg-[var(--surface-inset)] p-4">
              <span className="text-sm font-extrabold text-[var(--text-primary)]">
                When did this happen?
              </span>
              <span className="block text-xs font-medium leading-5 text-[var(--text-secondary)]">
                Use the date the workout, meal, scan, or activity happened.
              </span>
              <input
                className="w-full rounded-[12px] border border-[var(--divider)] bg-[var(--surface-elevated)] px-3 py-2 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--primary)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--primary)_18%,transparent)]"
                name="previewEvidenceDate"
                onChange={(event) => setEvidenceDate(event.target.value)}
                type="date"
                value={evidenceDate}
              />
            </label>

            <button
              className="flex w-full items-center justify-center gap-2 rounded-full bg-[var(--text-primary)] px-5 py-3 text-sm font-extrabold text-[var(--surface-elevated)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color-mix(in_srgb,var(--primary)_24%,transparent)]"
              type="submit"
            >
              Submit evidence
            </button>
          </form>
        </Card>
      </div>
    </main>
  );
}

function PreviewSelectorOption({ checked, label, name, onChange, value }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-[10px] px-2 py-2 text-sm font-bold text-[var(--text-primary)] focus-within:ring-4 focus-within:ring-[color-mix(in_srgb,var(--primary)_18%,transparent)]">
      <input
        checked={checked}
        className="h-4 w-4 accent-[var(--primary)]"
        name={name}
        onChange={onChange}
        type="radio"
        value={value}
      />
      {label}
    </label>
  );
}

function NutritionConfirmation({ nutritionDay, onBack, onConfirm, onEdit }) {
  return (
    <main className="min-h-screen bg-[var(--surface)]">
      <div className="mx-auto max-w-[393px] px-4 pb-32 pt-10">
        <button
          className="mb-6 text-sm font-bold text-[var(--text-secondary)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color-mix(in_srgb,var(--primary)_20%,transparent)]"
          onClick={onBack}
          type="button"
        >
          Back to upload
        </button>
        <header className="mb-6 space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--primary)]">
            Nutrition found
          </p>
          <h1 className="text-3xl font-extrabold leading-tight text-[var(--text-primary)]">
            Does this look right?
          </h1>
          <p className="text-base leading-7 text-[var(--text-secondary)]">
            Review what PhysiqueOS understood before saving it.
          </p>
        </header>

        <Card aria-label="Nutrition day summary" className="space-y-5" as="section">
          <div className="flex items-start gap-3">
            <IconBadge icon={Utensils} color="success" size="md" />
            <div>
              <p className="text-sm font-semibold text-[var(--text-secondary)]">
                {formatPreviewEvidenceDate(nutritionDay.date)}
              </p>
              <h2 className="mt-1 text-xl font-black text-[var(--text-primary)]">
                Nutrition Day
              </h2>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-3">
            <SummaryMetric label="Calories" value={`${numberLabel(nutritionDay.calories)} kcal`} />
            <SummaryMetric label="Protein" value={`${nutritionDay.protein} g`} />
            <SummaryMetric label="Carbohydrates" value={`${nutritionDay.carbohydrates} g`} />
            <SummaryMetric label="Fat" value={`${nutritionDay.fat} g`} />
            <SummaryMetric label="Meals" value={`${nutritionDay.mealCount} meals`} />
          </dl>

          <div className="space-y-3 border-t border-[var(--divider)] pt-4">
            {nutritionDay.meals.map((meal, index) => (
              <article
                className="rounded-[12px] bg-[var(--surface-inset)] p-3"
                key={`${meal.slot}-${index}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                      {meal.slot}
                    </p>
                    <h3 className="mt-1 text-sm font-extrabold text-[var(--text-primary)]">
                      {meal.name}
                    </h3>
                  </div>
                  <p className="shrink-0 text-sm font-extrabold text-[var(--text-primary)]">
                    {meal.calories} kcal
                  </p>
                </div>
                <p className="mt-2 text-xs font-semibold text-[var(--text-secondary)]">
                  {meal.protein} g protein · {meal.carbohydrates} g carbs · {meal.fat} g fat
                </p>
              </article>
            ))}
          </div>
        </Card>

        <div className="mt-5 space-y-3">
          <button
            className="w-full rounded-full bg-[var(--text-primary)] px-5 py-3 text-sm font-extrabold text-[var(--surface-elevated)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color-mix(in_srgb,var(--primary)_24%,transparent)]"
            onClick={onConfirm}
            type="button"
          >
            Confirm nutrition
          </button>
          <button
            className="w-full rounded-full border border-[var(--divider)] bg-[var(--surface-elevated)] px-5 py-3 text-sm font-extrabold text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color-mix(in_srgb,var(--primary)_20%,transparent)]"
            onClick={onEdit}
            type="button"
          >
            Edit details
          </button>
        </div>
      </div>
    </main>
  );
}

function numberLabel(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString() : value;
}

function WorkoutConfirmation({ onBack, onConfirm, onEdit, workout }) {
  return (
    <main className="min-h-screen bg-[var(--surface)]">
      <div className="mx-auto max-w-[393px] px-4 pb-32 pt-10">
        <button
          className="mb-6 text-sm font-bold text-[var(--text-secondary)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color-mix(in_srgb,var(--primary)_20%,transparent)]"
          onClick={onBack}
          type="button"
        >
          Back to upload
        </button>
        <header className="mb-6 space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--primary)]">
            Workout found
          </p>
          <h1 className="text-3xl font-extrabold leading-tight text-[var(--text-primary)]">
            Does this look right?
          </h1>
          <p className="text-base leading-7 text-[var(--text-secondary)]">
            Review what PhysiqueOS understood before saving it.
          </p>
        </header>

        <Card aria-label="Workout summary" className="space-y-5" as="section">
          <div className="flex items-start gap-3">
            <IconBadge icon={Dumbbell} color="success" size="md" />
            <div>
              <p className="text-sm font-semibold text-[var(--text-secondary)]">
                {formatPreviewEvidenceDate(workout.date)}
              </p>
              <h2 className="mt-1 text-xl font-black text-[var(--text-primary)]">
                {workout.workoutType}
              </h2>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-3">
            <SummaryMetric label="Duration" value={`${workout.durationMinutes} minutes`} />
            <SummaryMetric label="Distance" value={`${workout.distanceMiles} mi`} />
            <SummaryMetric label="Active calories" value={`${workout.activeCalories} cal`} />
            <SummaryMetric label="Average heart rate" value={`${workout.averageHeartRate} bpm`} />
          </dl>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-[var(--divider)] pt-4 text-sm">
            <CompactDetail label="Time" value={`${workout.startTime}–${workout.endTime}`} />
            <CompactDetail label="Total calories" value={`${workout.totalCalories} cal`} />
            <CompactDetail label="Average pace" value={`${workout.averagePace} /mi`} />
            <CompactDetail label="Elevation gain" value={`${workout.elevationGainFeet} ft`} />
            <CompactDetail label="Effort" value={workout.effort} />
          </dl>
        </Card>

        <div className="mt-5 space-y-3">
          <button
            className="w-full rounded-full bg-[var(--text-primary)] px-5 py-3 text-sm font-extrabold text-[var(--surface-elevated)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color-mix(in_srgb,var(--primary)_24%,transparent)]"
            onClick={onConfirm}
            type="button"
          >
            Confirm workout
          </button>
          <button
            className="w-full rounded-full border border-[var(--divider)] bg-[var(--surface-elevated)] px-5 py-3 text-sm font-extrabold text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color-mix(in_srgb,var(--primary)_20%,transparent)]"
            onClick={onEdit}
            type="button"
          >
            Edit details
          </button>
        </div>
      </div>
    </main>
  );
}

function SummaryMetric({ label, value }) {
  return (
    <div className="rounded-[12px] bg-[var(--surface-inset)] p-3">
      <dt className="text-xs font-semibold text-[var(--text-secondary)]">{label}</dt>
      <dd className="mt-1 text-sm font-extrabold text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}

function CompactDetail({ label, value }) {
  return (
    <div>
      <dt className="font-semibold text-[var(--text-secondary)]">{label}</dt>
      <dd className="mt-0.5 font-bold text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}

const EDIT_FIELDS = Object.freeze([
  ["workoutType", "Workout type", "text"],
  ["date", "Date", "date"],
  ["startTime", "Start time", "text"],
  ["endTime", "End time", "text"],
  ["durationMinutes", "Duration (minutes)", "number"],
  ["distanceMiles", "Distance (mi)", "number"],
  ["activeCalories", "Active calories", "number"],
  ["totalCalories", "Total calories", "number"],
  ["averageHeartRate", "Average heart rate", "number"],
  ["averagePace", "Average pace", "text"],
  ["elevationGainFeet", "Elevation gain (ft)", "number"],
  ["effort", "Effort", "text"],
]);

function WorkoutEditor({ draft, onCancel, onChange, onSave }) {
  function submit(event) {
    event.preventDefault();
    onSave();
  }

  return (
    <main className="min-h-screen bg-[var(--surface)]">
      <div className="mx-auto max-w-[393px] px-4 pb-32 pt-10">
        <header className="mb-6 space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--primary)]">
            Preview edit
          </p>
          <h1 className="text-3xl font-extrabold leading-tight text-[var(--text-primary)]">
            Edit workout details
          </h1>
        </header>
        <Card>
          <form className="space-y-4" onSubmit={submit}>
            {EDIT_FIELDS.map(([field, label, type]) => (
              <label className="block space-y-2" key={field}>
                <span className="text-sm font-bold text-[var(--text-primary)]">{label}</span>
                <input
                  className="w-full rounded-[12px] border border-[var(--divider)] bg-[var(--surface-elevated)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--primary)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--primary)_18%,transparent)]"
                  min={type === "number" ? "0" : undefined}
                  onChange={(event) => onChange({
                    ...draft,
                    [field]: event.target.value,
                  })}
                  step={field === "distanceMiles" ? "0.01" : undefined}
                  type={type}
                  value={draft[field]}
                />
              </label>
            ))}
            <button
              className="w-full rounded-full bg-[var(--text-primary)] px-5 py-3 text-sm font-extrabold text-[var(--surface-elevated)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color-mix(in_srgb,var(--primary)_24%,transparent)]"
              type="submit"
            >
              Save changes
            </button>
            <button
              className="w-full rounded-full border border-[var(--divider)] bg-[var(--surface-elevated)] px-5 py-3 text-sm font-extrabold text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color-mix(in_srgb,var(--primary)_20%,transparent)]"
              onClick={onCancel}
              type="button"
            >
              Cancel
            </button>
          </form>
        </Card>
      </div>
    </main>
  );
}

const NUTRITION_FIELDS = Object.freeze([
  ["date", "Date", "date"],
  ["calories", "Daily calories", "number"],
  ["protein", "Protein (g)", "number"],
  ["carbohydrates", "Carbohydrates (g)", "number"],
  ["fat", "Fat (g)", "number"],
  ["mealCount", "Meal count", "number"],
]);

const MEAL_FIELDS = Object.freeze([
  ["slot", "Meal slot", "text"],
  ["name", "Meal name", "text"],
  ["calories", "Calories", "number"],
  ["protein", "Protein (g)", "number"],
  ["carbohydrates", "Carbohydrates (g)", "number"],
  ["fat", "Fat (g)", "number"],
]);

function NutritionEditor({ draft, onCancel, onChange, onSave }) {
  function submit(event) {
    event.preventDefault();
    onSave();
  }

  function updateField(field, value) {
    onChange({ ...draft, [field]: value });
  }

  function updateMeal(index, field, value) {
    onChange({
      ...draft,
      meals: draft.meals.map((meal, mealIndex) =>
        mealIndex === index ? { ...meal, [field]: value } : meal
      ),
    });
  }

  return (
    <main className="min-h-screen bg-[var(--surface)]">
      <div className="mx-auto max-w-[393px] px-4 pb-32 pt-10">
        <header className="mb-6 space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--primary)]">
            Preview edit
          </p>
          <h1 className="text-3xl font-extrabold leading-tight text-[var(--text-primary)]">
            Edit nutrition details
          </h1>
        </header>
        <form className="space-y-4" onSubmit={submit}>
          <Card className="space-y-4">
            <h2 className="text-lg font-extrabold text-[var(--text-primary)]">
              Daily totals
            </h2>
            {NUTRITION_FIELDS.map(([field, label, type]) => (
              <EditInput
                key={field}
                label={label}
                onChange={(value) => updateField(field, value)}
                type={type}
                value={draft[field]}
              />
            ))}
          </Card>

          {draft.meals.map((meal, index) => (
            <Card className="space-y-4" key={`${meal.slot}-${index}`}>
              <h2 className="text-base font-extrabold text-[var(--text-primary)]">
                Meal {index + 1}
              </h2>
              {MEAL_FIELDS.map(([field, label, type]) => (
                <EditInput
                  key={field}
                  label={label}
                  onChange={(value) => updateMeal(index, field, value)}
                  type={type}
                  value={meal[field]}
                />
              ))}
            </Card>
          ))}

          <button
            className="w-full rounded-full bg-[var(--text-primary)] px-5 py-3 text-sm font-extrabold text-[var(--surface-elevated)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color-mix(in_srgb,var(--primary)_24%,transparent)]"
            type="submit"
          >
            Save changes
          </button>
          <button
            className="w-full rounded-full border border-[var(--divider)] bg-[var(--surface-elevated)] px-5 py-3 text-sm font-extrabold text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color-mix(in_srgb,var(--primary)_20%,transparent)]"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
        </form>
      </div>
    </main>
  );
}

function EditInput({ label, onChange, type, value }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-bold text-[var(--text-primary)]">{label}</span>
      <input
        className="w-full rounded-[12px] border border-[var(--divider)] bg-[var(--surface-elevated)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--primary)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--primary)_18%,transparent)]"
        min={type === "number" ? "0" : undefined}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </label>
  );
}

function PreviewTransition({
  confirmed,
  evidenceDate,
  evidenceType,
  initialDate,
  nutritionDay,
  outcome,
  state,
  onContinue,
}) {
  const complete = state === EVIDENCE_EXPERIENCE_STATES.COMPLETE;
  const recognition = state === EVIDENCE_EXPERIENCE_STATES.RECOGNITION;
  const reviewing = state === EVIDENCE_EXPERIENCE_STATES.REVIEWING;
  const saving = state === EVIDENCE_EXPERIENCE_STATES.SAVING;
  const historical = isHistoricalPreviewDate(evidenceDate, initialDate);
  const contextualDate = historical
    ? formatPreviewEvidenceDate(evidenceDate)
    : null;
  const copy = transitionCopy(state, outcome, evidenceType, nutritionDay);
  const canShowRecognition = confirmed && (recognition || complete);
  const nutrition = evidenceType === EVIDENCE_EXPERIENCE_TYPES.NUTRITION;
  const savedOutcome =
    outcome === EVIDENCE_EXPERIENCE_OUTCOMES.WORKOUT_SAVED ||
    outcome === EVIDENCE_EXPERIENCE_OUTCOMES.NUTRITION_SAVED;
  const StatusIcon = canShowRecognition && savedOutcome
    ? Check
    : nutrition ? Utensils : Dumbbell;
  const statusIconLabel = canShowRecognition
    ? savedOutcome
      ? nutrition ? "Nutrition saved" : "Workout saved"
      : nutrition ? "Nutrition progress" : "Training progress"
    : nutrition ? "Nutrition review" : "Workout review";

  return (
    <main className="min-h-screen bg-[var(--surface)]">
      <div
        className="mx-auto flex min-h-[calc(100svh-6rem)] max-w-[393px] flex-col items-center justify-center px-6 pb-32 pt-12 text-center"
      >
        <div aria-live="polite" className="flex flex-col items-center" role="status">
          {(saving || canShowRecognition) && contextualDate && (
            <p className="mb-5 text-sm font-semibold text-[var(--text-secondary)]">
              {contextualDate}
            </p>
          )}
          <div
            aria-label={statusIconLabel}
            className="motion-safe:animate-[pulse_1.8s_ease-in-out_infinite] motion-reduce:animate-none"
            role="img"
          >
            <IconBadge
              appearanceClassName={
                canShowRecognition && savedOutcome
                  ? "bg-[var(--surface-inset)] text-[var(--chart-1)]"
                  : canShowRecognition
                  ? "bg-[color-mix(in_srgb,var(--chart-1)_16%,transparent)] text-[var(--chart-1)]"
                  : ""
              }
              className="rounded-[16px]"
              color="primary"
              icon={StatusIcon}
              size="lg"
            />
          </div>
          <h1 className="mt-6 text-2xl font-extrabold leading-tight text-[var(--text-primary)]">
            {copy.headline}
          </h1>
          {reviewing && contextualDate && (
            <p className="mt-2 text-sm font-semibold text-[var(--text-secondary)]">
              {contextualDate}
            </p>
          )}
          {copy.body && (
            <p className="mt-3 max-w-[320px] text-base leading-7 text-[var(--text-secondary)]">
              {copy.body}
            </p>
          )}
        </div>
        {complete && confirmed && (
          <button
            className="mt-8 w-full max-w-[320px] rounded-full bg-[var(--text-primary)] px-5 py-3 text-sm font-extrabold text-[var(--surface-elevated)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color-mix(in_srgb,var(--primary)_24%,transparent)]"
            onClick={onContinue}
            type="button"
          >
            Continue
          </button>
        )}
      </div>
    </main>
  );
}

function transitionCopy(state, outcome, evidenceType, nutritionDay) {
  const nutrition = evidenceType === EVIDENCE_EXPERIENCE_TYPES.NUTRITION;
  if (state === EVIDENCE_EXPERIENCE_STATES.UPLOADING) {
    return {
      headline: nutrition
        ? "Uploading your nutrition…"
        : "Uploading your workout…",
      body: null,
    };
  }
  if (state === EVIDENCE_EXPERIENCE_STATES.REVIEWING) {
    return nutrition
      ? {
        headline: "Reviewing your nutrition",
        body: "Looking through your meals and daily totals before you confirm them.",
      }
      : {
        headline: "Reviewing your workout",
        body: "Looking through your training and checking for new milestones.",
      };
  }
  if (state === EVIDENCE_EXPERIENCE_STATES.SAVING) {
    return {
      headline: nutrition
        ? "Saving your nutrition…"
        : "Saving your workout…",
      body: null,
    };
  }
  const result = getPreviewOutcomeResult(outcome, {
    protein: nutritionDay?.protein,
  });
  return { headline: result.title, body: result.body };
}
