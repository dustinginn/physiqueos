import XCTest
@testable import PhysiqueOS

@MainActor
final class MorningCheckInModelTests: XCTestCase {

    // MARK: - Core Evidence Recovery: missing detection (default state = no reviews)

    func testAllFourRecoveryTypesAreMissingByDefault() {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        let items = store.evidenceRecoveryItems(now: date(2026, 8, 30))
        XCTAssertEqual(Set(items.map(\.type)), Set(MorningEvidenceRecoveryType.allCases))
        XCTAssertTrue(items.allSatisfy { $0.status == .missing })
    }

    func testMissingNutritionUsesTheRealActionLabelAndLogDestination() throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        let item = try XCTUnwrap(store.evidenceRecoveryItems(now: date(2026, 8, 30)).first { $0.type == .nutrition })
        XCTAssertEqual(item.actionLabel, "Add Nutrition")
        XCTAssertEqual(item.destination, .evidenceRecoveryUpload(type: .nutrition, occurrenceDateKey: "2026-08-29"))
    }

    func testMissingTrainingUsesTheRealActionLabelAndLogDestination() throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        let item = try XCTUnwrap(store.evidenceRecoveryItems(now: date(2026, 8, 30)).first { $0.type == .training })
        XCTAssertEqual(item.actionLabel, "Add Workout")
        XCTAssertEqual(item.destination, .evidenceRecoveryUpload(type: .training, occurrenceDateKey: "2026-08-29"))
    }

    func testMissingActivityUsesTheRealActionLabelAndLogDestination() throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        let item = try XCTUnwrap(store.evidenceRecoveryItems(now: date(2026, 8, 30)).first { $0.type == .activityDay })
        XCTAssertEqual(item.actionLabel, "Add Activity")
        XCTAssertEqual(item.destination, .evidenceRecoveryUpload(type: .activityDay, occurrenceDateKey: "2026-08-29"))
    }

    /// The one type whose MISSING destination is `/evidence/photos`, not
    /// `/log` — verified against source (`actionFor` in
    /// `MorningEvidenceRecoveryService.js`).
    func testMissingPhotoSessionRoutesToItsOwnUploadDestinationNotTheGenericLog() throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        let item = try XCTUnwrap(store.evidenceRecoveryItems(now: date(2026, 8, 30)).first { $0.type == .photoSession })
        XCTAssertEqual(item.actionLabel, "Upload Photos")
        XCTAssertEqual(item.destination, .evidenceRecoveryUpload(type: .photoSession, occurrenceDateKey: "2026-08-29"))
    }

    // MARK: - Present evidence is not flagged

    func testAConfirmedReviewForYesterdayRemovesThatTypesRecoveryCard() {
        let yesterday = date(2026, 8, 29)
        let review = LocalEvidenceReview(
            id: "review-nutrition-1", sourceAssets: [], typedDetails: "",
            items: [.init(id: "item-1", category: .nutrition, title: "Nutrition", occurrenceDate: yesterday, fields: [], included: true)],
            status: .confirmed
        )
        let store = LoggingSandboxStore(now: date(2026, 8, 30), reviews: ["review-nutrition-1": review])
        let types = Set(store.evidenceRecoveryItems(now: date(2026, 8, 30)).map(\.type))
        XCTAssertFalse(types.contains(.nutrition), "A confirmed, present day must never surface a recovery card.")
        XCTAssertTrue(types.contains(.training), "Unrelated types remain flagged independently.")
    }

    // MARK: - Pending review semantics

    func testAPendingReviewSurfacesAsPendingConfirmationNotMissing() throws {
        let yesterday = date(2026, 8, 29)
        let review = LocalEvidenceReview(
            id: "review-photos-pending", sourceAssets: [], typedDetails: "",
            items: [.init(id: "item-1", category: .progressPhotos, title: "Photos", occurrenceDate: yesterday, fields: [], included: true)],
            status: .awaitingConfirmation
        )
        let store = LoggingSandboxStore(now: date(2026, 8, 30), reviews: ["review-photos-pending": review])
        let item = try XCTUnwrap(store.evidenceRecoveryItems(now: date(2026, 8, 30)).first { $0.type == .photoSession })
        XCTAssertEqual(item.status, .pendingConfirmation)
        XCTAssertEqual(item.actionLabel, "Resume review")
        XCTAssertEqual(item.destination, .localEvidenceReview(reviewId: "review-photos-pending"))
    }

    /// `PRESENT_PARTIAL` — a strength shell recorded with zero exercises.
    func testAConfirmedTrainingReviewWithNoExercisesIsPresentPartialNotComplete() throws {
        let yesterday = date(2026, 8, 29)
        let review = LocalEvidenceReview(
            id: "review-training-shell", sourceAssets: [], typedDetails: "",
            items: [.init(id: "item-1", category: .training, title: "Workout", occurrenceDate: yesterday, fields: [], exercises: [], included: true)],
            status: .confirmed
        )
        let store = LoggingSandboxStore(now: date(2026, 8, 30), reviews: ["review-training-shell": review])
        let item = try XCTUnwrap(store.evidenceRecoveryItems(now: date(2026, 8, 30)).first { $0.type == .training })
        XCTAssertEqual(item.status, .presentPartial)
        XCTAssertEqual(item.actionLabel, "Add workout details")
        XCTAssertEqual(item.destination, .evidenceRecoveryUpload(type: .training, occurrenceDateKey: "2026-08-29"))
    }

    func testAConfirmedTrainingReviewWithExercisesIsPresentCompleteAndDoesNotSurface() {
        let yesterday = date(2026, 8, 29)
        let review = LocalEvidenceReview(
            id: "review-training-full", sourceAssets: [], typedDetails: "",
            items: [.init(id: "item-1", category: .training, title: "Workout", occurrenceDate: yesterday, fields: [],
                           exercises: [.init(id: "ex-1", name: "Bench Press", sets: [.init(id: "set-1", summary: "5 reps @ 135 lb", reps: "5", load: "135", unit: "lb")])],
                           included: true)],
            status: .confirmed
        )
        let store = LoggingSandboxStore(now: date(2026, 8, 30), reviews: ["review-training-full": review])
        XCTAssertFalse(store.evidenceRecoveryItems(now: date(2026, 8, 30)).contains { $0.type == .training })
    }

    // MARK: - Discarded semantics

    func testDiscardingAPendingReviewRevertsThatTypeToMissing() {
        let yesterday = date(2026, 8, 29)
        let review = LocalEvidenceReview(
            id: "review-activity-pending", sourceAssets: [], typedDetails: "",
            items: [.init(id: "item-1", category: .activity, title: "Activity", occurrenceDate: yesterday, fields: [], included: true)],
            status: .awaitingConfirmation
        )
        let store = LoggingSandboxStore(now: date(2026, 8, 30), reviews: ["review-activity-pending": review])
        XCTAssertEqual(store.evidenceRecoveryItems(now: date(2026, 8, 30)).first { $0.type == .activityDay }?.status, .pendingConfirmation)
        store.discardReview(id: "review-activity-pending")
        XCTAssertEqual(store.evidenceRecoveryItems(now: date(2026, 8, 30)).first { $0.type == .activityDay }?.status, .missing, "A discarded review must not silently count as satisfied — the user is prompted to redo it.")
    }

    // MARK: - Recovery re-evaluation (genuine, not optimistic hiding)

    func testRecoveringMissingNutritionThroughTheRealIntakePipelineClearsTheCard() async throws {
        let now = date(2026, 8, 30)
        let store = LoggingSandboxStore(now: now)
        let yesterday = "2026-08-29"
        XCTAssertEqual(store.evidenceRecoveryItems(now: now).first { $0.type == .nutrition }?.status, .missing)

        // Mirrors EvidenceIntakeView's onAppear for `.evidenceRecoveryUpload`.
        store.setEvidenceScenario(.nutrition)
        store.pendingRecoveryContext = .init(evidenceType: .nutrition, occurrenceDateKey: yesterday)
        store.setEvidenceOccurrenceDateKey(yesterday)
        XCTAssertEqual(LoggingSandboxStore.dateKey(store.evidenceDraft.occurrenceDate), yesterday, "The recovered evidence's occurrence date must be yesterday, not today.")

        store.evidenceDraft.details = "Breakfast: oatmeal, protein shake. 520 calories, 42g protein, 60g carbs, 12g fat."
        XCTAssertEqual(store.submitEvidence(now: now), .success(nil))
        let interpretationResult = await store.finishInterpretation(now: now)
        let reviewId = try XCTUnwrap(try value(interpretationResult))
        let review = try XCTUnwrap(store.review(id: reviewId))
        XCTAssertEqual(review.recoveryContext, .init(evidenceType: .nutrition, occurrenceDateKey: yesterday), "The recovery context must travel onto the created review.")
        XCTAssertNil(store.pendingRecoveryContext, "The pending context is consumed once attached.")

        // Still pending until confirmed — this is the PENDING_CONFIRMATION state, not yet satisfied.
        XCTAssertEqual(store.evidenceRecoveryItems(now: now).first { $0.type == .nutrition }?.status, .pendingConfirmation)

        for item in review.items { store.updateReviewItem(reviewId: reviewId, itemId: item.id) { $0.fields = $0.fields.map { var f = $0; if ["calories", "protein", "carbs", "fat"].contains(f.id), f.value.isEmpty { f.value = "1" }; return f } } }
        _ = store.confirmReview(id: reviewId)

        // Genuine re-evaluation: the card must now reflect the confirmed evidence.
        XCTAssertFalse(store.evidenceRecoveryItems(now: now).contains { $0.type == .nutrition }, "Confirming recovered evidence must clear the card via real re-evaluation, not an optimistic UI hide.")
    }

    // MARK: - Completion gate: evidence recovery and briefing never block the weight/priority save

    func testMissingEvidenceRecoveryNeverBlocksCompletingMorningCheckIn() throws {
        let now = date(2026, 8, 30)
        let store = LoggingSandboxStore(now: now)
        XCTAssertFalse(store.evidenceRecoveryItems(now: now).isEmpty)
        let unfinished = store.previousDayUnfinishedPriorities(now: now)
        let dispositions = Dictionary(uniqueKeysWithValues: unfinished.map { ($0.id, (disposition: PriorityDisposition.completed, note: "")) })
        // Must succeed despite every evidence-recovery item still being missing.
        _ = try value(store.saveMorningCheckIn(weightText: "180.0", dispositions: dispositions, now: now))
    }

    func testAPendingBriefingReconciliationNeverBlocksCompletingMorningCheckIn() throws {
        let now = date(2026, 8, 30)
        let workItem = BriefingReconciliationWorkItem(id: "wi-1", cadence: .weekly, evidenceDateKey: "2026-08-29", status: .revisionPending, resolvesAsNoOp: true)
        let store = LoggingSandboxStore(now: now, briefingReconciliationWorkItems: [workItem])
        let unfinished = store.previousDayUnfinishedPriorities(now: now)
        let dispositions = Dictionary(uniqueKeysWithValues: unfinished.map { ($0.id, (disposition: PriorityDisposition.skipped, note: "")) })
        _ = try value(store.saveMorningCheckIn(weightText: "180.0", dispositions: dispositions, now: now))
    }

    // MARK: - Recovery Evidence form (sleep / subjective recovery / soreness)

    func testRecoveryEvidenceIsOmittedWhenEveryFieldIsEmpty() throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        XCTAssertEqual(try value(store.saveRecoveryCheckIn(sleepDurationHours: nil, subjectiveRecovery: nil, soreness: nil)), .omitted)
    }

    func testRecoveryEvidenceSavesWithAnyPartialSubset() throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        let outcome = try value(store.saveRecoveryCheckIn(sleepDurationHours: nil, subjectiveRecovery: .good, soreness: nil))
        guard case .saved(let draft) = outcome else { return XCTFail("Expected a saved outcome") }
        XCTAssertNil(draft.sleepDurationHours)
        XCTAssertEqual(draft.subjectiveRecovery, .good)
    }

    func testRecoveryEvidenceValidatesSleepDurationRange() {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        XCTAssertFailure(store.saveRecoveryCheckIn(sleepDurationHours: 25, subjectiveRecovery: nil, soreness: nil), "Sleep duration must be between 0 and 24 hours.")
    }

    func testRecoveryEvidenceIsIndependentOfPriorityReconciliation() throws {
        // Saving Recovery Evidence must never touch weight/priority state.
        let now = date(2026, 8, 30)
        let store = LoggingSandboxStore(now: now)
        _ = try value(store.saveRecoveryCheckIn(sleepDurationHours: 7.5, subjectiveRecovery: .average, soreness: .mild))
        XCTAssertNil(store.weighIn(on: now))
        XCTAssertTrue(store.previousDayUnfinishedPriorities(now: now).allSatisfy { _ in true })
    }

    // MARK: - Briefing reconciliation: presentation

    func testNoBriefingCardWhenNoWorkItemExistsForYesterday() {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        XCTAssertNil(store.briefingReconciliationPresentation(now: date(2026, 8, 30)))
    }

    func testBriefingCardVisibleForRevisionPendingAndOffersFinalize() throws {
        let workItem = BriefingReconciliationWorkItem(id: "wi-1", cadence: .weekly, evidenceDateKey: "2026-08-29", status: .revisionPending, resolvesAsNoOp: true)
        let store = LoggingSandboxStore(now: date(2026, 8, 30), briefingReconciliationWorkItems: [workItem])
        let presentation = try XCTUnwrap(store.briefingReconciliationPresentation(now: date(2026, 8, 30)))
        XCTAssertTrue(presentation.visible)
        XCTAssertTrue(presentation.canFinalize)
        XCTAssertEqual(presentation.actionLabel, "Finish recovery and update briefing")
        XCTAssertFalse(presentation.isFailure)
    }

    func testBriefingCardBlocksFinalizeWhilePendingEvidenceConfirmationExists() throws {
        let yesterday = date(2026, 8, 29)
        let pendingReview = LocalEvidenceReview(
            id: "review-pending", sourceAssets: [], typedDetails: "",
            items: [.init(id: "item-1", category: .training, title: "Workout", occurrenceDate: yesterday, fields: [], included: true)],
            status: .awaitingConfirmation
        )
        let workItem = BriefingReconciliationWorkItem(id: "wi-1", cadence: .midweek, evidenceDateKey: "2026-08-29", status: .revisionPending, resolvesAsNoOp: true)
        let store = LoggingSandboxStore(now: date(2026, 8, 30), reviews: ["review-pending": pendingReview], briefingReconciliationWorkItems: [workItem])
        let presentation = try XCTUnwrap(store.briefingReconciliationPresentation(now: date(2026, 8, 30)))
        XCTAssertFalse(presentation.canFinalize, "canFinalize must be false while an evidence-recovery item is still pending confirmation.")
        XCTAssertEqual(presentation.title, "Briefing update is waiting for confirmation")
    }

    func testBriefingCardForFailedStatusOffersRetryWhenRetryableAndUnderAttemptLimit() throws {
        let workItem = BriefingReconciliationWorkItem(id: "wi-1", cadence: .monthly, evidenceDateKey: "2026-08-29", status: .failed, attempts: 1, retryable: true, resolvesAsNoOp: true)
        let store = LoggingSandboxStore(now: date(2026, 8, 30), briefingReconciliationWorkItems: [workItem])
        let presentation = try XCTUnwrap(store.briefingReconciliationPresentation(now: date(2026, 8, 30)))
        XCTAssertTrue(presentation.canFinalize)
        XCTAssertTrue(presentation.isFailure)
        XCTAssertEqual(presentation.actionLabel, "Retry briefing update")
    }

    func testBriefingCardForFailedStatusDoesNotOfferRetryAtTheAttemptLimit() throws {
        let workItem = BriefingReconciliationWorkItem(id: "wi-1", cadence: .monthly, evidenceDateKey: "2026-08-29", status: .failed, attempts: 3, retryable: true, resolvesAsNoOp: true)
        let store = LoggingSandboxStore(now: date(2026, 8, 30), briefingReconciliationWorkItems: [workItem])
        let presentation = try XCTUnwrap(store.briefingReconciliationPresentation(now: date(2026, 8, 30)))
        XCTAssertFalse(presentation.canFinalize)
    }

    func testBriefingCardForCurrentAfterRevisionIsInformationalOnly() throws {
        let workItem = BriefingReconciliationWorkItem(id: "wi-1", cadence: .weekly, evidenceDateKey: "2026-08-29", status: .currentAfterRevision, resolvesAsNoOp: true)
        let store = LoggingSandboxStore(now: date(2026, 8, 30), briefingReconciliationWorkItems: [workItem])
        let presentation = try XCTUnwrap(store.briefingReconciliationPresentation(now: date(2026, 8, 30)))
        XCTAssertTrue(presentation.visible)
        XCTAssertFalse(presentation.canFinalize)
    }

    func testBriefingCardHiddenWhenWorkItemIsAlreadyCurrent() {
        let workItem = BriefingReconciliationWorkItem(id: "wi-1", cadence: .weekly, evidenceDateKey: "2026-08-29", status: .current, resolvesAsNoOp: true)
        let store = LoggingSandboxStore(now: date(2026, 8, 30), briefingReconciliationWorkItems: [workItem])
        XCTAssertNil(store.briefingReconciliationPresentation(now: date(2026, 8, 30)))
    }

    // MARK: - Briefing reconciliation: command seam (never fabricates real regeneration)

    func testFinalizingReturnsWaitingOnEvidenceWhenAConfirmationIsStillPending() {
        let yesterday = date(2026, 8, 29)
        let pendingReview = LocalEvidenceReview(
            id: "review-pending", sourceAssets: [], typedDetails: "",
            items: [.init(id: "item-1", category: .nutrition, title: "Nutrition", occurrenceDate: yesterday, fields: [], included: true)],
            status: .awaitingConfirmation
        )
        let workItem = BriefingReconciliationWorkItem(id: "wi-1", cadence: .weekly, evidenceDateKey: "2026-08-29", status: .revisionPending, resolvesAsNoOp: true)
        let store = LoggingSandboxStore(now: date(2026, 8, 30), reviews: ["review-pending": pendingReview], briefingReconciliationWorkItems: [workItem])
        XCTAssertEqual(store.finalizeBriefingReconciliation(now: date(2026, 8, 30)), .waitingOnEvidence)
    }

    func testFinalizingResolvesLocallyWhenTheRealSystemsOwnNoOpBranchApplies() {
        let workItem = BriefingReconciliationWorkItem(id: "wi-1", cadence: .weekly, evidenceDateKey: "2026-08-29", status: .revisionPending, resolvesAsNoOp: true)
        let store = LoggingSandboxStore(now: date(2026, 8, 30), briefingReconciliationWorkItems: [workItem])
        XCTAssertEqual(store.finalizeBriefingReconciliation(now: date(2026, 8, 30)), .resolvedNoOp)
        XCTAssertEqual(store.briefingReconciliationWorkItems.first?.status, .currentAfterRevision)
    }

    /// The critical safety property this task requires: Native must never
    /// fabricate a successful Briefing regeneration.
    func testFinalizingNeverFabricatesSuccessWhenRealRegenerationWouldBeRequired() {
        let workItem = BriefingReconciliationWorkItem(id: "wi-1", cadence: .weekly, evidenceDateKey: "2026-08-29", status: .revisionPending, resolvesAsNoOp: false)
        let store = LoggingSandboxStore(now: date(2026, 8, 30), briefingReconciliationWorkItems: [workItem])
        XCTAssertEqual(store.finalizeBriefingReconciliation(now: date(2026, 8, 30)), .requiresBriefingEngine)
        XCTAssertEqual(store.briefingReconciliationWorkItems.first?.status, .revisionPending, "A non-no-op item must remain unresolved rather than being marked falsely current.")
    }

    func testFinalizingWithNoPendingWorkItemIsANoOp() {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        XCTAssertEqual(store.finalizeBriefingReconciliation(now: date(2026, 8, 30)), .noPendingWorkItem)
    }

    // MARK: - Briefing state stays distinct from Priority state

    func testFinalizingBriefingReconciliationNeverTouchesPriorityState() {
        let now = date(2026, 8, 30)
        let workItem = BriefingReconciliationWorkItem(id: "wi-1", cadence: .weekly, evidenceDateKey: "2026-08-29", status: .revisionPending, resolvesAsNoOp: true)
        let store = LoggingSandboxStore(now: now, briefingReconciliationWorkItems: [workItem])
        let before = store.previousDayUnfinishedPriorities(now: now)
        _ = store.finalizeBriefingReconciliation(now: now)
        XCTAssertEqual(store.previousDayUnfinishedPriorities(now: now).map(\.id), before.map(\.id), "Priority occurrences must be completely unaffected by briefing finalization.")
    }

    // MARK: - Combined scenario: Priority + evidence + briefing reconciliation together

    func testAllThreeReconciliationSurfacesOperateIndependentlyInOneSession() throws {
        let now = date(2026, 8, 30)
        let yesterday = date(2026, 8, 29)
        let pendingPhoto = LocalEvidenceReview(
            id: "review-photo-pending", sourceAssets: [], typedDetails: "",
            items: [.init(id: "item-1", category: .progressPhotos, title: "Photos", occurrenceDate: yesterday, fields: [], included: true)],
            status: .awaitingConfirmation
        )
        let workItem = BriefingReconciliationWorkItem(id: "wi-1", cadence: .weekly, evidenceDateKey: "2026-08-29", status: .revisionPending, resolvesAsNoOp: true)
        let store = LoggingSandboxStore(now: now, reviews: ["review-photo-pending": pendingPhoto], briefingReconciliationWorkItems: [workItem])

        // 1. Priority reconciliation succeeds independently.
        let unfinished = store.previousDayUnfinishedPriorities(now: now)
        let dispositions = Dictionary(uniqueKeysWithValues: unfinished.map { ($0.id, (disposition: PriorityDisposition.completed, note: "")) })
        _ = try value(store.saveMorningCheckIn(weightText: "179.5", dispositions: dispositions, now: now))

        // 2. Evidence recovery still reflects the pending photo review, untouched by the weight save.
        XCTAssertEqual(store.evidenceRecoveryItems(now: now).first { $0.type == .photoSession }?.status, .pendingConfirmation)

        // 3. Briefing finalize is correctly blocked by the still-pending photo confirmation.
        XCTAssertEqual(store.finalizeBriefingReconciliation(now: now), .waitingOnEvidence)

        // 4. Confirming the photo review clears both the evidence-recovery card AND unblocks the briefing card.
        for item in store.review(id: "review-photo-pending")!.items {
            store.updateReviewItem(reviewId: "review-photo-pending", itemId: item.id) { $0.photoIdentities = [.init(id: "p1", attachmentId: "a1", orientation: .front, contraction: .relaxed, poseVariant: .standard, customLabel: "", goalRole: .primary, tags: "", confirmed: true)] }
            store.updateReviewItem(reviewId: "review-photo-pending", itemId: item.id) { updated in
                if let index = updated.fields.firstIndex(where: { $0.id == "timeOfDay" }) { updated.fields[index].value = "morning" } else { updated.fields.append(.init(id: "timeOfDay", label: "Time of day", value: "morning", unit: nil, required: false)) }
                if let index = updated.fields.firstIndex(where: { $0.id == "fasted" }) { updated.fields[index].value = "true" } else { updated.fields.append(.init(id: "fasted", label: "Fasted", value: "true", unit: nil, required: false)) }
                if let index = updated.fields.firstIndex(where: { $0.id == "originalUnedited" }) { updated.fields[index].value = "true" } else { updated.fields.append(.init(id: "originalUnedited", label: "Original", value: "true", unit: nil, required: false)) }
            }
        }
        _ = store.confirmReview(id: "review-photo-pending")
        XCTAssertFalse(store.evidenceRecoveryItems(now: now).contains { $0.type == .photoSession })
        XCTAssertEqual(store.finalizeBriefingReconciliation(now: now), .resolvedNoOp)
    }

    // MARK: - Timing: previous-day boundary, Pacific timezone, far-ahead UTC

    func testYesterdayResolvesAcrossAMonthBoundary() {
        let store = LoggingSandboxStore(now: date(2026, 9, 1))
        let items = store.evidenceRecoveryItems(now: date(2026, 9, 1))
        // September 1 -> August 31; confirm the destination carries the correct rolled-back date.
        XCTAssertEqual(items.first?.destination, .evidenceRecoveryUpload(type: items.first!.type, occurrenceDateKey: "2026-08-31"))
    }

    func testEvidenceRecoveryUsesPacificLocalDateNotDeviceUTCDate() {
        // 2026-08-30 06:00 UTC is still 2026-08-29 23:00 local in Pacific
        // (PDT = UTC-7 in August) — the "yesterday" window must resolve
        // against the Pacific date, not a naive UTC calendar date (which
        // would already have rolled to Aug 30).
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC")!
        let earlyUTC = utc.date(from: DateComponents(year: 2026, month: 8, day: 30, hour: 6))!
        let store = LoggingSandboxStore(now: earlyUTC)
        let items = store.evidenceRecoveryItems(now: earlyUTC)
        XCTAssertEqual(items.first?.destination, .evidenceRecoveryUpload(type: items.first!.type, occurrenceDateKey: "2026-08-28"), "At 06:00 UTC it is still Aug 29 in Pacific, so 'yesterday' is Aug 28.")
    }

    func testEvidenceRecoveryStaysStableUnderAFarAheadUTCOffsetTimeZone() {
        // A device set to Pacific/Kiritimati (UTC+14) must not shift the
        // Pacific-anchored recovery window — Native's calculator is
        // explicitly timezone-fixed to America/Los_Angeles, not device-local.
        let pacific = pacificDate(2026, 8, 30, 9)
        let storeAtPacific = LoggingSandboxStore(now: pacific)
        let itemsAtPacific = storeAtPacific.evidenceRecoveryItems(now: pacific)

        let original = TimeZone.current
        defer { NSTimeZone.default = original }
        NSTimeZone.default = TimeZone(identifier: "Pacific/Kiritimati")!
        let storeAtKiritimati = LoggingSandboxStore(now: pacific)
        let itemsAtKiritimati = storeAtKiritimati.evidenceRecoveryItems(now: pacific)

        XCTAssertEqual(itemsAtPacific.map(\.destination), itemsAtKiritimati.map(\.destination))
    }

    // MARK: - Stable identities

    func testEvidenceRecoveryDestinationsAreStableAcrossRepeatedCalls() {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        let first = store.evidenceRecoveryItems(now: date(2026, 8, 30))
        let second = store.evidenceRecoveryItems(now: date(2026, 8, 30))
        XCTAssertEqual(first.map(\.destination), second.map(\.destination))
    }

    // MARK: - Occurrence date preservation

    func testSetEvidenceOccurrenceDateKeyPreservesTheExactRecoveryDate() {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        store.setEvidenceOccurrenceDateKey("2026-08-15")
        XCTAssertEqual(LoggingSandboxStore.dateKey(store.evidenceDraft.occurrenceDate), "2026-08-15")
    }

    // MARK: - Test helpers

    private func date(_ year: Int, _ month: Int, _ day: Int) -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/Los_Angeles")!
        return calendar.date(from: .init(year: year, month: month, day: day, hour: 12))!
    }

    private func pacificDate(_ year: Int, _ month: Int, _ day: Int, _ hour: Int) -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/Los_Angeles")!
        return calendar.date(from: .init(year: year, month: month, day: day, hour: hour))!
    }

    private func value<T>(_ result: Result<T, LoggingSandboxError>) throws -> T {
        switch result { case .success(let value): value; case .failure(let error): throw error }
    }

    private func XCTAssertFailure<T>(_ result: Result<T, LoggingSandboxError>, _ message: String, file: StaticString = #filePath, line: UInt = #line) {
        switch result {
        case .success: XCTFail("Expected failure", file: file, line: line)
        case .failure(let error): XCTAssertEqual(error.message, message, file: file, line: line)
        }
    }
}
