import XCTest
@testable import PhysiqueOS

/// Orientation, contraction, and pose variant are not independent. Native's pose
/// controls, adjustments, and the "Confirm pose" gate all derive from the one
/// canonical table the Server validates, so a photo identity Native lets the
/// Founder confirm can never later become "pose still to choose".
final class ProgressPhotoPoseContractTests: XCTestCase {
    /// The seven canonical combinations, written out literally. Deriving this
    /// from the contract would make the test agree with any drift.
    private static let canonical: [(ProgressPhotoOrientation, ProgressPhotoContraction, ProgressPhotoPoseVariant, String)] = [
        (.front, .relaxed, .standard, "front-relaxed"),
        (.rear, .relaxed, .standard, "back-relaxed"),
        (.rear, .flexed, .doubleBiceps, "back-flexed"),
        (.side, .relaxed, .standard, "side-relaxed"),
        (.leftSide, .relaxed, .standard, "left-side-relaxed"),
        (.rightSide, .relaxed, .standard, "right-side-relaxed"),
        (.front, .flexed, .standard, "front-flexed"),
    ]

    private func draft(
        _ orientation: ProgressPhotoOrientation = .unconfirmed, _ contraction: ProgressPhotoContraction = .unconfirmed,
        _ variant: ProgressPhotoPoseVariant = .standard, confirmed: Bool = false
    ) -> ProgressPhotoIdentityDraft {
        .init(id: "pose-1", attachmentId: "a1", orientation: orientation, contraction: contraction, poseVariant: variant,
              customLabel: "", goalRole: .supporting, tags: "", confirmed: confirmed)
    }

    private func isConsistent(_ value: ProgressPhotoIdentityDraft) -> Bool {
        !ProgressPhotoPoseContract.matching(
            orientation: value.orientation == .unconfirmed ? nil : value.orientation,
            contraction: value.contraction == .unconfirmed ? nil : value.contraction,
            variant: value.poseVariant
        ).isEmpty
    }

    // MARK: The table is the Server's

    func testNativeTableIsTheServerContractVerbatim() throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let data = try Data(contentsOf: root.appendingPathComponent("contracts/progress-photo-pose-contract.v1.json"))
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        let rows = try XCTUnwrap(json["combinations"] as? [[String: String]])
        XCTAssertEqual(json["version"] as? String, ProgressPhotoPoseContractData.version, "generated table is stale: run ios/Scripts/generate_pose_contract.py")
        XCTAssertEqual(rows.map { [$0["id"], $0["label"], $0["orientation"], $0["contractionState"], $0["poseVariant"]] },
                       ProgressPhotoPoseContractData.combinations.map { [$0.id, $0.label, $0.orientation, $0.contractionState, $0.poseVariant] })
    }

    func testEveryContractCombinationIsRepresentableInNativeControlsAndNothingElseExists() {
        XCTAssertEqual(ProgressPhotoPoseContract.combinations.count, ProgressPhotoPoseContractData.combinations.count)
        XCTAssertEqual(ProgressPhotoPoseContract.combinations.map(\.id), Self.canonical.map { $0.3 })
    }

    func testOnlyTheSevenCanonicalCombinationsAreCanonicalAcrossEveryControlState() {
        var accepted = 0
        for orientation in ProgressPhotoOrientation.allCases {
            for contraction in ProgressPhotoContraction.allCases {
                for variant in ProgressPhotoPoseVariant.allCases {
                    let expected = Self.canonical.contains { $0.0 == orientation && $0.1 == contraction && $0.2 == variant }
                    XCTAssertEqual(ProgressPhotoPoseContract.isCanonical(orientation: orientation, contraction: contraction, variant: variant), expected,
                                   "\(orientation) \(contraction) \(variant)")
                    XCTAssertEqual(draft(orientation, contraction, variant).isCanonicalPose, expected)
                    if expected { accepted += 1 }
                }
            }
        }
        XCTAssertEqual(accepted, 7)
    }

    func testRearRelaxedDoubleBicepsIsRejectedAndRearFlexedDoubleBicepsIsAccepted() {
        XCTAssertFalse(draft(.rear, .relaxed, .doubleBiceps).isCanonicalPose)
        XCTAssertNil(draft(.rear, .relaxed, .doubleBiceps).canonicalPose)
        XCTAssertEqual(draft(.rear, .flexed, .doubleBiceps).canonicalPose?.id, "back-flexed")
    }

    // MARK: Double Biceps dependency

    func testChoosingDoubleBicepsSetsFlexedAndSaysSo() {
        let result = ProgressPhotoPoseContract.applying(.variant(.doubleBiceps), to: draft(.rear, .relaxed, .standard, confirmed: true))
        XCTAssertEqual(result.draft.contraction, .flexed)
        XCTAssertEqual(result.draft.orientation, .rear)
        XCTAssertEqual(result.draft.poseVariant, .doubleBiceps)
        XCTAssertEqual(result.notice, "Double Biceps uses Flexed.")
        XCTAssertTrue(result.draft.isCanonicalPose)
        XCTAssertFalse(result.draft.confirmed, "a changed pose must be confirmed again")
    }

    func testChoosingDoubleBicepsBeforeAnOrientationExistsImpliesRearAndFlexed() {
        let result = ProgressPhotoPoseContract.applying(.variant(.doubleBiceps), to: draft())
        XCTAssertEqual(result.draft.orientation, .rear)
        XCTAssertEqual(result.draft.contraction, .flexed)
        XCTAssertEqual(result.notice, "Double Biceps uses Rear and Flexed.")
        XCTAssertTrue(result.draft.isCanonicalPose)
    }

    func testChoosingRelaxedWhileDoubleBicepsIsSetResetsPoseToStandardAndExplainsTheDependency() {
        let result = ProgressPhotoPoseContract.applying(.contraction(.relaxed), to: draft(.rear, .flexed, .doubleBiceps, confirmed: true))
        XCTAssertEqual(result.draft.contraction, .relaxed, "the choice the Founder just made is honored")
        XCTAssertEqual(result.draft.poseVariant, .standard)
        XCTAssertEqual(result.notice, "Double Biceps uses Flexed, so Pose was reset to Standard.")
        XCTAssertTrue(result.draft.isCanonicalPose)
        XCTAssertFalse(result.draft.confirmed)
        XCTAssertFalse(ProgressPhotoPoseContract.isCanonical(orientation: .rear, contraction: .relaxed, variant: .doubleBiceps), "Relaxed can never coexist with Double Biceps")
    }

    func testChoosingFlexedOnARearPhotoMakesThePoseDoubleBiceps() {
        let result = ProgressPhotoPoseContract.applying(.contraction(.flexed), to: draft(.rear, .relaxed, .standard))
        XCTAssertEqual(result.draft.poseVariant, .doubleBiceps)
        XCTAssertEqual(result.notice, "Rear Flexed uses Double Biceps.")
        XCTAssertTrue(result.draft.isCanonicalPose)
    }

    func testChoosingFlexedOnAFrontPhotoStaysStandardWithoutANotice() {
        let result = ProgressPhotoPoseContract.applying(.contraction(.flexed), to: draft(.front, .relaxed, .standard))
        XCTAssertEqual(result.draft.poseVariant, .standard)
        XCTAssertNil(result.notice)
        XCTAssertEqual(result.draft.canonicalPose?.id, "front-flexed")
    }

    func testChangesTheContractCannotSatisfyAreRefusedAndExplainedNotApplied() {
        let front = draft(.front, .relaxed, .standard)
        let doubleOnFront = ProgressPhotoPoseContract.applying(.variant(.doubleBiceps), to: front)
        XCTAssertEqual(doubleOnFront.draft.poseVariant, .standard)
        XCTAssertEqual(doubleOnFront.draft.orientation, .front)
        XCTAssertEqual(doubleOnFront.notice, "Double Biceps isn't available for Front photos.")

        let flexedSide = ProgressPhotoPoseContract.applying(.contraction(.flexed), to: draft(.side, .relaxed, .standard))
        XCTAssertEqual(flexedSide.draft.contraction, .relaxed)
        XCTAssertEqual(flexedSide.notice, "Side photos use Relaxed.")

        let lat = ProgressPhotoPoseContract.applying(.variant(.latSpread), to: draft(.rear, .relaxed, .standard))
        XCTAssertEqual(lat.draft.poseVariant, .standard)
        XCTAssertNotNil(lat.notice)
    }

    func testOrientationChangesMoveTheDependentChoicesAndSayWhy() {
        let toFront = ProgressPhotoPoseContract.applying(.orientation(.front), to: draft(.rear, .flexed, .doubleBiceps))
        XCTAssertEqual(toFront.draft.canonicalPose?.id, "front-flexed")
        XCTAssertEqual(toFront.notice, "Double Biceps is a Rear pose, so Pose was reset to Standard.")

        let toSide = ProgressPhotoPoseContract.applying(.orientation(.leftSide), to: draft(.front, .flexed, .standard))
        XCTAssertEqual(toSide.draft.canonicalPose?.id, "left-side-relaxed")
        XCTAssertEqual(toSide.notice, "Left Side photos use Relaxed.")

        let unchanged = ProgressPhotoPoseContract.applying(.orientation(.rear), to: draft(.front, .relaxed, .standard))
        XCTAssertEqual(unchanged.draft.canonicalPose?.id, "back-relaxed")
        XCTAssertNil(unchanged.notice)
    }

    // MARK: Never contradictory, always reachable

    func testNoChangeEverProducesAContradictoryCombination() {
        var checked = 0
        for orientation in ProgressPhotoOrientation.allCases {
            for contraction in ProgressPhotoContraction.allCases {
                for variant in ProgressPhotoPoseVariant.allCases {
                    let start = draft(orientation, contraction, variant)
                    guard isConsistent(start) else { continue }   // only states the controls can reach
                    var changes: [ProgressPhotoPoseContract.Change] = []
                    changes += ProgressPhotoOrientation.allCases.map { .orientation($0) }
                    changes += ProgressPhotoContraction.allCases.map { .contraction($0) }
                    changes += ProgressPhotoPoseVariant.allCases.map { .variant($0) }
                    for change in changes {
                        let result = ProgressPhotoPoseContract.applying(change, to: start)
                        XCTAssertTrue(isConsistent(result.draft), "\(start.poseLabel) + \(change) -> \(result.draft.poseLabel)")
                        XCTAssertFalse(result.draft.confirmed)
                        checked += 1
                    }
                }
            }
        }
        XCTAssertGreaterThan(checked, 100)
    }

    func testEveryCanonicalCombinationRemainsSelectableInAnyOrderUsingOnlyOfferedChoices() {
        let orders: [[Int]] = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]
        for (orientation, contraction, variant, id) in Self.canonical {
            for order in orders {
                var value = draft()
                for step in order {
                    switch step {
                    case 0:
                        XCTAssertTrue(ProgressPhotoPoseContract.selectableOrientations.contains(orientation), "\(id) orientation not offered")
                        value = ProgressPhotoPoseContract.applying(.orientation(orientation), to: value).draft
                    case 1:
                        XCTAssertTrue(ProgressPhotoPoseContract.selectableContractions(for: value.orientation).contains(contraction), "\(id) contraction not offered in order \(order)")
                        value = ProgressPhotoPoseContract.applying(.contraction(contraction), to: value).draft
                    default:
                        XCTAssertTrue(ProgressPhotoPoseContract.selectableVariants(for: value.orientation).contains(variant), "\(id) variant not offered in order \(order)")
                        value = ProgressPhotoPoseContract.applying(.variant(variant), to: value).draft
                    }
                }
                XCTAssertEqual(value.canonicalPose?.id, id, "order \(order)")
            }
        }
    }

    func testOfferedChoicesComeFromTheContract() {
        XCTAssertEqual(ProgressPhotoPoseContract.selectableVariants(for: .rear), [.standard, .doubleBiceps])
        XCTAssertEqual(ProgressPhotoPoseContract.selectableVariants(for: .unconfirmed), [.standard, .doubleBiceps])
        for orientation in [ProgressPhotoOrientation.front, .side, .leftSide, .rightSide] {
            XCTAssertEqual(ProgressPhotoPoseContract.selectableVariants(for: orientation), [.standard], "\(orientation)")
        }
        for variant in [ProgressPhotoPoseVariant.latSpread, .sideChest, .other] {
            XCTAssertFalse(ProgressPhotoOrientation.allCases.contains { ProgressPhotoPoseContract.selectableVariants(for: $0).contains(variant) }, "\(variant) is not a canonical pose")
        }
        XCTAssertEqual(ProgressPhotoPoseContract.selectableContractions(for: .front), [.unconfirmed, .relaxed, .flexed])
        XCTAssertEqual(ProgressPhotoPoseContract.selectableContractions(for: .side), [.unconfirmed, .relaxed])
        XCTAssertEqual(ProgressPhotoPoseContract.selectableOrientations, [.unconfirmed, .front, .rear, .side, .leftSide, .rightSide])
    }

    // MARK: Confirm Pose and serialization

    func testConfirmPoseIsEnabledOnlyForACombinationTheServerConsidersCanonical() {
        XCTAssertFalse(draft().isCanonicalPose, "nothing chosen")
        XCTAssertFalse(draft(.rear, .unconfirmed, .doubleBiceps).isCanonicalPose, "incomplete")
        XCTAssertFalse(draft(.rear, .relaxed, .doubleBiceps).isCanonicalPose, "contradictory")
        XCTAssertFalse(draft(.front, .flexed, .doubleBiceps).isCanonicalPose)
        XCTAssertFalse(draft(.side, .flexed, .standard).isCanonicalPose)
        for (orientation, contraction, variant, _) in Self.canonical { XCTAssertTrue(draft(orientation, contraction, variant).isCanonicalPose) }
    }

    func testSerializedIdentitiesAreTheCanonicalContractSpelling() throws {
        let contractRows = Dictionary(uniqueKeysWithValues: ProgressPhotoPoseContractData.combinations.map { ($0.id, [$0.orientation, $0.contractionState, $0.poseVariant]) })
        for (orientation, contraction, variant, id) in Self.canonical {
            let json = try ProductionEvidenceUploadView.photoIdentitiesJSON([draft(orientation, contraction, variant, confirmed: true)])
            let decoded = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(json.utf8)) as? [[String: Any]])
            let entry = try XCTUnwrap(decoded.first)
            XCTAssertEqual([entry["orientation"] as? String, entry["contractionState"] as? String, entry["poseVariant"] as? String], contractRows[id]?.map { Optional($0) }, id)
            XCTAssertEqual(entry["identityStatus"] as? String, "confirmed")
            XCTAssertEqual(entry["goalValidationRole"] as? String, "supporting")
        }
        let side = try ProductionEvidenceUploadView.photoIdentitiesJSON([draft(.side, .relaxed, .standard, confirmed: true)])
        XCTAssertTrue(side.contains("\"side_unspecified\""), "Native's generic Side is sent as the contract's side_unspecified")
    }

    func testANonCanonicalIdentityCanNeverBeSerialized() {
        XCTAssertThrowsError(try ProductionEvidenceUploadView.photoIdentitiesJSON([draft(.front, .relaxed, .standard), draft(.rear, .relaxed, .doubleBiceps)])) { error in
            XCTAssertEqual(error as? ProgressPhotoIdentityError, .nonCanonicalPose(photo: 2))
        }
        XCTAssertThrowsError(try ProductionEvidenceUploadView.photoIdentitiesJSON([draft(.rear, .unconfirmed, .standard)]))
        XCTAssertEqual(ProgressPhotoIdentityError.nonCanonicalPose(photo: 2).errorDescription, "Photo 2's pose isn't a supported combination. Choose one of the supported poses.")
    }

    // MARK: Review presentation

    func testGoalRelationshipTextNeverExposesARawEnum() {
        XCTAssertEqual(EvidenceReviewPhotoSession.goalRelationshipText(goalLabel: "Build Lean Mass", status: "resolved"), "Build Lean Mass")
        XCTAssertEqual(EvidenceReviewPhotoSession.goalRelationshipText(goalLabel: "Build Lean Mass", status: "needs_review"), "Build Lean Mass")
        XCTAssertEqual(EvidenceReviewPhotoSession.goalRelationshipText(goalLabel: nil, status: "resolved"), "Linked goal")
        XCTAssertEqual(EvidenceReviewPhotoSession.goalRelationshipText(goalLabel: "  ", status: "needs_review"), "Needs session review")
        XCTAssertEqual(EvidenceReviewPhotoSession.goalRelationshipText(goalLabel: nil, status: "unrelated"), "No goal linked")
        XCTAssertNil(EvidenceReviewPhotoSession.goalRelationshipText(goalLabel: nil, status: "something_new"))
        XCTAssertNil(EvidenceReviewPhotoSession.goalRelationshipText(goalLabel: nil, status: nil))
        for status in ["resolved", "needs_review", "unrelated", "anything"] {
            XCTAssertFalse((EvidenceReviewPhotoSession.goalRelationshipText(goalLabel: nil, status: status) ?? "").contains("_"), status)
        }
    }

    // MARK: Refusal is a failure

    func testAPhotoReadinessRefusalReadsAsAFailureNeverAnAcknowledgement() {
        let problem = ProductionProblemDetails(
            problemVersion: "1", type: nil, title: "This Evidence Review needs a correction before it can be confirmed.", status: 400,
            code: "PHOTO_POSE_UNRESOLVED", detail: "Choose a pose for the remaining photo before saving.", instance: nil, requestId: nil, fieldErrors: [], recovery: nil
        )
        let message = EvidenceReviewDetailView.errorMessage(for: ProductionNativeError.validation(problem))
        XCTAssertTrue(message.contains("can't be confirmed yet"))
        XCTAssertTrue(message.contains("Choose a pose for the remaining photo before saving."))
        XCTAssertFalse(message.lowercased().contains("accepted"))
        XCTAssertFalse(ProductionEvidenceIntakePipeline.acceptanceIsUncertain(after: ProductionNativeError.validation(problem)), "a 400 refusal is definitive, not an ambiguous acceptance")
    }
}
