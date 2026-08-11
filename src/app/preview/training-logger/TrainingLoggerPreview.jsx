"use client";

import { useMemo, useState } from "react";
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
import Card from "../../../components/ui/Card";
import {
  acceptTrainingCategorySuggestion,
  addTrainingExercise,
  addTrainingSet,
  APPLE_HEALTH_MATCH_STATES,
  applyProgressionSuggestion,
  assignTrainingVariant,
  buildEvidenceReviewHandoff,
  buildTrainingWorkoutSummary,
  canContinueFromReconciliation,
  continueWithoutAppleHealthMatch,
  createTrainingLoggerPreviewDraft,
  createTrainingSuperset,
  getSupersetContext,
  goToTrainingLoggerStep,
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
  selectAppleHealthMatch,
  setAppleHealthMatchState,
  toggleTrainingCategory,
  TRAINING_LOGGER_CATEGORY_SUGGESTION,
  TRAINING_LOGGER_MODES,
  TRAINING_LOGGER_STEPS,
  TRAINING_LOGGER_VARIANT_OPTIONS,
  toggleTrainingSetCompletion,
  updateTrainingSet,
  updateWorkoutContext,
} from "./TrainingLoggerPreviewState";

export default function TrainingLoggerPreview({ initialDate }) {
  const [draft, setDraft] = useState(() => createTrainingLoggerPreviewDraft({
    workoutDate: initialDate,
  }));
  const [search, setSearch] = useState("");
  const [openMenuId, setOpenMenuId] = useState(null);
  const [variantPickerId, setVariantPickerId] = useState(null);
  const [supersetPickerId, setSupersetPickerId] = useState(null);
  const [removeExerciseId, setRemoveExerciseId] = useState(null);

  function resetPreview() {
    setDraft(createTrainingLoggerPreviewDraft({ workoutDate: initialDate }));
    setSearch("");
    setOpenMenuId(null);
    setVariantPickerId(null);
    setSupersetPickerId(null);
    setRemoveExerciseId(null);
  }

  function navigate(step) {
    setDraft((current) => goToTrainingLoggerStep(current, step));
    setSearch("");
  }

  return (
    <main className="min-h-screen bg-[var(--surface)] text-[var(--text-primary)]">
      <div className="mx-auto min-h-screen w-full max-w-[393px] px-4 pb-36 pt-5">
        <PreviewBanner compact={draft.step === TRAINING_LOGGER_STEPS.LOGGER} />

        {draft.step === TRAINING_LOGGER_STEPS.ENTRY && (
          <EntryScreen
            onChooseMode={(mode) => setDraft((current) =>
              initializeTrainingLoggerMode(current, mode)
            )}
          />
        )}

        {draft.step === TRAINING_LOGGER_STEPS.CATEGORIES && (
          <CategoryScreen
            draft={draft}
            onBack={resetPreview}
            onContinue={() => navigate(TRAINING_LOGGER_STEPS.EXERCISES)}
            onSelectSuggestion={() => setDraft((current) =>
              acceptTrainingCategorySuggestion(current)
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
            draft={draft}
            onBack={() => navigate(
              draft.step === TRAINING_LOGGER_STEPS.ADD_EXERCISE
                ? TRAINING_LOGGER_STEPS.LOGGER
                : TRAINING_LOGGER_STEPS.CATEGORIES
            )}
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
            onFinish={() => navigate(TRAINING_LOGGER_STEPS.SUMMARY)}
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
            onBack={() => navigate(TRAINING_LOGGER_STEPS.LOGGER)}
            onContinue={() => navigate(TRAINING_LOGGER_STEPS.RECONCILIATION)}
          />
        )}

        {draft.step === TRAINING_LOGGER_STEPS.RECONCILIATION && (
          <ReconciliationScreen
            draft={draft}
            onBack={() => navigate(TRAINING_LOGGER_STEPS.SUMMARY)}
            onContinue={() => navigate(TRAINING_LOGGER_STEPS.EVIDENCE_REVIEW)}
            onContinueWithoutMatch={() => setDraft((current) =>
              continueWithoutAppleHealthMatch(current)
            )}
            onSelectMatch={(matchId) => setDraft((current) =>
              selectAppleHealthMatch(current, matchId)
            )}
            onSetMatchState={(matchState) => setDraft((current) =>
              setAppleHealthMatchState(current, matchState)
            )}
          />
        )}

        {draft.step === TRAINING_LOGGER_STEPS.EVIDENCE_REVIEW && (
          <EvidenceReviewScreen
            draft={draft}
            onBack={() => navigate(TRAINING_LOGGER_STEPS.RECONCILIATION)}
            onComplete={() => navigate(TRAINING_LOGGER_STEPS.COMPLETE)}
          />
        )}

        {draft.step === TRAINING_LOGGER_STEPS.COMPLETE && (
          <CompletionScreen draft={draft} onRestart={resetPreview} />
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

function EntryScreen({ onChooseMode }) {
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
  const suggestionAccepted = draft.acceptedSuggestionId === TRAINING_LOGGER_CATEGORY_SUGGESTION.id;
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

      <button className="mb-5 w-full text-left" onClick={onSelectSuggestion} type="button">
        <Card className={suggestionAccepted ? "border-[var(--primary)]" : ""} variant="accent">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="mb-1.5 flex items-center gap-2 text-[var(--primary)]">
                <Sparkles aria-hidden="true" size={16} />
                <span className="text-xs font-extrabold uppercase tracking-[0.1em]">Suggested today</span>
              </div>
              <p className="text-lg font-extrabold">{TRAINING_LOGGER_CATEGORY_SUGGESTION.label}</p>
              <p className="mt-1 text-sm font-medium text-[var(--text-secondary)]">
                {TRAINING_LOGGER_CATEGORY_SUGGESTION.reason}
              </p>
            </div>
            <SelectionMark selected={suggestionAccepted} />
          </div>
        </Card>
      </button>

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

function ExerciseSelectionScreen({ adding, draft, onBack, onContinue, onSearch, onToggleExercise, search }) {
  const available = useMemo(() => listTrainingLoggerExercises({
    categories: draft.selectedCategories,
    search,
  }), [draft.selectedCategories, search]);
  const selectedIds = new Set(draft.exercises.map((exercise) => exercise.canonicalExerciseId));
  return (
    <section>
      <PageHeader
        description={adding
          ? "Add another movement without leaving your workout."
          : `Showing canonical exercises for ${draft.selectedCategories.join(" + ")}.`}
        onBack={onBack}
        step={adding ? "In workout" : "2 of 2"}
        title={adding ? "Add an exercise" : "Choose exercises"}
      />

      <label className="relative mb-4 block">
        <Search aria-hidden="true" className="absolute left-3.5 top-3.5 text-[var(--text-subtle)]" size={18} />
        <span className="sr-only">Search exercises</span>
        <input
          className="h-12 w-full rounded-2xl border border-[var(--divider)] bg-[var(--input-bg)] pl-11 pr-4 text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--primary)]"
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Search exercises"
          type="search"
          value={search}
        />
      </label>

      <div className="space-y-2">
        {available.map((exercise) => {
          const selected = selectedIds.has(exercise.id);
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
                <span className="block truncate text-sm font-extrabold">{exercise.name}</span>
                <span className="mt-1 block truncate text-xs font-semibold text-[var(--text-muted)]">
                  {adding && selected ? "Already in workout" : `${exercise.body_region} · ${exercise.movement_pattern}`}
                </span>
              </span>
              <SelectionMark selected={selected} />
            </button>
          );
        })}
        {available.length === 0 && (
          <Card className="text-center" variant="soft">
            <p className="font-extrabold">No matching exercises</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Try a broader search.</p>
          </Card>
        )}
      </div>

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
  onLinkSuperset,
  onRemoveSet,
  onRemoveSuperset,
  onRemoveVariant,
  onRequestRemove,
  onSetMenu,
  onSetSupersetPicker,
  onSetVariantPicker,
  onUpdateSet,
}) {
  const summary = buildTrainingWorkoutSummary(draft);
  return (
    <section>
      <header className="mb-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <div className="mb-1 flex items-center gap-2">
              {draft.mode === TRAINING_LOGGER_MODES.LIVE && (
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50 motion-reduce:animate-none" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                </span>
              )}
              <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-[var(--primary)]">
                {draft.mode === TRAINING_LOGGER_MODES.LIVE ? "Workout in progress" : "Past workout"}
              </p>
            </div>
            <h1 className="text-3xl font-extrabold tracking-[-0.03em]">Training Logger</h1>
          </div>
          <span className="rounded-full bg-[var(--surface-muted)] px-3 py-1.5 text-xs font-extrabold text-[var(--text-secondary)]">
            {summary.confirmedSetCount}/{summary.setCount} sets
          </span>
        </div>
        <p className="text-sm font-semibold text-[var(--text-secondary)]">
          {formatWorkoutContext(draft)} · {draft.exercises.length} exercises
        </p>
      </header>

      <div className="space-y-3">
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
        className="mt-3 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-soft)] text-sm font-extrabold text-[var(--primary)]"
        onClick={onAddExercise}
        type="button"
      >
        <CirclePlus aria-hidden="true" size={19} />
        Add Exercise
      </button>

      <BottomAction label="Finish Workout" onClick={onFinish} />
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
  return (
    <Card padding="none" className={superset ? "border-l-4 border-l-[var(--primary)]" : ""}>
      <div className="p-3 pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-extrabold leading-tight">{exercise.name}</h2>
            {exercise.executionVariant && (
              <p className="mt-1 text-sm font-extrabold text-[var(--primary)]">
                {exercise.executionVariant.label}
              </p>
            )}
            {superset && (
              <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)]">
                <Link2 aria-hidden="true" size={13} />
                Superset with {superset.partners.map((partner) => partner.name).join(" + ")}
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
                  Add another exercise before creating a Superset.
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

        <div className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-[var(--surface-muted)] px-3 py-2">
          <div className="flex shrink-0 items-baseline gap-2">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.06em] text-[var(--text-muted)]">Previous</p>
            <p className="text-sm font-extrabold">
              {exercise.previousPerformance.reps} × {formatLoad(exercise.previousPerformance.load)}
            </p>
          </div>
          <p className="truncate text-right text-[11px] font-semibold text-[var(--text-subtle)]">
            {exercise.previousPerformance.context}
          </p>
        </div>
      </div>

      <ProgressionCard
        exercise={exercise}
        onApplySuggestion={onApplySuggestion}
        onKeepPrevious={onKeepPrevious}
      />

      <div className="px-3 pb-3 pt-2">
        <div className="mb-1 grid grid-cols-[32px_minmax(58px,1fr)_minmax(68px,1fr)_44px_32px] items-center gap-2 px-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-[var(--text-subtle)]">
          <span>Set</span><span>Reps</span><span>Load</span><span className="text-center">Done</span><span />
        </div>
        <div className="space-y-1">
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
        <button
          className="mt-2 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--surface-soft)] text-xs font-extrabold text-[var(--primary)]"
          onClick={onAddSet}
          type="button"
        >
          <Plus aria-hidden="true" size={16} /> Add Set
        </button>
      </div>
    </Card>
  );
}

function SetRow({ onRemove, onToggle, onUpdate, set, showRemove }) {
  return (
    <div className={`grid grid-cols-[32px_minmax(58px,1fr)_minmax(68px,1fr)_44px_32px] items-center gap-2 rounded-xl px-1 ${set.confirmed
      ? "bg-[var(--surface-success)]"
      : "bg-[var(--surface-muted)]"}`}>
      <span className="text-center text-sm font-extrabold">{set.order}</span>
      <input
        aria-label={`Set ${set.order} reps`}
        className="h-11 min-w-0 rounded-lg border border-[var(--divider)] bg-[var(--input-bg)] px-2 text-center text-base font-extrabold text-[var(--text-primary)]"
        inputMode="numeric"
        min="0"
        onChange={(event) => onUpdate({ reps: event.target.value, confirmed: false })}
        type="number"
        value={set.reps}
      />
      <label className="relative min-w-0">
        <span className="sr-only">Set {set.order} load in pounds</span>
        <input
          className="h-11 w-full min-w-0 rounded-lg border border-[var(--divider)] bg-[var(--input-bg)] px-1 pr-6 text-center text-base font-extrabold text-[var(--text-primary)]"
          inputMode="decimal"
          min="0"
          onChange={(event) => onUpdate({ load: event.target.value, confirmed: false })}
          type="number"
          value={set.load}
        />
        <span className="pointer-events-none absolute right-1.5 top-3.5 text-[9px] font-extrabold text-[var(--text-subtle)]">lb</span>
      </label>
      <button
        aria-label={set.confirmed ? `Mark set ${set.order} incomplete` : `Mark set ${set.order} done`}
        aria-pressed={set.confirmed}
        className={`flex h-11 w-11 items-center justify-center rounded-xl border ${set.confirmed
          ? "border-emerald-500 bg-emerald-500 text-white"
          : "border-[var(--divider)] bg-[var(--surface-elevated)] text-[var(--text-subtle)]"}`}
        onClick={onToggle}
        type="button"
      >
        <Check aria-hidden="true" size={19} strokeWidth={3} />
      </button>
      {showRemove ? (
        <button aria-label={`Remove set ${set.order}`} className="flex h-11 w-8 items-center justify-center text-[var(--text-subtle)]" onClick={onRemove} type="button">
          <Minus aria-hidden="true" size={16} />
        </button>
      ) : <span />}
    </div>
  );
}

function ProgressionCard({ exercise, onApplySuggestion, onKeepPrevious }) {
  const recommendation = exercise.progressionRecommendation;
  const opportunity = recommendation.state === PROGRESSION_STATES.OPPORTUNITY;
  const suggestionSelected = exercise.progressionChoice === PROGRESSION_CHOICES.SUGGESTION;
  const previousSelected = exercise.progressionChoice === PROGRESSION_CHOICES.PREVIOUS;
  return (
    <div className={`border-y border-[var(--divider)] px-3 py-2 ${opportunity
      ? "bg-[var(--surface-accent)]"
      : recommendation.state === PROGRESSION_STATES.RECOVER
        ? "bg-[var(--surface-warning)]"
        : "bg-[var(--surface-soft)]"}`}>
      <div className="flex items-start gap-2">
        <Sparkles aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--primary)]" size={16} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-[var(--primary)]">
              {recommendation.eyebrow}
            </p>
            <p className="shrink-0 text-xs font-extrabold">{recommendation.prescription}</p>
          </div>
          <p className="mt-1 text-xs font-semibold leading-5 text-[var(--text-secondary)]">
            {recommendation.message}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              aria-pressed={suggestionSelected}
              className={`inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border px-2 text-xs font-extrabold transition ${suggestionSelected
                ? "border-[var(--primary)] bg-[var(--primary)] text-white shadow-[var(--shadow-card)]"
                : "border-[var(--divider)] bg-[var(--surface-elevated)] text-[var(--text-secondary)]"}`}
              onClick={onApplySuggestion}
              type="button"
            >
              {suggestionSelected && <Check aria-hidden="true" size={14} strokeWidth={3} />}
              Use suggestion
            </button>
            <button
              aria-pressed={previousSelected}
              className={`inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border px-2 text-xs font-extrabold transition ${previousSelected
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
      </div>
    </div>
  );
}

function SummaryScreen({ draft, onBack, onContinue }) {
  const summary = buildTrainingWorkoutSummary(draft);
  return (
    <section>
      <PageHeader
        description="Your workout structure is ready. Nothing has been written to production."
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
            Simulated duration · {summary.durationMinutes} min
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
      <BottomAction label="Match Apple Health" onClick={onContinue} />
    </section>
  );
}

function ReconciliationScreen({
  draft,
  onBack,
  onContinue,
  onContinueWithoutMatch,
  onSelectMatch,
  onSetMatchState,
}) {
  const { reconciliation } = draft;
  const canContinue = canContinueFromReconciliation(draft);
  return (
    <section>
      <PageHeader
        description="Apple Health supplies the evidence shell. PhysiqueOS keeps the detailed strength structure."
        onBack={onBack}
        step="Workout reconciliation"
        title="Match Apple Health"
      />

      <fieldset className="mb-4">
        <legend className="mb-2 text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--text-muted)]">
          Preview match scenario
        </legend>
        <div className="grid grid-cols-3 gap-2">
          {[
            [APPLE_HEALTH_MATCH_STATES.STRONG, "Strong"],
            [APPLE_HEALTH_MATCH_STATES.MULTIPLE, "Multiple"],
            [APPLE_HEALTH_MATCH_STATES.NONE, "No match"],
          ].map(([value, label]) => (
            <button
              aria-pressed={reconciliation.matchState === value}
              className={`min-h-11 rounded-xl border px-2 text-xs font-extrabold ${reconciliation.matchState === value
                ? "border-[var(--primary)] bg-[var(--surface-accent)] text-[var(--primary)]"
                : "border-[var(--divider)] bg-[var(--surface-elevated)]"}`}
              key={value}
              onClick={() => onSetMatchState(value)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      {reconciliation.matchState === APPLE_HEALTH_MATCH_STATES.STRONG && (
        <>
          <StatusLead icon={Apple} label="Apple Health workout found" />
          <HealthMatchCard
            match={reconciliation.candidates[0]}
            onSelect={() => onSelectMatch(reconciliation.candidates[0].id)}
            selected={reconciliation.selectedMatchId === reconciliation.candidates[0].id}
            selectLabel={reconciliation.selectedMatchId ? "Workout linked" : "Link Workout"}
          />
        </>
      )}

      {reconciliation.matchState === APPLE_HEALTH_MATCH_STATES.MULTIPLE && (
        <>
          <StatusLead icon={Apple} label="Choose the matching workout" />
          <p className="mb-3 text-sm font-semibold leading-6 text-[var(--text-secondary)]">
            More than one session could match. PhysiqueOS won’t choose silently.
          </p>
          <div className="space-y-3">
            {reconciliation.candidates.map((match) => (
              <HealthMatchCard
                key={match.id}
                match={match}
                onSelect={() => onSelectMatch(match.id)}
                selected={reconciliation.selectedMatchId === match.id}
                selectLabel={reconciliation.selectedMatchId === match.id ? "Selected" : "Select Workout"}
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
            className={`mt-4 min-h-12 w-full rounded-xl border text-sm font-extrabold ${reconciliation.continueWithoutMatch
              ? "border-emerald-500 bg-[var(--surface-success)] text-emerald-700"
              : "border-[var(--divider)] bg-[var(--surface-elevated)]"}`}
            onClick={onContinueWithoutMatch}
            type="button"
          >
            {reconciliation.continueWithoutMatch ? "Continuing without match" : "Continue without Apple Health workout"}
          </button>
        </Card>
      )}

      <BottomAction disabled={!canContinue} label="Continue to Evidence Review" onClick={onContinue} />
    </section>
  );
}

function HealthMatchCard({ match, onSelect, selected, selectLabel }) {
  return (
    <Card className={selected ? "border-emerald-500" : ""}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold">{match.type}</h2>
          <p className="mt-1 text-sm font-semibold text-[var(--text-secondary)]">
            {match.startTime}–{match.endTime}
          </p>
        </div>
        {selected && <CheckCircle2 aria-label="Selected" className="text-emerald-500" size={22} />}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-[var(--surface-muted)] p-3">
        <SummaryMetric compact label="Duration" value={`${match.durationMinutes} min`} />
        <SummaryMetric compact label="Active calories" value={match.activeCalories} />
      </div>
      <button
        className={`mt-3 min-h-12 w-full rounded-xl text-sm font-extrabold ${selected
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

function EvidenceReviewScreen({ draft, onBack, onComplete }) {
  const handoff = buildEvidenceReviewHandoff(draft);
  const summary = handoff.workoutDetails;
  const variantContexts = handoff.executionContexts;
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
          <p className="text-lg font-extrabold">{summary.exerciseCount} exercises · {summary.setCount} sets</p>
          <p className="mt-1 text-sm font-semibold text-[var(--text-secondary)]">{formatWorkoutContext(draft)}</p>
        </ReviewSection>

        <ReviewSection icon={Apple} title="Apple Health">
          {handoff.appleHealth.status === "matched" ? (
            <>
              <p className="font-extrabold">
                {handoff.appleHealth.workout.type} · {handoff.appleHealth.workout.durationMinutes} min · {handoff.appleHealth.workout.activeCalories} active calories
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-emerald-600"><CheckCircle2 aria-hidden="true" size={15} /> Matched</p>
            </>
          ) : (
            <p className="font-extrabold">No workout linked · Continue with detailed log</p>
          )}
        </ReviewSection>

        {(variantContexts.length > 0 || handoff.exerciseRelationshipGroups.length > 0) && (
          <ReviewSection icon={Link2} title="Execution Context">
            <div className="space-y-2">
              {variantContexts.map((context) => (
                <p className="text-sm font-extrabold" key={context.exerciseOccurrenceId}>
                  {context.exerciseName} · <span className="text-[var(--primary)]">{context.executionVariant.label}</span>
                </p>
              ))}
              {handoff.exerciseRelationshipGroups.map((group) => {
                const names = group.memberExerciseIds.map((id) =>
                  draft.exercises.find((exercise) => exercise.id === id)?.name
                ).filter(Boolean);
                return <p className="text-sm font-extrabold" key={group.id}>{names.join(" + ")} · <span className="text-[var(--primary)]">Superset</span></p>;
              })}
            </div>
          </ReviewSection>
        )}
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

function formatLoad(load) {
  return Number(load) === 0 ? "bodyweight" : `${load} lb`;
}
