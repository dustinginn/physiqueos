import XCTest
@testable import PhysiqueOS

@MainActor
final class LoggingSandboxTests: XCTestCase {
    func testManualWeighInHistoricalCorrectionAndMorningCheckIn() throws {
        let occurrence = date(2026, 8, 18), now = date(2026, 8, 30)
        let store = LoggingSandboxStore(now: now)
        XCTAssertEqual(try value(store.saveWeighIn(weightText: "166.8", unit: .lb, date: occurrence, now: now)).dateKey, "2026-08-18")
        XCTAssertEqual(try value(store.saveWeighIn(weightText: "166.2", unit: .lb, date: occurrence, now: now)).correctionCount, 1)
        XCTAssertFailure(store.saveMorningCheckIn(weightText: "166.4", now: now), "Choose an outcome for each unfinished priority.")
        store.morningPriorities.forEach { store.updateMorningPriority(id: $0.id, disposition: .completed) }
        XCTAssertEqual(try value(store.saveMorningCheckIn(weightText: "166.4", now: now)).reconciledPriorityCount, 2)
        XCTAssertTrue(store.reviews.isEmpty)
    }

    func testWeightValidationAndPacificCalendarDate() {
        let today = date(2026, 8, 30)
        XCTAssertNil(ManualWeighInValidation.error(weightText: "150.5", unit: .lb, date: today, maximumDate: today))
        XCTAssertEqual(ManualWeighInValidation.error(weightText: "", unit: .lb, date: today, maximumDate: today), "Enter a valid weight.")
        XCTAssertEqual(LoggingSandboxStore.dateKey(today), "2026-08-30")
    }

    func testAttachmentCountsOrderingIdentityRemovalAndReselection() {
        for count in [1, 2, 3, 6] {
            let store = LoggingSandboxStore(now: date(2026, 8, 30))
            let assets = (0..<count).map { SandboxAttachment(id: "id-\($0)", displayName: "same-name.png", source: .photos, contentType: "image/png", data: Data([UInt8($0)])) }
            store.addAttachments(assets)
            XCTAssertEqual(store.evidenceDraft.attachments.map(\.id), assets.map { $0.id })
            XCTAssertEqual(store.evidenceDraft.attachments.count, count)
            if count > 1 { store.removeAttachment(id: "id-0"); store.addAttachments([assets[0]]); XCTAssertEqual(store.evidenceDraft.attachments.count, count) }
        }
    }

    func testDiscardClearsDraftAndNeverContaminatesNextUpload() async throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        for cycle in 0..<2 {
            store.evidenceDraft.occurrenceDate = date(2026, 8, 30)
            store.evidenceDraft.scenario = .weight
            store.evidenceDraft.details = "Weight \(160 + cycle) lb"
            store.addAttachments((0..<3).map { .init(id: "\(cycle)-\($0)", displayName: "photo.png", source: .photos, contentType: "image/png", data: Data([UInt8($0)])) })
            _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
            let id = try await reviewID(store)
            XCTAssertEqual(store.review(id: id)?.sourceAssets.count, 3)
            XCTAssertTrue(store.evidenceDraft.attachments.isEmpty)
            store.discardReview(id: id)
            XCTAssertTrue(store.evidenceDraft.attachments.isEmpty)
        }
    }

    func testSaveForLaterPreservesExactReviewAndAssets() async throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        store.evidenceDraft.scenario = .activity
        store.evidenceDraft.details = "Active calories 612\nExercise minutes 47"
        store.addAttachments([.init(id: "asset", displayName: "rings.png", source: .photos, contentType: "image/png", data: Data([1, 2, 3]))])
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let id = try await reviewID(store)
        let saved = try XCTUnwrap(store.review(id: id))
        XCTAssertEqual(saved.sourceAssets.first?.data, Data([1, 2, 3]))
        XCTAssertEqual(store.review(id: id), saved)
    }

    func testAutomaticUsesActualSignalsAndRemainsHonestWhenUnresolved() async throws {
        let training = LoggingSandboxStore(now: date(2026, 8, 30))
        training.evidenceDraft.details = "Shoulder press machine\n150p 10r x4"
        XCTAssertEqual(EvidenceSandboxRouter.scenario(for: training.evidenceDraft), .training)
        _ = try value(training.submitEvidence(now: date(2026, 8, 30)))
        let id = try await reviewID(training)
        XCTAssertEqual(training.review(id: id)?.items.first?.exercises.first?.sets.count, 4)

        let unresolved = LoggingSandboxStore(now: date(2026, 8, 30))
        unresolved.evidenceDraft.details = "Unlabeled document"
        _ = try value(unresolved.submitEvidence(now: date(2026, 8, 30)))
        let unresolvedResult = await unresolved.finishInterpretation(now: date(2026, 8, 30))
        XCTAssertFailure(unresolvedResult, "Choose an evidence type so this upload can be reviewed.")
    }

    func testFounderTrainingShorthandAndSeparateCardioRecords() async throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        store.evidenceDraft.scenario = .training
        store.evidenceDraft.details = "Shoulder press machine\n150p 10r x4\n\nLateral raises machine\n75p 15r x4"
        store.addAttachments([
            .init(id: "walk", displayName: "walk.png", source: .photos, contentType: "image/png", extractedText: "Outdoor Walk\nDuration 32 min\nActive calories 210\nAverage heart rate 112"),
            .init(id: "cycle", displayName: "cycle.png", source: .photos, contentType: "image/png", extractedText: "Indoor Cycling\nDuration 24 min\nActive calories 280\nAverage heart rate 134"),
        ])
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let id = try await reviewID(store)
        let items = try XCTUnwrap(store.review(id: id)?.items)
        XCTAssertEqual(items.count, 3)
        XCTAssertEqual(items[0].exercises.map(\.name), ["Shoulder Press Machine", "Lateral Raises Machine"])
        XCTAssertEqual(items[0].exercises.map { $0.sets.count }, [4, 4])
        XCTAssertEqual(items[0].exercises[0].sets[0].reps, "10")
        XCTAssertEqual(items[0].exercises[0].sets[0].load, "150")
        XCTAssertEqual(items.dropFirst().map(\.title), ["Outdoor Walk", "Indoor Cycling"])

        store.updateReviewItem(reviewId: id, itemId: items[0].id) { item in
            item.exercises[0].sets[0].reps = "12"
            item.exercises[0].sets[0].load = "155"
            item.exercises[0].sets[0].refreshSummary()
        }
        let corrected = try XCTUnwrap(store.review(id: id)?.items[0].exercises[0].sets[0])
        XCTAssertEqual(corrected.summary, "12 reps @ 155 lb")
        XCTAssertTrue(try XCTUnwrap(store.review(id: id)).canConfirm)
    }

    func testTypeSpecificReviewsUseSubmittedValuesAndNeverCannedValues() async throws {
        let cases: [(EvidenceFixtureScenario, String, String, String)] = [
            (.nutrition, "Calories 1987 Protein 176 Carbohydrates 204 Fat 61", "calories", "1987"),
            (.weight, "Body weight 164.7 lb", "weight", "164.7"),
            (.activity, "Active calories 612 Exercise minutes 47 Steps 10234", "activeCalories", "612"),
            (.recovery, "Sleep 7.4 hr HRV 52 ms", "sleep", "7.4"),
        ]
        for (scenario, details, field, expected) in cases {
            let store = LoggingSandboxStore(now: date(2026, 8, 30)); store.evidenceDraft.scenario = scenario; store.evidenceDraft.details = details
            _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
            let id = try await reviewID(store)
            XCTAssertEqual(store.review(id: id)?.items[0].fields.first(where: { $0.id == field })?.value, expected)
        }
    }

    func testDEXAOnlyUsesExtractedOrCorrectedValues() async throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30)); store.evidenceDraft.scenario = .dexa
        store.addAttachments([.init(id: "pdf", displayName: "BodySpec.pdf", source: .files, contentType: "application/pdf", extractedText: "Total mass 168.3\nBody fat 7.6\nFat mass 12.8\nLean mass 148.3")])
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let id = try await reviewID(store)
        let fields = try XCTUnwrap(store.review(id: id)?.items[0].fields)
        XCTAssertEqual(fields.first(where: { $0.id == "totalMass" })?.value, "168.3")
        XCTAssertEqual(fields.first(where: { $0.id == "rmr" })?.value, "")
    }

    func testProgressPhotosBeginUnconfirmedAndRequireRealSessionConditions() async throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30)); store.setEvidenceScenario(.progressPhotos)
        store.addAttachments([.init(id: "front", displayName: "front.jpg", source: .photos, contentType: "image/jpeg", data: Data([1]))])
        XCTAssertEqual(store.evidenceDraft.photoIdentities.first?.orientation, .unconfirmed)
        XCTAssertFailure(store.submitEvidence(now: date(2026, 8, 30)), "Confirm every photo identity before continuing.")
        let id = try XCTUnwrap(store.evidenceDraft.photoIdentities.first?.id)
        store.updatePhotoIdentity(id: id) { $0.orientation = .front; $0.contraction = .relaxed; $0.confirmed = true }
        store.evidenceDraft.photoSession.timeOfDay = .morning; store.evidenceDraft.photoSession.fasted = true; store.evidenceDraft.photoSession.originalUnedited = true
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let reviewId = try await reviewID(store)
        let item = try XCTUnwrap(store.review(id: reviewId)?.items[0])
        XCTAssertTrue(item.hasRequiredValues)
        XCTAssertFalse(item.fields.contains { ["source", "goalRelationship", "linkedGoal", "tags"].contains($0.id) })
    }

    func testRereadUsesPreservedSubmissionNotFixtureReplacement() async throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30)); store.evidenceDraft.scenario = .weight; store.evidenceDraft.details = "Weight 163.2 lb"
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let id = try await reviewID(store)
        let reread = try value(await store.reprocessReview(id: id))
        XCTAssertEqual(reread.items[0].fields.first(where: { $0.id == "weight" })?.value, "163.2")
    }

    func testLocalTextInterpretationRecordsSubThreeSecondPipeline() async throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        store.evidenceDraft.scenario = .nutrition
        store.evidenceDraft.details = "Calories 1987 Protein 176 Carbohydrates 204 Fat 61"
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        _ = try await reviewID(store)
        XCTAssertNotNil(store.pipelineTimings.interpretationSeconds)
        XCTAssertNotNil(store.pipelineTimings.reconciliationSeconds)
        XCTAssertLessThan(try XCTUnwrap(store.pipelineTimings.reviewReadySeconds), 3)
    }

    func testNumericEditingPolicyRemainsFastAndHonest() {
        XCTAssertTrue(NumericEditingContract.shouldSelectAllOnFocus("135")); XCTAssertFalse(NumericEditingContract.shouldSelectAllOnFocus(""))
        XCTAssertNil(NumericEditingContract.parsedValue("")); XCTAssertEqual(NumericEditingContract.parsedValue("145"), 145)
        XCTAssertFalse(NumericEditingContract.finishActionVisible(step: .workout, keyboardVisible: true))
    }

    private func date(_ year: Int, _ month: Int, _ day: Int) -> Date { var c = Calendar(identifier: .gregorian); c.timeZone = TimeZone(identifier: "America/Los_Angeles")!; return c.date(from: .init(year: year, month: month, day: day, hour: 12))! }
    private func value<T>(_ result: Result<T, LoggingSandboxError>) throws -> T { switch result { case .success(let value): value; case .failure(let error): throw error } }
    private func reviewID(_ store: LoggingSandboxStore) async throws -> String { let result = await store.finishInterpretation(now: date(2026, 8, 30)); return try XCTUnwrap(try value(result)) }
    private func XCTAssertFailure<T>(_ result: Result<T, LoggingSandboxError>, _ message: String, file: StaticString = #filePath, line: UInt = #line) { switch result { case .success: XCTFail("Expected failure", file: file, line: line); case .failure(let error): XCTAssertEqual(error.message, message, file: file, line: line) } }
}
