"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Activity, AlertTriangle, Camera, Check, Dumbbell, FileText, HeartPulse, Scale, Utensils } from "lucide-react";
import Card from "../components/ui/Card";
import EvidenceImage from "../components/progress/EvidenceImage";
import {
  createEvidenceReviewPresentation,
  formatExerciseSet,
  toggleEvidenceReviewItemDecision,
} from "../domain/services/EvidenceReviewPresentationService";
import {
  listExercisesWithoutCanonicalIdentity,
  listUnresolvedProvisionalExercises,
  searchCanonicalExerciseOptions,
} from "../domain/services/CanonicalExerciseLibraryService";
import { createEvidenceExperiencePresentation } from "../domain/services/EvidenceExperiencePresentationService";
import { createEvidenceSuccessNavigation } from "../domain/services/EvidenceSuccessNavigationService";
import { createTrainingPerformanceSuccessPresentation } from "../domain/services/TrainingPerformanceSuccessPresentationService";
import {
  CanonicalProgressPhotoCategories,
  getCanonicalProgressPhotoCategory,
  getProgressPhotoDisplayLabel,
} from "../domain/models/progressPhotoPoseVocabulary";
import {
  resolveCanonicalTrainingMuscleGroup,
  searchCanonicalTrainingMuscleGroups,
  suggestCanonicalTrainingMuscleGroup,
} from "../domain/models/trainingMuscleGroupIdentity";
import { parsePrivateMediaReference } from "../contracts/v1/mediaIdentifiers";
import { validateDexaScan } from "../domain/services/DEXAContract";

const ICONS = { activity: Activity, dexa: FileText, nutrition: Utensils, photos: Camera, training: Dumbbell, weight: Scale };

export default function EvidenceReviewScreen({ canonicalExercises = [], confirmAction, dexaEditOutcome = null, dexaMeasurementsAction, discardAction, exerciseRelationshipAction, exerciseResolutionAction, exerciseVariantAction, photoPoseAction, photoSessionMetadataAction, recoveryContext = null, reprocessAction, reprocessOutcome = null, review }) {
  const evidencePackage = review.interpretedEvidence ?? {};
  const [itemDecisions, setItemDecisions] = useState(() => review.itemDecisions ?? {});
  const [nutritionDispositions, setNutritionDispositions] = useState(() =>
    Object.fromEntries((evidencePackage.evidence_objects ?? [])
      .filter((object) => object.evidence_type === "nutrition")
      .map((object) => [
        object.id,
        object.reconciliation?.nutrition?.disposition ?? "",
      ]))
  );
  const presentation = createEvidenceReviewPresentation({ evidencePackage, itemDecisions });
  const experience = createEvidenceExperiencePresentation(review);
  const trainingAchievements = createTrainingPerformanceSuccessPresentation(review);
  const status = review.status;
  const canEdit = ["pending", "commit_failed"].includes(status);
  const canContinue = hasCommitFailure(review);
  const blockingPhotoIssue = presentation.items.some((item) => item.included && hasIncompletePhotoSet(item.object));
  const blockingPhotoSessionMetadata = presentation.items.some((item) => item.included && hasIncompletePhotoSessionMetadata(item.object));
  const evidenceWithLocalDecisions = {
    ...evidencePackage,
    evidence_objects: (evidencePackage.evidence_objects ?? []).map((object) => ({
      ...object,
      removed: itemDecisions[object.id]?.included === false,
    })),
  };
  const submittedEvidencePackage = {
    ...evidencePackage,
    evidence_objects: (evidencePackage.evidence_objects ?? []).map((object) =>
      object.evidence_type !== "nutrition" ? object : ({
        ...object,
        reconciliation: {
          ...(object.reconciliation ?? {}),
          nutrition: {
            ...(object.reconciliation?.nutrition ?? {}),
            disposition: nutritionDispositions[object.id] || null,
          },
        },
      })
    ),
  };
  const unresolvedExercises = listUnresolvedProvisionalExercises(
    evidenceWithLocalDecisions
  );
  const blockingExercises = listExercisesWithoutCanonicalIdentity(
    evidenceWithLocalDecisions,
    { canonicalExercises }
  );
  const blockingNutrition = presentation.items.filter((item) =>
    item.included &&
    item.object.reconciliation?.nutrition?.dispositionStatus ===
      "requires_choice" &&
    !nutritionDispositions[item.object.id]
  );
  const blockedNutritionInvariant = presentation.items.filter((item) =>
    item.included &&
    item.object.reconciliation?.nutrition?.dispositionStatus ===
      "blocked_duplicate_active_days"
  );
  const blockingStructuralIssues = presentation.items.filter((item) =>
    item.included && (item.structuralReviewIssues ?? []).length > 0
  );
  const blockingDexaIssues = presentation.items.filter((item) =>
    item.included && item.type === "dexa" && !validateDexaScan(item.object, { production: true }).valid
  );
  const toggleItem = (item) => {
    setItemDecisions((current) =>
      toggleEvidenceReviewItemDecision(current, item.object.id, item.included)
    );
  };

  if (status === "confirmed") return <EvidenceSavedScreen experience={experience} trainingAchievements={trainingAchievements} />;

  return (
    <main className="app-surface min-h-screen">
      <div className="mx-auto max-w-[393px] px-4 pb-32 pt-8 sm:py-10">
        <Link className="inline-flex min-h-11 items-center text-sm font-bold text-[var(--primary)]" href={recoveryContext?.returnTo ?? "/log"}>← {recoveryContext ? "Back to Morning Check-In" : "Back to Log"}</Link>
        <header aria-label={experience.reviewingTitle} aria-live="polite" className="mt-3">
          <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[var(--primary)]">{experience.eyebrow}</p>
          <h1 className="mt-2 text-3xl font-extrabold text-[var(--text-primary)]">Does this look right?</h1>
          {experience.friendlyDate && <p className="mt-3 text-sm font-bold text-[var(--text-secondary)]">{experience.friendlyDate}</p>}
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{experience.reviewingBody} Review what PhysiqueOS understood before saving it. You can exclude anything that should not become part of your history.</p>
        </header>

        <div className="mt-6 space-y-4">
          {presentation.items.map((item) => (
            <EvidenceCard canEdit={canEdit} dexaMeasurementsAction={dexaMeasurementsAction} exerciseRelationshipAction={exerciseRelationshipAction} exerciseVariantAction={exerciseVariantAction} item={item} key={item.object.id} nutritionDisposition={nutritionDispositions[item.object.id] ?? ""} onNutritionDisposition={(value) => setNutritionDispositions((current) => ({ ...current, [item.object.id]: value }))} onToggle={toggleItem} photoPoseAction={photoPoseAction} photoSessionMetadataAction={photoSessionMetadataAction} recoveryContext={recoveryContext} review={review} />
          ))}
        </div>

        {unresolvedExercises.length > 0 && (
          <section aria-label="New exercises" className="mt-6 space-y-4">
            {unresolvedExercises.map((exercise) => (
              <NewExerciseCard
                action={exerciseResolutionAction}
                canonicalExercises={canonicalExercises}
                exercise={exercise}
                key={exercise.provisionalExercise.provisionalExerciseId}
                recoveryContext={recoveryContext}
                review={review}
              />
            ))}
          </section>
        )}

        {hasCommitFailure(review) && (
          <Card className="mt-6" variant="warning">
            <div className="flex gap-3">
              <AlertTriangle aria-hidden="true" size={20} />
              <div>
                <h2 className="font-extrabold">{`Your ${experience.noun} is saved`}</h2>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  We couldn’t finish the follow-up step. Continue without re-uploading or repeating completed work.
                </p>
              </div>
            </div>
          </Card>
        )}

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
          {blockingPhotoIssue && <p className="text-sm font-semibold text-[var(--text-secondary)]">Choose a pose for every included photo before saving.</p>}
          {blockingPhotoSessionMetadata && <p className="text-sm font-semibold text-[var(--text-secondary)]">Review the shared photo-session details before saving.</p>}
          {blockingExercises.length > 0 && <p className="text-sm font-semibold text-[var(--text-secondary)]">{blockingExercises.length} exercise {blockingExercises.length === 1 ? "identity needs" : "identities need"} details before this workout can be saved.</p>}
          {blockingStructuralIssues.length > 0 && <p className="text-sm font-semibold text-[var(--text-secondary)]">Review or remove the unresolved Superset structure before saving.</p>}
          {blockingDexaIssues.length > 0 && <p className="text-sm font-semibold text-[var(--text-secondary)]">Review the required DEXA measurements before saving.</p>}
          {blockingNutrition.length > 0 && <p className="text-sm font-semibold text-[var(--text-secondary)]">Choose how to update the existing Nutrition Day before saving.</p>}
          {blockedNutritionInvariant.length > 0 && <p className="text-sm font-semibold text-[var(--text-secondary)]">This date has conflicting active Nutrition records and needs repair before another update can be saved.</p>}
        </Card>

        <form action={confirmAction} className="mt-6">
          <input name="reviewId" type="hidden" value={review.id} />
          <EvidenceRecoveryContextFields context={recoveryContext}/>
          <textarea className="hidden" name="evidenceJson" readOnly value={JSON.stringify(submittedEvidencePackage)} />
          <textarea className="hidden" name="itemDecisionsJson" readOnly value={JSON.stringify(itemDecisions)} />
          {canEdit || canContinue ? (
            <ConfirmButton blockingCount={blockingExercises.length + blockingStructuralIssues.length} disabled={blockingExercises.length > 0 || blockingStructuralIssues.length > 0 || blockingDexaIssues.length > 0 || blockingNutrition.length > 0 || blockedNutritionInvariant.length > 0 || (!canContinue && (!presentation.summary.included || blockingPhotoIssue || blockingPhotoSessionMetadata))} retry={canContinue} savingLabel={experience.savingLabel} />
          ) : <Card><p className="font-bold text-[var(--text-primary)]">This review was {status}.</p></Card>}
        </form>
        {canEdit && reprocessAction && <form action={reprocessAction} className="mt-3"><input name="reviewId" type="hidden" value={review.id} /><EvidenceRecoveryContextFields context={recoveryContext}/><ReprocessButton /></form>}
        {reprocessOutcome === "updated" && <Card className="mt-3" variant="soft"><p aria-live="polite" className="text-sm font-bold text-[var(--text-primary)]">Review updated from the original evidence.</p></Card>}
        {reprocessOutcome === "current" && <Card className="mt-3" variant="soft"><p aria-live="polite" className="text-sm font-bold text-[var(--text-primary)]">No newer interpretation is available.</p></Card>}
        {reprocessOutcome === "failed" && <Card className="mt-3" variant="warning"><p aria-live="assertive" className="text-sm font-bold text-[var(--text-primary)]">Re-read failed. Your previous review is still intact.</p></Card>}
        {dexaEditOutcome === "updated" && <Card className="mt-3" variant="soft"><p aria-live="polite" className="text-sm font-bold text-[var(--text-primary)]">DEXA measurements updated. Review them once more before saving.</p></Card>}
        {dexaEditOutcome === "stale" && <Card className="mt-3" variant="warning"><p aria-live="assertive" className="text-sm font-bold text-[var(--text-primary)]">This review changed before the DEXA correction was saved. Review the current values and try again.</p></Card>}
        {canEdit && <div className="mt-3 grid grid-cols-2 gap-3">
          <Link className="flex min-h-12 items-center justify-center rounded-2xl border border-[var(--divider)] px-3 text-center text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100" href={recoveryContext?.returnTo ?? "/log"}>Save and return later</Link>
          <DiscardReviewControl action={discardAction} recoveryContext={recoveryContext} reviewId={review.id} />
        </div>}
      </div>
    </main>
  );
}

function EvidenceCard({ canEdit, dexaMeasurementsAction, exerciseRelationshipAction, exerciseVariantAction, item, nutritionDisposition, onNutritionDisposition, onToggle, photoPoseAction, photoSessionMetadataAction, recoveryContext, review }) {
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

      {item.type === "dexa" && canEdit && dexaMeasurementsAction && (
        <DexaMeasurementEditor action={dexaMeasurementsAction} item={item} recoveryContext={recoveryContext} review={review} />
      )}

      {item.strengthSetDetails?.length > 0 && (
        <RecordedStrengthSetDetails exercises={item.strengthSetDetails} />
      )}

      {item.type === "nutrition" && item.object.reconciliation?.nutrition?.targetCanonicalId && (
        <NutritionReplacementControl
          canEdit={canEdit && item.included}
          disposition={nutritionDisposition}
          onChange={onNutritionDisposition}
          relationship={item.object.reconciliation.nutrition}
        />
      )}

      {item.exercises?.length > 0 && (
        <section>
          <h3 className="text-sm font-extrabold text-[var(--text-primary)]">Exercises</h3>
          <div className="mt-3 space-y-4">
            {(item.exerciseRelationshipGroups ?? []).map((group) => (
              <div className="rounded-2xl border border-[var(--primary)]/25 bg-[var(--surface-accent)]/45 p-3" key={group.id}>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--primary)]">Superset</p>
                <div className="mt-3 space-y-4">
                  {group.members.map((exercise) => (
                    <GroupedExerciseReviewRow canEdit={canEdit} exercise={exercise} exerciseVariantAction={exerciseVariantAction} item={item} key={exercise.id} recoveryContext={recoveryContext} review={review} />
                  ))}
                </div>
                {canEdit && exerciseRelationshipAction && <SupersetEditor action={exerciseRelationshipAction} exercises={item.exercises} group={group} item={item} recoveryContext={recoveryContext} review={review} />}
              </div>
            ))}
            {(item.standaloneExercises ?? item.exercises).map((exercise, index) => (
              <div key={`${exercise.name}-${index}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-extrabold text-[var(--text-primary)]">{exercise.name}</p>
                    {exercise.executionVariant?.label && (
                      <p className="mt-0.5 text-xs font-bold text-[var(--primary)]">
                        Variant: {exercise.executionVariant.label}
                      </p>
                    )}
                  </div>
                  {exercise.provisionalExerciseId && (
                    <a
                      className="shrink-0 rounded-full bg-[var(--surface-warning)] px-2.5 py-1 text-xs font-extrabold text-[var(--text-primary)] underline decoration-transparent underline-offset-2 hover:decoration-current focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100"
                      href={`#new-exercise-${exercise.provisionalExerciseId}`}
                    >
                      New exercise
                    </a>
                  )}
                </div>
                {exercise.sets.length
                  ? <ul className="mt-1 space-y-1 text-sm text-[var(--text-secondary)]">{exercise.sets.map((set, setIndex) => <li key={`${set}-${setIndex}`}>• {set}</li>)}</ul>
                  : <p className="mt-1 text-sm text-[var(--text-muted)]">Set details unavailable</p>}
                {canEdit && exercise.canonicalExerciseId && exerciseVariantAction && (
                  <details className="mt-2 rounded-xl border border-[var(--divider)] px-3 py-2">
                    <summary className="cursor-pointer text-xs font-extrabold text-[var(--primary)]">
                      {exercise.executionVariant ? "Edit variant" : "Add variant"}
                    </summary>
                    <form action={exerciseVariantAction} className="mt-3 space-y-2">
                      <input name="reviewId" type="hidden" value={review.id} />
                      <input name="expectedUpdatedAt" type="hidden" value={review.updatedAt} />
                      <input name="evidenceObjectId" type="hidden" value={item.object.id} />
                      <input name="exerciseIndex" type="hidden" value={exercise.exerciseIndex} />
                      <EvidenceRecoveryContextFields context={recoveryContext}/>
                      <label className="block text-xs font-bold text-[var(--text-secondary)]" htmlFor={`variant-${item.object.id}-${exercise.exerciseIndex}`}>
                        Execution variant
                      </label>
                      <input
                        className="min-h-11 w-full rounded-xl border border-[var(--divider)] bg-[var(--surface-elevated)] px-3 text-sm font-semibold text-[var(--text-primary)]"
                        defaultValue={exercise.executionVariant?.label ?? ""}
                        id={`variant-${item.object.id}-${exercise.exerciseIndex}`}
                        name="variantLabel"
                        placeholder="Static Hold"
                      />
                      <div className="flex gap-2">
                        <button className="min-h-10 flex-1 rounded-xl bg-[var(--primary)] px-3 text-xs font-extrabold text-white" name="variantMode" type="submit" value="save">
                          Save variant
                        </button>
                        {exercise.executionVariant && (
                          <button className="min-h-10 rounded-xl border border-[var(--divider)] px-3 text-xs font-extrabold text-[var(--text-primary)]" name="variantMode" type="submit" value="remove">
                            Remove
                          </button>
                        )}
                      </div>
                    </form>
                  </details>
                )}
              </div>
            ))}
            {(item.structuralReviewIssues ?? []).map((issue) => (
              <div className="rounded-2xl border border-[var(--warning)] bg-[var(--surface-warning)] p-3" key={issue.id}>
                <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-primary)]">Superset needs review</p>
                <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{issue.message}</p>
                {canEdit && exerciseRelationshipAction && <SupersetEditor action={exerciseRelationshipAction} exercises={item.exercises} issue={issue} item={item} recoveryContext={recoveryContext} review={review} />}
              </div>
            ))}
          </div>
        </section>
      )}

      {item.meals?.length > 0 && (
        <section>
          <div className="flex items-end justify-between gap-3">
            <h3 className="text-sm font-extrabold text-[var(--text-primary)]">Meals</h3>
            <p className="text-xs font-semibold text-[var(--text-muted)]">
              {item.meals.reduce((count, meal) => count + meal.foodCount, 0)} foods
            </p>
          </div>
          <div className="mt-3 space-y-2">
            {item.meals.map((meal) => (
              <details className="rounded-xl border border-[var(--divider)] bg-[var(--surface-muted)]" key={meal.id ?? meal.name}>
                <summary className="cursor-pointer list-none px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-extrabold text-[var(--text-primary)]">{meal.name}</p>
                      <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{meal.summary}</p>
                    </div>
                    <span className="shrink-0 text-xs font-bold text-[var(--text-muted)]">
                      {meal.foodCount} {meal.foodCount === 1 ? "food" : "foods"}
                    </span>
                  </div>
                </summary>
                <ul className="space-y-3 border-t border-[var(--divider)] px-3 py-3">
                  {meal.foods.map((food, index) => (
                    <li className="flex items-start justify-between gap-3 text-sm" key={food.id ?? `${food.name}-${index}`}>
                      <div>
                        <p className="font-bold text-[var(--text-primary)]">{food.name}</p>
                        {(food.brand || food.serving) && (
                          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                            {[food.brand, food.serving].filter(Boolean).join(" · ")}
                          </p>
                        )}
                      </div>
                      {food.calories && <span className="shrink-0 font-bold text-[var(--text-secondary)]">{food.calories}</span>}
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
          {item.reconciliation && <p className="mt-3 text-xs leading-5 text-[var(--text-muted)]">{item.reconciliation}</p>}
        </section>
      )}

      {item.type === "photos" && <PhotoPreviews action={photoPoseAction} canEdit={canEdit && item.included} metadataAction={photoSessionMetadataAction} object={item.object} recoveryContext={recoveryContext} review={review} />}
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

function RecordedStrengthSetDetails({ exercises }) {
  return (
    <section>
      <h3 className="text-sm font-extrabold text-[var(--text-primary)]">Recorded sets</h3>
      <div className="mt-3 divide-y divide-[var(--divider)] rounded-2xl border border-[var(--divider)] bg-[var(--surface-muted)] px-3">
        {exercises.map((exercise, index) => (
          <div className="py-3" key={`${exercise.name}-${index}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-extrabold text-[var(--text-primary)]">{exercise.name}</p>
                {exercise.variantLabel && (
                  <p className="mt-0.5 text-xs font-bold text-[var(--primary)]">
                    Variant: {exercise.variantLabel}
                  </p>
                )}
                {exercise.supersetWith?.length > 0 && (
                  <p className="mt-0.5 text-xs font-semibold text-[var(--text-muted)]">
                    Superset with {exercise.supersetWith.join(" + ")}
                  </p>
                )}
              </div>
              {exercise.proposedNewExercise && (
                <span className="shrink-0 rounded-full bg-[var(--surface-warning)] px-2.5 py-1 text-xs font-extrabold text-[var(--text-primary)]">
                  New exercise
                </span>
              )}
            </div>
            {exercise.sets.length > 0 ? (
              <p className="mt-2 text-sm font-semibold leading-6 text-[var(--text-secondary)]">
                {exercise.sets.join(" Â· ")}
              </p>
            ) : (
              <p className="mt-2 text-sm text-[var(--text-muted)]">Set details unavailable</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function GroupedExerciseReviewRow({ canEdit, exercise, exerciseVariantAction, item, recoveryContext, review }) {
  return (
    <div className="rounded-xl border border-[var(--divider)] bg-[var(--surface-elevated)] p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-extrabold text-[var(--text-primary)]">{exercise.occurrenceLabel ?? exercise.name}</p>
          {exercise.executionVariant?.label && <p className="mt-0.5 text-xs font-bold text-[var(--primary)]">Variant: {exercise.executionVariant.label}</p>}
        </div>
        {exercise.provisionalExerciseId && <span className="shrink-0 rounded-full bg-[var(--surface-warning)] px-2.5 py-1 text-xs font-extrabold text-[var(--text-primary)]">New exercise</span>}
      </div>
      {exercise.sets.length
        ? <ul className="mt-1 space-y-1 text-sm text-[var(--text-secondary)]">{exercise.sets.map((set, setIndex) => <li key={`${set}-${setIndex}`}>• {set}</li>)}</ul>
        : <p className="mt-1 text-sm text-[var(--text-muted)]">Set details unavailable</p>}
      {canEdit && exercise.canonicalExerciseId && exerciseVariantAction && (
        <details className="mt-2 rounded-xl border border-[var(--divider)] px-3 py-2">
          <summary className="cursor-pointer text-xs font-extrabold text-[var(--primary)]">{exercise.executionVariant ? "Edit variant" : "Add variant"}</summary>
          <form action={exerciseVariantAction} className="mt-3 space-y-2">
            <input name="reviewId" type="hidden" value={review.id} />
            <input name="expectedUpdatedAt" type="hidden" value={review.updatedAt} />
            <input name="evidenceObjectId" type="hidden" value={item.object.id} />
            <input name="exerciseIndex" type="hidden" value={exercise.exerciseIndex} />
            <EvidenceRecoveryContextFields context={recoveryContext}/>
            <label className="block text-xs font-bold text-[var(--text-secondary)]" htmlFor={`variant-${item.object.id}-${exercise.exerciseIndex}`}>Execution variant</label>
            <input className="min-h-11 w-full rounded-xl border border-[var(--divider)] bg-[var(--surface-elevated)] px-3 text-sm font-semibold text-[var(--text-primary)]" defaultValue={exercise.executionVariant?.label ?? ""} id={`variant-${item.object.id}-${exercise.exerciseIndex}`} name="variantLabel" placeholder="Static Hold" />
            <div className="flex gap-2">
              <button className="min-h-10 flex-1 rounded-xl bg-[var(--primary)] px-3 text-xs font-extrabold text-white" name="variantMode" type="submit" value="save">Save variant</button>
              {exercise.executionVariant && <button className="min-h-10 rounded-xl border border-[var(--divider)] px-3 text-xs font-extrabold text-[var(--text-primary)]" name="variantMode" type="submit" value="remove">Remove</button>}
            </div>
          </form>
        </details>
      )}
    </div>
  );
}

function SupersetEditor({ action, exercises, group = null, issue = null, item, recoveryContext, review }) {
  const selectedIds = group?.memberExerciseIds ?? issue?.memberExerciseIds ?? [];
  const formKey = group?.id ?? issue?.id ?? "new";
  return (
    <details className="mt-3 rounded-xl border border-[var(--divider)] bg-[var(--surface-elevated)] px-3 py-2">
      <summary className="cursor-pointer text-xs font-extrabold text-[var(--primary)]">{group ? "Edit Superset" : "Resolve Superset"}</summary>
      <form action={action} className="mt-3 space-y-3">
        <input name="reviewId" type="hidden" value={review.id} />
        <input name="expectedUpdatedAt" type="hidden" value={review.updatedAt} />
        <input name="evidenceObjectId" type="hidden" value={item.object.id} />
        {group?.id && <input name="relationshipGroupId" type="hidden" value={group.id} />}
        {issue?.id && <input name="structuralReviewIssueId" type="hidden" value={issue.id} />}
        <EvidenceRecoveryContextFields context={recoveryContext}/>
        {[0, 1].map((memberIndex) => (
          <label className="block text-xs font-bold text-[var(--text-secondary)]" key={memberIndex}>
            Exercise {memberIndex + 1}
            <select className="mt-1 min-h-11 w-full rounded-xl border border-[var(--divider)] bg-[var(--surface-elevated)] px-3 text-sm font-semibold text-[var(--text-primary)]" defaultValue={selectedIds[memberIndex] ?? ""} name="memberExerciseId" required>
              <option disabled value="">Choose exercise</option>
              {exercises.map((exercise) => <option key={`${formKey}-${memberIndex}-${exercise.id}`} value={exercise.id}>{exercise.occurrenceLabel ?? exercise.name}</option>)}
            </select>
          </label>
        ))}
        <div className="flex gap-2">
          <button className="min-h-10 flex-1 rounded-xl bg-[var(--primary)] px-3 text-xs font-extrabold text-white" name="relationshipMode" type="submit" value="save">Save Superset</button>
          {(group || issue) && <button className="min-h-10 rounded-xl border border-[var(--divider)] px-3 text-xs font-extrabold text-[var(--text-primary)]" name="relationshipMode" type="submit" value={group ? "remove" : "dismiss_issue"}>Remove Superset</button>}
        </div>
      </form>
    </details>
  );
}

function NutritionReplacementControl({ canEdit, disposition, onChange, relationship }) {
  const existing = relationship.existingPreview ?? {};
  const incoming = relationship.newPreview ?? {};
  const projected = relationship.projectedPreview ?? incoming;
  const status = relationship.dispositionStatus;
  const existingMeals = new Map((existing.meals ?? []).map((meal) => [meal.key, meal]));
  const incomingMealKeys = new Set((incoming.meals ?? []).map((meal) => meal.key));
  const comparisons = (incoming.meals ?? [])
    .filter((meal) => existingMeals.has(meal.key))
    .map((meal) => ({ existing: existingMeals.get(meal.key), incoming: meal }));
  const unchangedMeals = (existing.meals ?? [])
    .filter((meal) => !incomingMealKeys.has(meal.key))
    .map((meal) => meal.label);
  return (
    <section className="rounded-2xl border border-[var(--divider)] bg-[var(--surface-accent)] p-4">
      <h3 className="font-extrabold text-[var(--text-primary)]">Update this Nutrition Day</h3>
      <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">This looks related to the Nutrition Day already logged for this date.</p>
      {(existing.calories != null || projected.calories != null) && (
        <p className="mt-2 text-sm font-bold text-[var(--text-primary)]">Projected daily total: {existing.calories ?? "not available"} → {projected.calories ?? "not available"} calories</p>
      )}
      {comparisons.map(({ existing: prior, incoming: next }) => (
        <p className="mt-1 text-sm font-bold text-[var(--text-primary)]" key={next.key}>{next.label}: {prior.calories ?? "not available"} → {next.calories ?? "not available"} calories</p>
      ))}
      {unchangedMeals.length > 0 && (
        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{formatMealList(unchangedMeals)} will remain unchanged.</p>
      )}
      {status === "automatic" ? (
        <p className="mt-3 text-sm font-semibold text-[var(--primary)]">The current day will be updated; its prior version will remain in history.</p>
      ) : status === "requires_choice" ? (
        <fieldset className="mt-3 space-y-2" disabled={!canEdit}>
          <legend className="text-sm font-extrabold text-[var(--text-primary)]">How should this evidence be applied?</legend>
          <label className="flex min-h-11 items-center gap-3 rounded-xl bg-white px-3 text-sm font-bold text-[var(--text-primary)]"><input checked={disposition === "replace"} name={`nutrition-${relationship.logicalDayKey}`} onChange={() => onChange("replace")} type="radio"/>Replace existing</label>
          <label className="flex min-h-11 items-center gap-3 rounded-xl bg-white px-3 text-sm font-bold text-[var(--text-primary)]"><input checked={disposition === "additive"} name={`nutrition-${relationship.logicalDayKey}`} onChange={() => onChange("additive")} type="radio"/>Add as a distinct meal</label>
        </fieldset>
      ) : (
        <p className="mt-3 text-sm font-semibold text-[var(--text-secondary)]">Saving is paused because this date has conflicting active Nutrition records.</p>
      )}
    </section>
  );
}

function formatMealList(meals) {
  if (meals.length < 2) return meals[0] ?? "Other meals";
  if (meals.length === 2) return `${meals[0]} and ${meals[1]}`;
  return `${meals.slice(0, -1).join(", ")}, and ${meals.at(-1)}`;
}

function NewExerciseCard({ action, canonicalExercises, exercise, recoveryContext, review }) {
  const [mode, setMode] = useState("new");
  const [searchQuery, setSearchQuery] = useState("");
  const provisional = exercise.provisionalExercise;
  const inferredMuscleGroup =
    suggestCanonicalTrainingMuscleGroup(provisional.normalizedDisplayName);
  const persistedMuscleGroup =
    ["high", "user_supplied"].includes(
      provisional.suggestedPrimaryMuscleGroupConfidence
    )
      ? resolveCanonicalTrainingMuscleGroup(
          provisional.suggestedPrimaryMuscleGroupId ??
            provisional.suggestedPrimaryMuscleGroup
        )
      : null;
  const suggestedMuscleGroup =
    persistedMuscleGroup ??
    (inferredMuscleGroup.confidence === "high"
      ? inferredMuscleGroup.muscleGroup
      : null);
  const [muscleGroupQuery, setMuscleGroupQuery] = useState("");
  const [primaryMuscleGroupId, setPrimaryMuscleGroupId] = useState(
    () => suggestedMuscleGroup?.id ?? ""
  );
  const matchingCanonicalExercises = searchCanonicalExerciseOptions(
    canonicalExercises,
    searchQuery
  );
  const matchingMuscleGroups =
    searchCanonicalTrainingMuscleGroups(muscleGroupQuery);
  const changeMode = (nextMode) => {
    setMode(nextMode);
    setSearchQuery("");
    setMuscleGroupQuery("");
    setPrimaryMuscleGroupId(
      nextMode === "new" ? suggestedMuscleGroup?.id ?? "" : ""
    );
  };
  const changeMuscleGroupSearch = (query) => {
    const matches = searchCanonicalTrainingMuscleGroups(query);
    setMuscleGroupQuery(query);
    if (
      primaryMuscleGroupId &&
      !matches.some((candidate) => candidate.id === primaryMuscleGroupId)
    ) {
      setPrimaryMuscleGroupId("");
    }
  };
  const fieldClass = "mt-1 min-h-12 w-full rounded-xl border border-[var(--divider)] bg-[var(--input-bg)] px-3 text-sm font-semibold text-[var(--text-primary)]";
  return (
    <Card className="scroll-mt-4 space-y-4" id={`new-exercise-${provisional.provisionalExerciseId}`} tabIndex={-1} variant="warning">
      <div>
        <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-[var(--primary)]">New exercise detected</p>
        <h2 className="mt-1 text-xl font-extrabold text-[var(--text-primary)]">{provisional.normalizedDisplayName}</h2>
        <p className="mt-1 text-sm font-semibold text-[var(--text-secondary)]">{exercise.sets?.length ?? 0} sets</p>
        <ul className="mt-2 space-y-1 text-sm text-[var(--text-secondary)]">
          {(exercise.sets ?? []).map((set, index) => (
            <li key={index}>{formatExerciseSet(set) ?? "Set details unavailable"}</li>
          ))}
        </ul>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button className={`min-h-11 rounded-xl border px-2 text-sm font-extrabold ${mode === "new" ? "border-[var(--primary)] bg-[var(--surface-accent)]" : "border-[var(--divider)]"}`} onClick={() => changeMode("new")} type="button">Add new</button>
        <button className={`min-h-11 rounded-xl border px-2 text-sm font-extrabold ${mode === "existing" ? "border-[var(--primary)] bg-[var(--surface-accent)]" : "border-[var(--divider)]"}`} onClick={() => changeMode("existing")} type="button">Map existing</button>
      </div>
      <form action={action} className="space-y-3">
        <input name="reviewId" type="hidden" value={review.id} />
        <EvidenceRecoveryContextFields context={recoveryContext}/>
        <input name="expectedUpdatedAt" type="hidden" value={review.updatedAt} />
        <input name="provisionalExerciseId" type="hidden" value={provisional.provisionalExerciseId} />
        <input name="resolutionMode" type="hidden" value={mode} />
        {mode === "new" ? <>
          <ReviewField className={fieldClass} defaultValue={provisional.suggestedCanonicalName} label="Canonical exercise name" name="canonicalName" />
          <div className="min-w-0 space-y-2">
            <label className="block text-sm font-extrabold text-[var(--text-primary)]" htmlFor={`${provisional.provisionalExerciseId}-muscle-search`}>
              Primary muscle group <span aria-hidden="true">*</span>
            </label>
            <input
              className={`${fieldClass} mt-0 max-w-full`}
              id={`${provisional.provisionalExerciseId}-muscle-search`}
              onChange={(event) => changeMuscleGroupSearch(event.target.value)}
              placeholder="Search muscle groups"
              type="search"
              value={muscleGroupQuery}
            />
            <select
              aria-label="Primary muscle group"
              className={`${fieldClass} mt-0 max-w-full truncate`}
              name="primaryMuscleGroupId"
              onChange={(event) => setPrimaryMuscleGroupId(event.target.value)}
              required
              value={primaryMuscleGroupId}
            >
              <option value="">Choose a muscle group</option>
              {matchingMuscleGroups.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.label}
                </option>
              ))}
            </select>
            {matchingMuscleGroups.length === 0 && (
              <p className="text-sm font-semibold text-[var(--text-secondary)]">
                No matching muscle group.
              </p>
            )}
            {suggestedMuscleGroup && primaryMuscleGroupId === suggestedMuscleGroup.id && (
              <p className="text-xs font-semibold text-[var(--text-muted)]">
                Suggested from the exercise name. You can choose another option.
              </p>
            )}
          </div>
          <details className="rounded-xl border border-[var(--divider)] bg-[var(--surface-muted)] p-3">
            <summary className="cursor-pointer text-sm font-extrabold text-[var(--text-primary)]">Optional details</summary>
            <div className="mt-3 space-y-3">
              <ReviewField className={fieldClass} defaultValue={provisional.suggestedMovementPattern} label="Movement pattern" name="movementPattern" required={false} />
              <ReviewField className={fieldClass} defaultValue={provisional.suggestedEquipment} label="Equipment type" name="equipment" required={false} />
              <ReviewField className={fieldClass} defaultValue={provisional.suggestedLaterality} label="Laterality" name="laterality" required={false} />
              <ReviewField className={fieldClass} defaultValue={(provisional.suggestedAliases ?? []).join(", ")} label="Aliases" name="aliases" required={false} />
            </div>
          </details>
        </> : <div className="space-y-3">
          <label className="block text-sm font-extrabold text-[var(--text-primary)]">Search exercises
            <input className={fieldClass} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Name or alias" type="search" value={searchQuery} />
          </label>
          <label className="block text-sm font-extrabold text-[var(--text-primary)]">Existing exercise
            <select className={fieldClass} name="canonicalExerciseId" required>
              <option value="">Choose an exercise</option>
              {matchingCanonicalExercises.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
            </select>
          </label>
          {matchingCanonicalExercises.length === 0 && <p className="text-sm font-semibold text-[var(--text-secondary)]">No canonical exercise matches that search.</p>}
        </div>}
        <ExerciseResolutionButton />
      </form>
      <form action={action}>
        <input name="reviewId" type="hidden" value={review.id} />
        <EvidenceRecoveryContextFields context={recoveryContext}/>
        <input name="expectedUpdatedAt" type="hidden" value={review.updatedAt} />
        <input name="provisionalExerciseId" type="hidden" value={provisional.provisionalExerciseId} />
        <input name="resolutionMode" type="hidden" value="remove" />
        <button className="min-h-11 w-full rounded-xl border border-[var(--divider)] px-3 text-sm font-bold text-[var(--text-secondary)]" type="submit">Remove from workout</button>
      </form>
    </Card>
  );
}

function ReviewField({ className, defaultValue, label, name, required = true }) {
  return <label className="block text-sm font-extrabold text-[var(--text-primary)]">{label}<input className={className} defaultValue={defaultValue ?? ""} name={name} required={required} /></label>;
}

function DexaMeasurementEditor({ action, item, recoveryContext, review }) {
  const object = item.object;
  const metadata = object.metadata ?? {};
  const value = (key) => metadata[key] ?? object[key]?.value ?? object[key] ?? "";
  const inputClassName = "mt-1 min-h-11 w-full rounded-xl border border-[var(--divider)] bg-white px-3 text-base font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--primary)] focus:ring-4 focus:ring-indigo-100";
  const issueCount = validateDexaScan(object, { production: true }).issues.length;
  return (
    <form action={action} className="rounded-2xl border border-[var(--divider)] bg-[var(--surface-elevated)] p-4">
      <input name="reviewId" type="hidden" value={review.id} />
      <input name="evidenceObjectId" type="hidden" value={object.id} />
      <input name="expectedUpdatedAt" type="hidden" value={review.updatedAt} />
      <EvidenceRecoveryContextFields context={recoveryContext} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-extrabold text-[var(--text-primary)]">Review PDF measurements</h3>
          <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">Correct anything the PDF reader missed. Required values must be complete before the scan can be saved.</p>
        </div>
        {issueCount > 0 && <span className="shrink-0 rounded-full bg-[var(--surface-warning)] px-2.5 py-1 text-[10px] font-extrabold text-[var(--text-primary)]">Needs review</span>}
      </div>
      {review.interpretedEvidence?.review_metadata?.duplicateCandidate && (
        <p className="mt-3 rounded-xl bg-[var(--surface-warning)] p-3 text-xs font-bold leading-5 text-[var(--text-primary)]">This PDF has the same scan date as existing DEXA history. Verify that you chose the intended report.</p>
      )}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <DexaReviewField className={`${inputClassName} col-span-2`} defaultValue={object.measuredAt ?? object.observed_at} label="Scan date" name="measuredAt" type="date" />
        <DexaReviewField className={inputClassName} defaultValue={value("totalMass")} label="Total mass (lb)" name="totalMass" />
        <DexaReviewField className={inputClassName} defaultValue={value("bodyFatPercentage")} label="Body fat (%)" name="bodyFatPercentage" />
        <DexaReviewField className={inputClassName} defaultValue={value("fatMass")} label="Fat tissue (lb)" name="fatMass" />
        <DexaReviewField className={inputClassName} defaultValue={value("leanMass")} label="Lean tissue (lb)" name="leanMass" />
        <DexaReviewField className={inputClassName} defaultValue={value("boneMineralContent")} label="Bone mineral (lb)" name="boneMineralContent" />
        <DexaReviewField className={inputClassName} defaultValue={value("restingMetabolicRate")} label="RMR (kcal/day)" name="restingMetabolicRate" required={false} />
        <DexaReviewField className={inputClassName} defaultValue={metadata.vatMass ?? object.visceralAdiposeTissue?.mass?.value} label="VAT mass (lb)" name="vatMass" required={false} />
        <DexaReviewField className={inputClassName} defaultValue={metadata.vatVolume ?? object.visceralAdiposeTissue?.volume?.value} label="VAT volume (in³)" name="vatVolume" required={false} />
      </div>
      <DexaMeasurementButton />
    </form>
  );
}

function DexaReviewField({ className, defaultValue, label, name, required = true, type = "number" }) {
  return <label className={type === "date" ? "col-span-2 text-xs font-extrabold text-[var(--text-secondary)]" : "text-xs font-extrabold text-[var(--text-secondary)]"}>{label}<input className={className} defaultValue={defaultValue ?? ""} inputMode={type === "number" ? "decimal" : undefined} name={name} required={required} step={type === "number" ? "0.01" : undefined} type={type} /></label>;
}

function DexaMeasurementButton() {
  const { pending } = useFormStatus();
  return <button className="mt-4 min-h-12 w-full rounded-xl border border-[var(--primary)] px-3 text-sm font-extrabold text-[var(--primary)] disabled:opacity-50" disabled={pending} type="submit">{pending ? "Updating measurements…" : "Update measurements"}</button>;
}

function ExerciseResolutionButton() {
  const { pending } = useFormStatus();
  return <button className="min-h-12 w-full rounded-xl bg-[var(--primary)] px-3 text-sm font-extrabold text-white disabled:opacity-50" disabled={pending} type="submit">{pending ? "Saving exercise\u2026" : "Confirm exercise details"}</button>;
}

function ConfirmButton({ blockingCount = 0, disabled, retry, savingLabel }) {
  const { pending } = useFormStatus();
  const label = blockingCount > 0 ? `Resolve ${blockingCount} exercise ${blockingCount === 1 ? "identity" : "identities"} to save` : retry ? "Continue" : "Save included evidence";
  return <button aria-live="polite" className="min-h-14 w-full cursor-pointer rounded-2xl bg-[var(--primary)] px-4 font-extrabold text-white transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40" disabled={disabled || pending} type="submit">{pending ? (retry ? "Continuing\u2026" : savingLabel) : label}</button>;
}

function ReprocessButton() {
  const { pending } = useFormStatus();
  return <button className="min-h-12 w-full cursor-pointer rounded-2xl border border-[var(--divider)] px-4 text-sm font-bold text-[var(--text-secondary)] disabled:cursor-not-allowed disabled:opacity-40" disabled={pending} type="submit">{pending ? "Reading upload again\u2026" : "Read upload again"}</button>;
}

function DiscardReviewControl({ action, recoveryContext, reviewId }) {
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
          <form action={action}><input name="reviewId" type="hidden" value={reviewId} /><EvidenceRecoveryContextFields context={recoveryContext}/><DiscardSubmitButton /></form>
        </div>
      </section>
    </div>}
  </>;
}

function DiscardSubmitButton() {
  const { pending } = useFormStatus();
  return <button className="min-h-12 w-full cursor-pointer rounded-2xl bg-red-600 px-3 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={pending} type="submit">{pending ? "Discarding..." : "Discard review"}</button>;
}

function EvidenceSavedScreen({ experience, trainingAchievements }) {
  const [continueNavigation] = useState(() =>
    createEvidenceSuccessNavigation((destination) => {
      window.location.assign(destination);
    })
  );

  return (
    <main className="app-surface min-h-screen">
      <section aria-live="polite" className="mx-auto flex min-h-screen max-w-[393px] flex-col items-center justify-center px-6 pb-24 text-center" role="status">
        {experience.friendlyDate && <p className="mb-7 text-sm font-bold text-[var(--text-secondary)]">{experience.friendlyDate}</p>}
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--surface-success)] text-[var(--chart-1)]"><Check aria-hidden="true" size={30} strokeWidth={3} /></span>
        <h1 className="mt-7 text-3xl font-extrabold text-[var(--text-primary)]">{experience.savedTitle}</h1>
        <p className="mt-3 max-w-xs text-base leading-7 text-[var(--text-secondary)]">{experience.savedBody}</p>
        {trainingAchievements && (
          <section className="mt-7 w-full rounded-2xl border border-[var(--divider)] bg-[var(--surface-elevated)] p-4 text-left">
            <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-[var(--chart-1)]">{trainingAchievements.heading}</p>
            <p className="mt-1 text-sm font-extrabold text-[var(--text-primary)]">{trainingAchievements.summary}</p>
            <div className="mt-3 space-y-2">
              {trainingAchievements.items.map((item) => (
                <div className="rounded-xl bg-[var(--surface-muted)] px-3 py-2.5" key={`${item.exerciseName}-${item.eventType}-${item.detail}`}>
                  <p className="text-sm font-extrabold text-[var(--text-primary)]">{item.exerciseName}</p>
                  <p className="mt-1 text-xs font-semibold leading-5 text-[var(--text-secondary)]">{item.detail}</p>
                </div>
              ))}
            </div>
          </section>
        )}
        <button className="mt-9 min-h-14 w-full rounded-2xl bg-[var(--primary)] px-4 font-extrabold text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100" onClick={continueNavigation} type="button">Continue</button>
      </section>
    </main>
  );
}

function PhotoPreviews({ action, canEdit, metadataAction, object, recoveryContext, review }) {
  const photos = (object.photos ?? []).filter((photo) => photo.active !== false);
  return <section aria-label="Photo pose review" className="space-y-4">
    {(object.captureMetadata || object.goalRelationship) && <PhotoSessionMetadataReview action={metadataAction} canEdit={canEdit} object={object} recoveryContext={recoveryContext} review={review} />}
    <div>
      <h3 className="text-sm font-extrabold text-[var(--text-primary)]">Match each photo to its pose</h3>
      <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">Each selection stays attached to this uploaded image.</p>
    </div>
    {photos.map((photo, index) => {
      const poseId = getCanonicalProgressPhotoCategory(photo)?.id ?? "unknown";
      return <article className="overflow-hidden rounded-2xl border border-[var(--divider)] bg-[var(--surface-muted)]" data-artifact-id={photo.source_artifact_ref} key={photo.source_artifact_ref ?? photo.id ?? index}>
        <EvidenceImage
          alt={poseId === "unknown" ? `Uploaded progress photo ${index + 1}` : getProgressPhotoDisplayLabel(photo)}
          className="aspect-[3/4] w-full bg-black/5 object-contain"
          src={privateEvidenceUrl(photo.storage_path ?? photo.imagePath)}
        />
        <div className="space-y-3 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-xs font-bold text-[var(--text-secondary)]">{photo.file_name ?? `Photo ${index + 1}`}</p>
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${poseId === "unknown" ? "bg-amber-100 text-amber-900" : "bg-[var(--surface-success)] text-[var(--text-primary)]"}`}>{poseId === "unknown" ? "Pose needed" : getProgressPhotoDisplayLabel(photo)}</span>
          </div>
          <form action={action} className="space-y-2">
            <input name="reviewId" type="hidden" value={review.id} />
            <EvidenceRecoveryContextFields context={recoveryContext}/>
            <input name="expectedUpdatedAt" type="hidden" value={review.updatedAt} />
            <input name="photoId" type="hidden" value={photo.id} />
            <input name="sourceArtifactRef" type="hidden" value={photo.source_artifact_ref ?? ""} />
            <label className="block text-xs font-extrabold text-[var(--text-secondary)]" htmlFor={`pose-${photo.id}`}>Pose</label>
            <select className="min-h-12 w-full rounded-xl border border-[var(--divider)] bg-[var(--surface-elevated)] px-3 text-sm font-bold text-[var(--text-primary)] disabled:opacity-50" defaultValue={poseId === "unknown" ? "" : poseId} disabled={!canEdit || !action} id={`pose-${photo.id}`} name="poseId" required>
              <option disabled value="">Choose pose</option>
              {CanonicalProgressPhotoCategories.map((pose) => <option key={pose.id} value={pose.id}>{pose.label}</option>)}
            </select>
            <PhotoPoseSaveButton disabled={!canEdit || !action} />
          </form>
        </div>
      </article>;
    })}
  </section>;
}
function PhotoPoseSaveButton({ disabled }) { const { pending } = useFormStatus(); return <button className="min-h-11 w-full rounded-xl border border-[var(--primary)] px-3 text-sm font-extrabold text-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-40" disabled={disabled || pending} type="submit">{pending ? "Saving pose\u2026" : "Save pose"}</button>; }

function PhotoSessionMetadataReview({ action, canEdit, object, recoveryContext, review }) {
  const captureNeedsReview = object.captureMetadata?.status === "needs_review";
  const goalNeedsReview = object.goalRelationship?.status === "needs_review";
  if (!captureNeedsReview && !goalNeedsReview) return <div className="rounded-2xl border border-[var(--divider)] bg-[var(--surface-muted)] p-3"><p className="text-xs font-extrabold text-[var(--text-primary)]">Shared session details</p><p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{formatSessionTime(object)} · {object.goalRelationship?.goalLabel ?? "No Goal relationship"}</p></div>;
  const options = object.goalRelationship?.options ?? [];
  return <form action={action} className="space-y-3 rounded-2xl border border-[var(--divider)] bg-[var(--surface-muted)] p-3">
    <div><p className="text-xs font-extrabold text-[var(--text-primary)]">Shared session details</p><p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">These values apply once to every photo in this capture session.</p></div>
    <input name="reviewId" type="hidden" value={review.id}/><input name="expectedUpdatedAt" type="hidden" value={review.updatedAt}/><input name="evidenceObjectId" type="hidden" value={object.id}/><EvidenceRecoveryContextFields context={recoveryContext}/>
    {captureNeedsReview ? <label className="block text-xs font-extrabold text-[var(--text-secondary)]">Time of day<select className="mt-1 min-h-12 w-full rounded-xl border border-[var(--divider)] bg-[var(--surface-elevated)] px-3 text-sm font-bold" name="timeOfDay" required><option disabled value="">Choose time of day</option><option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="evening">Evening</option></select></label> : <input name="timeOfDay" type="hidden" value={object.captureMetadata?.timeOfDay ?? object.conditions?.timeOfDay ?? ""}/>}
    {goalNeedsReview ? <label className="block text-xs font-extrabold text-[var(--text-secondary)]">Goal relationship<select className="mt-1 min-h-12 w-full rounded-xl border border-[var(--divider)] bg-[var(--surface-elevated)] px-3 text-sm font-bold" name="goalId" required={options.length > 0}><option value="">{options.length ? "Choose Goal" : "No Goal relationship"}</option>{options.map((goal)=><option key={goal.id} value={goal.id}>{goal.title}</option>)}</select></label> : <input name="goalId" type="hidden" value={object.goalRelationship?.goalIds?.[0] ?? ""}/>}
    <PhotoSessionMetadataSaveButton disabled={!canEdit || !action}/>
  </form>;
}
function PhotoSessionMetadataSaveButton({ disabled }) { const { pending }=useFormStatus(); return <button className="min-h-11 w-full rounded-xl border border-[var(--primary)] px-3 text-sm font-extrabold text-[var(--primary)] disabled:opacity-40" disabled={disabled||pending} type="submit">{pending?"Saving session details\u2026":"Save session details"}</button>; }
function formatSessionTime(object) { const time=object.captureMetadata?.timeOfDay??object.conditions?.timeOfDay; const label=time?`${time[0].toUpperCase()}${time.slice(1)}`:"Time unavailable"; return object.captureMetadata?.status==="inferred"?`${label} · Inferred from image metadata`:label; }

function EvidenceRecoveryContextFields({ context }) {
  if (!context) return null;
  return <>
    <input name="recoveryDate" type="hidden" value={context.date}/>
    <input name="recoveryEvidenceType" type="hidden" value={context.expectedEvidenceType}/>
    {context.recoveryIntent && (
      <input name="recoveryIntent" type="hidden" value={context.recoveryIntent}/>
    )}
    <input name="recoveryKey" type="hidden" value={context.recoveryKey}/>
    <input name="returnTo" type="hidden" value={context.returnTo}/>
  </>;
}
function privateEvidenceUrl(value) { if (!value) return null; const mediaId=parsePrivateMediaReference(value);if(mediaId)return `/api/private-evidence/media/${mediaId}`;if(String(value).startsWith("media://"))return null;return `/api/private-evidence/${String(value).replace(/^private[\\/]/i, "").replaceAll("\\", "/")}`; }
function hasIncompletePhotoSet(object) { return object.evidence_type === "photo_session" && (object.photos ?? []).filter((photo) => photo.active !== false).some((photo) => !getCanonicalProgressPhotoCategory(photo)); }
function hasIncompletePhotoSessionMetadata(object) { return object.evidence_type === "photo_session" && (object.captureMetadata?.status === "needs_review" || object.goalRelationship?.status === "needs_review"); }
function hasCommitFailure(review) { return ["commit_failed", "partially_committed"].includes(review.status); }
