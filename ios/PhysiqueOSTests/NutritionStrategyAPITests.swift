import XCTest
@testable import PhysiqueOS

/// Proves the Build 33 Nutrition Operating Plan wire contract: a JSON
/// payload shaped exactly like server's
/// `CoreNavigationReadService.getNutritionStrategyDetail`
/// (`operating-plan-nutrition-strategy`) decodes into
/// `NutritionStrategyDetail`, and its `editor` sub-object carries every
/// field `NutritionStrategyEditorReadModel` needs plus the
/// `expectedCurrentVersionId` concurrency token the save path requires —
/// Nutrition's OWN concurrency model (the protocol's `currentVersionId`),
/// not Recovery's `expectedRevision` counter.
final class NutritionStrategyAPITests: XCTestCase {
    func testDecodesTheServerDetailAndEditorShapeExactly() throws {
        let json = Data("""
        {
          "protocolId": "nutrition-protocol",
          "title": "Macro Strategy",
          "purpose": "Define how daily intake is composed across protein, carbohydrates, and fats to support your goal.",
          "goal": "Your Lean Mass Goal",
          "startedDate": "Jul 1, 2026",
          "status": "Active",
          "fields": [
            { "label": "Protein Target", "value": "1 g per lb of body weight" },
            { "label": "Carbohydrate Approach", "value": "Performance" },
            { "label": "Fat Approach", "value": "Sustainable Minimum" }
          ],
          "editor": {
            "expectedCurrentVersionId": "nutrition-protocol_v1",
            "proteinBasis": "body_weight",
            "proteinRatio": 1,
            "fixedProteinGrams": 150,
            "carbohydrateStrategy": "performance",
            "fatStrategy": "sustainable_minimum"
          }
        }
        """.utf8)

        let detail = try JSONDecoder().decode(NutritionStrategyDetail.self, from: json)

        XCTAssertEqual(detail.protocolId, "nutrition-protocol")
        XCTAssertEqual(detail.title, "Macro Strategy")
        XCTAssertEqual(detail.goal, "Your Lean Mass Goal")
        XCTAssertEqual(detail.fields.map(\.label), ["Protein Target", "Carbohydrate Approach", "Fat Approach"])
        XCTAssertEqual(detail.editor.expectedCurrentVersionId, "nutrition-protocol_v1")
        XCTAssertEqual(detail.editor.proteinBasis, .bodyWeight)
        XCTAssertEqual(detail.editor.proteinRatio, 1)
        XCTAssertEqual(detail.editor.fixedProteinGrams, 150)
        XCTAssertEqual(detail.editor.carbohydrateStrategy, .performance)
        XCTAssertEqual(detail.editor.fatStrategy, .sustainableMinimum)

        // The exact mapping OperatingPlanStrategyEditorView.NutritionStrategyEditor
        // performs when priming its local editable model from a fetched detail.
        let model = NutritionStrategyEditorReadModel(
            strategyId: detail.protocolId,
            proteinBasis: detail.editor.proteinBasis,
            proteinRatio: detail.editor.proteinRatio,
            fixedProteinGrams: detail.editor.fixedProteinGrams,
            carbohydrateStrategy: detail.editor.carbohydrateStrategy,
            fatStrategy: detail.editor.fatStrategy
        )
        XCTAssertEqual(model.strategyId, "nutrition-protocol")
        XCTAssertEqual(model.fixedProteinGrams, 150)
    }

    func testDecodesWithAnAbsentGoalAndFixedGramsBasis() throws {
        // `goal` is optional server-side (composeOperatingPlanStrategyDetail's
        // `common.goal` is null when no active Goal is linked) — proves the
        // Native model tolerates its absence rather than failing to decode.
        let json = Data("""
        {
          "protocolId": "nutrition-protocol",
          "title": "Macro Strategy",
          "purpose": "Define how daily intake is composed.",
          "startedDate": "Jul 1, 2026",
          "status": "Active",
          "fields": [],
          "editor": {
            "expectedCurrentVersionId": "nutrition-protocol_v2",
            "proteinBasis": "fixed_grams",
            "proteinRatio": 1,
            "fixedProteinGrams": 200,
            "carbohydrateStrategy": "balanced",
            "fatStrategy": "higher_fat"
          }
        }
        """.utf8)

        let detail = try JSONDecoder().decode(NutritionStrategyDetail.self, from: json)
        XCTAssertNil(detail.goal)
        XCTAssertEqual(detail.editor.proteinBasis, .fixedGrams)
        XCTAssertEqual(detail.editor.fixedProteinGrams, 200)
    }
}
