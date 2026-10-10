import XCTest
import SwiftUI
@testable import PhysiqueOS

/// Regression coverage for the Home read-model contract introduced in this
/// slice. These tests protect the boundary the Native V1 design depends on:
/// native must decode and display server-owned values, never derive them.
final class HomeReadModelTests: XCTestCase {

    func testPriorityGridPacksOneThroughFiveItemsAndSpansEveryOddTail() {
        XCTAssertEqual(TodaysFocusGridLayout.rows(itemCount: 1).map(Array.init), [[0]])
        XCTAssertEqual(TodaysFocusGridLayout.rows(itemCount: 2).map(Array.init), [[0, 1]])
        XCTAssertEqual(TodaysFocusGridLayout.rows(itemCount: 3).map(Array.init), [[0, 1], [2]])
        XCTAssertEqual(TodaysFocusGridLayout.rows(itemCount: 4).map(Array.init), [[0, 1], [2, 3]])
        XCTAssertEqual(TodaysFocusGridLayout.rows(itemCount: 5).map(Array.init), [[0, 1], [2, 3], [4]])
        XCTAssertTrue(TodaysFocusGridLayout.rows(itemCount: 0).isEmpty)
    }

    func testPriorityGridUsesExpandedRowsForAccessibilityDynamicType() {
        XCTAssertFalse(TodaysFocusGridLayout.usesSingleColumn(
            itemCount: 3, containsExpandedContent: false, dynamicTypeSize: .large
        ))
        XCTAssertTrue(TodaysFocusGridLayout.usesSingleColumn(
            itemCount: 3, containsExpandedContent: false, dynamicTypeSize: .accessibility1
        ))
        XCTAssertTrue(TodaysFocusGridLayout.usesSingleColumn(
            itemCount: 2, containsExpandedContent: true, dynamicTypeSize: .large
        ))
        XCTAssertTrue(TodaysFocusGridLayout.usesSingleColumn(
            itemCount: 1, containsExpandedContent: false, dynamicTypeSize: .large
        ))
    }

    func testPriorityGridKeepsShortPairsAndPromotesOnlyContentHeavyRows() {
        var shortA = Self.executionContextItem(title: "Foam Roll", time: "17:00", dose: nil)
        var long = Self.executionContextItem(
            title: "Upload the scheduled DEXA results",
            time: nil,
            dose: nil
        )
        long.actionLabel = "Upload DEXA Results"
        var shortB = Self.executionContextItem(title: "Fadogia", time: "20:00", dose: nil)
        var shortC = Self.executionContextItem(title: "Tesamorelin", time: "22:00", dose: nil)
        var tail = Self.executionContextItem(title: "Morning Check-In", time: "06:00", dose: nil)
        shortA.id = "a"; long.id = "long"; shortB.id = "b"; shortC.id = "c"; tail.id = "tail"

        let rows = TodaysFocusGridLayout.rows(
            items: [shortA, long, shortB, shortC, tail],
            dynamicTypeSize: .large
        )

        XCTAssertEqual(rows.map(\.indices), [[0], [1], [2, 3], [4]])
        XCTAssertTrue(TodaysFocusGridLayout.requiresFullWidth(long))
        XCTAssertFalse(TodaysFocusGridLayout.requiresFullWidth(shortB))
    }

    func testPriorityGridUsesFullWidthForEveryAccessibilityRow() {
        let items = [
            Self.executionContextItem(title: "One", time: "08:00", dose: nil),
            Self.executionContextItem(title: "Two", time: "09:00", dose: nil),
            Self.executionContextItem(title: "Three", time: "10:00", dose: nil),
        ]
        XCTAssertEqual(
            TodaysFocusGridLayout.rows(items: items, dynamicTypeSize: .accessibility1).map(\.indices),
            [[0], [1], [2]]
        )
    }

    func testMorningRemovesOnlyInlineCompleteWhileKeepingNavigationAndProjectedSkip() {
        var morning = Self.executionContextItem(title: "Morning Weigh-In", time: "05:30", dose: nil)
        morning.id = "reminder_morning_weight"
        morning.routePriorityId = "reminder_morning_weight"
        morning.executionItemId = "execution_morning_weigh_in"
        morning.continueActionDestination = .checkIn(checkInType: "morning")
        morning.notificationAction?.workflow = "morning_check_in"
        morning.notificationAction?.skipCommand = .init(
            commandType: ProductionCommandType.skipPriority,
            expectedVersion: 7,
            payload: .init(priorityId: "reminder_morning_weight", occurrenceDate: morning.date)
        )

        XCTAssertTrue(morning.isMorningWeighIn)
        XCTAssertFalse(morning.allowsHomeInlineCompletion, "Morning completion belongs only to Morning Weigh-In submit.")
        XCTAssertEqual(morning.destination, .checkIn(checkInType: "morning"))
        XCTAssertNotNil(morning.canonicalSkipCommand, "The separate canonical Skip capability remains intact.")
    }

    func testDexaAppointmentRejectsCompleteAndSkipCapabilitiesFromOlderPayloads() {
        var dexa = Self.executionContextItem(title: "DEXA tomorrow", time: "07:30", dose: nil)
        dexa.id = "dexa-appointment:2026-10-09:day-before"
        dexa.routePriorityId = dexa.id
        dexa.executionItemId = "execution_next_dexa"
        dexa.notificationAction?.workflow = "dexa_appointment"
        dexa.notificationAction?.skipCommand = .init(
            commandType: ProductionCommandType.skipPriority,
            expectedVersion: 4,
            payload: .init(priorityId: dexa.id, occurrenceDate: dexa.date)
        )

        XCTAssertTrue(dexa.isDexaAppointmentReminder)
        XCTAssertFalse(dexa.allowsHomeInlineCompletion)
        XCTAssertNil(dexa.canonicalSkipCommand, "An old Server command cannot turn a reminder into a mutation.")
        XCTAssertEqual(PriorityOccurrenceCapabilities.resolve(dexa.notificationAction), .openOnly)
    }

    func testHomePriorityAcknowledgementHasStableTerminalIdentityAndCopy() {
        let completed = HomePriorityAcknowledgement(occurrenceID: "priority-1", kind: .completed)
        let skipped = HomePriorityAcknowledgement(occurrenceID: "priority-1", kind: .skipped)
        XCTAssertEqual(completed.id, "priority-1|completed")
        XCTAssertEqual(completed.kind.title, "Completed")
        XCTAssertEqual(skipped.id, "priority-1|skipped")
        XCTAssertEqual(skipped.kind.title, "Skipped")
        XCTAssertNotEqual(completed, skipped)
    }

    func testHomeSkipIsDirectAndKeepsIndependentAccessibleHitRegion() throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        let home = root.appendingPathComponent("PhysiqueOS/Presentation/Home")
        let focus = try String(contentsOf: home.appendingPathComponent("FocusTileView.swift"), encoding: .utf8)
        let grouped = try String(contentsOf: home.appendingPathComponent("TodaysFocusCardView.swift"), encoding: .utf8)
        let screen = try String(contentsOf: home.appendingPathComponent("HomeView.swift"), encoding: .utf8)

        XCTAssertFalse(focus.contains("Menu {"), "A top-level Home priority must not hide Skip in a menu.")
        XCTAssertFalse(grouped.contains("Menu {"), "A grouped child priority must not hide Skip in a menu.")
        XCTAssertFalse(screen.contains("skipCandidate"), "Home must submit an eligible projected Skip directly.")
        XCTAssertFalse(screen.contains(".confirmationDialog("), "Home Skip must not add a second confirmation tap.")
        XCTAssertTrue(focus.contains("minWidth: 44"))
        XCTAssertTrue(focus.contains("accessibilityLabel(\"Skip \\(title)\")"))
        XCTAssertTrue(grouped.contains("HomePrioritySkipButton("))
    }

    func testHomeSkipComesOnlyFromExactProjectedCommand() {
        var actionable = Self.executionContextItem(title: "Fadogia", time: "08:00", dose: nil)
        actionable.routePriorityId = "reminder_fadogia"
        actionable.notificationAction?.skipCommand = .init(
            commandType: ProductionCommandType.skipPriority,
            expectedVersion: 8,
            payload: .init(priorityId: "reminder_fadogia", occurrenceDate: actionable.date)
        )
        XCTAssertEqual(actionable.canonicalSkipCommand?.payload.priorityId, "reminder_fadogia")
        XCTAssertEqual(actionable.canonicalSkipCommand?.expectedVersion, 8)

        var informational = actionable
        informational.id = "protein-fallback"
        informational.routePriorityId = "protein-fallback"
        informational.notificationAction = nil
        informational.projectedSkipCommand = nil
        XCTAssertNil(informational.canonicalSkipCommand, "Informational Home fallbacks never infer Skip.")

        var mismatched = actionable
        mismatched.notificationAction?.skipCommand?.payload.occurrenceDate = "2026-09-17"
        XCTAssertNil(mismatched.canonicalSkipCommand, "A command for another occurrence is refused.")
    }

    func testGroupedHomeSessionKeepsChildSkipAndHasNoAggregateSkip() {
        let child = PrioritySessionItem(
            id: "reminder_progress_photos", label: "Progress Photos", completed: false,
            satisfiedByEvidence: false,
            skipCommand: .init(
                commandType: ProductionCommandType.skipPriority, expectedVersion: 4,
                payload: .init(priorityId: "reminder_progress_photos", occurrenceDate: "2026-09-16")
            )
        )
        XCTAssertEqual(child.canonicalSkipCommand?.payload.priorityId, "reminder_progress_photos")
        var malformedChild = child
        malformedChild.skipCommand?.commandType = ProductionCommandType.completePriority
        XCTAssertNil(malformedChild.canonicalSkipCommand, "A grouped child also fails closed on a non-Skip command.")
        var group = Self.executionContextItem(title: "Morning Check-in", time: "08:00", dose: nil)
        group.sessionItems = [child]
        group.notificationAction?.skipCommand = nil
        XCTAssertNil(group.canonicalSkipCommand, "Presentation groups never invent aggregate Skip.")
    }

    private static func context(title: String, time: String, dose: String? = nil) -> String {
        PriorityExecutionContextPresentation.context(
            for: executionContextItem(title: title, time: time, dose: dose)
        ) ?? ""
    }

    private static func executionContextItem(title: String, time: String?, dose: String?) -> PriorityOccurrence {
        PriorityOccurrence(
            id: "priority-\(title)", executionItemId: "execution-\(title)", date: "2026-09-16",
            title: title, subtitle: "Tonight", metadata: nil, changeLabel: nil,
            icon: .target, color: .primary, urgency: .available, completed: false,
            completable: true, expectedVersion: 1, actionLabel: nil,
            completionContext: nil,
            notificationAction: PriorityNotificationAction(
                classification: .specializedWorkflowRequired,
                workflow: dose == nil ? "priority_detail" : "peptide_protocol",
                scheduledTime: time,
                completionCommand: dose.map { value in
                    PriorityNotificationCompletionCommand(
                        commandType: "priority.complete.v1", expectedVersion: 1,
                        payload: PriorityNotificationCompletionPayload(
                            priorityId: "priority", occurrenceDate: "2026-09-16", dose: value,
                            protocolId: "protocol"
                        )
                    )
                }
            )
        )
    }

    func testWebParityTokensKeepPhaseAndGuardrailGeometrySymmetrical() {
        XCTAssertEqual(HomeGoalWebParityTokens.cardHorizontalPadding, 16)
        XCTAssertEqual(HomeGoalWebParityTokens.cardVerticalPadding, 15)
        XCTAssertEqual(HomeGoalWebParityTokens.phaseIconSize, HomeGoalWebParityTokens.guardrailIconSize)
        XCTAssertEqual(HomeGoalWebParityTokens.cardCornerRadius, 16)
        XCTAssertGreaterThanOrEqual(HomeGoalWebParityTokens.phaseToPhaseSpacing, 12)
        XCTAssertGreaterThanOrEqual(HomeGoalWebParityTokens.guardrailTopSpacing, HomeGoalWebParityTokens.phaseToPhaseSpacing)
    }

    // MARK: - Fixture decoding integrity

    func testBundledFixtureDecodesWithoutError() throws {
        let model = try Self.loadBundledFixture()
        XCTAssertFalse(model.header.name.isEmpty)
        XCTAssertFalse(model.goals.isEmpty)
        XCTAssertNotNil(model.hero.confidence)
    }

    func testFixtureExercisesBothGoalPresentationModes() throws {
        let model = try Self.loadBundledFixture()
        let hasPrimary = model.goals.contains { if case .primary = $0.presentation { return true } else { return false } }
        let hasSupporting = model.goals.contains { if case .supporting = $0.presentation { return true } else { return false } }
        XCTAssertTrue(hasPrimary, "Fixture should exercise the primary-goal presentation.")
        XCTAssertTrue(hasSupporting, "Fixture should exercise the supporting-objective presentation.")
    }

    func testRedesignReviewFixturePreservesLockedHomeInformationContract() throws {
        let url = try XCTUnwrap(Bundle.main.url(forResource: "HomeRedesignReviewFixture", withExtension: "json"))
        let model = try JSONDecoder().decode(HomeReadModel.self, from: Data(contentsOf: url))
        XCTAssertEqual(model.hero.confidence, 79)
        XCTAssertEqual(model.hero.primaryTimeline, "4 weeks to goal target")
        XCTAssertEqual(model.briefingCards.count, 2)
        XCTAssertEqual(model.briefingCards.map(\.id), [
            "dexa_event_dexa-fixture-005",
            "midweek_briefing_2026-09-06_2026-09-08",
        ])
        XCTAssertEqual(model.briefingCards.map(\.sectionLabel), ["Event Briefing", "Midweek Briefing"])
        XCTAssertEqual(
            model.briefingCards.map(\.destination),
            [
                .briefingDetail(briefingId: "dexa_event_dexa-fixture-005"),
                .briefingDetail(briefingId: "midweek_briefing_2026-09-06_2026-09-08"),
            ]
        )
        XCTAssertEqual(model.todaysFocus.count, 3)
        guard case .phaseTrajectory(let trajectory) = try XCTUnwrap(model.goals.first).presentation else {
            return XCTFail("The locked Home review state must exercise the two-phase trajectory.")
        }
        XCTAssertEqual(trajectory.phases.map(\.status), ["completed", "active"])
        XCTAssertNotNil(trajectory.guardrail)
        XCTAssertEqual(
            HomeJourneyTimingPresentation.remainingPeriod(hero: model.hero, trajectory: trajectory),
            "4 weeks"
        )
        let activePhase = try XCTUnwrap(trajectory.phases.first(where: { $0.status == "active" }))
        XCTAssertEqual(
            HomeJourneyTimingPresentation.phaseDetail(for: activePhase, remainingPeriod: "4 weeks"),
            "Aug 15 – Oct 31 · about 4 weeks remaining"
        )
    }

    func testSecondaryBriefingEditorialRailKeepsApprovedGeometryAndAccessibleReadingOrder() throws {
        XCTAssertEqual(HomeSecondaryBriefingLayout.cornerRadius, 18)
        XCTAssertEqual(HomeSecondaryBriefingLayout.railWidth, 5)
        XCTAssertEqual(HomeSecondaryBriefingLayout.arrowHitWidth, 44)
        XCTAssertGreaterThanOrEqual(HomeSecondaryBriefingLayout.minimumHeight, 118)

        let now = try XCTUnwrap(ISO8601DateFormatter.homeFixture.date(from: "2026-10-09T18:00:00.000Z"))
        let card = HomeBriefingCard(
            id: "midweek",
            sectionLabel: "Midweek Briefing",
            title: "Midweek Briefing Ready",
            prompt: "Review the week so far.",
            createdAt: "2026-10-07T14:00:00.000Z",
            destination: .briefingDetail(briefingId: "midweek")
        )
        XCTAssertEqual(
            BriefingCardView.accessibilityLabel(for: card, now: now),
            "Midweek Briefing, Midweek Briefing Ready, Review the week so far., Oct 7"
        )
    }

    func testPhaseFriendlyTimelineRestoresRemainingWhenLegacyHeroValueIsAbsent() {
        let hero = HomeHero(
            mode: .phaseTrajectory,
            goalLabel: "Build Lean Mass",
            headline: "Lean Mass Build",
            supportLine: "Execution is aligned with the current plan.",
            confidence: 79,
            confidenceDetail: nil,
            primaryTimeline: "4 weeks to goal target",
            projectedFinish: nil,
            daysRemaining: nil
        )
        let active = HomeGoalPhase(
            id: "phase-lean-mass",
            order: 1,
            phaseName: "Lean Mass Build",
            status: "active",
            presentationTone: "green",
            progressType: "outcome",
            clampedProgressPercentage: 58,
            presentationLabel: "+5.8 of 10 lb",
            progressStatus: "measured",
            startDate: "2026-08-15",
            calculatedPlannedReviewDate: "2026-10-31",
            timelineProgressState: "active",
            friendlyTimeline: "about 4 weeks to goal target remaining"
        )
        let trajectory = HomePhaseTrajectory(
            targetDescription: "+10 lb lean",
            overallTargetDate: "2026-10-31",
            guardrail: nil,
            phases: [active]
        )

        let remaining = HomeJourneyTimingPresentation.remainingPeriod(hero: hero, trajectory: trajectory)
        XCTAssertEqual(hero.primaryTimeline, "4 weeks to goal target", "The green status line keeps the Founder-approved canonical copy.")
        XCTAssertEqual(remaining, "4 weeks")
        XCTAssertNotEqual(remaining, "—")
        XCTAssertEqual(
            HomeJourneyTimingPresentation.phaseDetail(for: active, remainingPeriod: remaining),
            "Aug 15 – Oct 31 · about 4 weeks remaining"
        )
        XCTAssertEqual(trajectory.overallTargetDate, "2026-10-31")
        XCTAssertEqual(active.clampedProgressPercentage, 58)
    }

    func testBriefingTileUsesFreedEyebrowSpaceForRealCadenceTitles() {
        XCTAssertFalse(HomeBriefingTileLayout.showsSectionEyebrow)
        XCTAssertEqual(HomeBriefingTileLayout.titleLineLimit, 3)
        for title in ["Weekly Briefing Ready", "Midweek Briefing Ready"] {
            XCTAssertLessThanOrEqual(
                title.split(separator: " ").count,
                HomeBriefingTileLayout.titleLineLimit,
                "Each canonical word can occupy a full line in the narrow locked tile without truncation."
            )
        }
    }

    // MARK: - Confidence is supplied, never recomputed

    /// Decodes two fixtures that differ only in their confidence value and
    /// asserts the decoded model reflects each value exactly. `HomeReadModel`
    /// decoding is a pure structural mapping with no arithmetic over
    /// `confidence` anywhere in its `init(from:)` path — this test would
    /// catch a future change that started deriving or clamping the value
    /// during decode instead of passing it through untouched.
    func testConfidenceValueIsPassedThroughVerbatim() throws {
        for expected in [0, 42, 100] {
            let json = Self.confidenceOnlyFixture(confidence: expected)
            let model = try JSONDecoder().decode(HomeReadModel.self, from: json)
            XCTAssertEqual(model.hero.confidence, expected)
        }
    }

    func testMissingConfidenceDecodesToNilNotZero() throws {
        let json = Self.confidenceOnlyFixture(confidence: nil)
        let model = try JSONDecoder().decode(HomeReadModel.self, from: json)
        XCTAssertNil(model.hero.confidence, "Absent confidence must stay absent, never default to 0 or another computed value.")
    }

    // MARK: - Section visibility follows fixture state

    func testEmptyBriefingCardsHidesTheSection() throws {
        var model = try Self.loadBundledFixture()
        model.briefingCards = []
        XCTAssertFalse(model.hasBriefingCards)
    }

    func testNonEmptyBriefingCardsShowsTheSection() throws {
        let model = try Self.loadBundledFixture()
        XCTAssertTrue(model.hasBriefingCards)
    }

    func testEmptyTodaysFocusHidesTheSection() throws {
        var model = try Self.loadBundledFixture()
        model.todaysFocus = []
        XCTAssertFalse(model.hasTodaysFocus)
    }

    func testCanonicalSupplementIconDecodesAsPillsWithoutChangingPeptideOrRecoverySemantics() throws {
        XCTAssertEqual(HomeFocusIconPresentation.systemImage(for: .pills), "pills.fill")
        XCTAssertEqual(HomeFocusIconPresentation.systemImage(for: .syringe), "syringe.fill")
        XCTAssertEqual(
            HomeFocusIconPresentation.systemImage(for: .activity),
            "figure.strengthtraining.traditional"
        )

        let decoded = try JSONDecoder().decode(
            HomeFocusIcon.self,
            from: Data(#""pills""#.utf8)
        )
        XCTAssertEqual(decoded, .pills)
    }

    func testFutureServerIconsDegradeNeutrallyWithoutDroppingHomeOrPriority() throws {
        let json = Data(#"""
        {
          "header":{"greeting":"Good morning","name":"Founder"},
          "hero":{"mode":"active","goalLabel":"Goal","headline":"On track","supportLine":"Continue","confidence":null,"confidenceDetail":null,"projectedFinish":null,"daysRemaining":null,"actionLabel":null,"actionDestination":null},
          "nextBestAction":{"title":"Future action","icon":"future_domain_icon","destination":{"id":"briefing.list","parameters":{}}},
          "briefingCards":[],
          "goals":[{"id":"goal","title":"Goal","current":"1","target":"2","unit":"lb","icon":"future_goal_icon","color":"future_color","presentationMode":"primary","progress":50,"destination":null}],
          "todaysFocus":[
            {"id":"future-priority","executionItemId":"execution-future","date":"2026-09-18","title":"Future priority","subtitle":null,"metadata":null,"changeLabel":null,"icon":"future_focus_icon","color":"future_color","urgency":"available","completed":false,"completable":false,"expectedVersion":null,"actionLabel":null,"completionContext":null},
            {"id":"known-priority","executionItemId":"execution-known","date":"2026-09-18","title":"Known priority","subtitle":null,"metadata":null,"changeLabel":null,"icon":"pills","color":"effort","urgency":"available","completed":false,"completable":false,"expectedVersion":null,"actionLabel":null,"completionContext":null}
          ]
        }
        """#.utf8)
        let model = try JSONDecoder().decode(HomeReadModel.self, from: json)
        XCTAssertEqual(model.nextBestAction.icon, .unknown)
        XCTAssertEqual(model.goals.first?.icon, .unknown)
        XCTAssertEqual(model.goals.first?.color, .muted)
        XCTAssertEqual(model.todaysFocus.map(\.icon), [.unknown, .pills])
        XCTAssertEqual(HomeFocusIconPresentation.systemImage(for: model.todaysFocus[0].icon), "circle.dashed")
        XCTAssertEqual(model.todaysFocus.map(\.title), ["Future priority", "Known priority"])
    }

    // MARK: - Typed, bounded route intent

    func testDestinationRoundTripsThroughTheServerWireShape() throws {
        let destinations: [AppDestination] = [
            .goalDetail(goalId: "goal_fixture_lean_definition"),
            .checkIn(checkInType: "morning"),
            .photoUpload,
            .dexaUpload,
            .briefingDetail(briefingId: "briefing-daily-fixture-001"),
            .briefingList,
            .priorityDetail(priorityId: "priority-fixture-001"),
        ]
        for destination in destinations {
            let data = try JSONEncoder().encode(destination)
            let decoded = try JSONDecoder().decode(AppDestination.self, from: data)
            XCTAssertEqual(decoded, destination)
        }
    }

    func testDestinationWireShapeMatchesServerIdFormat() throws {
        // Guards against a native-only id format drifting from the server's
        // actual DestinationId strings (src/contracts/v1/destination.js).
        let data = try JSONEncoder().encode(AppDestination.goalDetail(goalId: "abc"))
        let object = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        XCTAssertEqual(object?["id"] as? String, "goal.detail")
        let parameters = object?["parameters"] as? [String: Any]
        XCTAssertEqual(parameters?["goalId"] as? String, "abc")
    }

    func testUnknownDestinationIdFailsClosedRatherThanGuessing() {
        let json = Data(#"{"id": "some.unrecognized.destination", "parameters": {}}"#.utf8)
        XCTAssertThrowsError(try JSONDecoder().decode(AppDestination.self, from: json))
    }

    func testEveryHomeInteractionCarriesAResolvableDestination() throws {
        let model = try Self.loadBundledFixture()
        XCTAssertNotNil(model.nextBestAction.destination)
        for card in model.briefingCards where card.destination != nil {
            XCTAssertEqual(card.destination?.serverDestinationId, "briefing.detail")
        }
        for goal in model.goals where goal.destination != nil {
            XCTAssertEqual(goal.destination?.serverDestinationId, "goal.detail")
        }
    }

    /// The literal reported bug: "Home → Your Goals looks tappable but goes
    /// nowhere." Every row `GoalRowView` renders — primary and every
    /// supporting/guardrail objective — must carry a real destination, not
    /// a `nil` that leaves the row hover-styled but inert (verified against
    /// source for this task: the real web's `GoalRow` applies its hover/
    /// focus styling unconditionally, so a missing `href` there is exactly
    /// this "looks tappable but isn't" bug class, not merely a cosmetic
    /// difference).
    func testEveryHomeGoalRowHasARealDestinationNotNil() throws {
        let model = try Self.loadBundledFixture()
        for goal in model.goals {
            XCTAssertNotNil(goal.destination, "\(goal.title) must have a real destination.")
        }
    }

    /// Each Home goal's destination must resolve to an *existing* Goal
    /// page — not merely be non-`nil` syntactically. Uses canonical Goal
    /// identity end-to-end through `GoalsAPI`, the same seam
    /// `GoalDetailView` itself calls, so this fails if a Home goal ever
    /// points at an id nothing in the Goals vertical actually resolves.
    func testEveryHomeGoalDestinationResolvesThroughTheRealGoalsAPI() async throws {
        let model = try Self.loadBundledFixture()
        let api = FixtureGoalsAPI()
        for goal in model.goals {
            guard case .goalDetail(let goalId) = goal.destination else {
                return XCTFail("\(goal.title) destination is not a goalDetail case.")
            }
            let detail = try await api.fetchGoalDetail(goalId: goalId)
            XCTAssertNotNil(detail, "\(goal.title) (\(goalId)) does not resolve to a real Goal.")
            XCTAssertNotNil(detail?.id)
        }
    }

    /// Do not duplicate Goal detail inside Home: a supporting/guardrail
    /// objective must resolve to the *lightweight* supporting-objective
    /// shape, not accidentally collide with the primary Goal's own rich
    /// `active` detail (which would mean Home and the Goals vertical are
    /// describing two different things under the same id, or that a
    /// supporting row is silently rendering the full multi-phase page).
    func testSupportingGoalRowsResolveToTheLightweightSupportingShapeNotActiveOrCompleted() async throws {
        let model = try Self.loadBundledFixture()
        let api = FixtureGoalsAPI()
        let supportingRows = model.goals.filter { if case .supporting = $0.presentation { true } else { false } }
        XCTAssertFalse(supportingRows.isEmpty)
        for goal in supportingRows {
            guard case .goalDetail(let goalId) = goal.destination else { continue }
            let detail = try await api.fetchGoalDetail(goalId: goalId)
            XCTAssertNotNil(detail?.supporting, "\(goal.title) should resolve to a supporting objective.")
            XCTAssertNil(detail?.active)
            XCTAssertNil(detail?.completed)
        }
    }

    func testHomeProjectsEverySupportingObjectiveToTheOwningActiveGoal() async throws {
        let home = try Self.loadBundledFixture()
        let hub = try await FixtureGoalsAPI().fetchGoalsHub()
        let activeGoal = hub.activeGoal!
        let projected = HomeViewModel.projectGoals(home.goals, from: activeGoal)
        let supporting = projected.filter { if case .supporting = $0.presentation { true } else { false } }

        XCTAssertFalse(supporting.isEmpty)
        XCTAssertTrue(supporting.allSatisfy { $0.destination == activeGoal.destination })
        XCTAssertTrue(projected.allSatisfy { $0.destination == activeGoal.destination })
    }

    func testCompletedHomePrioritiesAreRemovedFromTheVisibleProjection() throws {
        let completed = PriorityOccurrence(
            id: "priority-completed",
            executionItemId: "execution_foam_roll",
            date: "2026-08-30",
            title: "Foam roll",
            subtitle: nil,
            metadata: nil,
            changeLabel: nil,
            icon: .activity,
            color: .primary,
            urgency: .available,
            completed: true,
            completable: true,
            actionLabel: nil,
            completionContext: nil,
            continueActionDestination: nil
        )
        var pending = completed
        pending.id = "priority-pending"
        pending.completed = false
        let priorities = [completed, pending]

        let visible = HomeViewModel.visiblePriorities(priorities)

        XCTAssertEqual(visible.map(\.id), [pending.id])
        XCTAssertFalse(visible.contains { $0.id == completed.id })
    }

    func testExactCanonicalTimesRemainVisibleForThreeCardCompactHomeLayout() {
        XCTAssertTrue(Self.context(title: "Morning Weigh-In", time: "05:30").contains("5:30"))
        XCTAssertTrue(Self.context(title: "Foam Rolling", time: "19:15").contains("7:15"))
        XCTAssertTrue(Self.context(title: "Tesamorelin", time: "22:29", dose: "0.5 mg").contains("10:29"))
    }

    func testPeptideDoseComesFromCanonicalCompletionPayload() {
        XCTAssertTrue(Self.context(title: "Tesamorelin", time: "22:29", dose: "0.5 mg").contains("0.5 mg"))
    }

    func testDaypartIsOnlyFallbackWhenCanonicalExactTimeIsAbsent() {
        var item = Self.executionContextItem(title: "Untimed support", time: nil, dose: nil)
        item.subtitle = "Tonight"
        XCTAssertEqual(PriorityExecutionContextPresentation.primaryLine(for: item), "Tonight")
        item.notificationAction?.scheduledTime = "21:00"
        XCTAssertNotEqual(PriorityExecutionContextPresentation.primaryLine(for: item), "Tonight")
        item.subtitle = nil
        item.notificationAction?.scheduledTime = nil
        XCTAssertNil(PriorityExecutionContextPresentation.primaryLine(for: item))
    }

    func testPrioritySchedulePresentationDeduplicatesCadenceAndClockAcrossPriorityTypes() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.locale = Locale(identifier: "en_US_POSIX")
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!

        var daily = Self.executionContextItem(title: "Foam Rolling", time: "17:00", dose: nil)
        daily.subtitle = "5:00 PM"
        daily.metadata = "Daily · 5:00 PM"
        XCTAssertEqual(
            PriorityExecutionContextPresentation.lines(for: daily, calendar: calendar),
            .init(primary: "Daily · 5:00 PM", secondary: nil)
        )

        var weekly = Self.executionContextItem(title: "Retatrutide", time: "21:45", dose: "1.5 mg")
        weekly.subtitle = "Thursday · 9:45 PM"
        weekly.metadata = "Weekly · Thursday · 9:45 PM"
        XCTAssertEqual(
            PriorityExecutionContextPresentation.lines(for: weekly, calendar: calendar),
            .init(primary: "Weekly · Thursday · 9:45 PM · 1.5 mg", secondary: nil)
        )

        var oneOff = Self.executionContextItem(title: "DEXA appointment", time: "07:30", dose: nil)
        oneOff.subtitle = "Tomorrow at 7:30 AM"
        oneOff.metadata = "Saturday, October 10 · 7:30 AM"
        XCTAssertEqual(
            PriorityExecutionContextPresentation.lines(for: oneOff, calendar: calendar),
            .init(primary: "Saturday, October 10 · 7:30 AM", secondary: nil)
        )

        var workout = Self.executionContextItem(title: "Upper Body", time: "18:00", dose: nil)
        workout.subtitle = "Today · 6:00 PM"
        workout.metadata = "Strength workout"
        XCTAssertEqual(
            PriorityExecutionContextPresentation.lines(for: workout, calendar: calendar),
            .init(primary: "Today · 6:00 PM", secondary: "Strength workout")
        )

        var custom = Self.executionContextItem(title: "Mobility", time: nil, dose: nil)
        custom.subtitle = "Every other day"
        custom.metadata = "After training"
        XCTAssertEqual(
            PriorityExecutionContextPresentation.lines(for: custom, calendar: calendar),
            .init(primary: "Every other day", secondary: "After training")
        )

        var overdue = daily
        overdue.subtitle = "Overdue"
        XCTAssertEqual(
            PriorityExecutionContextPresentation.lines(for: overdue, calendar: calendar),
            .init(primary: "Daily · 5:00 PM", secondary: "Overdue")
        )
    }

    func testPrioritySchedulePresentationPreservesDistinctDueAndScheduledTimes() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.locale = Locale(identifier: "en_US_POSIX")
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        var item = Self.executionContextItem(title: "Custom deadline", time: "17:00", dose: nil)
        item.subtitle = "Due at 5:00 PM"
        item.metadata = "Scheduled at 5:00 PM"

        XCTAssertEqual(
            PriorityExecutionContextPresentation.lines(for: item, calendar: calendar),
            .init(primary: "Scheduled at 5:00 PM", secondary: "Due at 5:00 PM")
        )
    }

    // MARK: - Natural prose capitalization

    /// Mirrors the product rule in
    /// `src/domain/presentation/proseCapitalization.js`: internal domain
    /// nouns (Goal, Confidence, Evidence, ...) must read as ordinary English
    /// mid-sentence, not as proper nouns. This does not reimplement that
    /// module — it checks the same narrow rule against the prose fields
    /// Home actually renders, so fixture/live copy that violates it fails a
    /// test instead of only being caught by eyeballing the simulator.
    func testProseCopyUsesNaturalMidSentenceCapitalization() throws {
        let model = try Self.loadBundledFixture()
        var prose = [model.hero.headline, model.hero.supportLine]
        if let detail = model.hero.confidenceDetail {
            prose += detail.supportingFactors + detail.limitingFactors + detail.clarifyingFactors
            if !detail.uncertaintyStatement.isEmpty { prose.append(detail.uncertaintyStatement) }
        }
        for sentence in prose {
            XCTAssertTrue(
                NaturalCapitalizationCheck.violations(in: sentence).isEmpty,
                "Unnatural mid-sentence capitalization in: \"\(sentence)\""
            )
        }
    }

    /// The bundled fixture's own copy happens to contain no mid-sentence
    /// domain nouns, so the assertion above would pass even if the checker
    /// were broken. This test exercises the checker directly against a
    /// deliberately bad and a deliberately fine string, so a regression in
    /// the rule itself — not just in fixture copy — is caught.
    func testNaturalCapitalizationCheckDetectsMidSentenceViolations() {
        XCTAssertEqual(
            NaturalCapitalizationCheck.violations(in: "Your Goal is progressing well."),
            ["Goal"]
        )
        XCTAssertTrue(
            NaturalCapitalizationCheck.violations(in: "Weight trends are good. Confidence continues to build.").isEmpty,
            "Sentence-initial capitalization must not be flagged."
        )
    }

    // MARK: - Fixtures

    static func loadBundledFixture() throws -> HomeReadModel {
        let url = try XCTUnwrap(Bundle.main.url(forResource: "HomeFixture", withExtension: "json"))
        let data = try Data(contentsOf: url)
        return try JSONDecoder().decode(HomeReadModel.self, from: data)
    }

    static func confidenceOnlyFixture(confidence: Int?) -> Data {
        let confidenceLiteral = confidence.map(String.init) ?? "null"
        let json = """
        {
          "header": { "greeting": "Good morning,", "name": "Alex" },
          "hero": {
            "mode": "active", "goalLabel": "Test Goal", "headline": "On track.",
            "supportLine": "Keep executing the plan.", "confidence": \(confidenceLiteral),
            "confidenceDetail": null, "projectedFinish": null, "daysRemaining": null,
            "actionLabel": null, "actionDestination": null
          },
          "nextBestAction": { "title": "Log Morning Weight", "icon": "scale", "destination": { "id": "check-in", "parameters": { "checkInType": "morning" } } },
          "briefingCards": [],
          "goals": [],
          "todaysFocus": []
        }
        """
        return Data(json.utf8)
    }
}

/// Test-only mirror of the product's mid-sentence capitalization rule.
/// Not shipped in the app target — it exists to check fixture/live copy in
/// tests, the same way the web repository's equivalent module is only
/// exercised from its own test suite.
enum NaturalCapitalizationCheck {
    static let domainNouns = [
        "Training", "Energy", "Weight", "Photos", "Goal", "Recovery", "Activity",
        "Strategy", "Phase", "Forecast", "Confidence", "Evidence", "Guardrail",
        "Nutrition", "Review", "Baseline", "Trajectory", "Protocol",
    ]

    static func violations(in text: String) -> [String] {
        guard !text.isEmpty else { return [] }
        var found: [String] = []
        for noun in domainNouns {
            guard let regex = try? NSRegularExpression(pattern: "\\b\(noun)\\b") else { continue }
            let range = NSRange(text.startIndex..., in: text)
            for match in regex.matches(in: text, range: range) {
                guard let matchRange = Range(match.range, in: text) else { continue }
                let prefix = text[text.startIndex..<matchRange.lowerBound].trimmingCharacters(in: .whitespaces)
                if prefix.isEmpty || prefix.hasSuffix(".") || prefix.hasSuffix("!") || prefix.hasSuffix("?") { continue }
                found.append(noun)
            }
        }
        return found
    }
}
