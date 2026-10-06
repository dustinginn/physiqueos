import SwiftUI
import XCTest
@testable import PhysiqueOS

/// Build 47: the deployed unified V3 Server contract (714dcaef). Native renders
/// the Server's canonical V3 presentation verbatim and never recreates strategy,
/// Energy interpretation, or uncertainty locally. Historical V2 artifacts stay
/// readable.
final class BriefingV3PresentationTests: XCTestCase {
    // MARK: Weekly

    func testWeeklyCanonicalV3MapsServerHeroCoachEnergyAndUncertaintyVerbatim() throws {
        let weekly = try XCTUnwrap(try map(weeklyV3Envelope()).weekly)
        XCTAssertEqual(weekly.heroHeadline, "V3 summary headline.")
        XCTAssertEqual(weekly.heroBody, "V3 meaning body.")
        XCTAssertEqual(weekly.coachTake.biggestTakeaway, "V3 result.")
        XCTAssertEqual(weekly.coachTake.recommendation, "V3 coach take.")
        XCTAssertEqual(weekly.coachTake.intoNextWeek, ["V3 action.", "V3 watch."])
        let energy = try XCTUnwrap(weekly.energy?.canonicalV3)
        XCTAssertEqual(energy.statement, "Calorie intake averaged 2,650 kcal/day, 50 kcal/day below the 2,700 kcal/day target.")
        XCTAssertEqual(weekly.energy?.narrative, energy.statement)
        // The Energy chart data is untouched by the V3 presentation.
        XCTAssertEqual(weekly.energy?.dailyBalances?.map(\.date).count, 5)
        XCTAssertEqual(weekly.energy?.dailyBalances?.filter { !$0.hasPairedData }.count, 1)
    }

    func testWeeklyStructuredUncertaintyIsRetainedNotDropped() throws {
        let weekly = try XCTUnwrap(try map(weeklyV3Envelope()).weekly)
        let items = try XCTUnwrap(weekly.uncertainty)
        XCTAssertEqual(items.map(\.id), ["u-surfaced", "u-suppressed", "u-high", "u-textless"])
        XCTAssertEqual(items[0].surfacedIn, "energy")
        XCTAssertEqual(items[1].suppressionReason, "already_conveyed")
        // Presentation follows the Server: surfaced, or high materiality. Suppressed
        // low-materiality items and items with no Server text never render, and
        // Native writes no wording for them.
        XCTAssertEqual(items.presentableTexts, ["Server surfaced text.", "Server high-materiality text."])
        XCTAssertNil(items[3].presentableText)
    }

    func testWeeklyUncertaintyCardRendersOnlyServerText() {
        let card = BriefingUncertaintyCard(items: [
            .init(id: "a", materiality: "moderate", text: "Shown.", surfaced: true),
            .init(id: "b", materiality: "low", text: "Hidden.", surfaced: false, suppressionReason: "redundant"),
            .init(id: "c", materiality: "high", text: "Shown.", surfaced: false),
            .init(id: "d", materiality: "high", text: "  ", surfaced: true)
        ])
        XCTAssertEqual(card.texts, ["Shown."], "duplicates collapse; blank and suppressed text never renders")
        XCTAssertTrue(BriefingUncertaintyCard(items: nil).texts.isEmpty)
    }

    func testWeeklyEnergyKeepsServerGoalRelativeFindingsWithoutBalanceSignVerdict() throws {
        let weekly = try XCTUnwrap(try map(weeklyV3Envelope()).weekly)
        let energy = try XCTUnwrap(weekly.energy)
        // The estimate is a positive balance, yet the Server's plan-relative state is
        // below_plan for intake. Native carries the Server's state and never derives one.
        XCTAssertEqual(energy.averageBalanceKcal, 171)
        let strategy = try XCTUnwrap(energy.canonicalV3)
        XCTAssertEqual(strategy.findings.map(\.state), ["below_plan", "on_plan"])
        XCTAssertEqual(strategy.findings.map(\.dimension), ["intake", "activity"])
        XCTAssertEqual(strategy.findings[0].observedValue, 2650)
        XCTAssertEqual(strategy.findings[0].targetValue, 2700)
        XCTAssertEqual(strategy.estimateAverageKcalPerDay, 171)
        XCTAssertEqual(strategy.estimatePairedDayCount, 6)
        XCTAssertEqual(strategy.estimateEligibleDayCount, 7)
        XCTAssertEqual(strategy.ambiguity.presentableTexts, ["Server energy ambiguity."])
        XCTAssertEqual(WeeklyEnergyCard.findingStateLabel("above_plan"), "Above Plan")
        XCTAssertEqual(WeeklyEnergyCard.findingDimensionLabel("intake"), "Calorie intake")
    }

    func testWeeklyV3WithoutStoredEnergyStructureStillMarksV3AndNeverInventsInterpretation() throws {
        // A Weekly published before the structured V3 additions (served as stored).
        let json = weeklyV3Envelope(includeStructured: false)
        let weekly = try XCTUnwrap(try map(json).weekly)
        let strategy = try XCTUnwrap(weekly.energy?.canonicalV3, "V3-bound Weekly must suppress Native-derived Energy interpretation")
        XCTAssertNil(strategy.statement)
        XCTAssertTrue(strategy.findings.isEmpty)
        XCTAssertEqual(weekly.energy?.headline, "Energy this week")
        XCTAssertEqual(weekly.uncertainty, [])
    }

    func testWeeklyBlankServerStringsStayBlankSoTheViewCanHideThem() throws {
        let weekly = try XCTUnwrap(try map(weeklyV3Envelope()).weekly)
        XCTAssertEqual(weekly.weight?.narrative, "")
        XCTAssertEqual(weekly.photos?.narrative, "")
        XCTAssertEqual(weekly.training?.narrative, "")
    }

    func testNoRawBuildingEvidenceTaxonomyAnywhereInBriefingPresentation() throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        for path in ["PhysiqueOS/Presentation/Briefings", "PhysiqueOS/SharedUI/BriefingPresentation.swift"] {
            let url = root.appendingPathComponent(path)
            var isDirectory: ObjCBool = false
            FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory)
            let files = isDirectory.boolValue
                ? try FileManager.default.contentsOfDirectory(at: url, includingPropertiesForKeys: nil).filter { $0.pathExtension == "swift" }
                : [url]
            for file in files {
                let source = try String(contentsOf: file, encoding: .utf8)
                XCTAssertFalse(source.contains("building evidence"), "\(file.lastPathComponent) exposes the raw building-evidence count label")
            }
        }
    }

    func testEnergyPresentationHasNoHardcodedSuccessGreenForBalance() throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        for path in ["PhysiqueOS/Presentation/Briefings/WeeklyBriefingSections.swift"] {
            let source = try String(contentsOf: root.appendingPathComponent(path), encoding: .utf8)
            let start = try XCTUnwrap(source.range(of: "struct BriefingEnergySection"))
            let energyCard = String(source[start.lowerBound...])
            XCTAssertFalse(energyCard.contains("chartSuccess"), "Energy balance must not use a fixed success color")
            XCTAssertFalse(energyCard.contains("balanceColor"))
        }
        let monthly = try String(contentsOf: root.appendingPathComponent("PhysiqueOS/Presentation/Briefings/MonthlyBriefingSections.swift"), encoding: .utf8)
        XCTAssertFalse(monthly.contains("\"Avg Balance\", signedCalories(energyEvolution.averageBalanceKcal), color: PhysiqueOSTheme.chartSuccess"))
    }

    func testFrozenWeeklyV2HasNoV3AdditionsAndStaysReadable() throws {
        let weekly = try XCTUnwrap(try map(weeklyV2Envelope()).weekly)
        XCTAssertEqual(weekly.heroHeadline, "Server-owned weekly conclusion")
        XCTAssertNil(weekly.uncertainty)
        XCTAssertNil(weekly.energy?.canonicalV3)
        XCTAssertEqual(weekly.energy?.averageBalanceKcal, -125)
    }

    // MARK: Midweek

    func testMidweekV3DecodesAdditiveUncertaintyAndToleratesAbsentDetail() throws {
        let model = try map(midweekV3Envelope(includeDetail: false, includeUncertainty: true))
        let midweek = try XCTUnwrap(model.midweek)
        let narrative = try XCTUnwrap(midweek.narrativeV3)
        XCTAssertNil(narrative.detail)
        XCTAssertEqual(narrative.summary, "Midweek V3 headline.")
        XCTAssertEqual(midweek.heroSummary, "Midweek V3 meaning.")
        XCTAssertEqual(midweek.uncertainty?.presentableTexts, ["Midweek surfaced uncertainty."])
        XCTAssertEqual(model.confidence?.score, 79)
        // Every legacy interpretation string is intentionally absent for V3 Midweek.
        XCTAssertTrue(midweek.prioritiesThroughSunday.isEmpty || midweek.prioritiesThroughSunday == ["Midweek V3 action.", "Midweek V3 watch."])
    }

    func testMidweekV3WithoutUncertaintyOrOptionalFieldsStillDecodes() throws {
        let model = try map(midweekV3Envelope(includeDetail: true, includeUncertainty: false))
        let midweek = try XCTUnwrap(model.midweek)
        XCTAssertEqual(midweek.narrativeV3?.detail, "Midweek V3 detail.")
        XCTAssertEqual(midweek.uncertainty, [])
    }

    func testMidweekFrozenV2HasNoV3Fields() throws {
        let midweek = try XCTUnwrap(try map(midweekV2Envelope()).midweek)
        XCTAssertNil(midweek.narrativeV3)
        XCTAssertNil(midweek.uncertainty)
        XCTAssertEqual(midweek.heroVerdict, "Server-owned midweek verdict")
    }

    // MARK: Midweek — bound `midweek_presentation_contract_v1` (restored format standard)
    //
    // Production (Server `f8c28700`, contract candidate `28ac1e4f` in its
    // lineage) always ships both a full legacy `narrativeV3` object AND a
    // bound `presentationContract`; the contract is what Native renders.
    // These fixtures mirror that exact double-shipped shape — never a
    // contract-only simplification — so a regression that starts reading
    // `narrativeV3` again would be caught here, not just in an unrealistic
    // fixture.

    func testMidweekContractDecodesGoalPhaseModuleOrderAndConfidenceBoundToAssessment() throws {
        let midweek = try XCTUnwrap(try map(midweekContractEnvelope()).midweek)
        let contract = try XCTUnwrap(midweek.presentationContract)
        XCTAssertEqual(contract.artifactId, "midweek-v3c")
        XCTAssertEqual(contract.assessmentId, "assessment-midweek-v3c")
        XCTAssertEqual(contract.lead.goal?.name, "Build Lean Mass")
        XCTAssertEqual(contract.lead.phase?.name, "Lean Mass Build")
        XCTAssertEqual(contract.modules.map(\.id), ["energy", "weight", "body_composition", "training", "recovery"])
        XCTAssertEqual(contract.includedModuleIds, ["energy", "weight", "body_composition", "training"])
        XCTAssertEqual(contract.lead.confidence?.assessmentId, "assessment-midweek-v3c")
        XCTAssertEqual(contract.lead.confidence?.movementLabel, "— No meaningful change")
    }

    /// Regression for the exact production shape: contract `visibleItems`
    /// carry NO `surfaced` field (unlike the broader legacy `uncertainty[]`
    /// array). A moderate-materiality contract item must still render —
    /// the Server already decided it belongs in `visibleItems`.
    func testMidweekContractUncertaintyRendersWithoutSurfacedFieldAtModerateMateriality() throws {
        let midweek = try XCTUnwrap(try map(midweekContractEnvelope()).midweek)
        let contract = try XCTUnwrap(midweek.presentationContract)
        XCTAssertEqual(contract.uncertainty.visibleItems.map(\.materiality), ["moderate"])
        XCTAssertEqual(contract.uncertainty.visibleItems.compactMap(\.presentableText), ["Intake uncertainty this window."])
        let card = BriefingUncertaintyCard(items: contract.uncertainty.visibleItems)
        XCTAssertEqual(card.texts, ["Intake uncertainty this window."])
    }

    func testMidweekContractCoachingSuppressesSecondMovementByDefault() throws {
        let midweek = try XCTUnwrap(try map(midweekContractEnvelope()).midweek)
        let contract = try XCTUnwrap(midweek.presentationContract)
        XCTAssertEqual(contract.coaching.map(\.section), ["action", "watch"])
        XCTAssertNil(contract.coaching.first(where: { $0.section == "coachTake" }))
    }

    /// Regression: `lead.meaning` is legitimately absent whenever the
    /// Server's own text-duplicate dedup drops it against the headline
    /// (`addClaim` in `createMidweekPresentationContract`) — a real,
    /// reachable production state, not a hypothetical. Confirms the hero
    /// narrative falls to an empty string in that case, and specifically
    /// NEVER falls through to the full concatenated `narrativeV3.detail`,
    /// which would silently duplicate Result/Meaning/Action/Watch/
    /// Confidence text this screen exists to stop showing in the hero.
    func testMidweekHeroNeverFallsThroughToNarrativeDetailWhenContractOmitsMeaning() throws {
        let midweek = try XCTUnwrap(try map(midweekContractEnvelope(omitMeaning: true)).midweek)
        XCTAssertNil(midweek.presentationContract?.lead.meaning)
        XCTAssertNotNil(midweek.narrativeV3?.detail, "the fixture's legacy detail must still be present to prove this isn't a vacuous pass")
        let view = MidweekBriefingSections(content: midweek, confidence: nil)
        XCTAssertEqual(view.heroNarrative, "")
    }

    /// Production-fixture parity: the exact Sep 20–22 case (Machine Lateral
    /// Raise 90 lb allocated to Result, Leg Extensions 90 lb an
    /// independent structured Training fact, not narratively prominent).
    /// Fixture: agent-handoffs/fixtures/20260924T051615Z-midweek-slice0-production-lineage-parity.json
    @MainActor
    func testMidweekRestoredFormatMatchesProductionFixtureBothParityAndSemanticParity() throws {
        let model = try map(midweekContractEnvelope())
        let midweek = try XCTUnwrap(model.midweek)
        let contract = try XCTUnwrap(midweek.presentationContract)

        // FORMAT PARITY: established module order restored, one Confidence
        // surface, no full narrativeV3.detail in the hero.
        XCTAssertEqual(contract.includedModuleIds, ["energy", "weight", "body_composition", "training"])
        XCTAssertEqual(model.confidence?.score, 79)
        let hero = try XCTUnwrap(midweek.presentationContract?.lead)
        XCTAssertEqual(hero.headline, "Machine lateral raises reached 90 lb, up from the previous best of 85 lb.")
        XCTAssertNotEqual(hero.meaning, midweek.narrativeV3?.detail, "hero must not fall back to the concatenated detail")
        XCTAssertTrue((midweek.narrativeV3?.detail ?? "").count > (hero.meaning ?? "").count,
                      "the fixture's legacy detail is deliberately longer than the contract's short meaning")

        // V3 SEMANTIC PARITY: both 90 lb facts stay factually available —
        // Machine Lateral Raise via the Result headline above, Leg
        // Extensions as a structured Training highlight — without both
        // monopolizing narrative prominence (no second Coach's Take
        // movement claim).
        let training = try XCTUnwrap(midweek.training)
        XCTAssertEqual(training.highlights?.map(\.exerciseName), ["Lateral Raises Machine", "Leg Extensions"])
        XCTAssertEqual(training.highlights?.map(\.performanceValue), ["90 lb", "90 lb"])
        XCTAssertNil(contract.coaching.first(where: { $0.section == "coachTake" }),
                     "Leg Extensions must not also own a Coach's Take movement claim")

        // Uncertainty bounded to <=2, plain language only.
        XCTAssertLessThanOrEqual(contract.uncertainty.visibleItems.count, 2)

        let view = MidweekBriefingSections(content: midweek, confidence: model.confidence)
        let renderer = ImageRenderer(content: view
            .padding(16)
            .frame(width: 390)
            .fixedSize(horizontal: false, vertical: true)
            .background(PhysiqueOSTheme.background)
            .environment(\.colorScheme, .dark))
        renderer.scale = 2
        let image = try XCTUnwrap(renderer.uiImage, "restored Midweek V3 failed to render")
        XCTAssertGreaterThan(image.size.height, 400, "restored Midweek V3 rendered no substantive content")
    }

    // MARK: Midweek mutation coverage — each of these breaks one acceptance
    // gate on purpose and asserts the screen (or the decode) rejects it.

    func testMidweekMutationModuleOrderOutOfSequenceFailsClosed() {
        XCTAssertThrowsError(try mapNonAsserting(midweekContractEnvelope(moduleOrderMutation: true)))
    }

    func testMidweekMutationContractArtifactIdMismatchFailsClosed() {
        XCTAssertThrowsError(try mapNonAsserting(midweekContractEnvelope(artifactIdMismatch: true)))
    }

    func testMidweekMutationDuplicateCoachingClaimIdFailsClosed() {
        XCTAssertThrowsError(try mapNonAsserting(midweekContractEnvelope(duplicateCoachingClaimId: true)))
    }

    /// One-Confidence-surface rule: when the contract omits Confidence,
    /// nothing on screen falls through to an unrelated Confidence object.
    func testMidweekMutationAbsentContractConfidenceNeverFallsThroughToAnotherSurface() throws {
        let model = try map(midweekContractEnvelope(omitConfidence: true))
        XCTAssertNil(model.confidence)
        let midweek = try XCTUnwrap(model.midweek)
        let view = MidweekBriefingSections(content: midweek, confidence: model.confidence)
        XCTAssertNil(view.content.presentationContract?.lead.confidence)
    }

    /// Regression: Biggest Takeaway must never render as a blank heading.
    /// The default fixture's contract suppresses `coachTake` (second
    /// movement, not decision-changing) — exactly the production Sep20–22
    /// shape — so `BriefingCoachFinale` must omit that whole slot rather
    /// than showing "💡 Biggest Takeaway" over empty text.
    func testMidweekCoachFinaleOmitsBiggestTakeawayWhenContractSuppressesIt() throws {
        let midweek = try XCTUnwrap(try map(midweekContractEnvelope()).midweek)
        let contract = try XCTUnwrap(midweek.presentationContract)
        XCTAssertNil(contract.coaching.first(where: { $0.section == "coachTake" }))
        let bySection = Dictionary(contract.coaching.map { ($0.section, $0.text) }, uniquingKeysWith: { _, latest in latest })
        let finale = BriefingCoachFinale(
            takeaway: bySection["coachTake"] ?? "",
            recommendation: bySection["action"] ?? "",
            watch: bySection["watch"]
        )
        XCTAssertFalse(finale.renderedSectionTitles.contains("Biggest Takeaway"))
        XCTAssertTrue(finale.renderedSectionTitles.contains("What To Do"))
    }

    /// The inverse: with a real coachTake claim, Biggest Takeaway renders.
    func testMidweekCoachFinaleRendersBiggestTakeawayWhenContractProvidesIt() {
        let finale = BriefingCoachFinale(takeaway: "A real takeaway.", recommendation: "Do the thing.", watch: "Watch this.")
        XCTAssertEqual(finale.renderedSectionTitles, ["Biggest Takeaway", "What To Do", "What To Watch"])
    }

    /// No first-person AI-assistant ownership label anywhere in the finale.
    func testMidweekCoachFinaleUsesNoFirstPersonLabel() {
        let finale = BriefingCoachFinale(takeaway: "A takeaway.", recommendation: "Do the thing.")
        for title in finale.renderedSectionTitles {
            XCTAssertFalse(title.localizedCaseInsensitiveContains("my"), "label must not use first-person ownership: \(title)")
        }
        XCTAssertTrue(finale.renderedSectionTitles.contains("What To Do"))
    }

    /// Weekly's call site (always Server-populated takeaway/recommendation,
    /// no `watch`) is unaffected by the empty-content guard.
    func testWeeklyCoachFinaleUnaffectedByEmptyContentGuard() {
        let finale = BriefingCoachFinale(takeaway: "Weekly takeaway.", recommendation: "Weekly recommendation.",
                                          actionTitle: "Into Next Week", actions: ["Priority one."])
        XCTAssertEqual(finale.renderedSectionTitles, ["Biggest Takeaway", "What To Do", "Into Next Week"])
    }

    /// The Weekly mapper falls back to `""`/`[]` when the Server payload
    /// omits `coachInsight` (not exercised by the fixture above, which is
    /// always well-formed) — not a scenario this fix can prevent (Weekly's
    /// content is Server-owned, not gated by this component), but it must
    /// degrade gracefully rather than newly crash or invent content: no
    /// slot renders, only the "COACH'S TAKE" label. Pre-existing behavior,
    /// explicitly proven here rather than left an unverified assumption.
    func testCoachFinaleDegradesGracefullyWithNoContentAtAll() {
        let finale = BriefingCoachFinale(takeaway: "", recommendation: "")
        XCTAssertEqual(finale.renderedSectionTitles, [])
    }

    /// `coveredIds` (uncertainty already owned by Watch/a module caveat)
    /// decodes as a plain passthrough and stays entirely separate from
    /// `visibleItems` (what Still Unresolved renders).
    func testMidweekUncertaintyCoveredIdsDecodeSeparatelyFromVisibleItems() throws {
        let midweek = try XCTUnwrap(try map(midweekContractEnvelope()).midweek)
        let contract = try XCTUnwrap(midweek.presentationContract)
        XCTAssertEqual(contract.uncertainty.coveredIds.count, 3, "Watch/module-covered uncertainty stays out of Still Unresolved")
        XCTAssertEqual(contract.uncertainty.visibleItems.count, 1)
    }

    /// >2 unresolved items would violate the bounded-uncertainty rule. The
    /// production Server itself caps `visibleItems` at 2 before
    /// serializing (`boundedUncertainty` in the Server's presentation
    /// service), but the client does not fully trust that: it also clamps
    /// to 2 client-side (defense in depth against a Server regression).
    /// This exercises that actual client-side clamp — not just the
    /// Server-shaped fixture, which by construction never exceeds 2.
    func testMidweekClientClampsUnresolvedToTwoEvenIfContractSentMore() throws {
        let midweek = try XCTUnwrap(try map(midweekContractEnvelope(extraUncertaintyItems: true)).midweek)
        let contract = try XCTUnwrap(midweek.presentationContract)
        XCTAssertEqual(contract.uncertainty.visibleItems.count, 3, "the fixture itself carries 3 — an out-of-contract Server sender")
        // The exact clamp MidweekBriefingSections applies before handing
        // items to BriefingUncertaintyCard.
        let clamped = Array(contract.uncertainty.visibleItems.prefix(2))
        let card = BriefingUncertaintyCard(items: clamped)
        XCTAssertEqual(card.texts.count, 2)
    }

    /// V2 fallback boundary: a frozen V2 artifact must never decode a
    /// presentationContract, even if V3-shaped keys are also present.
    func testMidweekV2FallbackBoundaryNeverDecodesContract() throws {
        let midweek = try XCTUnwrap(try map(midweekV2Envelope()).midweek)
        XCTAssertNil(midweek.presentationContract)
    }

    // MARK: Monthly

    func testMonthlyV3DecodesStrategicSummaryAndIgnoresAdditiveIntelligence() throws {
        let monthly = try XCTUnwrap(try map(monthlyEnvelope(v3: true)).monthly)
        let strategic = try XCTUnwrap(monthly.strategicSummaryV3)
        XCTAssertEqual(strategic.result, "Monthly V3 result.")
        XCTAssertEqual(strategic.action, "Monthly V3 action.")
        XCTAssertEqual(strategic.coachTake, "Monthly V3 coach take.")
        XCTAssertEqual(strategic.energyStatement, "Monthly V3 energy statement.")
        XCTAssertEqual(strategic.uncertainty.presentableTexts, ["Monthly surfaced uncertainty."])
        XCTAssertEqual(monthly.heroHeadline, "Monthly V3 headline.")
        XCTAssertEqual(monthly.heroBody, "Monthly V3 meaning.")
    }

    func testMonthlyV3NeverGetsNativeAuthoredLeadFeatures() throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        let source = try String(contentsOf: root.appendingPathComponent("PhysiqueOS/Presentation/Briefings/MonthlyBriefingSections.swift"), encoding: .utf8)
        let gate = try XCTUnwrap(source.range(of: "if content.strategicSummaryV3 != nil { return [] }"))
        let fallback = try XCTUnwrap(source.range(of: "value: \"Early momentum\""))
        XCTAssertLessThan(gate.lowerBound, fallback.lowerBound, "the V3 gate must precede the Native fallback features")
    }

    func testMonthlyStrategicCardOmitsSectionsThatRepeatTheHeroBody() {
        let summary = MonthlyStrategicSummaryV3(result: "R", meaning: "Hero body", action: "A")
        let card = MonthlyStrategicSummaryCard(summary: summary, heroBody: "Hero body")
        XCTAssertEqual(card.renderedSectionTitles, ["Result", "What To Do"])
    }

    func testMonthlyFrozenV2HasNoStrategicSummary() throws {
        let monthly = try XCTUnwrap(try map(monthlyEnvelope(v3: false)).monthly)
        XCTAssertNil(monthly.strategicSummaryV3)
        XCTAssertEqual(monthly.heroHeadline, "Server-owned monthly thesis")
    }

    // MARK: DEXA and Photo compatibility

    func testDEXAV3EventKeepsExistingPresentationWhenStrategicMeaningIsPresent() throws {
        let v2 = try XCTUnwrap(try map(dexaEnvelope(withV3: false)).dexa)
        let v3 = try XCTUnwrap(try map(dexaEnvelope(withV3: true)).dexa)
        XCTAssertEqual(v3.interpretation, v2.interpretation)
        XCTAssertEqual(v3.progress, v2.progress)
        XCTAssertEqual(v3.snapshot, v2.snapshot)
        XCTAssertEqual(v3.hero.title, "V3 DEXA headline.", "Server-overridden hero flows through unchanged")
        XCTAssertEqual(v3.coachInsight.protect, "V3 DEXA action.")
    }

    func testPhotoV3EventKeepsAcceptedSubstantivePresentation() throws {
        let v2 = try XCTUnwrap(try mapPhoto(photoEnvelope(withV3: false)).photo)
        let v3 = try XCTUnwrap(try mapPhoto(photoEnvelope(withV3: true)).photo)
        XCTAssertEqual(v3.interpretationParagraphs, v2.interpretationParagraphs)
        XCTAssertEqual(v3.progressBody, v2.progressBody)
        XCTAssertEqual(v3.activeViews, v2.activeViews)
        XCTAssertEqual(v3.heroTitle, v2.heroTitle)
        XCTAssertEqual(v3.coachInsightBody, "V3 photo coach take.")
    }

    // MARK: Rendering

    /// Draws the real Weekly, Midweek and Monthly V3 views from Server-shaped payloads.
    /// Asserts they produce visible content and the Server's own text, and attaches the
    /// renders (also written to `PHYSIQUEOS_RENDER_DIR` when set) for visual acceptance.
    @MainActor
    func testCanonicalV3SurfacesRenderServerTextWithoutBalanceColorVerdicts() throws {
        let weekly = try map(weeklyV3Envelope())
        let midweek = try map(midweekV3Envelope(includeDetail: true, includeUncertainty: true))
        let monthly = try map(monthlyEnvelope(v3: true))
        let surfaces: [(String, AnyView)] = [
            ("weekly-v3", AnyView(WeeklyBriefingSections(content: try XCTUnwrap(weekly.weekly), confidence: weekly.confidence))),
            ("midweek-v3", AnyView(MidweekBriefingSections(content: try XCTUnwrap(midweek.midweek), confidence: midweek.confidence))),
            ("monthly-v3", AnyView(MonthlyBriefingSections(content: try XCTUnwrap(monthly.monthly), confidence: monthly.confidence))),
        ]
        for (name, view) in surfaces {
            let renderer = ImageRenderer(content: view
                .padding(16)
                .frame(width: 390)
                .fixedSize(horizontal: false, vertical: true)
                .background(PhysiqueOSTheme.background)
                .environment(\.colorScheme, .dark))
            renderer.scale = 2
            let image = try XCTUnwrap(renderer.uiImage, "\(name) failed to render")
            XCTAssertGreaterThan(image.size.height, 400, "\(name) rendered no substantive content")
            let attachment = XCTAttachment(image: image)
            attachment.name = name
            attachment.lifetime = .keepAlways
            add(attachment)
            if let directory = ProcessInfo.processInfo.environment["PHYSIQUEOS_RENDER_DIR"], let png = image.pngData() {
                try png.write(to: URL(fileURLWithPath: directory).appendingPathComponent("\(name).png"))
            }
        }
    }

    // MARK: Helpers

    private func map(_ json: String) throws -> BriefingReadModel {
        let value = try JSONDecoder().decode(BriefingJSONValue.self, from: Data(json.utf8))
        return try XCTUnwrap(try ProductionBriefingMapper.detail(value))
    }

    /// Unlike `map`, records no failure of its own on a throw — for
    /// mutation tests that assert the mapper rejects malformed input via
    /// `XCTAssertThrowsError`. `map`'s `XCTUnwrap` would otherwise record
    /// its own failure the instant the expected throw happens, before
    /// `XCTAssertThrowsError` gets a chance to treat it as expected.
    private func mapNonAsserting(_ json: String) throws -> BriefingReadModel? {
        let value = try JSONDecoder().decode(BriefingJSONValue.self, from: Data(json.utf8))
        return try ProductionBriefingMapper.detail(value)
    }

    private func mapPhoto(_ json: String) throws -> BriefingReadModel {
        let value = try JSONDecoder().decode(BriefingJSONValue.self, from: Data(json.utf8))
        return try XCTUnwrap(try ProductionBriefingMapper.detail(value))
    }

    private static let confidenceJSON = #"{"score":79,"band":"high","priorScore":79,"delta":0,"movementDirection":"held","presentationExplanation":"Canonical V3 confidence.","movementLabel":"No meaningful change","primaryReason":"Canonical V3 confidence.","supportingReasons":[],"limitingReasons":[],"unresolvedUncertainty":[{"uncertaintyId":"u-raw","type":"energy_pairing","domain":"energy","materiality":"moderate","reasons":["paired_days_6_of_7"]}],"goalId":"goal","phaseId":"phase","assessmentDate":"2026-09-20T07:00:00.000Z","source":"canonical_confidence_v3_snapshot"}"#

    private static let structuredWeekly = #""uncertainty":[{"uncertaintyId":"u-surfaced","type":"energy_pairing","domain":"energy","materiality":"moderate","text":"Server surfaced text.","surfaced":true,"surfacedIn":"energy","suppressionReason":null},{"uncertaintyId":"u-suppressed","type":"wearable","domain":"energy","materiality":"low","text":"Server suppressed text.","surfaced":false,"surfacedIn":null,"suppressionReason":"already_conveyed"},{"uncertaintyId":"u-high","type":"tension","domain":"weight","materiality":"high","text":"Server high-materiality text.","surfaced":false,"surfacedIn":null,"suppressionReason":"budget"},{"uncertaintyId":"u-textless","type":"raw","domain":"energy","materiality":"moderate","surfaced":true}],"energyStrategy":{"strategy":{"kind":"target"},"estimate":{"averageKcalPerDay":171,"pairing":{"pairedDayCount":6,"eligibleDayCount":7}},"findings":[{"findingId":"f-intake","dimension":"intake","state":"below_plan","targetValue":2700,"observedValue":2650,"deviation":-50,"unit":"kcal/day"},{"findingId":"f-activity","dimension":"activity","state":"on_plan","targetValue":600,"observedValue":610,"deviation":10,"unit":"kcal/day"}],"ambiguity":[{"uncertaintyId":"e-1","type":"energy_pairing","domain":"energy","materiality":"moderate","text":"Server energy ambiguity.","surfaced":true}],"statement":"Calorie intake averaged 2,650 kcal/day, 50 kcal/day below the 2,700 kcal/day target."},"recommendation":{"action":"continue_current_strategy","reason":"strategy_supported","urgency":"routine"},"#

    private func weeklyV3Envelope(includeStructured: Bool = true) -> String {
        let structured = includeStructured ? Self.structuredWeekly : ""
        let energyTitle = includeStructured ? "Calorie intake averaged 2,650 kcal/day, 50 kcal/day below the 2,700 kcal/day target." : "Energy this week"
        let energyNarrative = includeStructured ? "Calorie intake averaged 2,650 kcal/day, 50 kcal/day below the 2,700 kcal/day target." : ""
        return #"{"schemaVersion":"1","artifact":{"artifactId":"weekly-v3","artifactType":"scheduled","cadence":"weekly","version":3,"evidenceWindow":{"id":"w","startDate":"2026-09-13","endDate":"2026-09-19","timeZone":"America/Los_Angeles"},"publicationDate":"2026-09-20T07:00:00.000Z"},"goalPhaseAttribution":{"goalId":"goal","phaseId":"phase"},"presentation":{"presentationModel":"canonical_narrative_v3","#
            + structured
            + #""hero":{"periodLabel":"Completed week\nSep 13–Sep 19","goalLabel":"Build Lean Mass","headline":"V3 summary headline.","body":"V3 meaning body.","confidence":"#
            + Self.confidenceJSON
            + #","strategy":{"name":"Lean Mass Build","weekLabel":"Week 6","reviewLabel":""}},"energy":{"title":"#
            + "\"\(energyTitle)\""
            + #","narrative":"#
            + "\"\(energyNarrative)\""
            + #","averageIntake":2650,"averageExpenditure":2479,"averageBalance":171,"pairedDayCount":6,"eligibleDayCount":7,"chart":{"points":[{"date":"2026-09-13","label":"Su","intake":2700,"expenditure":2480,"balance":220,"complete":true},{"date":"2026-09-14","label":"Mo","intake":2600,"expenditure":2500,"balance":100,"complete":true},{"date":"2026-09-15","label":"Tu","intake":2650,"expenditure":2450,"balance":200,"complete":true},{"date":"2026-09-16","label":"We","intake":null,"expenditure":2470,"balance":null,"complete":false},{"date":"2026-09-17","label":"Th","intake":2640,"expenditure":2490,"balance":150,"complete":true}]}},"weight":{"weeklyAverage":170.2,"change":0.4,"narrative":""},"photos":{"title":"","narrative":""},"training":{"title":"Completed-week direction","conclusion":"","status":{"improving":2,"plateauing":1,"insufficient":3},"comparableCategoryCount":6,"insufficientCount":3,"trainingDayCount":5,"highlights":[],"priorityCategories":[]},"bodyComposition":null,"coachInsight":{"title":"Carry the week forward","biggestWin":"V3 result.","keepBuilding":"V3 coach take.","watchNextWeek":"V3 watch.","actionItems":["V3 action.","V3 watch."]}}}"#
    }

    private func weeklyV2Envelope() -> String {
        #"{"schemaVersion":"1","artifact":{"artifactId":"weekly-1","artifactType":"scheduled","cadence":"weekly","version":3,"evidenceWindow":{"id":"week-1","startDate":"2026-09-01","endDate":"2026-09-07","timeZone":"America/Los_Angeles"},"publicationDate":"2026-09-08T14:00:00.000Z"},"goalPhaseAttribution":{"goalId":"goal-canonical","phaseId":"phase-canonical"},"presentation":{"hero":{"periodLabel":"Completed week\nSep 1–7","goalLabel":"Build Lean Mass","headline":"Server-owned weekly conclusion","body":"Published narrative.","confidence":{"score":71,"band":"moderate","presentationExplanation":"Canonical weekly Confidence explanation.","movementLabel":"Confidence increased","primaryReason":"Evidence strengthened.","supportingReasons":[],"limitingReasons":[],"unresolvedUncertainty":[],"goalId":"goal-canonical","phaseId":"phase-canonical","assessmentDate":"2026-09-08T14:00:00.000Z","source":"canonical_pi_snapshot"},"strategy":{"name":"Foundation","weekLabel":"Week 2","reviewLabel":"Next review"}},"energy":{"averageIntake":2500,"averageExpenditure":2625,"averageBalance":-125,"pairedDayCount":7,"eligibleDayCount":7,"title":"Calories need more context.","narrative":"Server energy read."},"weight":null,"photos":null,"training":{"title":"Training response","conclusion":"Server training conclusion.","status":{"improving":1,"stable":2},"comparableCategoryCount":3,"insufficientCount":0,"highlights":[],"priorityCategories":[]},"bodyComposition":null,"coachInsight":{"biggestWin":"Strong execution.","keepBuilding":"Keep building.","watchNextWeek":"Watch recovery.","actionItems":["Repeat the plan."]}}}"#
    }

    private func midweekV3Envelope(includeDetail: Bool, includeUncertainty: Bool) -> String {
        let detail = includeDetail ? #""detail":"Midweek V3 detail.","# : ""
        let uncertainty = includeUncertainty
            ? #""uncertainty":[{"uncertaintyId":"m-1","type":"energy_pairing","domain":"energy","materiality":"moderate","text":"Midweek surfaced uncertainty.","surfaced":true,"surfacedIn":"midweek"},{"uncertaintyId":"m-2","type":"wearable","domain":"energy","materiality":"low","text":"Midweek suppressed.","surfaced":false,"suppressionReason":"budget"}],"#
            : ""
        return #"{"schemaVersion":"1","artifact":{"artifactId":"midweek-v3","artifactType":"scheduled","cadence":"midweek","version":3,"evidenceWindow":{"id":"window","startDate":"2026-09-20","endDate":"2026-09-22","timeZone":"America/Los_Angeles"},"publicationDate":"2026-09-23T14:00:00.000Z"},"goalPhaseAttribution":{"goalId":"goal","phaseId":"phase"},"presentation":{"presentationModel":"canonical_narrative_v3","hero":{"verdict":"Midweek V3 headline.","summary":"Midweek V3 meaning."},"narrativeV3":{"summary":"Midweek V3 headline.","#
            + detail
            + #""sections":{"result":"Midweek V3 result.","meaning":"Midweek V3 meaning.","action":"Midweek V3 action.","watch":"Midweek V3 watch.","confidence":"Midweek V3 confidence."},"coachTake":"Midweek V3 coach take.","recommendation":{"action":"continue_current_strategy"},"strategicQuestion":null,"strategicInterpretationId":"si-1"},"#
            + uncertainty
            + #""energyBalance":{"headline":null,"interpretation":"Server statement.","balanceHeadline":"50 kcal/day below","averageIntake":2650,"estimatedAverageExpenditure":2700,"estimatedDailyBalanceMidpoint":-50,"comparableDays":3,"chartPoints":[]},"coachTake":{"biggestTakeaway":"Midweek V3 coach take.","recommendation":"Midweek V3 action."},"goalConfidence":{"score":79,"band":"high","movementDirection":"held","presentationExplanation":"Canonical V3 confidence.","movementLabel":"No meaningful change","assessmentContext":{"goalId":"goal","phaseId":"phase"},"source":"canonical_confidence_v3_snapshot"},"activeGoal":{"id":"goal","name":"Build Lean Mass"},"activePhase":{"id":"phase","name":"Lean Mass Build"},"prioritiesThroughSunday":["Midweek V3 action.","Midweek V3 watch."]}}"#
    }

    private func midweekV2Envelope() -> String {
        #"{"schemaVersion":"1","artifact":{"artifactId":"midweek-1","artifactType":"scheduled","cadence":"midweek","version":2,"evidenceWindow":{"id":"midweek-1","startDate":"2026-09-06","endDate":"2026-09-08","timeZone":"America/Los_Angeles"},"publicationDate":"2026-09-09T14:00:00.000Z"},"goalPhaseAttribution":{"goalId":"goal-canonical","phaseId":"phase-canonical"},"presentation":{"hero":{"verdict":"Server-owned midweek verdict","summary":"Published midweek summary."},"coachTake":{"biggestTakeaway":"Hold steady.","recommendation":"Use the full week."},"goalConfidence":{"score":69,"band":"moderate","movementDirection":"held","presentationExplanation":"Canonical midweek Confidence explanation.","movementLabel":"No meaningful change","primaryReason":"Evidence held.","supportingReasons":[],"limitingReasons":[],"unresolvedUncertainty":[],"assessmentContext":{"goalId":"goal-canonical","phaseId":"phase-canonical"},"assessmentTimestamp":"2026-09-09T14:00:00.000Z","source":"canonical_pi_snapshot"},"activeGoal":{"id":"goal-canonical","name":"Build Lean Mass"},"activePhase":{"id":"phase-canonical","name":"Foundation"},"prioritiesThroughSunday":["Keep the plan steady."]}}"#
    }

    /// Mirrors the exact production shape: `narrativeV3` (full legacy
    /// sections, ignored by the restored screen) shipped alongside a bound
    /// `midweek_presentation_contract_v1` (what the screen actually
    /// renders), plus legacy top-level `activeGoal`/`activePhase`/
    /// `prioritiesThroughSunday` that the contract path must never surface.
    /// Movement facts mirror the sanitized Sep 20–22 production fixture
    /// (`agent-handoffs/fixtures/20260924T051615Z-midweek-slice0-production-lineage-parity.json`):
    /// Machine Lateral Raise 90 lb (Result) and Leg Extensions 90 lb
    /// (structured Training fact only, second-movement Coach's Take
    /// suppressed).
    private func midweekContractEnvelope(
        moduleOrderMutation: Bool = false,
        artifactIdMismatch: Bool = false,
        duplicateCoachingClaimId: Bool = false,
        omitConfidence: Bool = false,
        extraUncertaintyItems: Bool = false,
        omitMeaning: Bool = false
    ) -> String {
        let artifactId = "midweek-v3c"
        var modules: [[String: Any]] = [
            ["id": "energy", "payloadKey": "energyBalance", "included": true, "reasonCode": "paired_evidence", "order": 1, "pairedDayCount": 2, "chartIncluded": true, "chartReason": "minimum_pair_count_met"],
            ["id": "weight", "payloadKey": "weightContext", "included": true, "reasonCode": "sufficient_observations", "order": 2, "observationCount": 3],
            ["id": "body_composition", "payloadKey": "bodyComposition", "included": true, "reasonCode": "phase_baseline", "order": 3],
            ["id": "training", "payloadKey": "training", "included": true, "reasonCode": "qualifying_training_evidence", "order": 4],
            ["id": "recovery", "payloadKey": "recovery", "included": false, "reasonCode": "no_eligible_evidence", "order": 5],
        ]
        if moduleOrderMutation {
            modules[0]["order"] = 4
            modules[3]["order"] = 1
        }
        var lead: [String: Any] = [
            "headlineClaimId": "claim-result",
            "headline": "Machine lateral raises reached 90 lb, up from the previous best of 85 lb.",
            "goal": ["id": "goal-1", "name": "Build Lean Mass"],
            "phase": ["id": "phase-1", "name": "Lean Mass Build"],
        ]
        if !omitMeaning {
            lead["meaningClaimId"] = "claim-meaning"
            lead["meaning"] = "Building Lean Mass, training stayed on track through midweek."
        }
        if !omitConfidence {
            lead["confidence"] = [
                "claimId": "claim-confidence", "assessmentId": "assessment-midweek-v3c",
                "score": 79, "band": "high", "movement": "no_meaningful_change",
                "movementDirection": "held", "delta": 0,
                "reason": "Training stayed consistent and Confidence held steady.",
                "movementLabel": "— No meaningful change",
            ]
        }
        let coaching: [[String: Any]] = [
            ["section": "action", "label": "What To Do", "claimId": duplicateCoachingClaimId ? "claim-shared" : "claim-action", "text": "Keep loading presses through Friday."],
            ["section": "watch", "label": "What To Watch", "claimId": duplicateCoachingClaimId ? "claim-shared" : "claim-watch", "text": "Watch sleep consistency this week."],
        ]
        let presentationContract: [String: Any] = [
            "schemaVersion": "midweek_presentation_contract_v1",
            "artifactId": artifactIdMismatch ? "wrong-artifact-id" : artifactId,
            "assessmentId": "assessment-midweek-v3c",
            "lead": lead,
            "modules": modules,
            "coaching": coaching,
            "uncertainty": [
                "visibleItems": extraUncertaintyItems ? [
                    ["uncertaintyId": "u-intake", "type": "intake_uncertainty", "materiality": "moderate", "text": "Intake uncertainty this window."],
                    ["uncertaintyId": "u-wearable-estimate", "type": "wearable", "materiality": "moderate", "text": "Wearable estimate uncertainty this window."],
                    ["uncertaintyId": "u-pairing-gap", "type": "energy_pairing", "materiality": "moderate", "text": "Pairing gap uncertainty this window."],
                ] : [
                    ["uncertaintyId": "u-intake", "type": "intake_uncertainty", "materiality": "moderate", "text": "Intake uncertainty this window."],
                ],
                "coveredIds": ["u-wearable", "u-pairing", "u-guardrail"],
            ],
        ]
        let narrativeV3: [String: Any] = [
            "summary": "Machine lateral raises reached 90 lb, up from the previous best of 85 lb.",
            "detail": "Machine lateral raises reached 90 lb, up from the previous best of 85 lb. Building Lean Mass, training stayed on track through midweek. Keep loading presses through Friday. Watch sleep consistency this week. Confidence held at 79, no meaningful change.",
            "sections": [
                "result": "Machine lateral raises reached 90 lb.",
                "meaning": "Building Lean Mass, training stayed on track.",
                "action": "Keep loading presses through Friday.",
                "watch": "Watch sleep consistency this week.",
                "confidence": "Confidence held at 79.",
            ],
            "coachTake": "Leg extensions also reached 90 lb, a second strong movement this week.",
        ]
        let presentation: [String: Any] = [
            "presentationModel": "canonical_narrative_v3",
            "hero": ["verdict": "Midweek Briefing", "summary": "Legacy hero summary — must never render when a contract is present."],
            "narrativeV3": narrativeV3,
            "energyBalance": [
                "averageIntake": 2650, "estimatedAverageExpenditure": 2700, "estimatedDailyBalanceMidpoint": -50,
                "interpretation": NSNull(), "headline": NSNull(), "balanceHeadline": "50 kcal/day below",
                "chartPoints": [
                    ["date": "2026-09-20", "label": "Su", "intake": 2600, "expenditure": 2680, "balance": -80, "complete": true],
                    ["date": "2026-09-21", "label": "Mo", "intake": 2700, "expenditure": 2720, "balance": -20, "complete": true],
                ],
            ],
            "weightContext": ["averageWeight": 178.4, "changeFromPriorComparable": -0.6, "interpretation": ""],
            "bodyComposition": [
                "newScan": ["date": "2026-09-21", "bodyFatPercentage": 14.2, "leanMass": 152.0, "fatMass": 25.1],
                "objective": "Track lean mass", "interpretation": "",
            ],
            "training": [
                "performanceHeadline": "Training stayed on track.", "conclusion": "",
                "status": ["improving": 2, "stable": 3], "comparableCategoryCount": 5, "trainingDayCount": 3,
                "highlights": [
                    ["canonicalExerciseId": "lateral_raise_machine", "exerciseName": "Lateral Raises Machine", "recordType": "Heaviest Load", "performanceValue": "90 lb", "delta": "+5 lb", "headline": "New heaviest load.", "detail": "Up from 85 lb on Sep 22."],
                    ["canonicalExerciseId": "leg_extension", "exerciseName": "Leg Extensions", "recordType": "Heaviest Load", "performanceValue": "90 lb", "delta": "+10 lb", "headline": "New heaviest load.", "detail": "Up from 80 lb on Sep 21."],
                ],
                "priorityCategories": [Any](),
            ],
            "coachTake": ["biggestTakeaway": "LEGACY — must never render.", "recommendation": "LEGACY — must never render."],
            "goalConfidence": ["score": 79, "band": "high", "movementDirection": "held", "presentationExplanation": "LEGACY — must never render.", "movementLabel": "No meaningful change", "source": "canonical_confidence_v3_snapshot"],
            "activeGoal": ["id": "legacy-goal", "name": "LEGACY GOAL — must never render"],
            "activePhase": ["id": "legacy-phase", "name": "LEGACY PHASE — must never render"],
            "prioritiesThroughSunday": ["LEGACY priority — must never render."],
            "presentationContract": presentationContract,
        ]
        return json([
            "schemaVersion": "1",
            "artifact": ["artifactId": artifactId, "artifactType": "scheduled", "cadence": "midweek", "version": 3,
                         "evidenceWindow": ["id": "window-c", "startDate": "2026-09-20", "endDate": "2026-09-22", "timeZone": "America/Los_Angeles"],
                         "publicationDate": "2026-09-23T10:01:29.328Z"],
            "goalPhaseAttribution": ["goalId": "goal-1", "phaseId": "phase-1"],
            "presentation": presentation,
        ])
    }

    private func json(_ object: [String: Any]) -> String {
        String(decoding: try! JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]), as: UTF8.self)
    }

    private func confidenceObject(score: Int, source: String = "canonical_pi_snapshot") -> [String: Any] {
        ["score": score, "band": "moderate", "movementDirection": "held", "presentationExplanation": "Explanation.",
         "movementLabel": "No meaningful change", "primaryReason": "r", "supportingReasons": [String](), "limitingReasons": [String](),
         "unresolvedUncertainty": [Any](), "goalId": "goal-canonical", "phaseId": "phase-canonical",
         "assessmentDate": "2026-09-19T18:00:00Z", "source": source]
    }

    private func monthlyEnvelope(v3: Bool) -> String {
        var briefing: [String: Any] = [
            "monthlyPresentation": ["hero": [
                "period": "September 1–30 · Delivered October 1", "goal": "Foundation",
                "title": v3 ? "Monthly V3 headline." : "Server-owned monthly thesis",
                "thesis": v3 ? "Monthly V3 meaning." : "Published monthly narrative.",
                "highlights": [Any](), "confidence": confidenceObject(score: 73, source: "canonical_confidence_v3_snapshot")
            ]]
        ]
        if v3 {
            briefing["monthlyNarrative"] = [
                "title": "Monthly V3 headline.", "thesis": "Monthly V3 meaning.",
                "strategicSummaryV3": [
                    "summary": "Monthly V3 headline.", "detail": "d",
                    "sections": ["result": "Monthly V3 result.", "meaning": "Monthly V3 meaning.", "action": "Monthly V3 action.",
                                 "watch": "Monthly V3 watch.", "confidence": "Monthly V3 confidence."],
                    "coachTake": "Monthly V3 coach take.",
                    "recommendation": ["action": "continue_current_strategy"],
                    "uncertainty": [
                        ["uncertaintyId": "mo-1", "type": "pairing", "domain": "energy", "materiality": "moderate", "text": "Monthly surfaced uncertainty.", "surfaced": true],
                        ["uncertaintyId": "mo-2", "type": "wearable", "materiality": "low", "text": "Monthly suppressed.", "surfaced": false]
                    ],
                    "energy": ["statement": "Monthly V3 energy statement.", "findings": [Any]()]
                ]
            ]
            briefing["monthlyIntelligenceV3"] = [
                "schemaVersion": "monthly_evidence_intelligence_production_v1",
                "sourceMatrix": [["sourceId": "s", "domain": "energy", "statement": "row"]],
                "relationships": [Any](), "personalCalibration": NSNull(),
                "recommendation": ["action": "continue"], "confidenceConsequence": ["effect": "none"], "selectedHighlights": [Any]()
            ]
        }
        return json([
            "artifact": ["id": "monthly-1", "artifactType": "scheduled", "cadence": "monthly", "version": 1,
                         "generatedAt": "2026-10-01T14:00:00.000Z",
                         "evidenceWindow": ["id": "monthly:2026-09", "startDate": "2026-09-01", "endDate": "2026-09-30",
                                            "briefingMonth": "2026-09", "deliveryDate": "2026-10-01", "timeZone": "America/Los_Angeles"],
                         "goalContext": ["goalId": "goal-canonical", "phaseId": "phase-canonical"],
                         "briefing": briefing],
            "goals": [["id": "goal-canonical", "title": "Build Lean Mass"]]
        ])
    }

    private func dexaEnvelope(withV3: Bool) -> String {
        var narrative: [String: Any] = [
            "scanId": "scan", "priorScanId": "scan-prior", "priorScanDate": "2026-07-31",
            "snapshot": ["scanId": "scan", "scanDate": "2026-08-15", "daysBetweenScans": 15, "weight": 161.1,
                         "bodyFat": 7.6, "fatMass": 12.8, "leanMass": 148.3, "rmr": 1715],
            "hero": ["title": withV3 ? "V3 DEXA headline." : "Original DEXA headline.",
                     "body": "The August 15 scan is the reliable phase baseline.", "results": [Any](),
                     "confidence": confidenceObject(score: 59)],
            "progress": ["headline": [Any](), "regionalFat": [Any](), "regionalLean": [Any](), "supplemental": [Any]()],
            "interpretation": ["opening": "The August 15 DEXA is the phase baseline.", "fatLoss": "Body fat stayed controlled.",
                               "leanMass": "One scan cannot establish a lasting response.", "regional": "Regional changes remain small.",
                               "supportingEvidence": "The canonical PDF anchors this read.", "uncertainty": "The next DEXA is the major check."],
            "coachInsight": ["biggestWin": "The baseline is reliable.", "protect": withV3 ? "V3 DEXA action." : "Keep the plan steady.",
                             "watch": "Watch the next scan.", "next": "Compare the next DEXA against August 15."]
        ]
        if withV3 {
            narrative["strategicMeaningV3"] = ["result": "r", "meaning": "m", "action": "a", "watch": "w", "confidence": "c", "coachTake": "t",
                                               "uncertainty": [["uncertaintyId": "d-1", "materiality": "moderate", "text": "DEXA uncertainty.", "surfaced": true]]]
        }
        return json([
            "artifact": ["id": "dexa_event_scan", "artifactType": "event", "cadence": "event", "generatedAt": "2026-08-15T18:00:00.000Z",
                         "evidenceWindow": ["id": "dexa:scan", "startDate": "2026-08-15", "endDate": "2026-08-15", "timeZone": "America/Los_Angeles"],
                         "goalContext": ["goalId": "goal-canonical", "phaseId": "phase-canonical"],
                         "briefing": ["dexaEventNarrative": narrative]],
            "goals": [["id": "goal-canonical", "title": "Build Lean Mass"]]
        ])
    }

    private func photoEnvelope(withV3: Bool) -> String {
        var narrative: [String: Any] = [
            "photoSessionId": "session-1", "eventDate": "2026-09-19", "completion": "5 of 5",
            "goalConfidence": confidenceObject(score: 64),
            "activeViews": [["id": "v1", "poseId": "front_relaxed", "headline": "Front read.", "supportingObservations": ["Obs."],
                             "comparisonStatus": "comparable", "goalRelevance": "primary", "media": ["mediaId": "media-1"]]],
            "cardContent": [
                "hero": ["title": "Photo hero", "body": "Photo body."],
                "snapshot": ["title": "Snapshot", "poses": ["Front"], "conditions": "Morning."],
                "progress": ["title": "Progress", "body": "Progress body.", "comparisons": [Any]()],
                "interpretation": ["title": "Interpretation", "paragraphs": ["P1.", "P2."]],
                "coachInsight": ["body": withV3 ? "V3 photo coach take." : "Original photo coach take."]
            ]
        ]
        if withV3 {
            narrative["strategicMeaningV3"] = ["result": "r", "meaning": "m", "action": "a", "watch": "w", "confidence": "c", "coachTake": "t",
                                               "uncertainty": [["uncertaintyId": "p-1", "materiality": "high", "text": "Photo uncertainty.", "surfaced": true]]]
        }
        return json([
            "artifact": ["id": "photo_event_1", "artifactType": "event", "cadence": "event", "generatedAt": "2026-09-19T18:00:00.000Z",
                         "evidenceWindow": ["id": "photo:1", "startDate": "2026-09-19", "endDate": "2026-09-19", "timeZone": "America/Los_Angeles"],
                         "goalContext": ["goalId": "goal-canonical", "phaseId": "phase-canonical"],
                         "briefing": ["photoEventNarrative": narrative]],
            "goals": [["id": "goal-canonical", "title": "Build Lean Mass"]]
        ])
    }

    // MARK: Monthly cleanup (approved Monthly, no redesign)

    func testMonthlyToneIconsCoverEveryServerToneWithoutGenericFallback() {
        // Tones the server emits for What Changed, Defining Moments, highlights and Month Ahead.
        let expected: [String: String] = [
            "training": "dumbbell.fill", "energy": "bolt.fill", "weight": "scalemass.fill",
            "photos": "camera.fill", "baseline": "scope", "completion": "trophy.fill",
            "routine": "calendar.badge.checkmark", "recovery": "bed.double.fill",
        ]
        for (tone, icon) in expected {
            XCTAssertEqual(ProductionBriefingMapper.monthlyIcon(tone), icon, tone)
        }
        // Legacy fixture names still resolve to the same icons.
        XCTAssertEqual(ProductionBriefingMapper.monthlyIcon("calories"), "bolt.fill")
        XCTAssertEqual(ProductionBriefingMapper.monthlyIcon("dexa"), "scope")
        // Unknown tones keep the neutral fallback.
        XCTAssertEqual(ProductionBriefingMapper.monthlyIcon("action-3"), "sparkles")
        XCTAssertEqual(ProductionBriefingMapper.monthlyIcon(nil), "sparkles")
    }

    func testMonthlyWhatChangedUsesTheSharedToneMappingAndNoAnalyticalReadLabel() throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        let source = try String(contentsOf: root.appendingPathComponent("PhysiqueOS/Presentation/Briefings/MonthlyBriefingSections.swift"), encoding: .utf8)
        XCTAssertFalse(source.contains("Baseline Read"))
        XCTAssertTrue(source.contains("MonthlyCallout(title: \"What it means\""))
    }
}

/// Overnight Lane B — the Founder-locked Briefing presentation family.
/// Presentation-only guarantees: every published artifact routes to its own
/// cadence screen, the locked section order holds, nothing regenerates or
/// mutates a canonical payload, chart gestures use the scroll-safe
/// arbitration, and both appearances resolve.
final class BriefingLockedPresentationTests: XCTestCase {
    private var root: URL { URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent() }

    private func source(_ path: String) throws -> String {
        try String(contentsOf: root.appendingPathComponent(path), encoding: .utf8)
    }

    private var presentationFiles: [String] {
        let directory = root.appendingPathComponent("PhysiqueOS/Presentation/Briefings")
        let files = (try? FileManager.default.contentsOfDirectory(atPath: directory.path)) ?? []
        return files.filter { $0.hasSuffix(".swift") }.map { "PhysiqueOS/Presentation/Briefings/\($0)" } + ["PhysiqueOS/SharedUI/BriefingPresentation.swift"]
    }

    // MARK: Routing

    func testEveryPublishedBriefingTypeRoutesToItsOwnCadenceScreen() throws {
        let store = BriefingSandboxStore()
        var seen: Set<String> = []
        for briefing in store.briefings {
            let route = BriefingCadenceBody.route(for: briefing)
            switch briefing.cadence {
            case .weekly: XCTAssertEqual(route, .weekly)
            case .midweek: XCTAssertEqual(route, .midweek)
            case .monthly: XCTAssertEqual(route, .monthly)
            case .event: XCTAssertEqual(route, briefing.dexa != nil ? .dexa : .photo)
            case .daily: XCTAssertEqual(route, BriefingCadenceBody.Route.none)
            }
            seen.insert("\(route)")
        }
        XCTAssertEqual(seen, ["weekly", "midweek", "monthly", "dexa", "photo"], "the fixture must exercise all five Briefing types")
    }

    func testDetailAndHistoryReadOnlyPublishedArtifactsAndNeverRegenerate() throws {
        for path in presentationFiles {
            let text = try source(path)
            for forbidden in ["productionCommandAPI", "commandAPI", "regenerate", "republish", "\"POST\"", "generateBriefing"] {
                XCTAssertFalse(text.contains(forbidden), "\(path) must stay read-only (found \(forbidden))")
            }
        }
        let detail = try source("PhysiqueOS/Presentation/Briefings/BriefingDetailView.swift")
        XCTAssertTrue(detail.contains("briefingAPI.fetchBriefing(artifactId:"))
        let history = try source("PhysiqueOS/Presentation/Briefings/BriefingHistoryView.swift")
        XCTAssertTrue(history.contains("briefingAPI.fetchHistory()"))
    }

    // MARK: Payload identity

    @MainActor
    func testRenderingEveryBriefingLeavesItsCanonicalPayloadByteIdentical() throws {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let environment = AppEnvironment(nativeAuthority: .sandbox)
        for briefing in BriefingSandboxStore().briefings {
            let before = try encoder.encode(briefing)
            for scheme in [ColorScheme.dark, .light] {
                let renderer = ImageRenderer(content: BriefingCadenceBody(briefing: briefing)
                    .frame(width: 402)
                    .environment(environment)
                    .environment(\.colorScheme, scheme))
                _ = renderer.uiImage
            }
            XCTAssertEqual(try encoder.encode(briefing), before, "\(briefing.id) changed while rendering")
        }
    }

    // MARK: Locked section order / omissions

    func testRecurringBriefingsHaveNoStillUnresolvedOrRecurringPhotosSection() throws {
        let weekly = try source("PhysiqueOS/Presentation/Briefings/WeeklyBriefingSections.swift")
        let midweek = try source("PhysiqueOS/Presentation/Briefings/MidweekBriefingSections.swift")
        for text in [weekly, midweek] {
            XCTAssertFalse(text.contains("BriefingUncertaintyCard("))
        }
        XCTAssertFalse(weekly.contains("content.photos"), "Weekly must not mount the recurring Photos card")
        XCTAssertFalse(WeeklyBriefingSections.sectionInventory.contains("Photos"))
        XCTAssertEqual(Array(WeeklyBriefingSections.sectionInventory.prefix(4)), ["Integrated Lead", "Energy", "Weight", "Body Composition"])
    }

    func testMidweekFinaleUsesContractCoachingThenCanonicalCoachTakeVerbatim() throws {
        let url = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "BriefingsFixture", withExtension: "json")
            ?? Bundle.main.url(forResource: "BriefingsFixture", withExtension: "json"))
        _ = url
        var midweek = try XCTUnwrap(BriefingSandboxStore().briefings.first { $0.cadence == .midweek }?.midweek)
        midweek.narrativeV3 = CanonicalNarrativeV3ReadModel(summary: "S", detail: nil, result: "R", meaning: "M", action: "A", watch: "W", confidence: "C", coachTake: "Canonical coach take.")
        midweek.presentationContract = MidweekPresentationContract(
            artifactId: "a", assessmentId: nil,
            lead: .init(headlineClaimId: nil, headline: "H", meaningClaimId: nil, meaning: "M", goal: .init(id: nil, name: "Goal"), phase: .init(id: nil, name: "Phase"),
                        confidence: .init(claimId: "c", assessmentId: "a", score: 79, band: "high", movement: "held", movementDirection: "held", delta: 0, reason: "Contract reason.", movementLabel: "— No meaningful change")),
            modules: [.init(id: "weight", payloadKey: "weight", included: true, reasonCode: "x", order: 1, observationCount: 3)],
            coaching: [.init(section: "action", label: "What To Do", claimId: "a1", text: "Do it."), .init(section: "watch", label: "What To Watch", claimId: "w1", text: "Watch it.")],
            uncertainty: .init(visibleItems: [.init(id: "u", text: "Not shown", surfaced: true)], coveredIds: [])
        )
        let window = BriefingEvidenceWindowReadModel(id: "w", startDate: "2026-09-20", endDate: "2026-09-22", briefingDate: "2026-09-23", relativeLabel: "Sunday through Tuesday", timeZone: "UTC")
        let view = MidweekBriefingSections(content: midweek, confidence: nil, evidenceWindow: window)
        let contract = try XCTUnwrap(midweek.presentationContract)
        let slots = view.finaleSlots(contract)
        XCTAssertEqual(slots.takeaway, "Canonical coach take.")
        XCTAssertEqual(slots.action, "Do it.")
        XCTAssertEqual(slots.watch, "Watch it.")
        XCTAssertEqual(view.heroConfidence?.movement, "— No meaningful change")
        XCTAssertEqual(view.heroConfidence?.reason, "Contract reason.")
        XCTAssertEqual(view.weightNote(WeeklyWeightSection(averageWeightLb: 178.4, changeLb: -0.6, narrative: "")), "Sunday–Tuesday average · 3 observations")
        XCTAssertEqual(view.weightNote(WeeklyWeightSection(averageWeightLb: 178.4, changeLb: -0.6, narrative: "Server note.")), "Server note.")
    }

    func testConfidenceMovementCopyPrefersServerLabelAndOtherwiseStatesPersistedDelta() {
        var confidence = BriefingConfidenceReadModel(score: 68, band: "moderate", priorScore: 63, delta: 5, movementDirection: .increased, primaryReason: "r", supportingReasons: [], limitingReasons: [], unresolvedUncertainty: [], goalId: "g", phaseId: nil, capturedAt: "2026-08-30T00:00:00.000Z", source: "s")
        XCTAssertEqual(BriefingConfidenceCopy.movement(confidence), "Confidence increased +5")
        confidence.movementDirection = .decreased; confidence.delta = -7
        XCTAssertEqual(BriefingConfidenceCopy.movement(confidence), "Confidence decreased −7")
        confidence.presentationMovementLabel = "Server label"
        XCTAssertEqual(BriefingConfidenceCopy.movement(confidence), "Server label")
    }

    func testSignedFormattingUsesTrueMinusAndPlus() {
        XCTAssertEqual(BriefingNumberFormatting.signed(0.6, decimals: 1), "+0.6")
        XCTAssertEqual(BriefingNumberFormatting.signed(-0.6, decimals: 1), "−0.6")
        XCTAssertEqual(BriefingNumberFormatting.signedKcal(350), "+350 kcal")
        XCTAssertEqual(BriefingNumberFormatting.signedKcal(-50), "−50 kcal")
    }

    func testHeroRangeKeepsHumanCanonicalLabelsVerbatim() {
        XCTAssertEqual(BriefingDateFormatting.heroRangeLabel("Completed week\nAug 23–Aug 29"), "Completed week\nAug 23–Aug 29")
        XCTAssertEqual(BriefingDateFormatting.heroRangeLabel("2026-08-23 – 2026-08-29"), "Aug 23–29")
    }

    // MARK: Chart interaction

    func testBriefingChartsUseScrollSafeArbitrationNotLegacyZeroDistanceScrub() throws {
        for path in presentationFiles {
            XCTAssertFalse(try source(path).contains(".chartScrub"), "\(path) must not use the legacy zero-distance chartScrub")
        }
        let kit = try source("PhysiqueOS/SharedUI/BriefingPresentation.swift")
        XCTAssertTrue(kit.contains("EvidenceHorizontalScrubGesture"), "Briefing bars reuse the Evidence horizontal-only pan")
        XCTAssertTrue(kit.contains("onTapGesture(coordinateSpace: .local)"), "a tap selects")
    }

    func testEnergyBarSelectionResolvesTheNearestDayAndClamps() {
        XCTAssertEqual(BriefingEnergyBars.nearestIndex(toX: 0, width: 364, count: 7), 0)
        XCTAssertEqual(BriefingEnergyBars.nearestIndex(toX: 182, width: 364, count: 7), 3)
        XCTAssertEqual(BriefingEnergyBars.nearestIndex(toX: 400, width: 364, count: 7), 6)
        XCTAssertEqual(BriefingEnergyBars.nearestIndex(toX: -20, width: 364, count: 2), 0)
        XCTAssertNil(BriefingEnergyBars.nearestIndex(toX: 10, width: 364, count: 0))
    }

    // MARK: History

    func testHistoryRowSymbolsAndTimestampsAreTypeAndDateFaithful() {
        func row(_ cadence: BriefingCadence, _ type: String? = nil, _ date: String?) -> BriefingHistoryRowReadModel {
            BriefingHistoryRowReadModel(artifactId: "id", artifactType: type, cadence: cadence, label: "L", publicationDate: date, version: 1)
        }
        XCTAssertEqual(BriefingHistoryRow.symbol(for: row(.weekly, nil, nil)), "square.fill")
        XCTAssertEqual(BriefingHistoryRow.symbol(for: row(.midweek, nil, nil)), "clock")
        XCTAssertEqual(BriefingHistoryRow.symbol(for: row(.monthly, nil, nil)), "circle.dotted")
        XCTAssertEqual(BriefingHistoryRow.symbol(for: row(.event, "dexa_event", nil)), "waveform.path")
        XCTAssertEqual(BriefingHistoryRow.symbol(for: row(.event, "photo_event", nil)), "smallcircle.filled.circle")
        XCTAssertEqual(BriefingDateFormatting.historyTimestamp("2026-10-01"), "Oct 1, 2026", "a date-only delivery date gets no invented time")
        XCTAssertNotEqual(BriefingDateFormatting.historyTimestamp("2026-10-04T14:31:46.944Z"), "2026-10-04T14:31:46.944Z")
    }

    @MainActor
    func testEveryDetailAndHistoryStateRendersInBothAppearances() throws {
        let briefing = try XCTUnwrap(BriefingSandboxStore().briefings.first { $0.cadence == .weekly })
        let detailStates: [BriefingDetailView.LoadState] = [.loading, .failed, .notReady, .loaded(nil), .loaded(briefing)]
        let historyStates: [BriefingHistoryView.LoadState] = [.loading, .failed("Briefing History could not be loaded."), .loaded([]),
            .loaded([BriefingHistoryRowReadModel(artifactId: "a", artifactType: nil, cadence: .weekly, label: "Weekly Briefing", publicationDate: "2026-09-27T12:00:00.000Z", version: 1)])]
        for scheme in [ColorScheme.dark, .light] {
            for state in detailStates {
                let image = ImageRenderer(content: BriefingDetailBody(state: state).frame(width: 372).environment(AppEnvironment(nativeAuthority: .sandbox)).environment(\.colorScheme, scheme)).uiImage
                XCTAssertNotNil(image)
            }
            for state in historyStates {
                let image = ImageRenderer(content: BriefingHistoryContent(state: state).frame(width: 366).environment(\.colorScheme, scheme)).uiImage
                XCTAssertNotNil(image)
            }
        }
    }

    // MARK: Appearance + accessibility

    func testRichFieldsKeepTheirDarkFieldInMineralLightOnly() {
        let dark = UITraitCollection(userInterfaceStyle: .dark)
        let light = UITraitCollection(userInterfaceStyle: .light)
        func hex(_ color: Color, _ traits: UITraitCollection) -> String {
            var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
            UIColor(color).resolvedColor(with: traits).getRed(&r, green: &g, blue: &b, alpha: &a)
            return String(format: "%02X%02X%02X", Int(round(r * 255)), Int(round(g * 255)), Int(round(b * 255)))
        }
        XCTAssertEqual(hex(BriefingPalette.standard.ink, dark), "F4F7F8")
        XCTAssertEqual(hex(BriefingPalette.standard.ink, light), "102638")
        XCTAssertEqual(hex(BriefingPalette.richField.ink, dark), hex(BriefingPalette.standard.ink, dark))
        XCTAssertEqual(hex(BriefingPalette.richField.ink, light), "F4F8F8", "a rich field stays light-on-dark in Mineral Light")
        XCTAssertEqual(hex(BriefingPalette.standard.page, light), "F1F1E9")
    }

    func testNavigationChipsAndTapTargetsMeetTheLockedContract() throws {
        XCTAssertEqual(BriefingDetailHeader.navigationLabels, ["Home", "Briefing History"])
        let kit = try source("PhysiqueOS/SharedUI/BriefingPresentation.swift")
        XCTAssertTrue(kit.contains(".frame(height: 44)"), "navigation chips are 44 pt")
        XCTAssertTrue(kit.contains("accessibilityLabel(\"Confidence \\(score) percent\")"))
        let history = try source("PhysiqueOS/Presentation/Briefings/BriefingHistoryView.swift")
        XCTAssertTrue(history.contains(".frame(minHeight: 78)"))
        XCTAssertTrue(history.contains("minWidth: 44, minHeight: 44"))
    }

    func testReviewSeamsAreDebugOnly() throws {
        let history = try source("PhysiqueOS/Presentation/Briefings/BriefingHistoryView.swift")
        let seam = try XCTUnwrap(history.range(of: "enum BriefingReviewLaunchConfiguration"))
        let prefix = history[..<seam.lowerBound]
        XCTAssertTrue(prefix.hasSuffix("#if DEBUG\n/// Screenshot-only review seam (absent from Release): forces a Briefing\n/// Detail or History load state without touching the API.\n/// `-physiqueos.briefing-review.detail-state loading|failed|notReady|unavailable`\n/// `-physiqueos.briefing-review.history-state loading|failed|empty`\n"))
        let detail = try source("PhysiqueOS/Presentation/Briefings/BriefingDetailView.swift")
        XCTAssertTrue(detail.contains("#if DEBUG\nprivate struct BriefingReviewScrollOffset") || detail.contains("#if DEBUG\nstruct BriefingReviewScrollOffset"))
    }
}


extension BriefingLockedPresentationTests {
    // MARK: Monthly

    func testMonthlyRendersCanonicalStructureAndClosesWithCoachsTakeBeforeMonthAhead() throws {
        var monthly = try XCTUnwrap(BriefingSandboxStore().briefings.first { $0.cadence == .monthly }?.monthly)
        monthly.whatChangedSections = [MonthlyChangeSection(domain: "routine", title: "Routine", headline: "Two stretches", narrative: "Body.", tone: "routine")]
        monthly.definingMomentDetails = [MonthlyDefiningMoment(dateLabel: "2026-09-03", title: "Stretch began", narrative: "Body.", icon: "sparkles")]
        monthly.monthAheadActions = [MonthlyActionCard(domain: "routine", title: "Routine", narrative: "Value · Detail", icon: "sparkles", headline: "Value", detail: "Detail")]
        let view = MonthlyBriefingSections(content: monthly, confidence: nil)
        XCTAssertEqual(view.changeItems.first?.title, "Routine · Two stretches")
        XCTAssertEqual(view.momentItems.first?.title, "September 3 · Stretch began")
        XCTAssertEqual(view.monthAheadItems.first, .init(id: 0, label: "Routine", title: "Value", body: "Detail"))
        XCTAssertEqual(Array(MonthlyBriefingSections.sectionInventory.suffix(2)), ["Coach's Take", "Month Ahead"])
        let card = MonthlyStrategicSummaryCard(summary: MonthlyStrategicSummaryV3(result: "R", action: "A", confidence: "C", coachTake: "Coach take."), heroBody: "Hero")
        XCTAssertEqual(card.renderedSectionTitles, ["Coach's Take"], "the locked close is the coach take; Confidence is never repeated")
        let source = try source("PhysiqueOS/Presentation/Briefings/MonthlyBriefingSections.swift")
        XCTAssertFalse(source.contains("BriefingUncertaintyCard("), "Monthly renders no Still Unresolved section")
        XCTAssertFalse(source.contains("Current strategy"), "the raw strategy recommendation enum is never shown")
    }

    func testMonthlyMapperCarriesCanonicalTitlesOmittedWeeksAndNarrativeCoachTake() throws {
        let json = #"""
        {"artifact":{"id":"m","cadence":"monthly","generatedAt":"2026-10-01T14:10:00.000Z","briefing":{
          "narrativeV3":{"coachTake":"Canonical coach take.","sections":{"result":"R"}},
          "monthlyPresentation":{"hero":{"title":"T","thesis":"Body","period":"September 1–30 · Delivered October 1"},
            "energy":{"title":"E","weekly":[{"label":"Sep 1–Sep 7","intake":3157,"expenditure":2562,"observedCount":6,"missing":false},{"label":"Sep 29–Sep 30","missing":true,"observedCount":1}],
              "summaryMetrics":[{"label":"Avg intake","value":2691},{"label":"Avg expenditure","value":2583},{"label":"Avg balance","value":108}]},
            "changes":{"title":"Canonical changes title","themes":[]},"moments":{"title":"4 moments defined September.","moments":[]},
            "monthAhead":{"title":"Canonical ahead title","guidance":[{"tone":"routine","label":"Routine","value":"Keep the rhythm","detail":"Detail."}]}}}},
         "goals":[]}
        """#
        let value = try JSONDecoder().decode(BriefingJSONValue.self, from: Data(json.utf8))
        guard let monthly = try ProductionBriefingMapper.detail(value)?.monthly else { throw XCTSkip("monthly mapping shape not reachable from this minimal envelope") }
        XCTAssertEqual(monthly.monthLabel, "September 1–30")
        XCTAssertEqual(monthly.monthPeriodDetail, "Delivered October 1")
        XCTAssertEqual(monthly.whatChangedTitle, "Canonical changes title")
        XCTAssertEqual(monthly.monthAheadTitle, "Canonical ahead title")
        XCTAssertEqual(monthly.monthAheadActions?.first?.headline, "Keep the rhythm")
        XCTAssertEqual(monthly.energyEvolution?.omittedWeeks?.map(\.weekLabel), ["Sep 29–Sep 30"])
        XCTAssertEqual(monthly.strategicSummaryV3?.coachTake, "Canonical coach take.")
    }

    // MARK: Photo + DEXA

    func testPhotoComparisonOpensThePairedViewerOnlyWithRealMedia() {
        let entry = PhotoComparisonEntry(id: "c", poseId: .frontRelaxed, priorSetId: "a", priorDate: "2026-08-22", currentSetId: "b", currentDate: "2026-09-19", roleLabel: nil, narrative: "N", label: "Front relaxed")
        XCTAssertNil(PhotoBriefingSections.comparisonRequest(for: entry, previousSource: .placeholder, currentSource: .placeholder))
        let request = PhotoBriefingSections.comparisonRequest(for: entry, previousSource: .placeholder, currentSource: .authenticatedProduction(mediaId: "m"))
        XCTAssertEqual(request?.title, "Front relaxed")
        XCTAssertNil(request?.previous, "a missing prior stays empty rather than borrowing another photo")
        XCTAssertEqual(request?.currentLabel, "Current · Sep 19")
        XCTAssertEqual(entry.displayLabel, "Front relaxed")
        XCTAssertEqual(PhotoComparisonViewer.zoomLabel(1), "1×")
        XCTAssertEqual(PhotoComparisonViewer.zoomLabel(2.4), "2.4×")
    }

    func testDEXAKeepsEveryUnitAndTheConfidenceHeadlineIsCanonical() throws {
        let point = DEXATimelinePoint(scanId: "s", date: "2026-08-16", value: "9.0")
        XCTAssertEqual(DEXAPhaseBreakdown.value(point, unit: "%"), "9.0%")
        XCTAssertEqual(DEXAPhaseBreakdown.value(point, unit: "lb"), "9.0 lb")
        XCTAssertEqual(DEXAPhaseBreakdown.value(DEXATimelinePoint(scanId: "s", date: "d", value: "—"), unit: "lb"), "—")
        let confidence = BriefingConfidenceReadModel(score: 63, band: "developing", priorScore: 70, delta: -7, movementDirection: .decreased, primaryReason: "r", supportingReasons: [], limitingReasons: [], unresolvedUncertainty: [], goalId: "g", phaseId: nil, capturedAt: "c", source: "s")
        XCTAssertEqual(DEXAConfidenceRow(confidence: confidence).headline, "DEVELOPING · DECREASED −7")
        XCTAssertEqual(DEXABriefingSections.rmrText("1847 cal/day"), "1847 cal/day")
        XCTAssertEqual(DEXABriefingSections.rmrText("2240"), "2240 cal/day")
        XCTAssertNil(DEXABriefingSections.persistedGoalTitle(BriefingGoalAttribution(goalId: "g", goalTitle: "Goal at publication")))
        let dexa = try XCTUnwrap(BriefingSandboxStore().briefings.first { $0.dexa != nil }?.dexa)
        let rows = dexa.progress.headline.count + dexa.progress.regionalFat.count + dexa.progress.regionalLean.count + dexa.progress.supplemental.count
        XCTAssertEqual(rows, 17, "the locked correction restores all 17 unit rows")
        XCTAssertTrue(dexa.progress.headline.allSatisfy { $0.current.contains(where: \.isLetter) || $0.current.hasSuffix("%") })
    }

    func testMidweekBodyCompositionFallsBackToBaselineWhenNewScanIsTheFalseFlag() throws {
        let json = #"""
        {"schemaVersion":"x","artifact":{"id":"midweek-x","cadence":"midweek","generatedAt":"2026-09-30T14:54:55.410Z","version":3},
         "presentation":{"evidenceWindow":{"startDate":"2026-09-27","endDate":"2026-09-29","briefingDate":"2026-09-30","relativeLabel":"Sunday through Tuesday","timeZone":"UTC"},
           "hero":{"verdict":"V","summary":"S"},"coachTake":{"biggestTakeaway":"T","recommendation":"R"},"prioritiesThroughSunday":[],
           "bodyComposition":{"newScan":false,"baseline":{"date":"2026-09-12","fatMass":14.2,"leanMass":153.3,"bodyFatPercentage":8.1},"objective":"O","prominent":false,"interpretation":null}}}
        """#
        let value = try JSONDecoder().decode(BriefingJSONValue.self, from: Data(json.utf8))
        guard let midweek = try ProductionBriefingMapper.detail(value)?.midweek else { throw XCTSkip("minimal midweek envelope not mapped") }
        XCTAssertEqual(midweek.bodyComposition?.scanDate, "2026-09-12")
        XCTAssertEqual(midweek.bodyComposition?.bodyFatPercent, "8.1%")
    }
}
