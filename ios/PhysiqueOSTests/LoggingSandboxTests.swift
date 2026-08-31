import XCTest
@testable import PhysiqueOS

@MainActor
final class LoggingSandboxTests: XCTestCase {
    func testManualWeighInSupportsHistoricalOccurrenceAndLocalCorrection() throws {
        let occurrence = date(2026, 8, 18)
        let added = date(2026, 8, 30)
        let store = LoggingSandboxStore(now: added)

        let first = try value(store.saveWeighIn(weightText: "166.8", unit: .lb, date: occurrence, now: added))
        XCTAssertEqual(first.dateKey, "2026-08-18")
        XCTAssertEqual(first.recordedAt, added)
        XCTAssertEqual(first.correctionCount, 0)

        let unchanged = try value(store.saveWeighIn(weightText: "166.84", unit: .lb, date: occurrence, now: added.addingTimeInterval(30)))
        XCTAssertEqual(unchanged, first)

        let corrected = try value(store.saveWeighIn(weightText: "166.2", unit: .lb, date: occurrence, now: added.addingTimeInterval(60)))
        XCTAssertEqual(corrected.value, 166.2)
        XCTAssertEqual(corrected.correctionCount, 1)
        XCTAssertEqual(store.weighIn(on: occurrence), corrected)
    }

    func testManualWeighInValidationCoversUnitsBoundsAndFutureDates() {
        let today = date(2026, 8, 30)
        XCTAssertNil(ManualWeighInValidation.error(weightText: "165.2", unit: .lb, date: today, maximumDate: today))
        XCTAssertNil(ManualWeighInValidation.error(weightText: "75.0", unit: .kg, date: today, maximumDate: today))
        XCTAssertEqual(ManualWeighInValidation.error(weightText: "", unit: .lb, date: today, maximumDate: today), "Enter a valid weight.")
        XCTAssertEqual(ManualWeighInValidation.error(weightText: "49.9", unit: .lb, date: today, maximumDate: today), "Weight must be between 50 and 1,000 lb.")
        XCTAssertEqual(ManualWeighInValidation.error(weightText: "22.6", unit: .kg, date: today, maximumDate: today), "Weight must be between 22.7 and 453.6 kg.")
        XCTAssertEqual(ManualWeighInValidation.error(weightText: "165", unit: .lb, date: date(2026, 8, 31), maximumDate: today), "A weigh-in cannot be logged for a future date.")
    }

    func testAttachmentBatchPreservesSourceOrderAndRemoval() {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        let photo = SandboxAttachment(id: "photo", displayName: "front.jpg", source: .photos)
        let file = SandboxAttachment(id: "file", displayName: "scan.pdf", source: .files)
        store.addAttachments([photo, file])

        XCTAssertEqual(store.evidenceDraft.attachments, [photo, file])
        store.removeAttachment(id: photo.id)
        XCTAssertEqual(store.evidenceDraft.attachments, [file])
    }

    func testTypedDetailsCanEnterReviewWithoutAnAsset() throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        store.evidenceDraft.details = "Dinner totals from my handwritten log."
        store.evidenceDraft.scenario = .nutrition

        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let reviewId = try XCTUnwrap(try value(store.finishInterpretation(now: date(2026, 8, 30))))
        let review = try XCTUnwrap(store.review(id: reviewId))
        XCTAssertEqual(review.typedDetails, store.evidenceDraft.details)
        XCTAssertEqual(review.category, .nutrition)
    }

    func testEmptyAndFutureEvidenceAreRejectedWithoutLosingDraft() {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        XCTAssertFailure(store.submitEvidence(now: date(2026, 8, 30)), "Add a photo, file, or details before continuing.")

        store.evidenceDraft.details = "Backlog item"
        store.evidenceDraft.occurrenceDate = date(2026, 8, 31)
        XCTAssertFailure(store.submitEvidence(now: date(2026, 8, 30)), "Evidence cannot be dated in the future.")
        XCTAssertEqual(store.evidenceDraft.details, "Backlog item")
    }

    func testSupportedUploadExamplesCreateWebBackedReviewTypes() throws {
        let cases: [(EvidenceFixtureScenario, EvidenceCategory)] = [
            (.training, .training), (.cardio, .training), (.nutrition, .nutrition),
            (.weight, .weight), (.activity, .activity), (.dexa, .dexa),
            (.progressPhotos, .progressPhotos), (.labs, .labs), (.recovery, .recovery), (.generic, .generic),
            (.mixed, .nutrition),
        ]

        for (scenario, category) in cases {
            let store = preparedStore(scenario: scenario)
            _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
            let reviewId = try XCTUnwrap(try value(store.finishInterpretation(now: date(2026, 8, 30))))
            XCTAssertEqual(store.review(id: reviewId)?.category, category, scenario.rawValue)
        }
    }

    func testAutomaticEvidenceRoutingCoversEverySupportedReviewWithoutCrossCategoryLeakage() throws {
        let cases: [(String, EvidenceFixtureScenario, EvidenceCategory)] = [
            ("bench press workout sets", .training, .training),
            ("stair stepper cardio", .cardio, .training),
            ("nutrition calories protein", .nutrition, .nutrition),
            ("scale weight", .weight, .weight),
            ("activity rings steps", .activity, .activity),
            ("DEXA body composition", .dexa, .dexa),
            ("front side rear progress", .progressPhotos, .progressPhotos),
            ("CBC lab panel bloodwork", .labs, .labs),
            ("sleep recovery readiness", .recovery, .recovery),
            ("miscellaneous receipt", .generic, .generic),
        ]
        for (details, scenario, category) in cases {
            let store = LoggingSandboxStore(now: date(2026, 8, 30))
            store.evidenceDraft.details = details
            XCTAssertEqual(EvidenceSandboxRouter.scenario(for: store.evidenceDraft), scenario)
            _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
            let id = try XCTUnwrap(try value(store.finishInterpretation(now: date(2026, 8, 30))))
            XCTAssertEqual(store.review(id: id)?.category, category)
        }
    }

    func testAutomaticMixedUploadPreservesRecognizedSiblingCategories() throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        store.evidenceDraft.details = "nutrition calories and activity rings"
        XCTAssertEqual(EvidenceSandboxRouter.scenario(for: store.evidenceDraft), .mixed)
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let id = try XCTUnwrap(try value(store.finishInterpretation(now: date(2026, 8, 30))))
        let review = try XCTUnwrap(store.review(id: id))
        XCTAssertEqual(review.items.map(\.category), [.nutrition, .activity])
        XCTAssertEqual(review.completionTitle, "Evidence review complete")
    }

    func testMorningCheckInRequiresEveryPreviousDayPriorityAndSavesTodaysWeight() throws {
        let now = date(2026, 8, 30)
        let store = LoggingSandboxStore(now: now)
        XCTAssertFailure(store.saveMorningCheckIn(weightText: "166.4", now: now), "Choose an outcome for each unfinished priority.")
        store.updateMorningPriority(id: "priority-mobility", disposition: .completed)
        store.updateMorningPriority(id: "priority-evening", disposition: .note, note: "Travel day")
        let result = try value(store.saveMorningCheckIn(weightText: "166.4", now: now))
        XCTAssertEqual(result.reconciledPriorityCount, 2)
        XCTAssertEqual(result.weight.dateKey, "2026-08-30")
        XCTAssertEqual(store.weighIn(on: now)?.value, 166.4)
    }

    func testDirectTypedWeightAndCorrectionCompleteWithoutCreatingEvidenceReview() throws {
        let now = date(2026, 8, 30)
        let store = LoggingSandboxStore(now: now)
        store.morningPriorities.forEach { store.updateMorningPriority(id: $0.id, disposition: .completed) }

        _ = try value(store.saveMorningCheckIn(weightText: "166.4", now: now))
        XCTAssertTrue(store.reviews.isEmpty)
        let corrected = try value(store.saveMorningCheckIn(weightText: "166.1", now: now))
        XCTAssertEqual(corrected.weight.value, 166.1)
        XCTAssertEqual(corrected.weight.correctionCount, 1)
        XCTAssertTrue(store.reviews.isEmpty)
    }

    func testUploadedWeightStillRequiresTypeSpecificEvidenceReview() throws {
        let store = preparedStore(scenario: .weight)
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let id = try XCTUnwrap(try value(store.finishInterpretation(now: date(2026, 8, 30))))
        let review = try XCTUnwrap(store.review(id: id))
        XCTAssertEqual(review.category, .weight)
        XCTAssertEqual(review.status, .awaitingConfirmation)
        XCTAssertTrue(review.items[0].fields.contains { $0.id == "weight" })
    }

    func testCategorySpecificReviewFieldsMatchCurrentWebPresentationSemantics() {
        let draft = preparedStore(scenario: .training).evidenceDraft
        let training = LoggingSandboxFixtureFactory.review(category: .training, scenario: .training, draft: draft)
        XCTAssertEqual(training.items.map(\.title), ["Traditional Strength Training", "Outdoor Walk", "Indoor Cycling"])
        XCTAssertEqual(training.items[0].exercises.map(\.name), ["Bench Press", "Cable Fly"])
        XCTAssertEqual(training.items[0].exercises[0].sets.map(\.summary), ["8 reps @ 180 lb", "8 reps @ 180 lb", "7 reps @ 180 lb"])

        let nutrition = LoggingSandboxFixtureFactory.review(category: .nutrition, scenario: .nutrition, draft: draft)
        XCTAssertEqual(Set(nutrition.items[0].fields.map(\.id)), ["calories", "protein", "carbs", "fat", "source"])
        XCTAssertEqual(nutrition.items[0].meals.map(\.name), ["Breakfast", "Dinner"])
        XCTAssertTrue(nutrition.items[0].nutritionReplacementRequired)

        let activity = LoggingSandboxFixtureFactory.review(category: .activity, scenario: .activity, draft: draft)
        XCTAssertEqual(Set(activity.items[0].fields.map(\.id)), ["activeCalories", "exerciseMinutes", "duration", "source"])

        let dexa = LoggingSandboxFixtureFactory.review(category: .dexa, scenario: .dexa, draft: draft)
        XCTAssertEqual(Set(dexa.items[0].fields.map(\.id)), ["totalMass", "bodyFat", "fatMass", "leanMass", "source"])

        let photos = LoggingSandboxFixtureFactory.review(category: .progressPhotos, scenario: .progressPhotos, draft: draft)
        XCTAssertEqual(Set(photos.items[0].fields.map(\.id)), ["poses", "timeOfDay", "goalRelationship", "source"])

        let labs = LoggingSandboxFixtureFactory.review(category: .labs, scenario: .labs, draft: draft)
        XCTAssertEqual(Set(labs.items[0].fields.map(\.id)), ["panel", "hemoglobin", "source"])

        let recovery = LoggingSandboxFixtureFactory.review(category: .recovery, scenario: .recovery, draft: draft)
        XCTAssertEqual(Set(recovery.items[0].fields.map(\.id)), ["sleep", "source"])
    }

    func testReviewRequiresInclusionAndCompletesWithoutMutatingItsSourceFields() throws {
        let store = preparedStore(scenario: .weight)
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let reviewId = try XCTUnwrap(try value(store.finishInterpretation(now: date(2026, 8, 30))))

        let originalFields = try XCTUnwrap(store.review(id: reviewId)).items[0].fields
        store.updateReviewItem(reviewId: reviewId, itemId: "weight") { $0.included = false }
        XCTAssertFalse(try XCTUnwrap(store.review(id: reviewId)).canConfirm)
        XCTAssertFailure(store.confirmReview(id: reviewId), "Complete required fields and include the evidence before confirming.")

        store.updateReviewItem(reviewId: reviewId, itemId: "weight") { $0.included = true }
        let confirmed = try value(store.confirmReview(id: reviewId))
        XCTAssertEqual(confirmed.status, .confirmed)
        XCTAssertEqual(confirmed.items[0].fields, originalFields)
    }

    func testMultiWorkoutPackagePreservesIndependentCardsAndDecisions() throws {
        let store = preparedStore(scenario: .training)
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let reviewId = try XCTUnwrap(try value(store.finishInterpretation(now: date(2026, 8, 30))))
        let initial = try XCTUnwrap(store.review(id: reviewId))
        XCTAssertEqual(initial.items.map(\.title), ["Traditional Strength Training", "Outdoor Walk", "Indoor Cycling"])
        store.updateReviewItem(reviewId: reviewId, itemId: "walk") { $0.included = false }
        let updated = try XCTUnwrap(store.review(id: reviewId))
        XCTAssertEqual(updated.includedCount, 2)
        XCTAssertEqual(updated.excludedCount, 1)
        XCTAssertTrue(updated.canConfirm)
    }

    func testNutritionReplacementChoiceBlocksThenAllowsConfirmation() throws {
        let store = preparedStore(scenario: .nutrition)
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let id = try XCTUnwrap(try value(store.finishInterpretation(now: date(2026, 8, 30))))
        XCTAssertFalse(try XCTUnwrap(store.review(id: id)).canConfirm)
        store.updateReviewItem(reviewId: id, itemId: "nutrition") { $0.nutritionDisposition = .replaceExisting }
        XCTAssertTrue(try XCTUnwrap(store.review(id: id)).canConfirm)
    }

    func testDEXADedicatedIntakeRequiresPDFValuesAndFounderConfirmation() throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        store.evidenceDraft.scenario = .dexa
        store.evidenceDraft.attachments = [.init(id: "pdf", displayName: "BodySpec.pdf", source: .files)]
        XCTAssertFailure(store.submitEvidence(now: date(2026, 8, 30)), "Confirm the required DEXA values before continuing.")
        store.evidenceDraft.dexa.totalMass = "171.4"
        store.evidenceDraft.dexa.bodyFatPercentage = "8.3"
        store.evidenceDraft.dexa.fatMass = "14.3"
        store.evidenceDraft.dexa.leanMass = "150"
        store.evidenceDraft.dexa.boneMineralContent = "6.8"
        store.evidenceDraft.dexa.restingMetabolicRate = "1842"
        store.evidenceDraft.dexa.vatMass = "0.42"
        store.evidenceDraft.dexa.vatVolume = "11.8"
        store.evidenceDraft.dexa.valuesConfirmed = true
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let id = try XCTUnwrap(try value(store.finishInterpretation(now: date(2026, 8, 30))))
        XCTAssertEqual(
            Set(try XCTUnwrap(store.review(id: id)).items[0].fields.map(\.id)),
            ["totalMass", "bodyFat", "fatMass", "leanMass", "boneMineral", "rmr", "vatMass", "vatVolume", "source"]
        )
    }

    func testProgressPhotoIntakePreservesOrderIdentityAndSessionConfirmation() throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        store.setEvidenceScenario(.progressPhotos)
        store.addAttachments([
            .init(id: "front", displayName: "front.jpg", source: .photos),
            .init(id: "rear", displayName: "rear.jpg", source: .photos),
        ])
        XCTAssertFailure(store.submitEvidence(now: date(2026, 8, 30)), "Confirm every photo identity before continuing.")
        for identity in store.evidenceDraft.photoIdentities {
            store.updatePhotoIdentity(id: identity.id) { $0.confirmed = true }
        }
        store.evidenceDraft.photoSession.originalUnedited = true
        store.moveAttachment(id: "rear", by: -1)
        XCTAssertEqual(store.evidenceDraft.attachments.map(\.id), ["rear", "front"])
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let id = try XCTUnwrap(try value(store.finishInterpretation(now: date(2026, 8, 30))))
        XCTAssertFalse(try XCTUnwrap(store.review(id: id)).canConfirm)
        store.updateReviewItem(reviewId: id, itemId: "photos") { item in
            item.fields[item.fields.firstIndex(where: { $0.id == "timeOfDay" })!].value = "Morning"
        }
        XCTAssertTrue(try XCTUnwrap(store.review(id: id)).canConfirm)
    }

    func testSaveForLaterPreservesReviewAndDiscardRemovesIt() throws {
        let store = preparedStore(scenario: .activity)
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let reviewId = try XCTUnwrap(try value(store.finishInterpretation(now: date(2026, 8, 30))))
        XCTAssertTrue(store.containsReview(id: reviewId))
        store.discardReview(id: reviewId)
        XCTAssertFalse(store.containsReview(id: reviewId))
    }

    func testNumericEditingSupportsSelectAllTrueEmptyAndKeyboardFinishPolicy() {
        XCTAssertTrue(NumericEditingContract.shouldSelectAllOnFocus("135"))
        XCTAssertFalse(NumericEditingContract.shouldSelectAllOnFocus(""))
        XCTAssertEqual(NumericEditingContract.parsedValue("145"), 145)
        XCTAssertNil(NumericEditingContract.parsedValue(""))
        XCTAssertNil(NumericEditingContract.parsedValue("."))
        XCTAssertTrue(NumericEditingContract.finishActionVisible(step: .workout, keyboardVisible: false))
        XCTAssertFalse(NumericEditingContract.finishActionVisible(step: .workout, keyboardVisible: true))
        XCTAssertFalse(NumericEditingContract.finishActionVisible(step: .entry, keyboardVisible: false))
    }

    func testNativeLoggingDestinationsRoundTripWithoutPretendingServerRoutes() throws {
        let destinations: [AppDestination] = [
            .manualWeighIn,
            .evidenceIntake,
            .localEvidenceReview(reviewId: "local-review"),
        ]
        for destination in destinations {
            let encoded = try JSONEncoder().encode(destination)
            XCTAssertEqual(try JSONDecoder().decode(AppDestination.self, from: encoded), destination)
        }
        XCTAssertEqual(AppDestination.manualWeighIn.serverDestinationId, "native.manual-weigh-in")
        XCTAssertEqual(AppDestination.evidenceIntake.serverDestinationId, "native.evidence-intake")
    }

    private func preparedStore(scenario: EvidenceFixtureScenario) -> LoggingSandboxStore {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        store.evidenceDraft.details = "Uploaded evidence details"
        store.evidenceDraft.scenario = scenario
        if scenario == .dexa {
            store.evidenceDraft.attachments = [.init(id: "pdf", displayName: "BodySpec.pdf", source: .files)]
            store.evidenceDraft.dexa.totalMass = "171.4"
            store.evidenceDraft.dexa.bodyFatPercentage = "8.3"
            store.evidenceDraft.dexa.fatMass = "14.3"
            store.evidenceDraft.dexa.leanMass = "150"
            store.evidenceDraft.dexa.valuesConfirmed = true
        }
        if scenario == .progressPhotos {
            store.setEvidenceScenario(.progressPhotos)
            store.addAttachments([.init(id: "photo", displayName: "front.jpg", source: .photos)])
            store.evidenceDraft.photoIdentities.indices.forEach { store.evidenceDraft.photoIdentities[$0].confirmed = true }
            store.evidenceDraft.photoSession.originalUnedited = true
        }
        return store
    }

    private func date(_ year: Int, _ month: Int, _ day: Int) -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .current
        return calendar.date(from: DateComponents(year: year, month: month, day: day, hour: 12))!
    }

    private func value<T>(_ result: Result<T, LoggingSandboxError>) throws -> T {
        switch result {
        case .success(let value): value
        case .failure(let error): throw error
        }
    }

    private func XCTAssertFailure<T>(
        _ result: Result<T, LoggingSandboxError>,
        _ expectedMessage: String,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        switch result {
        case .success:
            XCTFail("Expected failure", file: file, line: line)
        case .failure(let error):
            XCTAssertEqual(error.message, expectedMessage, file: file, line: line)
        }
    }
}
