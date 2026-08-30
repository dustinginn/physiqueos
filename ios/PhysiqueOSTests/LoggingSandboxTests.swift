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

    func testRecognizedFixtureScenariosCreateEverySupportedReviewType() throws {
        let cases: [(EvidenceFixtureScenario, EvidenceCategory)] = [
            (.training, .training), (.cardio, .training), (.nutrition, .nutrition),
            (.weight, .weight), (.activity, .activity), (.dexa, .dexa),
            (.progressPhotos, .progressPhotos), (.recovery, .recovery), (.generic, .generic),
        ]

        for (scenario, category) in cases {
            let store = preparedStore(scenario: scenario)
            _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
            let reviewId = try XCTUnwrap(try value(store.finishInterpretation(now: date(2026, 8, 30))))
            XCTAssertEqual(store.review(id: reviewId)?.category, category, scenario.rawValue)
        }
    }

    func testCategorySpecificReviewFieldsMatchCurrentWebPresentationSemantics() {
        let draft = preparedStore(scenario: .training).evidenceDraft
        let training = LoggingSandboxFixtureFactory.review(category: .training, scenario: .training, draft: draft)
        XCTAssertTrue(Set(training.fields.map(\.id)).isSuperset(of: ["activityType", "exercise1", "variant", "relationship", "healthLink"]))

        let nutrition = LoggingSandboxFixtureFactory.review(category: .nutrition, scenario: .nutrition, draft: draft)
        XCTAssertTrue(Set(nutrition.fields.map(\.id)).isSuperset(of: ["meal", "calories", "protein", "carbs", "fat", "reconciliation"]))

        let activity = LoggingSandboxFixtureFactory.review(category: .activity, scenario: .activity, draft: draft)
        XCTAssertTrue(Set(activity.fields.map(\.id)).isSuperset(of: ["activeCalories", "exerciseMinutes", "separateWorkouts"]))

        let dexa = LoggingSandboxFixtureFactory.review(category: .dexa, scenario: .dexa, draft: draft)
        XCTAssertTrue(Set(dexa.fields.map(\.id)).isSuperset(of: ["totalMass", "bodyFat", "fatMass", "leanMass", "bmc", "rmr", "vatMass", "vatVolume"]))

        let photos = LoggingSandboxFixtureFactory.review(category: .progressPhotos, scenario: .progressPhotos, draft: draft)
        XCTAssertTrue(Set(photos.fields.map(\.id)).isSuperset(of: ["grouping", "front", "side", "rear", "timeOfDay", "goalRelationship"]))
    }

    func testAmbiguousEvidenceRequiresFounderClassificationBeforeReview() throws {
        let store = preparedStore(scenario: .ambiguous)
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        _ = try value(store.finishInterpretation(now: date(2026, 8, 30)))
        XCTAssertEqual(store.interpretationState, .ambiguous)

        let reviewId = store.resolveAmbiguity(as: .weight, now: date(2026, 8, 30))
        let review = try XCTUnwrap(store.review(id: reviewId))
        XCTAssertEqual(review.category, .weight)
        XCTAssertNotNil(review.warning)
    }

    func testNeedsMoreInformationRequiresClarificationAndRetainsSources() throws {
        let store = preparedStore(scenario: .needsMoreInformation)
        store.addAttachments([.init(id: "source", displayName: "unknown.png", source: .photos)])
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        _ = try value(store.finishInterpretation(now: date(2026, 8, 30)))
        XCTAssertEqual(store.interpretationState, .needsMoreInformation)
        XCTAssertFailure(store.continueAfterClarification(now: date(2026, 8, 30)), "Add the missing context before continuing.")

        store.evidenceDraft.clarification = "This is a recovery note."
        let reviewId = try value(store.continueAfterClarification(now: date(2026, 8, 30)))
        XCTAssertEqual(store.review(id: reviewId)?.sourceAssets.first?.id, "source")
    }

    func testUnsupportedEvidenceCanContinueOnlyAsHonestGenericReview() throws {
        let store = preparedStore(scenario: .unsupported)
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        _ = try value(store.finishInterpretation(now: date(2026, 8, 30)))
        XCTAssertEqual(store.interpretationState, .unsupported)

        let reviewId = store.continueUnsupportedAsGeneric(now: date(2026, 8, 30))
        let review = try XCTUnwrap(store.review(id: reviewId))
        XCTAssertEqual(review.category, .generic)
        XCTAssertTrue(review.warning?.contains("not recognized") == true)
    }

    func testLocalFailureRetryPreservesDateDetailsAndAssets() throws {
        let store = preparedStore(scenario: .localFailure)
        let occurrence = date(2026, 7, 14)
        store.evidenceDraft.occurrenceDate = occurrence
        store.addAttachments([.init(id: "file", displayName: "history.pdf", source: .files)])
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        _ = try value(store.finishInterpretation(now: date(2026, 8, 30)))
        XCTAssertEqual(store.interpretationState, .failed)

        store.retryInterpretation()
        XCTAssertEqual(store.interpretationState, .editing)
        XCTAssertEqual(store.evidenceDraft.occurrenceDate, occurrence)
        XCTAssertEqual(store.evidenceDraft.attachments.map(\.id), ["file"])
        XCTAssertEqual(store.evidenceDraft.details, "Fixture evidence details")
    }

    func testCorrectionValidationAndLocalCompletionNeverClaimCanonicalSuccess() throws {
        let store = preparedStore(scenario: .weight)
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let reviewId = try XCTUnwrap(try value(store.finishInterpretation(now: date(2026, 8, 30))))

        store.updateReview(id: reviewId) { review in
            review.correctionNote = "Corrected the scale reading."
            review.fields[0].value = "not a number"
        }
        XCTAssertFalse(try XCTUnwrap(store.review(id: reviewId)).canConfirm)
        XCTAssertFailure(store.confirmReview(id: reviewId), "Complete required fields and include the evidence before confirming.")

        store.updateReview(id: reviewId) { $0.fields[0].value = "166.4" }
        let confirmed = try value(store.confirmReview(id: reviewId))
        XCTAssertEqual(confirmed.status, .confirmedLocally)
        XCTAssertTrue(confirmed.provenance.contains("Device-only fixture"))
        XCTAssertFalse(confirmed.provenance.localizedCaseInsensitiveContains("production saved"))
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
        store.evidenceDraft.details = "Fixture evidence details"
        store.evidenceDraft.scenario = scenario
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
