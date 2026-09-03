import XCTest
import UIKit
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

    func testPhotoLoaderRetainsOneThreeAndSixInSourceOrderWithStableIDs() async {
        for count in [1, 3, 6] {
            var activeLoads = 0
            var maximumActiveLoads = 0
            var completionOrder: [Int] = []
            let requests = (0..<count).map { index in
                EvidenceAttachmentLoader.PhotoLoadRequest(
                    stableIdentifier: "library-asset-\(index)",
                    contentTypeIdentifier: "public.jpeg",
                    loadData: {
                        activeLoads += 1
                        maximumActiveLoads = max(maximumActiveLoads, activeLoads)
                        await Task.yield()
                        completionOrder.append(index)
                        activeLoads -= 1
                        return Data(repeating: UInt8(index), count: 1_024)
                    }
                )
            }

            let attachments = await EvidenceAttachmentLoader.photos(requests, startingAt: 0)

            XCTAssertEqual(attachments.count, count)
            XCTAssertEqual(attachments.map(\.id), (0..<count).map { "photo-library-asset-\($0)" })
            XCTAssertEqual(attachments.map(\.displayName), (1...count).map { "Photo \($0)" })
            XCTAssertEqual(attachments.map(\.contentType), Array(repeating: "image/jpeg", count: count))
            XCTAssertEqual(completionOrder, Array(0..<count))
            XCTAssertEqual(maximumActiveLoads, 1, "Photo bytes must load serially to bound peak memory.")
        }
    }

    func testPhotoLoaderRetainsFailuresBesideSuccessfulSelections() async {
        enum ExpectedFailure: Error { case unavailable }
        let requests = [
            EvidenceAttachmentLoader.PhotoLoadRequest(stableIdentifier: "one", contentTypeIdentifier: "public.jpeg", loadData: { Data([1]) }),
            EvidenceAttachmentLoader.PhotoLoadRequest(stableIdentifier: "two", contentTypeIdentifier: "public.heic", loadData: { throw ExpectedFailure.unavailable }),
            EvidenceAttachmentLoader.PhotoLoadRequest(stableIdentifier: "three", contentTypeIdentifier: "public.png", loadData: { nil }),
        ]

        let attachments = await EvidenceAttachmentLoader.photos(requests, startingAt: 4)

        XCTAssertEqual(attachments.count, 3)
        XCTAssertEqual(attachments.map(\.displayName), ["Photo 5", "Photo 6", "Photo 7"])
        XCTAssertEqual(attachments.map(\.id), ["photo-one", "photo-two", "photo-three"])
        XCTAssertEqual(attachments.compactMap(\.data), [Data([1])])
        XCTAssertNil(attachments[0].loadError)
        XCTAssertNotNil(attachments[1].loadError)
        XCTAssertEqual(attachments[2].loadError, "The photo could not be loaded.")
    }

    func testPhotoPreviewDownsamplesWithoutReplacingOriginalBytes() throws {
        let source = UIGraphicsImageRenderer(size: CGSize(width: 2_000, height: 1_000)).image { context in
            UIColor.purple.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 2_000, height: 1_000))
        }
        let data = try XCTUnwrap(source.jpegData(compressionQuality: 0.9))
        let preview = try XCTUnwrap(EvidenceAttachmentLoader.previewImage(data: data, maximumPixelSize: 200))

        XCTAssertLessThanOrEqual(max(preview.cgImage?.width ?? 0, preview.cgImage?.height ?? 0), 200)
        XCTAssertFalse(data.isEmpty, "The original compressed bytes remain available for upload and review.")
    }

    func testFilesLoaderStillRetainsRealFileBytes() throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("physiqueos-photo-fix-test.txt")
        let expected = Data("file evidence".utf8)
        try expected.write(to: url)
        defer { try? FileManager.default.removeItem(at: url) }

        let attachment = try XCTUnwrap(EvidenceAttachmentLoader.files([url]).first)
        XCTAssertEqual(attachment.source, .files)
        XCTAssertEqual(attachment.data, expected)
        XCTAssertNil(attachment.loadError)
    }

    func testInterpretationPreservesOrderAndSkipsFailedAttachments() async {
        var draft = EvidenceIntakeDraft.fresh(now: date(2026, 8, 30))
        draft.attachments = [
            .init(id: "failed", displayName: "Photo 1", source: .photos, contentType: "image/jpeg", loadError: "Unavailable"),
            .init(id: "text", displayName: "notes.txt", source: .files, contentType: "text/plain", data: Data("Weight 164.7 lb".utf8)),
            .init(id: "invalid-image", displayName: "Photo 2", source: .photos, contentType: "image/jpeg", data: Data([0, 1, 2])),
        ]

        let prepared = await EvidenceLocalInterpretation.prepare(draft)

        XCTAssertEqual(prepared.attachments.map(\.id), ["failed", "text", "invalid-image"])
        XCTAssertNil(prepared.attachments[0].extractedText)
        XCTAssertEqual(prepared.attachments[1].extractedText, "Weight 164.7 lb")
        XCTAssertNil(prepared.attachments[2].extractedText)
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
        XCTAssertEqual(EvidenceSandboxRouter.scenario(for: training.evidenceDraft), .workout)
        _ = try value(training.submitEvidence(now: date(2026, 8, 30)))
        let id = try await reviewID(training)
        XCTAssertEqual(training.review(id: id)?.items.first?.exercises.first?.sets.count, 4)

        let unresolved = LoggingSandboxStore(now: date(2026, 8, 30))
        unresolved.evidenceDraft.details = "Unlabeled document"
        _ = try value(unresolved.submitEvidence(now: date(2026, 8, 30)))
        let unresolvedResult = await unresolved.finishInterpretation(now: date(2026, 8, 30))
        XCTAssertFailure(unresolvedResult, "Choose an evidence type so this upload can be reviewed.")
    }

    func testAutomaticStrengthPackageWithCaloriesRemainsOneWorkoutDomain() async throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        store.evidenceDraft.details = "Bicep curl machine\n100p 10r x4\n\nTricep press machine\n130p 10r x4"
        store.addAttachments([
            .init(id: "strength", displayName: "strength.png", source: .photos, contentType: "image/png", extractedText: "Traditional Strength Training\nDuration 42 min\nActive Calories 188\nAverage Heart Rate 116"),
            .init(id: "walk-one", displayName: "walk-one.png", source: .photos, contentType: "image/png", extractedText: "Outdoor Walk\nDuration 18 min\nActive Calories 91\nAverage Heart Rate 104"),
            .init(id: "walk-two", displayName: "walk-two.png", source: .photos, contentType: "image/png", extractedText: "Outdoor Walk\nDuration 27 min\nActive Calories 137\nAverage Heart Rate 109"),
        ])

        XCTAssertEqual(EvidenceSandboxRouter.detectedCategories(for: store.evidenceDraft), [.training])
        XCTAssertEqual(EvidenceSandboxRouter.scenario(for: store.evidenceDraft), .workout)
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let id = try await reviewID(store)
        let items = try XCTUnwrap(store.review(id: id)?.items)

        XCTAssertEqual(items.count, 3)
        XCTAssertTrue(items.allSatisfy { $0.category == .training })
        XCTAssertEqual(items[0].exercises.map(\.name), ["Bicep Curl Machine", "Tricep Press Machine"])
        XCTAssertEqual(items[0].exercises.map { $0.sets.count }, [4, 4])
        XCTAssertEqual(Array(items.dropFirst()).map(\.title), ["Outdoor Walk", "Outdoor Walk"])
        XCTAssertFalse(items.contains { $0.category == .nutrition })
    }

    func testRealFounderWorkoutSignalsPreserveRepsFirstStrengthAndTwoWalks() async throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 31))
        store.evidenceDraft.details = "Bicep curls\n12r 50p x4\n\nSpider curls\n12r 40p x4"
        store.addAttachments([
            .init(
                id: "strength",
                displayName: "IMG_2165.PNG",
                source: .photos,
                contentType: "image/png",
                extractedText: "Traditional Strength Training\nWorkout Time\n1:10:13\nActive Calories\n381CAL\nTotal Calories\n490CAL\nAvg. Heart Rate\n111BPM"
            ),
            .init(
                id: "walk-one",
                displayName: "IMG_2164.PNG",
                source: .photos,
                contentType: "image/png",
                extractedText: "Outdoor Walk\nWorkout Time\n0:15:23\nDistance\n0.96MI\nActive Calories\n106CAL\nTotal Calories\n131CAL\nAvg. Heart Rate\n121BPM"
            ),
            .init(
                id: "walk-two",
                displayName: "IMG_2166.PNG",
                source: .photos,
                contentType: "image/png",
                extractedText: "Outdoor Walk\nWorkout Time\n0:17:32\nDistance\n1.01MI\nActive Calories\n89CAL\nTotal Calories\n117CAL\nAvg. Heart Rate\n97BPM"
            ),
        ])

        XCTAssertEqual(EvidenceSandboxRouter.detectedCategories(for: store.evidenceDraft), [.training])
        XCTAssertEqual(EvidenceSandboxRouter.scenario(for: store.evidenceDraft), .workout)
        _ = try value(store.submitEvidence(now: date(2026, 8, 31)))
        let id = try await reviewID(store)
        let items = try XCTUnwrap(store.review(id: id)?.items)

        XCTAssertEqual(items.map(\.title), ["Traditional Strength Training", "Outdoor Walk", "Outdoor Walk"])
        XCTAssertTrue(items.allSatisfy { $0.category == .training })
        XCTAssertEqual(items[0].exercises.map(\.name), ["Bicep Curls", "Spider Curls"])
        XCTAssertEqual(items[0].exercises.map { $0.sets.count }, [4, 4])
        XCTAssertEqual(items[0].exercises[0].sets[0].reps, "12")
        XCTAssertEqual(items[0].exercises[0].sets[0].load, "50")
        XCTAssertEqual(items[0].fields.first(where: { $0.id == "duration" })?.value, "1:10:13")
        XCTAssertEqual(items[0].fields.first(where: { $0.id == "activeCalories" })?.value, "381")
        XCTAssertEqual(items[1].fields.first(where: { $0.id == "distance" })?.value, "0.96")
        XCTAssertEqual(items[2].fields.first(where: { $0.id == "distance" })?.value, "1.01")
        XCTAssertFalse(items.contains { $0.category == .nutrition })
    }

    func testNumericToolbarIsNotRebuiltWhenFocusNeighborsAreUnchanged() {
        let field = NumericEditField(
            text: .constant("12"),
            accessibilityLabel: "Reps",
            fieldID: "set-1-reps",
            focusedFieldID: .constant(nil),
            nextFieldID: "set-1-load"
        )
        let coordinator = field.makeCoordinator()
        let toolbar = UIToolbar()

        coordinator.refreshToolbar(toolbar)
        let initialItems = toolbar.items ?? []
        coordinator.refreshToolbar(toolbar)
        let unchangedItems = toolbar.items ?? []

        XCTAssertEqual(initialItems.count, unchangedItems.count)
        XCTAssertTrue(zip(initialItems, unchangedItems).allSatisfy { $0 === $1 })
    }

    func testCaloriesAloneNeverCreateNutritionInsideWorkoutEvidence() {
        var draft = EvidenceIntakeDraft.fresh(now: date(2026, 8, 30))
        draft.attachments = [
            .init(id: "workout", displayName: "workout.png", source: .photos, contentType: "image/png", extractedText: "Traditional Strength Training\nDuration 35 min\nActive Calories 164"),
        ]

        XCTAssertEqual(EvidenceSandboxRouter.detectedCategories(for: draft), [.training])
        XCTAssertEqual(EvidenceSandboxRouter.scenario(for: draft), .workout)
    }

    func testNutritionSignalsStillClassifyNutritionAndCrossDomainRemainsMixed() {
        var nutrition = EvidenceIntakeDraft.fresh(now: date(2026, 8, 30))
        nutrition.details = "Daily nutrition summary Calories 1987 Protein 176 Carbohydrates 204 Fat 61"
        XCTAssertEqual(EvidenceSandboxRouter.detectedCategories(for: nutrition), [.nutrition])
        XCTAssertEqual(EvidenceSandboxRouter.scenario(for: nutrition), .nutrition)

        nutrition.details += "\nActivity rings Exercise minutes 47 Steps 10234"
        XCTAssertEqual(Set(EvidenceSandboxRouter.detectedCategories(for: nutrition)), Set([.nutrition, .activity]))
        XCTAssertEqual(EvidenceSandboxRouter.scenario(for: nutrition), .mixed)
    }

    // MARK: - Multi-domain package reconciliation
    //
    // Regression coverage for a real Founder-reported bug: a single upload
    // containing Nutrition + Activity + Training evidence silently dropped
    // Activity, while the same Activity evidence survived when paired with
    // only Nutrition. Root cause: `EvidenceSandboxRouter.detectedCategories`
    // classified one blob of text concatenated across the *entire* package,
    // and Activity/Weight detection was gated on `!trainingSignal` computed
    // over that same whole-package blob — so Training evidence anywhere in
    // the package silently suppressed Activity (and Weight) detection
    // everywhere in the package, even in a completely different attachment.
    // Fixed by classifying each source (typed details, each attachment's own
    // extracted text + filename) independently and unioning the results, so
    // the same intra-source disambiguation still applies but never crosses
    // between genuinely separate sources.

    private static let nutritionSourceText = "Daily nutrition summary Calories 1987 Protein 176 Carbohydrates 204 Fat 61"
    private static let activitySourceText = "9:47\nActivity\nMove 923 cal\nExercise 114 min\nStand 15 hr\nSteps 8,473\n47 bpm"
    private static let trainingCardioSourceText = "Outdoor Walk\nWorkout Time 18 min\nActive Calories 91\nAverage Heart Rate 104"
    private static let secondTrainingCardioSourceText = "Indoor Cycling\nWorkout Time 24 min\nActive Calories 280\nAverage Heart Rate 134"

    private func domainAttachment(id: String, text: String) -> SandboxAttachment {
        .init(id: id, displayName: "\(id).png", source: .photos, contentType: "image/png", extractedText: text)
    }

    func testNutritionAndActivityBothSurviveAsFullReviewItems() async throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        store.addAttachments([
            domainAttachment(id: "nutrition", text: Self.nutritionSourceText),
            domainAttachment(id: "activity", text: Self.activitySourceText),
        ])
        XCTAssertEqual(Set(EvidenceSandboxRouter.detectedCategories(for: store.evidenceDraft)), Set([.nutrition, .activity]))
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let id = try await reviewID(store)
        let items = try XCTUnwrap(store.review(id: id)?.items)

        XCTAssertEqual(Set(items.map(\.category)), Set([.nutrition, .activity]))
        let nutrition = try XCTUnwrap(items.first { $0.category == .nutrition })
        XCTAssertEqual(nutrition.fields.first { $0.id == "calories" }?.value, "1987")
        let activity = try XCTUnwrap(items.first { $0.category == .activity })
        XCTAssertEqual(activity.fields.first { $0.id == "steps" }?.value, "8473")
        XCTAssertEqual(activity.fields.first { $0.id == "activeCalories" }?.value, "923")
    }

    func testNutritionAndTrainingBothSurviveAsFullReviewItems() async throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        store.addAttachments([
            domainAttachment(id: "nutrition", text: Self.nutritionSourceText),
            domainAttachment(id: "training", text: Self.trainingCardioSourceText),
        ])
        XCTAssertEqual(Set(EvidenceSandboxRouter.detectedCategories(for: store.evidenceDraft)), Set([.nutrition, .training]))
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let id = try await reviewID(store)
        let items = try XCTUnwrap(store.review(id: id)?.items)

        XCTAssertEqual(Set(items.map(\.category)), Set([.nutrition, .training]))
        let nutrition = try XCTUnwrap(items.first { $0.category == .nutrition })
        XCTAssertEqual(nutrition.fields.first { $0.id == "calories" }?.value, "1987")
        let training = try XCTUnwrap(items.first { $0.category == .training })
        XCTAssertEqual(training.title, "Outdoor Walk")
        XCTAssertEqual(training.fields.first { $0.id == "activeCalories" }?.value, "91")
    }

    /// The pairing that was never actually broken in isolation — Activity
    /// and Training together, with no Nutrition present. Confirms the fix
    /// didn't just special-case the three-domain case.
    func testActivityAndTrainingBothSurviveAsFullReviewItems() async throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        store.addAttachments([
            domainAttachment(id: "activity", text: Self.activitySourceText),
            domainAttachment(id: "training", text: Self.trainingCardioSourceText),
        ])
        XCTAssertEqual(Set(EvidenceSandboxRouter.detectedCategories(for: store.evidenceDraft)), Set([.activity, .training]))
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let id = try await reviewID(store)
        let items = try XCTUnwrap(store.review(id: id)?.items)

        XCTAssertEqual(Set(items.map(\.category)), Set([.activity, .training]))
        let activity = try XCTUnwrap(items.first { $0.category == .activity })
        XCTAssertEqual(activity.fields.first { $0.id == "steps" }?.value, "8473")
        let training = try XCTUnwrap(items.first { $0.category == .training })
        XCTAssertEqual(training.fields.first { $0.id == "activeCalories" }?.value, "91")
        // Workout calories must not replace/overwrite Activity's own totals.
        XCTAssertNotEqual(activity.fields.first { $0.id == "activeCalories" }?.value, training.fields.first { $0.id == "activeCalories" }?.value)
    }

    /// The exact reported failure: Nutrition + Activity + Training in one
    /// package, checked across every asset order — since the original bug
    /// was order-dependent on which attachment happened to carry the
    /// Training signal, this must hold regardless of upload order.
    func testTripleDomainPackageSurvivesInEveryAssetOrder() async throws {
        let orders: [[String]] = [
            ["nutrition", "activity", "training"],
            ["training", "nutrition", "activity"],
            ["activity", "training", "nutrition"],
            ["training", "activity", "nutrition"],
        ]
        for order in orders {
            let attachmentsByDomain: [String: SandboxAttachment] = [
                "nutrition": domainAttachment(id: "nutrition", text: Self.nutritionSourceText),
                "activity": domainAttachment(id: "activity", text: Self.activitySourceText),
                "training": domainAttachment(id: "training", text: Self.trainingCardioSourceText),
            ]
            let store = LoggingSandboxStore(now: date(2026, 8, 30))
            store.addAttachments(order.compactMap { attachmentsByDomain[$0] })

            let categories = Set(EvidenceSandboxRouter.detectedCategories(for: store.evidenceDraft))
            XCTAssertEqual(categories, Set([.nutrition, .activity, .training]), "order: \(order)")

            _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
            let id = try await reviewID(store)
            let items = try XCTUnwrap(store.review(id: id)?.items, "order: \(order)")

            XCTAssertEqual(Set(items.map(\.category)), Set([.nutrition, .activity, .training]), "order: \(order)")
            // No duplicate Activity or Training evidence regardless of order.
            XCTAssertEqual(items.filter { $0.category == .activity }.count, 1, "order: \(order)")
            XCTAssertEqual(items.filter { $0.category == .training }.count, 1, "order: \(order)")
            let nutrition = try XCTUnwrap(items.first { $0.category == .nutrition }, "order: \(order)")
            let activity = try XCTUnwrap(items.first { $0.category == .activity }, "order: \(order)")
            let training = try XCTUnwrap(items.first { $0.category == .training }, "order: \(order)")
            XCTAssertEqual(nutrition.fields.first { $0.id == "calories" }?.value, "1987", "order: \(order)")
            XCTAssertEqual(activity.fields.first { $0.id == "steps" }?.value, "8473", "order: \(order)")
            XCTAssertEqual(activity.fields.first { $0.id == "activeCalories" }?.value, "923", "order: \(order)")
            XCTAssertEqual(training.fields.first { $0.id == "activeCalories" }?.value, "91", "order: \(order)")
        }
    }

    /// Exactly the shape the Founder actually uploaded: one screenshot per
    /// domain in a single package.
    func testOneActivityOneNutritionOneTrainingScreenshotAllSurvive() async throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        store.addAttachments([
            domainAttachment(id: "activity", text: Self.activitySourceText),
            domainAttachment(id: "nutrition", text: Self.nutritionSourceText),
            domainAttachment(id: "training", text: Self.trainingCardioSourceText),
        ])
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let id = try await reviewID(store)
        let items = try XCTUnwrap(store.review(id: id)?.items)

        XCTAssertEqual(items.count, 3)
        XCTAssertEqual(Set(items.map(\.category)), Set([.nutrition, .activity, .training]))
    }

    func testActivityNutritionAndMultipleTrainingScreenshotsAllSurvive() async throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        store.addAttachments([
            domainAttachment(id: "activity", text: Self.activitySourceText),
            domainAttachment(id: "nutrition", text: Self.nutritionSourceText),
            domainAttachment(id: "walk", text: Self.trainingCardioSourceText),
            domainAttachment(id: "cycle", text: Self.secondTrainingCardioSourceText),
        ])
        XCTAssertEqual(Set(EvidenceSandboxRouter.detectedCategories(for: store.evidenceDraft)), Set([.nutrition, .activity, .training]))
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let id = try await reviewID(store)
        let items = try XCTUnwrap(store.review(id: id)?.items)

        XCTAssertEqual(items.filter { $0.category == .training }.count, 2, "two distinct Training workout screenshots, not merged or deduplicated away")
        XCTAssertEqual(items.filter { $0.category == .activity }.count, 1)
        XCTAssertEqual(items.filter { $0.category == .nutrition }.count, 1)
        XCTAssertEqual(Set(items.filter { $0.category == .training }.map(\.title)), Set(["Outdoor Walk", "Indoor Cycling"]))
    }

    /// Multiple typed Training exercises (a real workout with sets) plus a
    /// separate Activity day screenshot plus Nutrition — the fullest
    /// realistic package shape.
    func testMultipleTrainingExercisesActivityDayAndNutritionAllSurvive() async throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        store.evidenceDraft.details = "Bicep curls\n12r 50p x4\n\nSpider curls\n12r 40p x4"
        store.addAttachments([
            domainAttachment(id: "activity", text: Self.activitySourceText),
            domainAttachment(id: "nutrition", text: Self.nutritionSourceText),
        ])
        XCTAssertEqual(Set(EvidenceSandboxRouter.detectedCategories(for: store.evidenceDraft)), Set([.nutrition, .activity, .training]))
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let id = try await reviewID(store)
        let items = try XCTUnwrap(store.review(id: id)?.items)

        let training = try XCTUnwrap(items.first { $0.category == .training })
        XCTAssertEqual(training.exercises.map(\.name), ["Bicep Curls", "Spider Curls"])
        XCTAssertEqual(training.exercises.map { $0.sets.count }, [4, 4])
        let activity = try XCTUnwrap(items.first { $0.category == .activity })
        XCTAssertEqual(activity.fields.first { $0.id == "steps" }?.value, "8473")
        let nutrition = try XCTUnwrap(items.first { $0.category == .nutrition })
        XCTAssertEqual(nutrition.fields.first { $0.id == "calories" }?.value, "1987")
        XCTAssertEqual(items.count, 3)
    }

    func testMyFitnessPalDailyTotalAndMacrosSurviveWhileInterfaceChromeIsExcluded() async throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        store.evidenceDraft.scenario = .nutrition
        store.addAttachments([
            .init(
                id: "mfp",
                displayName: "MyFitnessPal.png",
                source: .photos,
                contentType: "image/png",
                extractedText: """
                MyFitnessPal
                Calories Carbohydrates Fat Protein
                Totals 1,234 26 31 189
                Carbohydrates 26 g
                Fat 31 g
                Protein 189 g
                Breakfast
                Greek Yogurt
                Log more
                Lunch
                Chicken Breast
                Add food
                """
            ),
        ])

        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let reviewId = try await reviewID(store)
        let item = try XCTUnwrap(store.review(id: reviewId)?.items.first)

        XCTAssertEqual(item.fields.first(where: { $0.id == "calories" })?.value, "1234")
        XCTAssertEqual(item.fields.first(where: { $0.id == "protein" })?.value, "189")
        XCTAssertEqual(item.fields.first(where: { $0.id == "carbs" })?.value, "26")
        XCTAssertEqual(item.fields.first(where: { $0.id == "fat" })?.value, "31")
        XCTAssertEqual(item.meals.map(\.name), ["Breakfast", "Lunch"])
        XCTAssertEqual(item.meals.flatMap(\.foods).map(\.name), ["Greek Yogurt", "Chicken Breast"])
        XCTAssertFalse(item.meals.flatMap(\.foods).contains { $0.name.localizedCaseInsensitiveContains("log more") })
    }

    func testNutritionDailyRecapOverridesRoundedMealSummaryProtein() async throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        store.evidenceDraft.scenario = .nutrition
        store.addAttachments([
            nutritionAttachment("recap", """
                MyFitnessPal Nutrition
                Calories
                Carbohydrates
                Fat
                Protein
                2,460
                186
                112
                175
                """),
            nutritionAttachment("breakfast", """
                Breakfast
                440 cal
                C 37 g
                F 6 g
                P 62 g
                Greek Yogurt
                Log more
                """),
            nutritionAttachment("lunch", """
                Lunch
                588 cal
                C 24 g
                F 23 g
                P 61 g
                Chicken Breast
                Add food
                """),
            nutritionAttachment("dinner", """
                Dinner
                719 cal
                C 24 g
                F 51 g
                P 42 g
                Salmon
                Quick add
                """),
            nutritionAttachment("snacks", """
                Snacks
                713 cal
                C 101 g
                F 32 g
                P 11 g
                Protein Bar
                Scan meal
                """),
        ])

        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let reviewID = try await reviewID(store)
        let item = try XCTUnwrap(store.review(id: reviewID)?.items.first)

        XCTAssertEqual(nutritionValues(item), ["calories": "2460", "carbs": "186", "fat": "112", "protein": "175"])
        XCTAssertEqual(item.meals.map(\.name), ["Breakfast", "Lunch", "Dinner", "Snacks"])
        XCTAssertEqual(item.meals.flatMap(\.foods).map(\.name), ["Greek Yogurt", "Chicken Breast", "Salmon", "Protein Bar"])
    }

    func testCompleteMealSummariesProvideDailyTotalsWhenRecapIsAbsent() async throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        store.evidenceDraft.scenario = .nutrition
        store.addAttachments([
            nutritionAttachment("breakfast", "Breakfast\n440 cal\nC 37 g\nF 6 g\nP 62 g"),
            nutritionAttachment("lunch", "Lunch\n588 cal\nC 24 g\nF 23 g\nP 61 g"),
            nutritionAttachment("dinner", "Dinner\n719 cal\nC 24 g\nF 51 g\nP 42 g"),
            nutritionAttachment("snacks", "Snacks\n713 cal\nC 101 g\nF 32 g\nP 11 g"),
        ])

        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let reviewID = try await reviewID(store)
        let item = try XCTUnwrap(store.review(id: reviewID)?.items.first)

        XCTAssertEqual(nutritionValues(item), ["calories": "2460", "carbs": "186", "fat": "112", "protein": "176"])
    }

    func testActivityStepsRequireExactLabelAssociationAndPreserveGroupedIntegers() async throws {
        let samples = [
            "9:47\nActivity\nMove 923 cal\nExercise 114 min\nStand 15 hr\nSteps 8,473\n47 bpm",
            "9\nSteps\n8473\nMove 923 cal\nExercise 114 min\nStand 15 hr\n47 bpm",
            "9\nSteps\n8, 473\nMove 923 cal\nExercise 114 min\nStand 15 hr\n47 bpm",
        ]
        for (index, text) in samples.enumerated() {
            let store = LoggingSandboxStore(now: date(2026, 8, 30))
            store.evidenceDraft.scenario = .activity
            store.addAttachments([.init(
                id: "activity-\(index)",
                displayName: "Activity.png",
                source: .photos,
                contentType: "image/png",
                extractedText: text
            )])

            _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
            let reviewID = try await reviewID(store)
            let item = try XCTUnwrap(store.review(id: reviewID)?.items.first)
            XCTAssertEqual(item.fields.first(where: { $0.id == "steps" })?.value, "8473")
            XCTAssertEqual(item.fields.first(where: { $0.id == "activeCalories" })?.value, "923")
            XCTAssertEqual(item.fields.first(where: { $0.id == "exerciseMinutes" })?.value, "114")
            XCTAssertEqual(item.fields.first(where: { $0.id == "duration" })?.value, "15")
        }
    }

    func testEvidenceReviewPresentationKeepsSourceFactsReadOnlyAndStrengthEditingCompact() {
        for category in EvidenceCategory.allCases where category != .progressPhotos {
            XCTAssertTrue(EvidenceReviewPresentationPolicy.sourceValuesAreReadOnly(for: category))
        }
        XCTAssertFalse(EvidenceReviewPresentationPolicy.sourceValuesAreReadOnly(for: .progressPhotos))

        let exercise = EvidenceReviewExercise(
            id: "curls",
            name: "Spider Curls",
            variant: nil,
            relationship: nil,
            sets: (1...4).map {
                .init(id: "set-\($0)", summary: "14 reps @ 50 lb", reps: "14", load: "50", unit: "lb")
            }
        )
        XCTAssertEqual(EvidenceReviewPresentationPolicy.compactSummary(for: exercise), "4 × 14 @ 50 lb")

        let nutrition = EvidenceReviewItem(
            id: "nutrition",
            category: .nutrition,
            title: "Nutrition",
            occurrenceDate: date(2026, 8, 30),
            fields: [
                .init(id: "calories", label: "Calories", value: "1234", unit: "cal", required: false),
                .init(id: "protein", label: "Protein", value: "189", unit: "g", required: false),
                .init(id: "carbs", label: "Carbohydrates", value: "26", unit: "g", required: false),
                .init(id: "fat", label: "Fat", value: "31", unit: "g", required: false),
            ]
        )
        let metrics = EvidenceReviewPresentationPolicy.metrics(for: nutrition)
        XCTAssertEqual(metrics.map(\.tone), [.calories, .protein, .carbohydrates, .fat])
        XCTAssertEqual(metrics.map(\.displayValue), ["1234 cal", "189 g", "26 g", "31 g"])
    }

    func testAutomaticImageOnlyPackageRoutesToUnconfirmedProgressPhotoReview() async throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        store.addAttachments([
            .init(id: "photo-one", displayName: "Photo 1", source: .photos, contentType: "image/jpeg", data: Data([1])),
            .init(id: "photo-two", displayName: "Photo 2", source: .photos, contentType: "image/jpeg", data: Data([2])),
        ])

        XCTAssertEqual(EvidenceSandboxRouter.scenario(for: store.evidenceDraft), .progressPhotos)
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let id = try await reviewID(store)
        let review = try XCTUnwrap(store.review(id: id))

        XCTAssertEqual(review.items.first?.category, .progressPhotos)
        XCTAssertEqual(review.items.first?.photoIdentities.count, 2)
        XCTAssertTrue(try XCTUnwrap(review.items.first?.photoIdentities).allSatisfy { !$0.confirmed && $0.orientation == .unconfirmed })
        XCTAssertTrue(try XCTUnwrap(review.interpretationMessage).contains("may be Progress Photos"))
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

    // MARK: - Direct-upload Training exercise-boundary regressions

    /// Reproduces the real Founder failure exactly: typing "Bicep curls"
    /// then "Pull ups" previously merged Pull Ups' four sets into Bicep
    /// Curls (8 sets total) because "Pull ups" matched no heading signal
    /// at all and its sets silently bled into whatever exercise was still
    /// active. Neither name is in the small demo Training Logger catalog
    /// today, so both must be preserved as distinct, provisional
    /// occurrences — never dropped, merged, silently renamed, or given a
    /// fabricated canonical identity.
    func testPullUpsMergeRegressionPreservesTwoDistinctFourSetExercises() async throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        store.evidenceDraft.scenario = .training
        store.evidenceDraft.details = "Bicep curls\n12r 50p x4\n\nPull ups\n12r 60p x4"
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let id = try await reviewID(store)
        let exercises = try XCTUnwrap(store.review(id: id)?.items.first?.exercises)

        XCTAssertEqual(exercises.map(\.name), ["Bicep Curls", "Pull Ups"])
        XCTAssertEqual(exercises.map { $0.sets.count }, [4, 4])
        XCTAssertEqual(exercises[0].sets[0].reps, "12")
        XCTAssertEqual(exercises[0].sets[0].load, "50")
        XCTAssertEqual(exercises[1].sets[0].reps, "12")
        XCTAssertEqual(exercises[1].sets[0].load, "60")
        XCTAssertTrue(exercises[0].isProvisional)
        XCTAssertNil(exercises[0].canonicalExerciseId)
        XCTAssertTrue(exercises[1].isProvisional)
        XCTAssertNil(exercises[1].canonicalExerciseId)
    }

    /// Spider Curls is a genuinely catalogued Training Logger exercise
    /// (`TrainingLoggerFixture.json`), which is why it never exhibited the
    /// Pull Ups failure — its keyword matched the old heading heuristic.
    /// This asserts it still resolves to its real canonical identity under
    /// the new structural boundary detection, and that Bicep Curls (not
    /// catalogued) still does not merge into it.
    func testSpiderCurlsRegressionDoesNotMergeWithBicepCurlsAndResolvesCanonically() async throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        store.evidenceDraft.scenario = .training
        store.evidenceDraft.details = "Bicep curls\n12r 50p x4\n\nSpider curls\n12r 40p x4"
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let id = try await reviewID(store)
        let exercises = try XCTUnwrap(store.review(id: id)?.items.first?.exercises)

        XCTAssertEqual(exercises.map(\.name), ["Bicep Curls", "Spider Curls"])
        XCTAssertEqual(exercises.map { $0.sets.count }, [4, 4])
        XCTAssertTrue(exercises[0].isProvisional)
        XCTAssertNil(exercises[0].canonicalExerciseId)
        XCTAssertFalse(exercises[1].isProvisional)
        XCTAssertEqual(exercises[1].canonicalExerciseId, "spider-curls")
    }

    /// A known exercise flanked by two different unrecognized exercises:
    /// all three must remain distinct occurrences in typed source order
    /// (not alphabetized, not reordered by resolution status), and neither
    /// unresolved exercise may borrow sets from the known one or from each
    /// other.
    func testMultipleUnresolvedExercisesRemainDistinctInTypedOrderWithoutContaminatingAKnownExercise() async throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        store.evidenceDraft.scenario = .training
        store.evidenceDraft.details = "Lat pulldown\n10r 120p x3\n\nZercher squats\n8r 135p x3\n\nCopenhagen planks\n30r 10p x3"
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let id = try await reviewID(store)
        let exercises = try XCTUnwrap(store.review(id: id)?.items.first?.exercises)

        XCTAssertEqual(exercises.map(\.name), ["Lat Pulldown", "Zercher Squats", "Copenhagen Planks"])
        XCTAssertEqual(exercises.map { $0.sets.count }, [3, 3, 3])
        XCTAssertFalse(exercises[0].isProvisional)
        XCTAssertEqual(exercises[0].canonicalExerciseId, "lat-pulldown")
        XCTAssertTrue(exercises[1].isProvisional)
        XCTAssertTrue(exercises[2].isProvisional)
        XCTAssertEqual(exercises[0].sets[0].reps, "10")
        XCTAssertEqual(exercises[1].sets[0].reps, "8")
        XCTAssertEqual(exercises[2].sets[0].reps, "30")
    }

    /// Variants are freeform captured text on top of a resolved-or-not base
    /// exercise identity (`TrainingExecutionVariant`'s own documented
    /// model) — a new variant on a known base is not an error, and an
    /// unknown exercise still preserves any variant text verbatim.
    func testVariantMatrixPreservesOccurrenceIdentityAcrossKnownAndUnknownCombinations() async throws {
        struct Case { let details: String; let name: String; let canonicalId: String?; let isProvisional: Bool; let variant: String? }
        let cases: [Case] = [
            .init(details: "Spider curls\n12r 40p x4", name: "Spider Curls", canonicalId: "spider-curls", isProvisional: false, variant: nil),
            .init(details: "Spider curls (Slow Eccentric)\n12r 40p x4", name: "Spider Curls", canonicalId: "spider-curls", isProvisional: false, variant: "Slow Eccentric"),
            .init(details: "Spider curls (Paused)\n12r 40p x4", name: "Spider Curls", canonicalId: "spider-curls", isProvisional: false, variant: "Paused"),
            .init(details: "Zercher squats\n8r 135p x3", name: "Zercher Squats", canonicalId: nil, isProvisional: true, variant: nil),
            .init(details: "Zercher squats (Pause at Knee)\n8r 135p x3", name: "Zercher Squats", canonicalId: nil, isProvisional: true, variant: "Pause at Knee"),
        ]
        for testCase in cases {
            let store = LoggingSandboxStore(now: date(2026, 8, 30))
            store.evidenceDraft.scenario = .training
            store.evidenceDraft.details = testCase.details
            _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
            let id = try await reviewID(store)
            let exercise = try XCTUnwrap(store.review(id: id)?.items.first?.exercises.first)
            XCTAssertEqual(exercise.name, testCase.name, testCase.details)
            XCTAssertEqual(exercise.canonicalExerciseId, testCase.canonicalId, testCase.details)
            XCTAssertEqual(exercise.isProvisional, testCase.isProvisional, testCase.details)
            XCTAssertEqual(exercise.variant, testCase.variant, testCase.details)
        }
    }

    /// Mirrors `LocalEvidenceReviewView.matchExercise`: reconciling a
    /// provisional exercise to an existing catalog identity is a local,
    /// Founder-confirmed action — never automatic — and must preserve the
    /// exercise's own sets untouched.
    func testMatchingAProvisionalExerciseToTheCatalogPreservesItsOccurrenceAndSets() async throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        store.evidenceDraft.scenario = .training
        store.evidenceDraft.details = "Bicep curls\n12r 50p x4"
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let id = try await reviewID(store)
        let itemId = try XCTUnwrap(store.review(id: id)?.items.first?.id)
        let exerciseId = try XCTUnwrap(store.review(id: id)?.items.first?.exercises.first?.id)
        XCTAssertTrue(try XCTUnwrap(store.review(id: id)?.items.first?.exercises.first?.isProvisional))

        let catalogExercise = try XCTUnwrap(TrainingExerciseCatalogLoader.loadExercises().first { $0.canonicalExerciseId == "spider-curls" })
        store.updateReviewItem(reviewId: id, itemId: itemId) { item in
            guard let index = item.exercises.firstIndex(where: { $0.id == exerciseId }) else { return }
            item.exercises[index].canonicalExerciseId = catalogExercise.canonicalExerciseId
            item.exercises[index].name = catalogExercise.name
            item.exercises[index].isProvisional = false
        }
        let matched = try XCTUnwrap(store.review(id: id)?.items.first?.exercises.first)
        XCTAssertEqual(matched.canonicalExerciseId, "spider-curls")
        XCTAssertEqual(matched.name, "Spider Curls")
        XCTAssertFalse(matched.isProvisional)
        XCTAssertEqual(matched.sets.count, 4)
        XCTAssertEqual(matched.sets[0].reps, "12")
        XCTAssertEqual(matched.sets[0].load, "50")
    }

    // MARK: - Direct-upload Training acceptance matrix (occurrence identity, order, variants)

    /// The same exercise name typed twice, non-adjacently — e.g. performed
    /// again later in the same workout — must remain two distinct
    /// occurrences with their own sets, never merged into one because they
    /// share a normalized name.
    func testRepeatedSameExerciseNameRemainsTwoDistinctOccurrencesWhenStructurallySeparate() async throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        store.evidenceDraft.scenario = .training
        store.evidenceDraft.details = "Bicep curls\n12r 50p x4\n\nPull ups\n12r 60p x4\n\nBicep curls\n8r 55p x3"
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let id = try await reviewID(store)
        let exercises = try XCTUnwrap(store.review(id: id)?.items.first?.exercises)

        XCTAssertEqual(exercises.map(\.name), ["Bicep Curls", "Pull Ups", "Bicep Curls"])
        XCTAssertEqual(exercises.map { $0.sets.count }, [4, 4, 3])
        XCTAssertEqual(exercises[0].sets[0].load, "50")
        XCTAssertEqual(exercises[2].sets[0].load, "55")
        XCTAssertEqual(Set(exercises.map(\.id)).count, 3, "each occurrence must carry its own distinct identity")
    }

    /// Multi-word exercise headings parse structurally in general — not
    /// because any of these specific names is special-cased. Two resolve
    /// canonically (their catalog entries exist), two do not.
    func testMultiWordExerciseHeadingsParseGenerallyAcrossKnownAndUnknownNames() async throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        store.evidenceDraft.scenario = .training
        store.evidenceDraft.details = [
            "Pull Ups\n10r 45p x3",
            "Lat Pulldown\n10r 120p x3",
            "Cable Fly\n12r 30p x3",
            "Romanian Deadlift\n8r 185p x3",
        ].joined(separator: "\n\n")
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let id = try await reviewID(store)
        let exercises = try XCTUnwrap(store.review(id: id)?.items.first?.exercises)

        XCTAssertEqual(exercises.map(\.name), ["Pull Ups", "Lat Pulldown", "Cable Fly", "Romanian Deadlift"])
        XCTAssertEqual(exercises.map { $0.sets.count }, [3, 3, 3, 3])
        XCTAssertEqual(exercises.map(\.isProvisional), [true, false, false, false])
        XCTAssertEqual(exercises.map(\.canonicalExerciseId), [nil, "lat-pulldown", "cable-fly", "romanian-deadlift"])
    }

    /// Boundary preservation must hold symmetrically regardless of which
    /// side of an unknown exercise a known one falls on.
    func testKnownAndUnknownExerciseBoundariesHoldInEitherOrder() async throws {
        let knownThenUnknown = LoggingSandboxStore(now: date(2026, 8, 30))
        knownThenUnknown.evidenceDraft.scenario = .training
        knownThenUnknown.evidenceDraft.details = "Lat pulldown\n10r 120p x3\n\nZercher squats\n8r 135p x3"
        _ = try value(knownThenUnknown.submitEvidence(now: date(2026, 8, 30)))
        let firstId = try await reviewID(knownThenUnknown)
        let firstExercises = try XCTUnwrap(knownThenUnknown.review(id: firstId)?.items.first?.exercises)
        XCTAssertEqual(firstExercises.map(\.name), ["Lat Pulldown", "Zercher Squats"])
        XCTAssertEqual(firstExercises.map(\.isProvisional), [false, true])
        XCTAssertEqual(firstExercises.map { $0.sets.count }, [3, 3])

        let unknownThenKnown = LoggingSandboxStore(now: date(2026, 8, 30))
        unknownThenKnown.evidenceDraft.scenario = .training
        unknownThenKnown.evidenceDraft.details = "Zercher squats\n8r 135p x3\n\nLat pulldown\n10r 120p x3"
        _ = try value(unknownThenKnown.submitEvidence(now: date(2026, 8, 30)))
        let secondId = try await reviewID(unknownThenKnown)
        let secondExercises = try XCTUnwrap(unknownThenKnown.review(id: secondId)?.items.first?.exercises)
        XCTAssertEqual(secondExercises.map(\.name), ["Zercher Squats", "Lat Pulldown"])
        XCTAssertEqual(secondExercises.map(\.isProvisional), [true, false])
        XCTAssertEqual(secondExercises.map { $0.sets.count }, [3, 3])
    }

    /// SwiftUI identity must never be derived from the (possibly repeated)
    /// exercise name, and must remain stable across a Match Exercise
    /// mutation.
    func testOccurrenceIdentityIsNotDerivedFromNameAndStaysStableAcrossMatch() async throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        store.evidenceDraft.scenario = .training
        store.evidenceDraft.details = "Bicep curls\n12r 50p x4\n\nBicep curls\n8r 55p x3"
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let id = try await reviewID(store)
        let itemId = try XCTUnwrap(store.review(id: id)?.items.first?.id)
        let exercises = try XCTUnwrap(store.review(id: id)?.items.first?.exercises)
        XCTAssertNotEqual(exercises[0].id, exercises[1].id, "two same-named occurrences must not collide on a name-derived id")

        let firstId = exercises[0].id
        let catalogExercise = try XCTUnwrap(TrainingExerciseCatalogLoader.loadExercises().first { $0.canonicalExerciseId == "spider-curls" })
        store.updateReviewItem(reviewId: id, itemId: itemId) { item in
            guard let index = item.exercises.firstIndex(where: { $0.id == firstId }) else { return }
            item.exercises[index].canonicalExerciseId = catalogExercise.canonicalExerciseId
            item.exercises[index].name = catalogExercise.name
            item.exercises[index].isProvisional = false
        }
        let afterMatch = try XCTUnwrap(store.review(id: id)?.items.first?.exercises)
        XCTAssertEqual(afterMatch[0].id, firstId, "id must survive a name/canonical-identity change")
        XCTAssertEqual(afterMatch[0].name, "Spider Curls")
        XCTAssertEqual(afterMatch[1].id, exercises[1].id)
        XCTAssertEqual(afterMatch[1].name, "Bicep Curls", "the second occurrence must be untouched by matching the first")
        XCTAssertTrue(afterMatch[1].isProvisional)
    }

    /// Matching one unresolved occurrence must never mutate a different
    /// occurrence that happens to share the same typed name.
    func testMatchingOneOccurrenceNeverMutatesASimilarlyNamedOccurrence() async throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        store.evidenceDraft.scenario = .training
        store.evidenceDraft.details = "Zercher squats\n8r 135p x3\n\nZercher squats\n8r 140p x2"
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let id = try await reviewID(store)
        let itemId = try XCTUnwrap(store.review(id: id)?.items.first?.id)
        let secondOccurrenceId = try XCTUnwrap(store.review(id: id)?.items.first?.exercises[1].id)

        store.updateReviewItem(reviewId: id, itemId: itemId) { item in
            guard let index = item.exercises.firstIndex(where: { $0.id == secondOccurrenceId }) else { return }
            item.exercises[index].canonicalExerciseId = "lat-pulldown"
            item.exercises[index].name = "Lat Pulldown"
            item.exercises[index].isProvisional = false
        }
        let exercises = try XCTUnwrap(store.review(id: id)?.items.first?.exercises)
        XCTAssertEqual(exercises[0].name, "Zercher Squats")
        XCTAssertTrue(exercises[0].isProvisional)
        XCTAssertEqual(exercises[0].sets.count, 3)
        XCTAssertEqual(exercises[1].name, "Lat Pulldown")
        XCTAssertFalse(exercises[1].isProvisional)
        XCTAssertEqual(exercises[1].sets.count, 2)
    }

    /// Rematching an already-matched occurrence to a different catalog
    /// exercise must replace its identity in place, never append a
    /// duplicate occurrence.
    func testRematchingReplacesInPlaceWithoutDuplicatingOccurrences() async throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        store.evidenceDraft.scenario = .training
        store.evidenceDraft.details = "Zercher squats\n8r 135p x3"
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let id = try await reviewID(store)
        let itemId = try XCTUnwrap(store.review(id: id)?.items.first?.id)
        let exerciseId = try XCTUnwrap(store.review(id: id)?.items.first?.exercises.first?.id)

        func match(_ canonicalExerciseId: String, _ name: String) {
            store.updateReviewItem(reviewId: id, itemId: itemId) { item in
                guard let index = item.exercises.firstIndex(where: { $0.id == exerciseId }) else { return }
                item.exercises[index].canonicalExerciseId = canonicalExerciseId
                item.exercises[index].name = name
                item.exercises[index].isProvisional = false
            }
        }
        match("lat-pulldown", "Lat Pulldown")
        match("cable-fly", "Cable Fly")

        let exercises = try XCTUnwrap(store.review(id: id)?.items.first?.exercises)
        XCTAssertEqual(exercises.count, 1)
        XCTAssertEqual(exercises[0].id, exerciseId)
        XCTAssertEqual(exercises[0].canonicalExerciseId, "cable-fly")
        XCTAssertEqual(exercises[0].name, "Cable Fly")
        XCTAssertEqual(exercises[0].sets.count, 3)
    }

    /// "Create New Exercise" records Founder intent locally
    /// (`proposedAreaId`) without ever fabricating a canonical identity —
    /// no connected server exists yet to actually create the exercise.
    func testCreateNewExerciseRecordsProposedAreaWithoutFakingCanonicalCreation() async throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        store.evidenceDraft.scenario = .training
        store.evidenceDraft.details = "Zercher squats\n8r 135p x3"
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let id = try await reviewID(store)
        let itemId = try XCTUnwrap(store.review(id: id)?.items.first?.id)
        let exerciseId = try XCTUnwrap(store.review(id: id)?.items.first?.exercises.first?.id)

        store.updateReviewItem(reviewId: id, itemId: itemId) { item in
            guard let index = item.exercises.firstIndex(where: { $0.id == exerciseId }) else { return }
            item.exercises[index].proposedAreaId = "quads"
        }
        let exercise = try XCTUnwrap(store.review(id: id)?.items.first?.exercises.first)
        XCTAssertEqual(exercise.proposedAreaId, "quads")
        XCTAssertTrue(exercise.isProvisional, "choosing an area must not fabricate canonical status")
        XCTAssertNil(exercise.canonicalExerciseId)
        XCTAssertEqual(exercise.name, "Zercher Squats")
        XCTAssertEqual(exercise.sets.count, 3)
    }

    /// The future server handoff contract carries exactly the identity
    /// fields a canonicalization command needs — not sets/reps/load, which
    /// remain occurrence data the confirmation path already owns.
    func testTrainingExerciseCreationRequestCarriesOnlyIdentityFields() {
        let request = TrainingExerciseCreationRequest(
            reviewId: "local-review-1", occurrenceId: "exercise-abc", proposedName: "Zercher Squats", areaId: "quads"
        )
        XCTAssertEqual(request.reviewId, "local-review-1")
        XCTAssertEqual(request.occurrenceId, "exercise-abc")
        XCTAssertEqual(request.proposedName, "Zercher Squats")
        XCTAssertEqual(request.areaId, "quads")
    }

    /// `Variant: <label>` is the same explicit line-directive form the
    /// canonical web parser recognizes — attached to the open block before
    /// its first set, and inertly ignored once sets have begun rather than
    /// corrupting the occurrence.
    func testVariantDirectiveLineAttachesBeforeSetsAndIsIgnoredAfter() async throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        store.evidenceDraft.scenario = .training
        store.evidenceDraft.details = "Spider curls\nVariant: Slow Eccentric\n12r 40p x4\n\nZercher squats\n8r 135p x3\nVariant: Pause at Knee\n8r 140p x1"
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let id = try await reviewID(store)
        let exercises = try XCTUnwrap(store.review(id: id)?.items.first?.exercises)

        XCTAssertEqual(exercises[0].name, "Spider Curls")
        XCTAssertEqual(exercises[0].variant, "Slow Eccentric")
        XCTAssertEqual(exercises[0].canonicalExerciseId, "spider-curls")
        XCTAssertEqual(exercises[0].sets.count, 4)

        // The directive arrives after sets already began, so it must be
        // ignored — not merged into the previous exercise, not dropped as
        // an error, and the exercise itself keeps accumulating sets.
        XCTAssertEqual(exercises[1].name, "Zercher Squats")
        XCTAssertNil(exercises[1].variant)
        XCTAssertTrue(exercises[1].isProvisional)
        XCTAssertEqual(exercises[1].sets.count, 4)
    }

    /// Two occurrences of the same base exercise with different variants
    /// must remain distinct — a variant-keying gap would have merged these
    /// under the prior name-only occurrence key.
    func testMultipleOccurrencesOfSameBaseExerciseWithDifferentVariantsRemainDistinct() async throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        store.evidenceDraft.scenario = .training
        store.evidenceDraft.details = "Spider curls (Slow Eccentric)\n12r 40p x4\n\nSpider curls (Paused)\n10r 35p x3"
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let id = try await reviewID(store)
        let exercises = try XCTUnwrap(store.review(id: id)?.items.first?.exercises)

        XCTAssertEqual(exercises.map(\.name), ["Spider Curls", "Spider Curls"])
        XCTAssertEqual(exercises.map(\.variant), ["Slow Eccentric", "Paused"])
        XCTAssertEqual(exercises.map(\.canonicalExerciseId), ["spider-curls", "spider-curls"])
        XCTAssertEqual(exercises.map { $0.sets.count }, [4, 3])
        XCTAssertNotEqual(exercises[0].id, exercises[1].id)
    }

    /// A base exercise that resolves with a variant that does not (an
    /// unrecognized-name exercise carrying variant text) must never merge
    /// exercises, merge sets, move sets to the preceding exercise, create a
    /// duplicate base exercise, or erase the provisional state.
    func testUnresolvedExerciseWithVariantPreservesProvisionalStateAndDoesNotContaminateNeighbors() async throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        store.evidenceDraft.scenario = .training
        store.evidenceDraft.details = "Lat pulldown\n10r 120p x3\n\nZercher squats (Pause at Knee)\n8r 135p x3\n\nCable fly\n12r 30p x3"
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let id = try await reviewID(store)
        let exercises = try XCTUnwrap(store.review(id: id)?.items.first?.exercises)

        XCTAssertEqual(exercises.map(\.name), ["Lat Pulldown", "Zercher Squats", "Cable Fly"])
        XCTAssertEqual(exercises.map { $0.sets.count }, [3, 3, 3])
        XCTAssertFalse(exercises[0].isProvisional)
        XCTAssertNil(exercises[0].variant)
        XCTAssertTrue(exercises[1].isProvisional)
        XCTAssertEqual(exercises[1].variant, "Pause at Knee")
        XCTAssertNil(exercises[1].canonicalExerciseId)
        XCTAssertFalse(exercises[2].isProvisional)
        XCTAssertNil(exercises[2].variant)
        XCTAssertEqual(Set(exercises.map(\.id)).count, 3)
    }

    // MARK: - Variant identity: named spec examples

    /// "Bicep Curls (Static Hold)" against a known canonical exercise
    /// (using Spider Curls, the fixture's real canonical entry, in the same
    /// role): the base name resolves canonically, the variant attaches to
    /// the occurrence, and no new canonical exercise is created — the
    /// variant never becomes part of the exercise's own name/identity.
    func testKnownCanonicalExerciseWithFreeformVariantAttachesVariantWithoutCreatingANewExercise() async throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        store.evidenceDraft.scenario = .training
        store.evidenceDraft.details = "Spider curls (Static Hold)\n12r 40p x4"
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let id = try await reviewID(store)
        let exercise = try XCTUnwrap(store.review(id: id)?.items.first?.exercises.first)

        XCTAssertEqual(exercise.name, "Spider Curls")
        XCTAssertEqual(exercise.canonicalExerciseId, "spider-curls")
        XCTAssertFalse(exercise.isProvisional)
        XCTAssertEqual(exercise.variant, "Static Hold")
    }

    /// "Pull Ups (Neutral Grip)", with Pull Ups itself unknown to the
    /// catalog: the base exercise stays provisional/new, the variant
    /// remains attached independently, and neither collapses into the
    /// other.
    func testUnknownExercisePullUpsWithVariantStaysProvisionalWithVariantAttached() async throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        store.evidenceDraft.scenario = .training
        store.evidenceDraft.details = "Pull Ups (Neutral Grip)\n8r bw x4"
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let id = try await reviewID(store)
        let exercise = try XCTUnwrap(store.review(id: id)?.items.first?.exercises.first)

        XCTAssertEqual(exercise.name, "Pull Ups")
        XCTAssertNil(exercise.canonicalExerciseId)
        XCTAssertTrue(exercise.isProvisional)
        XCTAssertEqual(exercise.variant, "Neutral Grip")
    }

    /// Matching a provisional exercise that carries a variant: the base
    /// resolves canonically, but the variant is preserved on the
    /// occurrence exactly as it was typed — never folded into the
    /// canonical name and never dropped by the match action.
    func testMatchingAProvisionalExerciseWithAVariantPreservesTheVariantSeparateFromTheCanonicalName() async throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        store.evidenceDraft.scenario = .training
        store.evidenceDraft.details = "Pull Ups (Neutral Grip)\n8r bw x4"
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let id = try await reviewID(store)
        let itemId = try XCTUnwrap(store.review(id: id)?.items.first?.id)
        let exerciseId = try XCTUnwrap(store.review(id: id)?.items.first?.exercises.first?.id)

        let catalogExercise = try XCTUnwrap(TrainingExerciseCatalogLoader.loadExercises().first { $0.canonicalExerciseId == "lat-pulldown" })
        store.updateReviewItem(reviewId: id, itemId: itemId) { item in
            guard let index = item.exercises.firstIndex(where: { $0.id == exerciseId }) else { return }
            item.exercises[index].canonicalExerciseId = catalogExercise.canonicalExerciseId
            item.exercises[index].name = catalogExercise.name
            item.exercises[index].isProvisional = false
        }
        let matched = try XCTUnwrap(store.review(id: id)?.items.first?.exercises.first)
        XCTAssertEqual(matched.name, "Lat Pulldown")
        XCTAssertEqual(matched.canonicalExerciseId, "lat-pulldown")
        XCTAssertFalse(matched.isProvisional)
        XCTAssertEqual(matched.variant, "Neutral Grip")
    }

    // MARK: - Bodyweight parsing

    func testBWLoadTokenProducesFourBodyweightSetsOfTwelveReps() async throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        store.evidenceDraft.scenario = .training
        store.evidenceDraft.details = "Pull ups\n12r bw x4"
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let id = try await reviewID(store)
        let exercise = try XCTUnwrap(store.review(id: id)?.items.first?.exercises.first)

        XCTAssertEqual(exercise.sets.count, 4)
        for set in exercise.sets {
            XCTAssertEqual(set.reps, "12")
            XCTAssertNil(set.load)
            XCTAssertEqual(set.unit, "bodyweight")
            XCTAssertTrue(set.isBodyweight)
        }
    }

    func testBodyweightLoadTokenProducesFourBodyweightSetsOfTwelveReps() async throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        store.evidenceDraft.scenario = .training
        store.evidenceDraft.details = "Pull ups\n12r bodyweight x4"
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let id = try await reviewID(store)
        let exercise = try XCTUnwrap(store.review(id: id)?.items.first?.exercises.first)

        XCTAssertEqual(exercise.sets.count, 4)
        XCTAssertTrue(exercise.sets.allSatisfy { $0.reps == "12" && $0.isBodyweight })
    }

    func testBodyWeightTwoWordLoadTokenProducesFourBodyweightSetsOfTwelveReps() async throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        store.evidenceDraft.scenario = .training
        store.evidenceDraft.details = "Pull ups\n12r body weight x4"
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let id = try await reviewID(store)
        let exercise = try XCTUnwrap(store.review(id: id)?.items.first?.exercises.first)

        XCTAssertEqual(exercise.sets.count, 4)
        XCTAssertTrue(exercise.sets.allSatisfy { $0.reps == "12" && $0.isBodyweight })
    }

    /// Bodyweight must remain semantically bodyweight — never coerced to a
    /// fake `0` numeric load, which would misrepresent it as an unloaded
    /// or zero-weight set rather than a genuine bodyweight one.
    func testBodyweightSetsAreNeverCoercedToAZeroNumericLoad() async throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        store.evidenceDraft.scenario = .training
        store.evidenceDraft.details = "Pull ups\n12r bw x4"
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let id = try await reviewID(store)
        let exercise = try XCTUnwrap(store.review(id: id)?.items.first?.exercises.first)

        XCTAssertTrue(exercise.sets.allSatisfy { $0.load != "0" && $0.load == nil })
        XCTAssertTrue(exercise.sets.allSatisfy(\.isValid))
    }

    // MARK: - Exercise picker filtering

    func testExerciseSearchMatchingIsToleranceOfCasePunctuationAndSpacing() {
        XCTAssertTrue(ExerciseSearchMatching.matches(query: "pull ups", exerciseName: "Pull-ups"))
        XCTAssertTrue(ExerciseSearchMatching.matches(query: "PULL-UPS", exerciseName: "pull ups"))
        XCTAssertTrue(ExerciseSearchMatching.matches(query: "bench", exerciseName: "Bench Press"))
        XCTAssertFalse(ExerciseSearchMatching.matches(query: "squat", exerciseName: "Bench Press"))
        XCTAssertTrue(ExerciseSearchMatching.matches(query: "", exerciseName: "Bench Press"))
    }

    func testExercisePickerFilteringAppliesSearchAndTrainingAreaTogether() async throws {
        let catalog = try await configuration().exercises

        let searchOnly = ExercisePickerFiltering.filtered(catalog: catalog, selectedAreaId: nil, query: "curl")
        XCTAssertEqual(searchOnly.map(\.name), ["Spider Curls"])

        let areaOnly = ExercisePickerFiltering.filtered(catalog: catalog, selectedAreaId: "chest", query: "")
        XCTAssertEqual(Set(areaOnly.map(\.areaId)), ["chest"])
        XCTAssertTrue(areaOnly.map(\.name).contains("Bench Press"))

        let combined = ExercisePickerFiltering.filtered(catalog: catalog, selectedAreaId: "back", query: "curl")
        XCTAssertTrue(combined.isEmpty, "Spider Curls is a biceps exercise, not back")
    }

    private func configuration() async throws -> TrainingLoggerConfiguration {
        try await FixtureTrainingLoggerAPI().fetchConfiguration()
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

    func testProgressPhotoSessionLabelsAndPoseMutationAreExplicit() async throws {
        XCTAssertEqual(ProgressPhotoSessionDraft.userFacingConditionLabels, ["Time of day", "Fasted", "Post-workout", "Pump"])

        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        store.setEvidenceScenario(.progressPhotos)
        store.addAttachments([.init(id: "photo", displayName: "photo.jpg", source: .photos, contentType: "image/jpeg", data: Data([1]))])
        let identityID = try XCTUnwrap(store.evidenceDraft.photoIdentities.first?.id)
        store.updatePhotoIdentity(id: identityID) {
            $0.orientation = .front
            $0.contraction = .relaxed
            $0.poseVariant = .standard
            $0.confirmed = true
        }
        store.evidenceDraft.photoSession.timeOfDay = .afternoon
        store.evidenceDraft.photoSession.fasted = false
        store.evidenceDraft.photoSession.postWorkout = true
        store.evidenceDraft.photoSession.pump = true
        store.evidenceDraft.photoSession.originalUnedited = true
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let reviewID = try await reviewID(store)
        let item = try XCTUnwrap(store.review(id: reviewID)?.items.first)

        XCTAssertEqual(item.photoIdentities.first?.poseVariant, .standard)
        XCTAssertEqual(item.fields.first(where: { $0.id == "timeOfDay" })?.value, "Afternoon")
        XCTAssertEqual(item.fields.first(where: { $0.id == "postWorkout" })?.value, "Yes")
        XCTAssertEqual(item.fields.first(where: { $0.id == "pump" })?.value, "Present")
    }

    func testNutritionReplacementSemanticsDistinguishFullDayFromMeal() async throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        store.evidenceDraft.scenario = .nutrition
        store.evidenceDraft.details = "Daily nutrition summary Calories 2100 Protein 180 Carbohydrates 220 Fat 60"
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let firstID = try await reviewID(store)
        let firstItem = try XCTUnwrap(store.review(id: firstID)?.items.first)
        XCTAssertEqual(firstItem.nutritionScope, .fullDay)
        _ = try value(store.confirmReview(id: firstID))

        store.evidenceDraft.occurrenceDate = date(2026, 8, 30)
        store.evidenceDraft.scenario = .nutrition
        store.evidenceDraft.details = "Daily nutrition summary Calories 2200 Protein 185 Carbohydrates 230 Fat 62"
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let secondID = try await reviewID(store)
        let fullDay = try XCTUnwrap(store.review(id: secondID)?.items.first)
        XCTAssertTrue(fullDay.nutritionReplacementRequired)
        XCTAssertEqual(fullDay.nutritionDisposition, .replaceExisting)

        store.discardReview(id: secondID)
        store.evidenceDraft.occurrenceDate = date(2026, 8, 30)
        store.evidenceDraft.scenario = .nutrition
        store.evidenceDraft.details = "Lunch meal Calories 620 Protein 42 Carbohydrates 58 Fat 19"
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let mealID = try await reviewID(store)
        let meal = try XCTUnwrap(store.review(id: mealID)?.items.first)
        XCTAssertTrue(meal.nutritionReplacementRequired)
        XCTAssertEqual(meal.nutritionScope, .meal)
        XCTAssertNil(meal.nutritionDisposition)
        XCTAssertEqual(NutritionReviewDisposition.addDistinctMeal.label, "Add to this day")
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
        XCTAssertEqual(KeyboardFocusOrder.previous(before: "load", in: ["reps", "load", "duration"]), "reps")
        XCTAssertEqual(KeyboardFocusOrder.next(after: "load", in: ["reps", "load", "duration"]), "duration")
        XCTAssertNil(KeyboardFocusOrder.previous(before: "reps", in: ["reps", "load"]))
        XCTAssertNil(KeyboardFocusOrder.next(after: "load", in: ["reps", "load"]))
        XCTAssertEqual(EvidenceIntakeView.dexaFocusOrder, ["totalMass", "bodyFat", "fatMass", "leanMass", "boneMineral", "rmr", "vatMass", "vatVolume"])
    }

    private func date(_ year: Int, _ month: Int, _ day: Int) -> Date { var c = Calendar(identifier: .gregorian); c.timeZone = TimeZone(identifier: "America/Los_Angeles")!; return c.date(from: .init(year: year, month: month, day: day, hour: 12))! }
    private func nutritionAttachment(_ id: String, _ text: String) -> SandboxAttachment {
        .init(id: id, displayName: "\(id).png", source: .photos, contentType: "image/png", extractedText: text)
    }
    private func nutritionValues(_ item: EvidenceReviewItem) -> [String: String] {
        Dictionary(uniqueKeysWithValues: item.fields.map { ($0.id, $0.value) })
    }
    private func value<T>(_ result: Result<T, LoggingSandboxError>) throws -> T { switch result { case .success(let value): value; case .failure(let error): throw error } }
    private func reviewID(_ store: LoggingSandboxStore) async throws -> String { let result = await store.finishInterpretation(now: date(2026, 8, 30)); return try XCTUnwrap(try value(result)) }
    private func XCTAssertFailure<T>(_ result: Result<T, LoggingSandboxError>, _ message: String, file: StaticString = #filePath, line: UInt = #line) { switch result { case .success: XCTFail("Expected failure", file: file, line: line); case .failure(let error): XCTAssertEqual(error.message, message, file: file, line: line) } }
}
