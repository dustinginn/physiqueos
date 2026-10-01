import XCTest
@testable import PhysiqueOS

/// Proves the Build 33 Training Operating Plan wire contract: a JSON
/// payload shaped exactly like server's
/// `CoreNavigationReadService.getTrainingStrategyDetail`
/// (`operating-plan-training-strategy`) decodes into
/// `TrainingStrategyDetail`, and its `editor` sub-object carries every
/// field `TrainingStrategyEditorReadModel` needs plus the
/// `expectedCurrentVersionId` concurrency token — Training's OWN
/// concurrency model (the protocol's `currentVersionId`, the same
/// ActiveProtocolSuccessorService boundary Nutrition uses), not Recovery's
/// `expectedRevision` counter.
final class TrainingStrategyAPITests: XCTestCase {
    func testDecodesTheServerDetailAndEditorShapeExactly() throws {
        let json = Data("""
        {
          "protocolId": "training-protocol",
          "title": "Lean Mass Goal Training",
          "purpose": "Build the weekly structure, training focus, and progression needed to support your goal.",
          "goal": "Your Lean Mass Goal",
          "startedDate": "Jul 1, 2026",
          "status": "Active",
          "fields": [
            { "label": "Weekly Structure", "value": "3 area sessions" },
            { "label": "Training Focus", "value": "Chest" },
            { "label": "Progression", "value": "Moderate" }
          ],
          "editor": {
            "expectedCurrentVersionId": "training-protocol_v1",
            "frequencies": [
              { "area": "arms", "count": 0 },
              { "area": "core", "count": 0 },
              { "area": "lower_body", "count": 1 },
              { "area": "back", "count": 1 },
              { "area": "chest", "count": 1 },
              { "area": "shoulders", "count": 0 }
            ],
            "priorities": ["chest"],
            "progression": "moderate"
          }
        }
        """.utf8)

        let detail = try JSONDecoder().decode(TrainingStrategyDetail.self, from: json)

        XCTAssertEqual(detail.protocolId, "training-protocol")
        XCTAssertEqual(detail.title, "Lean Mass Goal Training")
        XCTAssertEqual(detail.goal, "Your Lean Mass Goal")
        XCTAssertEqual(detail.fields.map(\.label), ["Weekly Structure", "Training Focus", "Progression"])
        XCTAssertEqual(detail.editor.expectedCurrentVersionId, "training-protocol_v1")
        XCTAssertEqual(detail.editor.frequencies.map(\.area), [.arms, .core, .lowerBody, .back, .chest, .shoulders])
        XCTAssertEqual(detail.editor.frequencies.map(\.count), [0, 0, 1, 1, 1, 0])
        XCTAssertEqual(detail.editor.priorities, [.chest])
        XCTAssertEqual(detail.editor.progression, .moderate)

        // The exact mapping OperatingPlanStrategyEditorView.TrainingStrategyEditor
        // performs when priming its local editable model from a fetched detail.
        let model = TrainingStrategyEditorReadModel(
            strategyId: detail.protocolId,
            frequencies: detail.editor.frequencies,
            priorities: detail.editor.priorities,
            progression: detail.editor.progression
        )
        XCTAssertEqual(model.strategyId, "training-protocol")
        XCTAssertEqual(model.totalWeeklySessions, 3)
    }

    func testDecodesWithAnAbsentGoalAndAggressiveProgression() throws {
        // `goal` is optional server-side (composeOperatingPlanStrategyDetail's
        // `common.goal` is null when no active Goal is linked) — proves the
        // Native model tolerates its absence rather than failing to decode.
        let json = Data("""
        {
          "protocolId": "training-protocol",
          "title": "Current Training Strategy",
          "purpose": "Build the weekly structure.",
          "startedDate": "Jul 1, 2026",
          "status": "Active",
          "fields": [],
          "editor": {
            "expectedCurrentVersionId": "training-protocol_v2",
            "frequencies": [
              { "area": "arms", "count": 1 },
              { "area": "core", "count": 1 },
              { "area": "lower_body", "count": 2 },
              { "area": "back", "count": 2 },
              { "area": "chest", "count": 2 },
              { "area": "shoulders", "count": 1 }
            ],
            "priorities": ["back", "shoulders"],
            "progression": "aggressive"
          }
        }
        """.utf8)

        let detail = try JSONDecoder().decode(TrainingStrategyDetail.self, from: json)
        XCTAssertNil(detail.goal)
        XCTAssertEqual(detail.editor.progression, .aggressive)
        XCTAssertEqual(detail.editor.priorities, [.back, .shoulders])
    }
}
