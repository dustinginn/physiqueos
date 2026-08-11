"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Apple,
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CirclePlus,
  Dumbbell,
  History,
  Link2,
  Minus,
  MoreHorizontal,
  Play,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Trophy,
  Unlink,
} from "lucide-react";
import Card from "../ui/Card";
import {
  acceptTrainingCategorySuggestion,
  addTrainingExercise,
  addTrainingSet,
  APPLE_HEALTH_MATCH_STATES,
  APPLE_WORKOUT_CANONICAL_OWNER_TYPES,
  applyProgressionSuggestion,
  assignTrainingVariant,
  buildEvidenceReviewHandoff,
  buildTrainingWorkoutSummary,
  canContinueFromReconciliation,
  canFinishTrainingLoggerDraft,
  continueWithoutAppleHealthMatch,
  createTrainingLoggerProductionDraft,
  createTrainingLoggerPreviewDraft,
  createTrainingSuperset,
  finalizeTrainingLoggerReconciliation,
  finishTrainingLoggerDraft,
  getSupersetContext,
  goToTrainingLoggerStep,
  hydrateTrainingLoggerProductionDraft,
  initializeTrainingLoggerMode,
  keepPreviousPerformance,
  listTrainingLoggerCategories,
  listTrainingLoggerExercises,
  PROGRESSION_CHOICES,
  PROGRESSION_STATES,
  removeTrainingExercise,
  removeTrainingSet,
  removeTrainingSuperset,
  removeTrainingVariant,
  serializeTrainingLoggerRecoveryDraft,
  selectAppleHealthMatch,
  attachProductionAppleHealthReconciliation,
  toggleAppleHealthAdditionalEvidence,
  toggleTrainingCategory,
  TRAINING_LOGGER_CATEGORY_SUGGESTION,
  TRAINING_LOGGER_EXERCISE_SCOPES,
  TRAINING_LOGGER_MODES,
  TRAINING_LOGGER_STEPS,
  TRAINING_LOGGER_VARIANT_OPTIONS,
  toggleTrainingSetCompletion,
  updateTrainingSet,
  updateWorkoutContext,
} from "../../app/preview/training-logger/TrainingLoggerPreviewState";
import { createTrainingLoggerExercisePickerPresentation } from "../../presentation/trainingExercisePresentation";
import {
  discardTrainingLoggerRecoveryDraft,
  loadTrainingLoggerRecoveryDraft,
  saveTrainingLoggerRecoveryDraft,
} from "../../domain/services/TrainingLoggerDraftRecoveryService";

export default function TrainingLoggerClient({
  goalContext = null,
  initialCanonicalExercises = [],
  initialDate,
  initialHistorySessions = [],
  initialPerformedExerciseIds = null,
  production = false,
}) {
  const createInitialDraft = () => production
    ? createTrainingLoggerProductionDraft({
        exerciseLibrary: initialCanonicalExercises,
        goalContext,
        historySessions: initialHistorySessions,
        performedExerciseIds: initialPerformedExerciseIds,
        workoutDate: initialDate,
      })
    : createTrainingLoggerPreviewDraft({ workoutDate: initialDate });
  const [draft, setDraft] = useState(createInitialDraft);
  const [search, setSearch] = useState("");
  const [openMenuId, setOpenMenuId] = useState(null);
  const [variantPickerId, setVariantPickerId] = useState(null);
  const [supersetPickerId, setSupersetPickerId] = useState(null);
  const [removeExerciseId, setRemoveExerciseId] = useState(null);
  const [evidenceFiles, setEvidenceFiles] = useState([]);
  const [evidencePackageId, setEvidencePackageId] = useState(null);
  const [submissionError, setSubmissionError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [savedDraft, setSavedDraft] = useState(null);
  const [recoveryChecked, setRecoveryChecked] = useState(!production);
  const [browseAllExercises, setBrowseAllExercises] = useState(false);
  const [cancelWorkoutPending, setCancelWorkoutPending] = useState(false);

  useEffect(() => {
    if (!production) return;
    let recoveredDraft = null;
    const recovered = loadTrainingLoggerRecoveryDraft(window.localStorage);
    if (recovered) {
      const hydrated = hydrateTrainingLoggerProductionDraft(recovered, {
        exerciseLibrary: initialCanonicalExercises,
        goalContext,
        historySessions: initialHistorySessions,
        performedExerciseIds: initialPerformedExerciseIds,
        workoutDate: initialDate,
      });
      if (hydrated.mode && hydrated.step !== TRAINING_LOGGER_STEPS.ENTRY) {
        recoveredDraft = hydrated;
      } else {
        discardTrainingLoggerRecoveryDraft(window.localStorage);
      }
    }
    const timer = window.setTimeout(() => {
      setSavedDraft(recoveredDraft);
      setRecoveryChecked(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [
    goalContext,
    initialCanonicalExercises,
    initialDate,
    initialHistorySessions,
    initialPerformedExerciseIds,
    production,
  ]);

  useEffect(() => {
    if (!production || !recoveryChecked || !draft.mode) return;
    const recoverable = serializeTrainingLoggerRecoveryDraft(draft);
    if (recoverable) {
      saveTrainingLoggerRecoveryDraft(window.localStorage, recoverable);
    }
  }, [draft, production, recoveryChecked]);

  function resetPreview() {
    setDraft(createInitialDraft());
    setSearch("");
    setOpenMenuId(null);
    setVariantPickerId(null);
    setSupersetPickerId(null);
    setRemoveExerciseId(null);
    setEvidenceFiles([]);
    setEvidencePackageId(null);
    setSubmissionError(null);
    setBrowseAllExercises(false);
    setCancelWorkoutPending(false);
    if (production) discardTrainingLoggerRecoveryDraft(window.localStorage);
  }

  function resumeSavedWorkout() {
    if (!savedDraft) return;
    setDraft(savedDraft);
    setSavedDraft(null);
    setCancelWorkoutPending(false);
  }

  function leaveWorkout() {
    const recoverable = serializeTrainingLoggerRecoveryDraft(draft);
    if (recoverable) {
      saveTrainingLoggerRecoveryDraft(window.localStorage, recoverable);
    }
    window.location.assign("/log");
  }

  function cancelWorkout() {
    discardTrainingLoggerRecoveryDraft(window.localStorage);
    setSavedDraft(null);
    setDraft(createInitialDraft());
    setSearch("");
    setBrowseAllExercises(false);
    setCancelWorkoutPending(false);
    setEvidenceFiles([]);
    setEvidencePackageId(null);
    setSubmissionError(null);
  }

  function navigate(step) {
    setDraft((current) => goToTrainingLoggerStep(current, step));
    setSearch("");
    setBrowseAllExercises(false);
  }

  async function prepareAppleEvidence() {
    if (submitting) return;
    setSubmitting(true);
    setSubmissionError(null);
    try {
      const formData = new FormData();
      formData.set("draftJson", JSON.stringify(serializeTrainingLoggerRecoveryDraft(draft)));
      evidenceFiles.forEach((file) => formData.append("evidenceFiles", file));
      const response = await fetch("/log/training/reconcile", {
        method: "POST",
        body: formData,
        headers: { Accept: "application/json" },
      });
      const result = await response.json();
      if (!response.ok || !result.reconciliation) {
        throw new Error(result.error ?? "Apple Health evidence could not be prepared.");
      }
      setEvidencePackageId(result.evidencePackageId ?? null);
      setDraft((current) => goToTrainingLoggerStep(
        attachProductionAppleHealthReconciliation(current, result.reconciliation),
        TRAINING_LOGGER_STEPS.RECONCILIATION
      ));
    } catch (error) {
      setSubmissionError(error?.message ?? "Apple Health evidence could not be prepared.");
    } finally {
      setSubmitting(false);
    }
  }

  async function stageEvidenceReview() {
    if (submitting) return;
    setSubmitting(true);
    setSubmissionError(null);
    try {
      const finalized = finalizeTrainingLoggerReconciliation(draft);
      const response = await fetch("/log/training/reconcile", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          draft: serializeTrainingLoggerRecoveryDraft(finalized),
          evidencePackageId: evidencePackageId ?? finalized.reconciliation?.batchId ?? null,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.reviewUrl) {
        throw new Error(result.error ?? "Evidence Review could not be prepared.");
      }
      discardTrainingLoggerRecoveryDraft(window.localStorage);
      window.location.assign(result.reviewUrl);
    } catch (error) {
      setSubmissionError(error?.message ?? "Evidence Review could not be prepared.");
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--surface)] text-[var(--text-primary)]">
      <div className="mx-auto min-h-screen w-full max-w-[393px] px-4 pb-36 pt-5">
        {!production && <PreviewBanner compact={draft.step === TRAINING_LOGGER_STEPS.LOGGER} />}

        {draft.step === TRAINING_LOGGER_STEPS.ENTRY && (
          <EntryScreen
            onChooseMode={(mode) => setDraft((current) =>
              initializeTrainingLoggerMode(current, mode)
            )}
            onRequestCancel={() => setCancelWorkoutPending(true)}
            onResume={resumeSavedWorkout}
            recoveryPending={production && !recoveryChecked}
            savedDraft={savedDraft}
          />
        )}

        {draft.step === TRAINING_LOGGER_STEPS.CATEGORIES && (
          <CategoryScreen
            draft={draft}
            onBack={production ? leaveWorkout : resetPreview}
            onContinue={() => navigate(TRAINING_LOGGER_STEPS.EXERCISES)}
            onSelectSuggestion={() => setDraft((current) =>
              acceptTrainingCategorySuggestion(
                current,
                current.categorySuggestion ?? TRAINING_LOGGER_CATEGORY_SUGGESTION
              )
            )}
            onToggleCategory={(category) => setDraft((current) =>
              toggleTrainingCategory(current, category)
            )}
            onUpdateContext={(changes) => setDraft((current) =>
              updateWorkoutContext(current, changes)
            )}
          />
        )}

        {[TRAINING_LOGGER_STEPS.EXERCISES, TRAINING_LOGGER_STEPS.ADD_EXERCISE]
          .includes(draft.step) && (
          <ExerciseSelectionScreen
            adding={draft.step === TRAINING_LOGGER_STEPS.ADD_EXERCISE}
            broadCatalog={browseAllExercises}
            draft={draft}
            onBack={() => {
              if (browseAllExercises) {
                setBrowseAllExercises(false);
                setSearch("");
                return;
              }
              navigate(
                draft.step === TRAINING_LOGGER_STEPS.ADD_EXERCISE
                  ? TRAINING_LOGGER_STEPS.LOGGER
                  : TRAINING_LOGGER_STEPS.CATEGORIES
              );
            }}
            onBrowseNew={() => {
              setBrowseAllExercises(true);
              setSearch("");
            }}
            onContinue={() => navigate(TRAINING_LOGGER_STEPS.LOGGER)}
            onSearch={setSearch}
            onToggleExercise={(canonicalExerciseId) => setDraft((current) => {
              const existing = current.exercises.find(
                (exercise) => exercise.canonicalExerciseId === canonicalExerciseId
              );
              return existing
                ? removeTrainingExercise(current, existing.id)
                : addTrainingExercise(current, canonicalExerciseId);
            })}
            search={search}
            production={production}
          />
        )}

        {draft.step === TRAINING_LOGGER_STEPS.LOGGER && (
          <LoggerScreen
            draft={draft}
            openMenuId={openMenuId}
            removeExerciseId={removeExerciseId}
            supersetPickerId={supersetPickerId}
            variantPickerId={variantPickerId}
            onAddExercise={() => navigate(TRAINING_LOGGER_STEPS.ADD_EXERCISE)}
            onAddSet={(exerciseId) => setDraft((current) =>
              addTrainingSet(current, exerciseId)
            )}
            onApplySuggestion={(exerciseId) => setDraft((current) =>
              applyProgressionSuggestion(current, exerciseId)
            )}
            onAssignVariant={(exerciseId, variant) => {
              setDraft((current) => assignTrainingVariant(current, exerciseId, variant));
              setVariantPickerId(null);
              setOpenMenuId(null);
            }}
            onConfirmRemove={(exerciseId) => {
              setDraft((current) => removeTrainingExercise(current, exerciseId));
              setRemoveExerciseId(null);
              setOpenMenuId(null);
            }}
            onToggleSet={(exerciseId, setId) => setDraft((current) =>
              toggleTrainingSetCompletion(current, exerciseId, setId)
            )}
            onFinish={() => {
              setDraft((current) => production
                ? finishTrainingLoggerDraft(current)
                : goToTrainingLoggerStep(current, TRAINING_LOGGER_STEPS.SUMMARY));
              setSearch("");
            }}
            onLeave={production ? leaveWorkout : null}
            onKeepPrevious={(exerciseId) => setDraft((current) =>
              keepPreviousPerformance(current, exerciseId)
            )}
            onLinkSuperset={(firstId, secondId) => {
              setDraft((current) => createTrainingSuperset(current, firstId, secondId));
              setSupersetPickerId(null);
              setOpenMenuId(null);
            }}
            onRemoveSet={(exerciseId, setId) => setDraft((current) =>
              removeTrainingSet(current, exerciseId, setId)
            )}
            onRemoveSuperset={(groupId) => {
              setDraft((current) => removeTrainingSuperset(current, groupId));
              setOpenMenuId(null);
            }}
            onRemoveVariant={(exerciseId) => {
              setDraft((current) => removeTrainingVariant(current, exerciseId));
              setOpenMenuId(null);
            }}
            onRequestRemove={setRemoveExerciseId}
            onRequestCancel={production ? () => setCancelWorkoutPending(true) : null}
            onSetMenu={setOpenMenuId}
            onSetSupersetPicker={setSupersetPickerId}
            onSetVariantPicker={setVariantPickerId}
            onUpdateSet={(exerciseId, setId, changes) => setDraft((current) =>
              updateTrainingSet(current, exerciseId, setId, changes)
            )}
          />
        )}

        {draft.step === TRAINING_LOGGER_STEPS.SUMMARY && (
          <SummaryScreen
            draft={draft}
            error={submissionError}
            evidenceFiles={evidenceFiles}
            onEvidenceFiles={setEvidenceFiles}
            onBack={() => navigate(TRAINING_LOGGER_STEPS.LOGGER)}
            onContinue={production
              ? prepareAppleEvidence
              : () => navigate(TRAINING_LOGGER_STEPS.RECONCILIATION)}
            production={production}
            submitting={submitting}
          />
        )}

        {draft.step === TRAINING_LOGGER_STEPS.RECONCILIATION && (
          <ReconciliationScreen
            draft={draft}
            onBack={() => navigate(TRAINING_LOGGER_STEPS.SUMMARY)}
            onContinue={() => {
              if (production) {
                stageEvidenceReview();
              } else {
                setDraft((current) => goToTrainingLoggerStep(
                  finalizeTrainingLoggerReconciliation(current),
                  TRAINING_LOGGER_STEPS.EVIDENCE_REVIEW
                ));
                setSearch("");
              }
            }}
            onContinueWithoutMatch={() => setDraft((current) =>
              continueWithoutAppleHealthMatch(current)
            )}
            onSelectMatch={(matchId) => setDraft((current) =>
              selectAppleHealthMatch(current, matchId)
            )}
            onToggleAdditionalEvidence={(sourceWorkoutId) => setDraft((current) =>
              toggleAppleHealthAdditionalEvidence(current, sourceWorkoutId)
            )}
            error={submissionError}
            submitting={submitting}
          />
        )}

        {!production && draft.step === TRAINING_LOGGER_STEPS.EVIDENCE_REVIEW && (
          <EvidenceReviewScreen
            draft={draft}
            onBack={() => navigate(TRAINING_LOGGER_STEPS.RECONCILIATION)}
            onComplete={() => navigate(TRAINING_LOGGER_STEPS.COMPLETE)}
          />
        )}

        {draft.step === TRAINING_LOGGER_STEPS.COMPLETE && (
          <CompletionScreen draft={draft} onRestart={resetPreview} />
        )}

        {production && cancelWorkoutPending && (
          <CancelWorkoutConfirmation
            onCancel={cancelWorkout}
            onKeep={() => setCancelWorkoutPending(false)}
          />
        )}
      </div>
    </main>
  );
}

function PreviewBanner({ compact = false }) {
  return (
    <div className={`${compact ? "mb-3 py-2" : "mb-5 py-2.5"} flex items-center justify-between gap-3 rounded-xl border border-[var(--divider)] bg-[var(--surface-accent)] px-3`}>
      <div className="flex items-center gap-2">
        <Sparkles aria-hidden="true" className="text-[var(--primary)]" size={16} />
        <span className="text-xs font-extrabold uppercase tracking-[0.1em] text-[var(--primary)]">
          Training Logger Preview
        </span>
      </div>
      <span className="text-[11px] font-bold text-[var(--text-muted)]">Memory only</span>
    </div>
  );
}

function EntryScreen({
  onChooseMode,
  onRequestCancel,
  onResume,
  recoveryPending = false,
  savedDraft = null,
}) {
  const savedSummary = savedDraft ? buildTrainingWorkoutSummary(savedDraft) : null;
  return (
    <section>
      <header className="mb-8 pt-4">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--surface-accent)] text-[var(--primary)]">
          <Dumbbell aria-hidden="true" size={24} />
        </div>
        <p className="mb-2 text-sm font-extrabold uppercase tracking-[0.12em] text-[var(--primary)]">
          Training Logger
        </p>
        <h1 className="text-4xl font-extrabold leading-[1.08] tracking-[-0.03em]">
          Log the work.
          <br />Keep the context.
        </h1>
        <p className="mt-4 max-w-sm text-base font-medium leading-7 text-[var(--text-secondary)]">
          One logger for the gym and for workouts you’re adding later.
        </p>
      </header>

      {recoveryPending ? (
        <Card variant="soft">
          <p aria-live="polite" className="text-sm font-bold text-[var(--text-secondary)]">
            Checking for a saved workout…
          </p>
        </Card>
      ) : savedDraft ? (
        <Card variant="accent">
          <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-[var(--primary)]">
            Workout draft saved
          </p>
          <h2 className="mt-2 text-xl font-extrabold">Resume your workout?</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-[var(--text-secondary)]">
            {savedDraft.mode === TRAINING_LOGGER_MODES.LIVE ? "Workout in progress" : formatDate(savedDraft.workoutDate)}
            {savedSummary?.exerciseCount ? ` · ${savedSummary.exerciseCount} exercises` : ""}
          </p>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button className="min-h-12 rounded-xl bg-[var(--primary)] px-4 text-sm font-extrabold text-white" onClick={onResume} type="button">
              Resume workout
            </button>
            <button className="min-h-12 rounded-xl border border-red-200 bg-[var(--surface-elevated)] px-4 text-sm font-extrabold text-red-600" onClick={onRequestCancel} type="button">
              Cancel workout
            </button>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          <ModeCard
            description="Fast set-by-set logging while you train."
            icon={Play}
            label="Start Workout"
            onClick={() => onChooseMode(TRAINING_LOGGER_MODES.LIVE)}
          />
          <ModeCard
            description="Add the same workout structure for an earlier session."
            icon={History}
            label="Log Past Workout"
            onClick={() => onChooseMode(TRAINING_LOGGER_MODES.RETROSPECTIVE)}
          />
        </div>
      )}
    </section>
  );
}

function ModeCard({ description, icon: Icon, label, onClick }) {
  return (
    <button className="group w-full text-left" onClick={onClick} type="button">
      <Card className="flex min-h-24 items-center gap-4 transition duration-150 group-hover:border-[var(--border-strong)] group-active:scale-[0.99]" padding="lg">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-muted)] text-[var(--primary)]">
          <Icon aria-hidden="true" size={22} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-extrabold">{label}</span>
          <span className="mt-1 block text-sm font-medium leading-5 text-[var(--text-secondary)]">
            {description}
          </span>
        </span>
        <ChevronRight aria-hidden="true" className="text-[var(--text-subtle)]" size={20} />
      </Card>
    </button>
  );
}

function CategoryScreen({
  draft,
  onBack,
  onContinue,
  onSelectSuggestion,
  onToggleCategory,
  onUpdateContext,
}) {
  const categories = listTrainingLoggerCategories();
  const suggestion = draft.categorySuggestion ??
    (draft.previewVersion ? TRAINING_LOGGER_CATEGORY_SUGGESTION : null);
  const suggestionAccepted = suggestion && draft.acceptedSuggestionId === suggestion.id;
  return (
    <section>
      <PageHeader
        description="Choose every muscle group you plan to train. You can change exercises later."
        onBack={onBack}
        step="1 of 2"
        title="What are you training?"
      />

      {draft.mode === TRAINING_LOGGER_MODES.RETROSPECTIVE && (
        <Card className="mb-4" variant="soft">
          <div className="mb-3 flex items-center gap-2">
            <CalendarDays aria-hidden="true" className="text-[var(--primary)]" size={18} />
            <p className="text-sm font-extrabold">Past workout date</p>
          </div>
          <label className="text-xs font-bold text-[var(--text-muted)]">
            Date
            <input
              className="mt-1.5 h-11 w-full rounded-xl border border-[var(--divider)] bg-[var(--input-bg)] px-3 text-sm text-[var(--text-primary)]"
              max={new Date().toISOString().slice(0, 10)}
              onChange={(event) => onUpdateContext({ workoutDate: event.target.value })}
              required
              type="date"
              value={draft.workoutDate}
            />
          </label>
        </Card>
      )}

      {suggestion && <button className="mb-5 w-full text-left" onClick={onSelectSuggestion} type="button">
        <Card className={suggestionAccepted ? "border-[var(--primary)]" : ""} variant="accent">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="mb-1.5 flex items-center gap-2 text-[var(--primary)]">
                <Sparkles aria-hidden="true" size={16} />
                <span className="text-xs font-extrabold uppercase tracking-[0.1em]">Suggested today</span>
              </div>
              <p className="text-lg font-extrabold">{suggestion.label}</p>
              <p className="mt-1 text-sm font-medium text-[var(--text-secondary)]">
                {suggestion.reason}
              </p>
            </div>
            <SelectionMark selected={suggestionAccepted} />
          </div>
        </Card>
      </button>}

      <div className="grid grid-cols-2 gap-3">
        {categories.map((category) => {
          const selected = draft.selectedCategories.includes(category);
          return (
            <button
              aria-pressed={selected}
              className={`flex min-h-14 items-center justify-between rounded-2xl border px-4 text-left text-sm font-extrabold transition active:scale-[0.98] ${selected
                ? "border-[var(--primary)] bg-[var(--surface-accent)] text-[var(--primary)]"
                : "border-[var(--divider)] bg-[var(--surface-elevated)]"}`}
              key={category}
              onClick={() => onToggleCategory(category)}
              type="button"
            >
              {category}
              <SelectionMark selected={selected} />
            </button>
          );
        })}
      </div>

      <BottomAction
        disabled={draft.selectedCategories.length === 0}
        label={`Choose exercises${draft.selectedCategories.length ? ` · ${draft.selectedCategories.length} groups` : ""}`}
        onClick={onContinue}
      />
    </section>
  );
}

function ExerciseSelectionScreen({
  adding,
  broadCatalog,
  draft,
  onBack,
  onBrowseNew,
  onContinue,
  onSearch,
  onToggleExercise,
  production,
  search,
}) {
  const available = useMemo(() => listTrainingLoggerExercises({
    categories: draft.selectedCategories,
    exerciseLibrary: draft.productionContext?.exerciseLibrary,
    performedExerciseIds: draft.productionContext?.performedExerciseIds,
    search,
    scope: production && !broadCatalog
      ? TRAINING_LOGGER_EXERCISE_SCOPES.PERFORMED_HISTORY
      : TRAINING_LOGGER_EXERCISE_SCOPES.ALL_CANONICAL,
  }), [
    broadCatalog,
    draft.productionContext?.exerciseLibrary,
    draft.productionContext?.performedExerciseIds,
    draft.selectedCategories,
    production,
    search,
  ]);
  const selectedIds = new Set(draft.exercises.map((exercise) => exercise.canonicalExerciseId));
  return (
    <section>
      <PageHeader
        description={broadCatalog
          ? `Search all available exercises for ${draft.selectedCategories.join(" + ")}.`
          : adding
            ? "Choose from exercises you have performed before, or add a new exercise."
            : `Your performed exercises for ${draft.selectedCategories.join(" + ")}.`}
        onBack={onBack}
        step={adding ? "In workout" : "2 of 2"}
        title={broadCatalog ? "Add new exercise" : adding ? "Add an exercise" : "Choose exercises"}
      />

      <label className="relative mb-4 block">
        <Search aria-hidden="true" className="absolute left-3.5 top-3.5 text-[var(--text-subtle)]" size={18} />
        <span className="sr-only">Search exercises</span>
        <input
          className="h-12 w-full rounded-2xl border border-[var(--divider)] bg-[var(--input-bg)] pl-11 pr-4 text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--primary)]"
          onChange={(event) => onSearch(event.target.value)}
          placeholder={broadCatalog ? "Search all exercises" : "Search your exercises"}
          type="search"
          value={search}
        />
      </label>

      <div className="space-y-2">
        {available.map((exercise) => {
          const selected = selectedIds.has(exercise.id);
          const presentation = createTrainingLoggerExercisePickerPresentation(exercise);
          return (
            <button
              aria-pressed={selected}
              className={`flex min-h-16 w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition active:scale-[0.99] ${selected
                ? "border-[var(--primary)] bg-[var(--surface-accent)]"
                : "border-[var(--divider)] bg-[var(--surface-elevated)]"}`}
              disabled={adding && selected}
              key={exercise.id}
              onClick={() => onToggleExercise(exercise.id)}
              type="button"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-extrabold">{presentation.displayName}</span>
                {((adding && selected) || presentation.secondaryLabel) && (
                  <span className="mt-1 block truncate text-xs font-semibold text-[var(--text-muted)]">
                    {adding && selected ? "Already in workout" : presentation.secondaryLabel}
                  </span>
                )}
              </span>
              <SelectionMark selected={selected} />
            </button>
          );
        })}
        {available.length === 0 && (
          <Card className="text-center" variant="soft">
            <p className="font-extrabold">
              {broadCatalog ? "No matching exercises" : "No performed exercises here yet"}
            </p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {broadCatalog
                ? "Try a broader search."
                : "Add a new exercise to grow your workout history."}
            </p>
          </Card>
        )}
      </div>

      {production && !broadCatalog && (
        <button
          className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-soft)] px-4 text-sm font-extrabold text-[var(--primary)]"
          onClick={onBrowseNew}
          type="button"
        >
          <CirclePlus aria-hidden="true" size={18} />
          Add new exercise
        </button>
      )}

      <BottomAction
        disabled={draft.exercises.length === 0}
        label={adding ? "Return to workout" : `Start logging · ${draft.exercises.length} selected`}
        onClick={onContinue}
      />
    </section>
  );
}

function LoggerScreen({
  draft,
  openMenuId,
  removeExerciseId,
  supersetPickerId,
  variantPickerId,
  onAddExercise,
  onAddSet,
  onApplySuggestion,
  onAssignVariant,
  onConfirmRemove,
  onToggleSet,
  onFinish,
  onKeepPrevious,
  onLeave,
  onLinkSuperset,
  onRemoveSet,
  onRemoveSuperset,
  onRemoveVariant,
  onRequestRemove,
  onRequestCancel,
  onSetMenu,
  onSetSupersetPicker,
  onSetVariantPicker,
  onUpdateSet,
}) {
  const summary = buildTrainingWorkoutSummary(draft);
  return (
    <section>
      <header className="mb-2">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {draft.mode === TRAINING_LOGGER_MODES.LIVE && (
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50 motion-reduce:animate-none" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                </span>
              )}
              <p className="truncate text-[10px] font-extrabold uppercase tracking-[0.08em] text-[var(--primary)]">
                {draft.mode === TRAINING_LOGGER_MODES.LIVE ? "Workout in progress" : "Past workout"}
              </p>
            </div>
            <h1 className="mt-0.5 text-2xl font-extrabold tracking-[-0.03em]">Training Logger</h1>
            <p className="mt-0.5 text-[11px] font-semibold text-[var(--text-secondary)]">
              {formatWorkoutContext(draft)} · {draft.exercises.length} exercises
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-[var(--surface-muted)] px-2.5 py-1.5 text-xs font-extrabold text-[var(--text-secondary)]">
            {summary.confirmedSetCount}/{summary.setCount} sets
          </span>
        </div>
      </header>

      {(onLeave || onRequestCancel) && (
        <div className="mb-3 grid grid-cols-2 gap-2">
          <button className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--divider)] bg-[var(--surface-elevated)] text-xs font-extrabold text-[var(--text-secondary)]" onClick={onLeave} type="button">
            <ArrowLeft aria-hidden="true" size={16} /> Leave workout
          </button>
          <button className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-200 bg-[var(--surface-elevated)] text-xs font-extrabold text-red-600" onClick={onRequestCancel} type="button">
            <Trash2 aria-hidden="true" size={15} /> Cancel workout
          </button>
        </div>
      )}

      <div className="space-y-2" data-density-contract="v1.3">
        {draft.exercises.map((exercise) => (
          <ExerciseCard
            draft={draft}
            exercise={exercise}
            key={exercise.id}
            menuOpen={openMenuId === exercise.id}
            removePending={removeExerciseId === exercise.id}
            supersetPickerOpen={supersetPickerId === exercise.id}
            variantPickerOpen={variantPickerId === exercise.id}
            onAddSet={() => onAddSet(exercise.id)}
            onApplySuggestion={() => onApplySuggestion(exercise.id)}
            onAssignVariant={(variant) => onAssignVariant(exercise.id, variant)}
            onConfirmRemove={() => onConfirmRemove(exercise.id)}
            onToggleSet={(setId) => onToggleSet(exercise.id, setId)}
            onKeepPrevious={() => onKeepPrevious(exercise.id)}
            onLinkSuperset={(partnerId) => onLinkSuperset(exercise.id, partnerId)}
            onRemoveSet={(setId) => onRemoveSet(exercise.id, setId)}
            onRemoveSuperset={onRemoveSuperset}
            onRemoveVariant={() => onRemoveVariant(exercise.id)}
            onRequestRemove={() => onRequestRemove(exercise.id)}
            onToggleMenu={() => onSetMenu(openMenuId === exercise.id ? null : exercise.id)}
            onToggleSupersetPicker={() => onSetSupersetPicker(
              supersetPickerId === exercise.id ? null : exercise.id
            )}
            onToggleVariantPicker={() => onSetVariantPicker(
              variantPickerId === exercise.id ? null : exercise.id
            )}
            onUpdateSet={(setId, changes) => onUpdateSet(exercise.id, setId, changes)}
          />
        ))}
      </div>

      <button
        className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-soft)] text-sm font-extrabold text-[var(--primary)]"
        onClick={onAddExercise}
        type="button"
      >
        <CirclePlus aria-hidden="true" size={19} />
        Add Exercise
      </button>

      <BottomAction
        disabled={!canFinishTrainingLoggerDraft(draft)}
        label="Finish Workout"
        onClick={onFinish}
      />
    </section>
  );
}

function ExerciseCard({
  draft,
  exercise,
  menuOpen,
  removePending,
  supersetPickerOpen,
  variantPickerOpen,
  onAddSet,
  onApplySuggestion,
  onAssignVariant,
  onConfirmRemove,
  onToggleSet,
  onKeepPrevious,
  onLinkSuperset,
  onRemoveSet,
  onRemoveSuperset,
  onRemoveVariant,
  onRequestRemove,
  onToggleMenu,
  onToggleSupersetPicker,
  onToggleVariantPicker,
  onUpdateSet,
}) {
  const superset = getSupersetContext(draft, exercise.id);
  const previousContext = exercise.executionVariant || superset
    ? `Comparable ${formatDate(exercise.previousPerformance.date)}`
    : exercise.previousPerformance.context;
  return (
    <Card padding="none" className={superset ? "border-l-4 border-l-[var(--primary)]" : ""}>
      <div className="px-3 pb-2 pt-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold leading-tight">{exercise.name}</h2>
            {(exercise.executionVariant || superset) && (
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-bold leading-4 text-[var(--text-secondary)]">
                {exercise.executionVariant && (
                  <span className="font-extrabold text-[var(--primary)]">{exercise.executionVariant.label}</span>
                )}
                {superset && (
                  <span className="inline-flex items-center gap-1">
                    <Link2 aria-hidden="true" size={12} />
                    Superset with {superset.partners.map((partner) => partner.name).join(" + ")}
                  </span>
                )}
              </p>
            )}
            {exercise.previousPerformance.firstUse ? (
              <p className="mt-1 text-xs font-semibold leading-5 text-[var(--text-secondary)]">
                No comparable history yet · start with today’s performed values
              </p>
            ) : (
              <p className="mt-1 text-xs font-semibold leading-5 text-[var(--text-secondary)]">
                <span className="font-extrabold text-[var(--text-primary)]">Previous {exercise.previousPerformance.reps} × {formatLoad(exercise.previousPerformance.load)}</span>
                <span> · {previousContext}</span>
              </p>
            )}
          </div>
          <button
            aria-expanded={menuOpen}
            aria-label={`Actions for ${exercise.name}`}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--divider)] bg-[var(--surface-soft)] text-[var(--text-secondary)]"
            onClick={onToggleMenu}
            type="button"
          >
            <MoreHorizontal aria-hidden="true" size={20} />
          </button>
        </div>

        {menuOpen && (
          <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-[var(--surface-muted)] p-2">
            <ActionMenuButton icon={Sparkles} label={exercise.executionVariant ? "Edit Variant" : "Add Variant"} onClick={onToggleVariantPicker} />
            {exercise.executionVariant && (
              <ActionMenuButton icon={Minus} label="Remove Variant" onClick={onRemoveVariant} />
            )}
            <ActionMenuButton icon={Link2} label="Link as Superset" onClick={onToggleSupersetPicker} />
            {superset && (
              <ActionMenuButton icon={Unlink} label="Remove Superset" onClick={() => onRemoveSuperset(superset.group.id)} />
            )}
            <ActionMenuButton danger icon={Trash2} label="Remove Exercise" onClick={onRequestRemove} />
          </div>
        )}

        {variantPickerOpen && (
          <div className="mt-3 rounded-xl border border-[var(--divider)] bg-[var(--surface-soft)] p-3">
            <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--text-muted)]">
              Execution Variant
            </p>
            <div className="flex flex-wrap gap-2">
              {TRAINING_LOGGER_VARIANT_OPTIONS.map((variant) => (
                <button
                  className="min-h-11 rounded-xl border border-[var(--divider)] bg-[var(--surface-elevated)] px-3 text-xs font-extrabold"
                  key={variant}
                  onClick={() => onAssignVariant(variant)}
                  type="button"
                >
                  {variant}
                </button>
              ))}
            </div>
          </div>
        )}

        {supersetPickerOpen && (
          <div className="mt-3 rounded-xl border border-[var(--divider)] bg-[var(--surface-soft)] p-3">
            <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--text-muted)]">
              Superset with
            </p>
            <div className="space-y-2">
              {draft.exercises.filter((candidate) => candidate.id !== exercise.id).map((candidate) => (
                <button
                  className="flex min-h-11 w-full items-center justify-between rounded-xl border border-[var(--divider)] bg-[var(--surface-elevated)] px-3 text-left text-sm font-extrabold"
                  key={candidate.id}
                  onClick={() => onLinkSuperset(candidate.id)}
                  type="button"
                >
                  {candidate.name}
                  <Link2 aria-hidden="true" className="text-[var(--primary)]" size={16} />
                </button>
              ))}
              {draft.exercises.length < 2 && (
                <p className="text-sm font-semibold text-[var(--text-secondary)]">
                  Add another exercise before creating a superset.
                </p>
              )}
            </div>
          </div>
        )}

        {removePending && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-[var(--surface-warning)] p-3">
            <p className="text-xs font-bold leading-5">Remove this exercise and its set entries?</p>
            <button className="min-h-11 shrink-0 rounded-xl bg-red-500 px-3 text-xs font-extrabold text-white" onClick={onConfirmRemove} type="button">
              Remove
            </button>
          </div>
        )}

      </div>

      {exercise.progressionRecommendation && <ProgressionCard
          exercise={exercise}
          onApplySuggestion={onApplySuggestion}
          onKeepPrevious={onKeepPrevious}
        />}

      <div className="px-2.5 pb-2.5 pt-1">
        <div className="overflow-hidden rounded-xl border border-[var(--divider)]">
          <div className="grid h-10 grid-cols-[26px_minmax(52px,1fr)_minmax(62px,1fr)_40px_48px] items-center gap-1 bg-[var(--surface-soft)] px-1 text-[9px] font-extrabold uppercase tracking-[0.08em] text-[var(--text-subtle)]">
            <span>Set</span><span>Reps</span><span>Load</span><span className="text-center">Done</span>
            <button
              aria-label="Add Set"
              className="flex h-10 w-12 items-center justify-center gap-0.5 text-[10px] font-extrabold normal-case tracking-normal text-[var(--primary)]"
              onClick={onAddSet}
              type="button"
            >
              <Plus aria-hidden="true" size={13} /> Set
            </button>
          </div>
          <div>
            {exercise.sets.map((set) => (
              <SetRow
                key={set.id}
                onToggle={() => onToggleSet(set.id)}
                onRemove={() => onRemoveSet(set.id)}
                onUpdate={(changes) => onUpdateSet(set.id, changes)}
                set={set}
                showRemove={exercise.sets.length > 1}
              />
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function SetRow({ onRemove, onToggle, onUpdate, set, showRemove }) {
  return (
    <div className={`grid h-10 grid-cols-[26px_minmax(52px,1fr)_minmax(62px,1fr)_40px_48px] items-center gap-1 border-t border-[var(--divider)] px-1 ${set.confirmed
      ? "bg-[var(--surface-success)]"
      : "bg-[var(--surface-muted)]"}`}>
      <span className="text-center text-sm font-extrabold">{set.order}</span>
      <label className="flex h-10 min-w-0 items-center">
        <span className="sr-only">Set {set.order} reps</span>
        <input
          className="h-8 min-w-0 w-full rounded-md border border-[var(--divider)] bg-[var(--input-bg)] px-1 text-center text-base font-extrabold text-[var(--text-primary)]"
          inputMode="numeric"
          min="0"
          onChange={(event) => onUpdate({ reps: event.target.value, confirmed: false })}
          type="number"
          value={set.reps}
        />
      </label>
      <label className="relative flex h-10 min-w-0 items-center">
        <span className="sr-only">Set {set.order} load in pounds</span>
        <input
          className="h-8 w-full min-w-0 rounded-md border border-[var(--divider)] bg-[var(--input-bg)] px-1 pr-5 text-center text-base font-extrabold text-[var(--text-primary)]"
          inputMode="decimal"
          min="0"
          onChange={(event) => onUpdate({ load: event.target.value, confirmed: false })}
          type="number"
          value={set.load}
        />
        <span className="pointer-events-none absolute right-1.5 top-3.5 text-[8px] font-extrabold text-[var(--text-subtle)]">lb</span>
      </label>
      <button
        aria-label={set.confirmed ? `Mark set ${set.order} incomplete` : `Mark set ${set.order} done`}
        aria-pressed={set.confirmed}
        className="flex h-10 w-10 items-center justify-center"
        onClick={onToggle}
        type="button"
      >
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg border ${set.confirmed
          ? "border-emerald-500 bg-emerald-500 text-white"
          : "border-[var(--divider)] bg-[var(--surface-elevated)] text-[var(--text-subtle)]"}`}>
          <Check aria-hidden="true" size={17} strokeWidth={3} />
        </span>
      </button>
      {showRemove ? (
        <button aria-label={`Remove set ${set.order}`} className="flex h-10 w-12 items-center justify-center text-[var(--text-subtle)]" onClick={onRemove} type="button">
          <Minus aria-hidden="true" size={16} />
        </button>
      ) : <span />}
    </div>
  );
}

function ProgressionCard({ exercise, onApplySuggestion, onKeepPrevious }) {
  const recommendation = exercise.progressionRecommendation;
  const opportunity = recommendation.state === PROGRESSION_STATES.OPPORTUNITY;
  const hasExplicitTarget = recommendation.suggestedLoad != null && recommendation.suggestedReps != null;
  const suggestionSelected = exercise.progressionChoice === PROGRESSION_CHOICES.SUGGESTION;
  const previousSelected = exercise.progressionChoice === PROGRESSION_CHOICES.PREVIOUS;
  return (
    <div className={`border-y border-[var(--divider)] px-3 py-1.5 ${opportunity
      ? "bg-[var(--surface-accent)]"
      : recommendation.state === PROGRESSION_STATES.RECOVER
        ? "bg-[var(--surface-warning)]"
        : "bg-[var(--surface-soft)]"}`}>
      <div className="grid min-h-10 grid-cols-[minmax(0,1fr)_82px_90px] items-center gap-1.5">
        <div className="min-w-0">
          <p className="text-[10px] font-extrabold uppercase leading-4 tracking-[0.06em] text-[var(--primary)]">
            {recommendation.eyebrow}
          </p>
          <p className="text-xs font-extrabold leading-4">{recommendation.prescription}</p>
        </div>
        <button
          aria-label="Use suggestion"
          aria-pressed={suggestionSelected}
          className={`inline-flex h-10 items-center justify-center gap-1 rounded-xl border px-1 text-[11px] font-extrabold transition disabled:opacity-45 ${suggestionSelected
            ? "border-[var(--primary)] bg-[var(--primary)] text-white shadow-[var(--shadow-card)]"
            : "border-[var(--divider)] bg-[var(--surface-elevated)] text-[var(--text-secondary)]"}`}
          onClick={onApplySuggestion}
          disabled={!hasExplicitTarget}
          type="button"
        >
          {suggestionSelected && <Check aria-hidden="true" size={14} strokeWidth={3} />}
          Use suggestion
        </button>
        <button
          aria-label="Keep previous"
          aria-pressed={previousSelected}
          className={`inline-flex h-10 items-center justify-center gap-1 rounded-xl border px-1 text-[11px] font-extrabold transition ${previousSelected
            ? "border-[var(--primary)] bg-[var(--primary)] text-white shadow-[var(--shadow-card)]"
            : "border-[var(--divider)] bg-[var(--surface-elevated)] text-[var(--text-secondary)]"}`}
          onClick={onKeepPrevious}
          type="button"
        >
          {previousSelected && <Check aria-hidden="true" size={14} strokeWidth={3} />}
          Keep previous
        </button>
      </div>
    </div>
  );
}

function SummaryScreen({
  draft,
  error = null,
  evidenceFiles = [],
  onBack,
  onContinue,
  onEvidenceFiles = () => {},
  production = false,
  submitting = false,
}) {
  const summary = buildTrainingWorkoutSummary(draft);
  return (
    <section>
      <PageHeader
        description={production
          ? "Review the detailed workout before adding optional Apple Health evidence. Nothing is canonical yet."
          : "Your workout structure is ready. Nothing has been written to production."}
        onBack={onBack}
        step="Workout complete"
        title="Review workout"
      />
      <Card className="mb-4" variant="accent">
        <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-[var(--primary)]">Workout summary</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <SummaryMetric label="Exercises" value={summary.exerciseCount} />
          <SummaryMetric label="Sets" value={summary.setCount} />
          <SummaryMetric label="Variants" value={summary.variantCount} />
          <SummaryMetric label="Supersets" value={summary.supersetCount} />
        </div>
        {summary.durationMinutes && (
          <p className="mt-4 border-t border-[var(--divider)] pt-3 text-sm font-bold text-[var(--text-secondary)]">
            {production ? "In-progress duration" : "Simulated duration"} · {summary.durationMinutes} min
          </p>
        )}
      </Card>
      <Card>
        <div className="space-y-4">
          {draft.exercises.map((exercise) => {
            const superset = getSupersetContext(draft, exercise.id);
            return (
              <div className="flex items-start justify-between gap-4 border-b border-[var(--divider)] pb-4 last:border-0 last:pb-0" key={exercise.id}>
                <div>
                  <p className="font-extrabold">{exercise.name}</p>
                  {exercise.executionVariant && <p className="mt-0.5 text-xs font-bold text-[var(--primary)]">{exercise.executionVariant.label}</p>}
                  {superset && <p className="mt-1 text-xs font-semibold text-[var(--text-muted)]">Superset with {superset.partners.map((item) => item.name).join(" + ")}</p>}
                </div>
                <span className="shrink-0 text-sm font-extrabold text-[var(--text-secondary)]">{exercise.sets.length} sets</span>
              </div>
            );
          })}
        </div>
      </Card>
      {production && <Card className="mt-4" variant="soft">
        <div className="flex items-start gap-3">
          <Apple aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--primary)]" size={20} />
          <div>
            <p className="font-extrabold">Apple Health evidence</p>
            <p className="mt-1 text-sm font-semibold leading-6 text-[var(--text-secondary)]">
              Select every workout screenshot from this gym visit in one batch. This is optional.
            </p>
          </div>
        </div>
        <input
          accept="image/*"
          className="mt-4 block w-full text-xs font-semibold text-[var(--text-secondary)] file:mr-3 file:rounded-full file:border-0 file:bg-[var(--primary)] file:px-3 file:py-2 file:text-xs file:font-bold file:text-white"
          multiple
          onChange={(event) => onEvidenceFiles([...event.target.files])}
          type="file"
        />
        <p className="mt-2 text-xs font-semibold text-[var(--text-muted)]">
          {evidenceFiles.length > 0
            ? `${evidenceFiles.length} screenshot${evidenceFiles.length === 1 ? "" : "s"} selected`
            : "No screenshots selected · the detailed workout can continue without them"}
        </p>
      </Card>}
      {error && <p aria-live="assertive" className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700" role="alert">{error}</p>}
      <BottomAction
        disabled={submitting}
        label={submitting
          ? "Preparing evidence…"
          : production && evidenceFiles.length === 0
            ? "Continue without Apple Health"
            : "Add Apple Health evidence"}
        onClick={onContinue}
      />
    </section>
  );
}

function ReconciliationScreen({
  draft,
  error = null,
  onBack,
  onContinue,
  onContinueWithoutMatch,
  onSelectMatch,
  onToggleAdditionalEvidence,
  submitting = false,
}) {
  const { reconciliation } = draft;
  const canContinue = canContinueFromReconciliation(draft);
  const strengthCandidates = reconciliation.strengthCandidateIds.map((sourceWorkoutId) =>
    reconciliation.normalizedEvidence.find((item) => item.sourceWorkoutId === sourceWorkoutId)
  ).filter(Boolean);
  const additionalEvidence = reconciliation.additionalEvidenceActions.map((action) => ({
    ...action,
    evidence: reconciliation.normalizedEvidence.find(
      (item) => item.sourceWorkoutId === action.sourceWorkoutId
    ),
  })).filter((item) => item.evidence);
  const batchEvidenceCount = strengthCandidates.length + additionalEvidence.length;
  return (
    <section>
      <PageHeader
        description={`${batchEvidenceCount} normalized workouts were found in this evidence batch.`}
        onBack={onBack}
        step="Workout reconciliation"
        title="Apple Health evidence"
      />

      {reconciliation.matchState === APPLE_HEALTH_MATCH_STATES.STRONG && (
        <>
          <StatusLead icon={Apple} label="Strength workout match" />
          <HealthMatchCard
            match={strengthCandidates[0]}
            onSelect={() => onSelectMatch(strengthCandidates[0].sourceWorkoutId)}
            selected={reconciliation.selectedStrengthSourceId === strengthCandidates[0].sourceWorkoutId}
            selectLabel="Linked to this strength workout"
          />
        </>
      )}

      {reconciliation.matchState === APPLE_HEALTH_MATCH_STATES.MULTIPLE && (
        <>
          <StatusLead icon={Apple} label="Choose the matching workout" />
          <p className="mb-3 text-sm font-semibold leading-6 text-[var(--text-secondary)]">
            More than one unlinked session could match. Choose one explicitly.
          </p>
          <div className="space-y-3">
            {strengthCandidates.map((match) => (
              <HealthMatchCard
                key={match.sourceWorkoutId}
                match={match}
                onSelect={() => onSelectMatch(match.sourceWorkoutId)}
                selected={reconciliation.selectedStrengthSourceId === match.sourceWorkoutId}
                selectLabel={reconciliation.selectedStrengthSourceId === match.sourceWorkoutId ? "Selected" : "Select workout"}
              />
            ))}
          </div>
        </>
      )}

      {reconciliation.matchState === APPLE_HEALTH_MATCH_STATES.NONE && (
        <Card className="text-center" variant="soft">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--surface-muted)] text-[var(--text-muted)]">
            <Apple aria-hidden="true" size={22} />
          </span>
          <h2 className="mt-3 text-lg font-extrabold">No Apple Health workout found</h2>
          <p className="mt-1 text-sm font-semibold leading-6 text-[var(--text-secondary)]">
            Your detailed workout can still continue to Evidence Review.
          </p>
          <button
            className={`mt-4 min-h-12 w-full rounded-xl border text-sm font-extrabold ${reconciliation.continueWithoutStrength
              ? "border-emerald-500 bg-[var(--surface-success)] text-emerald-700"
              : "border-[var(--divider)] bg-[var(--surface-elevated)]"}`}
            onClick={onContinueWithoutMatch}
            type="button"
          >
            {reconciliation.continueWithoutStrength ? "Continuing without strength match" : "Continue without strength match"}
          </button>
        </Card>
      )}

      {additionalEvidence.length > 0 && (
        <div className="mt-4">
          <StatusLead icon={Apple} label="Additional workouts in this batch" />
          <div className="space-y-2">
            {additionalEvidence.map(({ evidence, included, canonicalOwnerType }) => (
              <AdditionalEvidenceCard
                canonicalOwnerType={canonicalOwnerType}
                evidence={evidence}
                included={included}
                key={evidence.sourceWorkoutId}
                onToggle={() => onToggleAdditionalEvidence(evidence.sourceWorkoutId)}
              />
            ))}
          </div>
        </div>
      )}

      {error && <p aria-live="assertive" className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700" role="alert">{error}</p>}
      <BottomAction disabled={!canContinue || submitting} label={submitting ? "Preparing Evidence Review…" : "Continue to Evidence Review"} onClick={onContinue} />
    </section>
  );
}

function HealthMatchCard({ match, onSelect, selected, selectLabel }) {
  if (!match) return null;
  return (
    <Card className={selected ? "border-emerald-500" : ""} padding="sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold">{match.workoutType}</h2>
          <p className="mt-1 text-sm font-semibold text-[var(--text-secondary)]">
            {formatDate(match.sessionDate)}{formatTimeRange(match) ? ` · ${formatTimeRange(match)}` : ""}
          </p>
        </div>
        {selected && <CheckCircle2 aria-label="Selected" className="text-emerald-500" size={22} />}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-[var(--surface-muted)] p-2.5">
        <SummaryMetric compact label="Duration" value={match.durationMinutes == null ? "Unknown" : `${match.durationMinutes} min`} />
        <SummaryMetric compact label="Active calories" value={match.activeCalories ?? "Unknown"} />
      </div>
      <button
        className={`mt-2 min-h-11 w-full rounded-xl text-sm font-extrabold ${selected
          ? "bg-emerald-500 text-white"
          : "bg-[var(--primary)] text-white"}`}
        onClick={onSelect}
        type="button"
      >
        {selectLabel}
      </button>
    </Card>
  );
}

function AdditionalEvidenceCard({ canonicalOwnerType, evidence, included, onToggle }) {
  const actionLabel = canonicalOwnerType === APPLE_WORKOUT_CANONICAL_OWNER_TYPES.CARDIO_WORKOUT
    ? "Add as cardio workout"
    : "Add as workout/activity";
  return (
    <Card className={included ? "border-emerald-500" : ""} padding="sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold">{evidence.workoutType}</p>
          <p className="mt-0.5 text-xs font-semibold text-[var(--text-secondary)]">
            {formatDate(evidence.sessionDate)} · {evidence.durationMinutes ?? "Unknown"} min · {evidence.activeCalories ?? "Unknown"} active cal
          </p>
        </div>
        <button
          aria-label={`${included ? "Exclude" : "Include"} ${evidence.workoutType}`}
          aria-pressed={included}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${included
            ? "border-emerald-500 bg-emerald-500 text-white"
            : "border-[var(--divider)] bg-[var(--surface-elevated)] text-[var(--text-subtle)]"}`}
          onClick={onToggle}
          type="button"
        >
          <Check aria-hidden="true" size={19} strokeWidth={3} />
        </button>
      </div>
      <p className="mt-2 text-xs font-extrabold text-[var(--primary)]">{actionLabel}</p>
    </Card>
  );
}

function EvidenceReviewScreen({ draft, onBack, onComplete }) {
  const handoff = buildEvidenceReviewHandoff(draft);
  const summary = handoff.workoutDetails;
  return (
    <section>
      <PageHeader
        description="Only meaningful workout and source context needs confirmation. Your sets stay structured."
        onBack={onBack}
        step="Evidence Review"
        title="Ready to Log"
      />

      <div className="space-y-3">
        <ReviewSection icon={Dumbbell} title="Workout Details">
          <p className="text-lg font-extrabold">{formatDate(summary.workoutDate)}</p>
          <p className="mt-1 text-sm font-semibold text-[var(--text-secondary)]">
            {summary.exerciseCount} exercises · {summary.setCount} sets
          </p>
        </ReviewSection>

        <ReviewSection icon={Apple} title="Apple Health">
          {handoff.appleHealth.acceptedWorkouts.length > 0 ? (
            <div className="divide-y divide-[var(--divider)]">
              {handoff.appleHealth.acceptedWorkouts.map((workout) => (
                <div className="py-2 first:pt-0 last:pb-0" key={workout.sourceWorkoutId}>
                  <p className="text-xs font-bold text-[var(--text-muted)]">{formatDate(workout.sessionDate)}</p>
                  <p className="mt-0.5 font-extrabold">{workout.workoutType}</p>
                  <p className="mt-0.5 text-sm font-semibold text-[var(--text-secondary)]">
                    {workout.durationMinutes} min · {workout.activeCalories} active calories
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-emerald-600">
                    <CheckCircle2 aria-hidden="true" size={14} />
                    {getEvidenceReviewDisposition(workout.canonicalOwnerType)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="font-extrabold">No Apple Health workout accepted · Continue with detailed log</p>
          )}
        </ReviewSection>
      </div>

      <Card className="mt-4" variant="soft">
        <p className="text-xs font-bold leading-5 text-[var(--text-muted)]">
          Preview handoff only. Completing this step does not create a canonical TrainingSession or Evidence Review record.
        </p>
      </Card>
      <BottomAction label="Complete Preview Log" onClick={onComplete} />
    </section>
  );
}

function CompletionScreen({ draft, onRestart }) {
  const summary = buildTrainingWorkoutSummary(draft);
  return (
    <section className="pt-8 text-center">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[28px] bg-[var(--surface-success)] text-emerald-600">
        <Trophy aria-hidden="true" size={38} strokeWidth={2.2} />
      </div>
      <p className="mt-6 text-sm font-extrabold uppercase tracking-[0.12em] text-emerald-600">Workout complete</p>
      <h1 className="mt-2 text-4xl font-extrabold tracking-[-0.04em]">Strong work.</h1>
      <p className="mx-auto mt-4 max-w-xs text-base font-semibold leading-7 text-[var(--text-secondary)]">
        {summary.exerciseCount} exercises and {summary.setCount} sets moved through the complete Training Logger preview.
      </p>
      <Card className="mt-8 text-left" variant="success">
        <div className="flex items-start gap-3">
          <CheckCircle2 aria-hidden="true" className="mt-0.5 shrink-0 text-emerald-600" size={22} />
          <div>
            <p className="font-extrabold">Preview flow complete</p>
            <p className="mt-1 text-sm font-semibold leading-6 text-[var(--text-secondary)]">
              No production workout was created. Your existing Training history is unchanged.
            </p>
          </div>
        </div>
      </Card>
      <button className="mt-6 min-h-14 w-full rounded-2xl bg-[var(--primary)] px-5 text-base font-extrabold text-white" onClick={onRestart} type="button">
        Run Preview Again
      </button>
    </section>
  );
}

function PageHeader({ description, onBack, step, title }) {
  return (
    <header className="mb-5">
      <div className="mb-4 flex items-center gap-3">
        <button aria-label="Go back" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--divider)] bg-[var(--surface-elevated)]" onClick={onBack} type="button">
          <ArrowLeft aria-hidden="true" size={19} />
        </button>
        <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-[var(--primary)]">{step}</p>
      </div>
      <h1 className="text-3xl font-extrabold leading-tight tracking-[-0.03em]">{title}</h1>
      <p className="mt-2 text-sm font-semibold leading-6 text-[var(--text-secondary)]">{description}</p>
    </header>
  );
}

function CancelWorkoutConfirmation({ onCancel, onKeep }) {
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/40 px-4 pb-24 pt-10" role="presentation">
      <div aria-labelledby="cancel-workout-title" aria-modal="true" className="w-full max-w-[361px] rounded-[22px] border border-[var(--divider)] bg-[var(--surface-elevated)] p-5 shadow-2xl" role="dialog">
        <h2 className="text-xl font-extrabold" id="cancel-workout-title">Cancel this workout?</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-[var(--text-secondary)]">
          Your current workout draft will be discarded. No Training or Evidence records will be created.
        </p>
        <div className="mt-5 grid grid-cols-1 gap-2">
          <button className="min-h-12 rounded-xl bg-red-600 px-4 text-sm font-extrabold text-white" onClick={onCancel} type="button">
            Cancel workout
          </button>
          <button className="min-h-12 rounded-xl border border-[var(--divider)] bg-[var(--surface-soft)] px-4 text-sm font-extrabold" onClick={onKeep} type="button">
            Keep workout
          </button>
        </div>
      </div>
    </div>
  );
}

function BottomAction({ disabled = false, label, onClick }) {
  return (
    <div className="sticky bottom-24 z-30 mt-6 rounded-[20px] border border-[var(--divider)] bg-[color-mix(in_srgb,var(--surface-elevated)_92%,transparent)] p-2 shadow-[var(--shadow-card)] backdrop-blur">
      <button
        className="min-h-14 w-full rounded-2xl bg-[var(--primary)] px-5 text-sm font-extrabold text-white transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
        disabled={disabled}
        onClick={onClick}
        type="button"
      >
        {label}
      </button>
    </div>
  );
}

function SelectionMark({ selected }) {
  return (
    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${selected
      ? "border-[var(--primary)] bg-[var(--primary)] text-white"
      : "border-[var(--border-strong)] bg-[var(--surface-elevated)]"}`}>
      {selected && <Check aria-hidden="true" size={14} strokeWidth={3} />}
    </span>
  );
}

function ActionMenuButton({ danger = false, icon: Icon, label, onClick }) {
  return (
    <button className={`flex min-h-11 items-center gap-2 rounded-lg px-2.5 text-left text-xs font-extrabold ${danger ? "text-red-500" : "text-[var(--text-secondary)]"}`} onClick={onClick} type="button">
      <Icon aria-hidden="true" size={15} /> {label}
    </button>
  );
}

function SummaryMetric({ compact = false, label, value }) {
  return (
    <div>
      <p className={`${compact ? "text-[10px]" : "text-xs"} font-bold uppercase tracking-[0.07em] text-[var(--text-muted)]`}>{label}</p>
      <p className={`${compact ? "mt-1 text-sm" : "mt-1 text-2xl"} font-extrabold`}>{value}</p>
    </div>
  );
}

function StatusLead({ icon: Icon, label }) {
  return (
    <div className="mb-3 flex items-center gap-2 text-emerald-600">
      <Icon aria-hidden="true" size={18} />
      <p className="text-sm font-extrabold">{label}</p>
    </div>
  );
}

function ReviewSection({ children, icon: Icon, title }) {
  return (
    <Card>
      <div className="mb-3 flex items-center gap-2 text-[var(--text-muted)]">
        <Icon aria-hidden="true" size={17} />
        <h2 className="text-xs font-extrabold uppercase tracking-[0.09em]">{title}</h2>
      </div>
      {children}
    </Card>
  );
}

function formatWorkoutContext(draft) {
  if (draft.mode === TRAINING_LOGGER_MODES.LIVE) return draft.startedAtLabel ?? "In progress";
  return formatDate(draft.workoutDate);
}

function formatDate(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  if (![year, month, day].every(Number.isFinite)) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" })
    .format(new Date(year, month - 1, day, 12));
}

function formatTimeRange(workout) {
  if (workout.startTime && workout.endTime) return `${workout.startTime}–${workout.endTime}`;
  if (workout.startTime) return `Started ${workout.startTime}`;
  if (workout.endTime) return `Ended ${workout.endTime}`;
  return null;
}

function getEvidenceReviewDisposition(canonicalOwnerType) {
  if (canonicalOwnerType === APPLE_WORKOUT_CANONICAL_OWNER_TYPES.TRAINING_SESSION) {
    return "Linked to detailed workout";
  }
  if (canonicalOwnerType === APPLE_WORKOUT_CANONICAL_OWNER_TYPES.CARDIO_WORKOUT) {
    return "Add as separate cardio workout";
  }
  return "Add as separate activity record";
}

function formatLoad(load) {
  return Number(load) === 0 ? "bodyweight" : `${load} lb`;
}
