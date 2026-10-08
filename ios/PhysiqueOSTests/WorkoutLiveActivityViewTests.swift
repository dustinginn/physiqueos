import SwiftUI
import UIKit
import XCTest
@testable import PhysiqueOS

/// Renders the SHIPPING Live Activity views (the same shared source the
/// Widget Extension compiles) in the states the Founder-approved prototype
/// showed. Lock Screen / Dynamic Island chrome around them is a test-only
/// backdrop; the system draws the real chrome on device.
///
/// Set TEST_RUNNER_WORKOUT_LA_SCREENSHOT_DIR to write the PNGs.
@MainActor
final class WorkoutLiveActivityViewTests: XCTestCase {
    private typealias State = WorkoutActivityAttributes.ContentState
    private typealias Row = State.Row

    // MARK: Fixtures (mirror the approved prototype)

    private let now = Date()

    private func attributes(elapsed: TimeInterval = 48 * 60 + 12) -> WorkoutActivityAttributes {
        .init(schemaVersion: 1, sessionId: "session-1", authority: "sandbox", startedAt: now.addingTimeInterval(-elapsed))
    }

    private func row(_ role: Row.Role, _ name: String, _ set: Int, _ count: Int, _ value: String, target: Bool = false,
                     superset: String? = nil, partner: String? = nil) -> Row {
        .init(role: role, exerciseName: name, variantLabel: nil, supersetLabel: superset, partnerName: partner,
              setNumber: set, setCount: count, valueText: value, isTarget: target)
    }

    private func stopwatch(_ seconds: TimeInterval) -> State.Rest {
        .init(id: "r", mode: .stopwatch, startedAt: now.addingTimeInterval(-seconds), endsAt: nil)
    }

    private func countdown(elapsed: TimeInterval, remaining: TimeInterval) -> State.Rest {
        .init(id: "r", mode: .countdown, startedAt: now.addingTimeInterval(-elapsed), endsAt: now.addingTimeInterval(remaining))
    }

    private func state(
        phase: State.Phase = .inProgress, layout: State.Layout, rows: [Row], rest: State.Rest?, completed: Int = 6, total: Int = 18,
        label: String = "Push · Chest & Shoulders", target: State.Target? = .init(exerciseId: "e", setId: "s")
    ) -> State {
        .init(schemaVersion: 1, revision: 5, phase: phase, label: label, completedSets: completed, totalSets: total, layout: layout,
              rows: rows, target: phase == .inProgress ? target : nil, rest: rest, finishedAt: nil)
    }

    private var normal: State {
        state(layout: .previousAndCurrent, rows: [
            row(.previous, "Incline Dumbbell Press", 2, 4, "80 lb × 10"),
            row(.current, "Incline Dumbbell Press", 3, 4, "85 lb × 8", target: true),
        ], rest: stopwatch(107))
    }

    private var finalSet: State {
        state(layout: .currentAndUpNext, rows: [
            row(.current, "Incline Dumbbell Press", 4, 4, "85 lb × 8", target: true),
            row(.upNext, "Cable Lateral Raise", 1, 3, "20 lb × 12"),
        ], rest: stopwatch(75), completed: 7)
    }

    private var postFinal: State {
        state(layout: .completedAndUpNext, rows: [
            row(.completed, "Incline Dumbbell Press", 4, 4, "85 lb × 8"),
            row(.upNext, "Cable Lateral Raise", 1, 3, "20 lb × 12", target: true),
        ], rest: stopwatch(12), completed: 8)
    }

    private var superset: State {
        state(layout: .previousAndCurrent, rows: [
            row(.previous, "Cable Fly", 2, 3, "35 lb × 12", superset: "A"),
            row(.current, "Chest-Supported Row", 2, 3, "70 lb × 10", target: true, superset: "B", partner: "Cable Fly"),
        ], rest: stopwatch(41), label: "Upper · Superset")
    }

    private var all: [(String, WorkoutActivityAttributes, State)] {
        [
            ("A-lock-normal-previous-current-stopwatch", attributes(), normal),
            ("B-lock-normal-previous-current-countdown", attributes(), { var s = normal; s.rest = countdown(elapsed: 17, remaining: 73); return s }()),
            ("C-lock-final-current-up-next-stopwatch", attributes(), finalSet),
            ("D-lock-post-final-completed-up-next-stopwatch", attributes(), postFinal),
            ("E-lock-rest-off-two-row", attributes(), { var s = normal; s.rest = nil; return s }()),
            ("F-lock-superset-two-row", attributes(), superset),
            ("L-lock-all-sets-complete", attributes(), state(phase: .allSetsComplete, layout: .completedOnly, rows: [], rest: nil, completed: 18)),
            ("M-lock-saving", attributes(), state(phase: .finishing, layout: .empty, rows: [], rest: nil, completed: 18)),
            ("N-lock-saved", attributes(), state(phase: .saved, layout: .empty, rows: [], rest: nil, completed: 18)),
            ("O-lock-long-names", attributes(), state(layout: .previousAndCurrent, rows: [
                row(.previous, "Single-Arm Incline Dumbbell Press With Pause", 2, 12, "102.5 lb × 10"),
                row(.current, "Single-Arm Incline Dumbbell Press With Pause", 3, 12, "102.5 lb × 10", target: true),
            ], rest: stopwatch(3725), label: "Push · Chest · Shoulders · Triceps · Core")),
        ]
    }

    // MARK: Rendering

    private func render<V: View>(_ view: V, size: CGSize, scheme: ColorScheme = .dark) -> UIImage {
        let host = UIHostingController(rootView: view.environment(\.colorScheme, scheme))
        host.safeAreaRegions = []
        host.view.bounds = CGRect(origin: .zero, size: size)
        host.view.backgroundColor = .clear
        let window = UIWindow(frame: CGRect(origin: .zero, size: size))
        window.rootViewController = host
        window.isHidden = false
        host.view.layoutIfNeeded()
        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { _ in host.view.drawHierarchy(in: CGRect(origin: .zero, size: size), afterScreenUpdates: true) }
    }

    private func fittingHeight<V: View>(_ view: V, width: CGFloat) -> CGFloat {
        let host = UIHostingController(rootView: view)
        return host.sizeThatFits(in: CGSize(width: width, height: .greatestFiniteMagnitude)).height
    }

    private func save(_ image: UIImage, named name: String) throws {
        let attachment = XCTAttachment(image: image)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
        guard let directory = ProcessInfo.processInfo.environment["WORKOUT_LA_SCREENSHOT_DIR"] else { return }
        try FileManager.default.createDirectory(atPath: directory, withIntermediateDirectories: true)
        try XCTUnwrap(image.pngData()).write(to: URL(fileURLWithPath: directory).appendingPathComponent("\(name).png"))
    }

    private func assertNotBlank(_ image: UIImage, _ name: String, file: StaticString = #filePath, line: UInt = #line) {
        guard let cg = image.cgImage, let data = cg.dataProvider?.data, let bytes = CFDataGetBytePtr(data) else {
            return XCTFail("\(name): no pixels", file: file, line: line)
        }
        let length = CFDataGetLength(data)
        var distinct = Set<UInt32>()
        var index = 0
        while index + 3 < length, distinct.count < 24 {
            distinct.insert(UInt32(bytes[index]) << 16 | UInt32(bytes[index + 1]) << 8 | UInt32(bytes[index + 2]))
            index += 4 * 97
        }
        XCTAssertGreaterThan(distinct.count, 6, "\(name) rendered blank", file: file, line: line)
    }

    private func lockScreen(_ attributes: WorkoutActivityAttributes, _ state: State, stale: Bool = false,
                            scheme: ColorScheme = .dark) -> some View {
        WorkoutLockScreenView(attributes: attributes, state: state, isStale: stale)
            .frame(width: 365)
            .background(RoundedRectangle(cornerRadius: 23, style: .continuous).fill(WorkoutActivityTheme.of(scheme).page.opacity(0.96)))
            .overlay(RoundedRectangle(cornerRadius: 23, style: .continuous).stroke(Color.white.opacity(0.12), lineWidth: 0.75))
            .environment(\.colorScheme, scheme)
    }

    private func scene<V: View>(_ card: V, scheme: ColorScheme = .dark) -> some View {
        ZStack {
            LinearGradient(colors: scheme == .light
                           ? [Color(red: 0.80, green: 0.85, blue: 0.86), Color(red: 0.62, green: 0.70, blue: 0.74)]
                           : [Color(red: 27 / 255, green: 24 / 255, blue: 66 / 255), WorkoutActivityTheme.dark.page, .black],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
            VStack(spacing: 0) {
                Image(systemName: "lock.fill").font(.system(size: 13, weight: .semibold)).padding(.top, 17)
                Text("Thursday, October 1").font(.system(size: 18, weight: .medium, design: .rounded)).padding(.top, 13)
                Text("9:41").font(.system(size: 78, weight: .thin, design: .rounded)).tracking(-3)
                Spacer()
                card.shadow(color: .black.opacity(0.42), radius: 16, y: 8).padding(.bottom, 98)
            }
            .foregroundStyle(.white)
        }
        .frame(width: 393, height: 852)
    }

    // MARK: Tests

    func testLockScreenStatesRenderAndStayWithinTheActivityHeightBudget() throws {
        // Both system appearances: Dark (deep navy) and Light (Mineral).
        for scheme in [ColorScheme.dark, .light] {
            for (name, attributes, state) in all {
                let view = lockScreen(attributes, state, scheme: scheme)
                let height = fittingHeight(view, width: 365)
                XCTAssertLessThanOrEqual(height, 160, "\(name) is \(height) pt; Live Activities truncate beyond 160 pt.")
                let image = render(scene(view, scheme: scheme), size: CGSize(width: 393, height: 852), scheme: scheme)
                assertNotBlank(image, name)
                try save(image, named: scheme == .light ? "\(name)-mineral" : name)
            }
        }
    }

    /// Tokens: with no app appearance the Lock Screen follows the system
    /// appearance (Build 92 behaviour for older activities); the Dynamic
    /// Island is always the Dark (system black) set. Build 93: warm amber
    /// replaces teal and Complete Set is the iPhone Finish Workout amber.
    func testLockedThemeFollowsTheSystemAppearanceAndTheIslandStaysDark() {
        XCTAssertEqual(WorkoutActivityTheme.of(.dark), .dark)
        XCTAssertEqual(WorkoutActivityTheme.of(.light), .mineralLight)
        XCTAssertEqual(WorkoutActivityTheme.dark.accent, Color.activityHex(0xEFB84F))
        XCTAssertEqual(WorkoutActivityTheme.dark.primaryAction, Color.activityHex(0xEFB84F))
        XCTAssertEqual(WorkoutActivityTheme.dark.green, Color.activityHex(0x55E39A))
        XCTAssertEqual(WorkoutActivityTheme.mineralLight.primaryAction, Color.activityHex(0xC88228))
        XCTAssertEqual(WorkoutActivityTheme.mineralLight.page, Color.activityHex(0xE8ECE5))
        // The Island resolves Dark whatever the environment says.
        let lightIsland = WorkoutIslandExpandedBottom(attributes: attributes(), state: normal).environment(\.colorScheme, .light)
        XCTAssertLessThanOrEqual(fittingHeight(lightIsland.padding(12), width: 371), 160)
    }

    /// Build 93: the Lock Screen follows the in-app PhysiqueOS appearance even
    /// when iOS is the other way round (shipping views rendered off-ActivityKit).
    func testLockScreenFollowsTheAppAppearanceAgainstTheSystemAppearance() throws {
        for (appearance, system, name) in [(State.Appearance.mineralLight, ColorScheme.dark, "theme-mineral-light-app-on-dark-ios"),
                                           (State.Appearance.dark, ColorScheme.light, "theme-dark-app-on-light-ios")] {
            let state = normal.withAppearance(appearance)
            let resolved = WorkoutActivityTheme.resolve(appearance, system: system)
            let view = WorkoutLockScreenView(attributes: attributes(), state: state)
                .frame(width: 365)
                .background(RoundedRectangle(cornerRadius: 23, style: .continuous).fill(WorkoutActivityTheme.backgroundTint(for: appearance)))
                .environment(\.colorScheme, system)
            XCTAssertLessThanOrEqual(fittingHeight(view, width: 365), 160)
            let image = render(scene(view, scheme: resolved == .mineralLight ? .light : .dark), size: CGSize(width: 393, height: 852), scheme: system)
            assertNotBlank(image, name)
            try save(image, named: name)
        }
        let island = WorkoutIslandExpandedBottom(attributes: attributes(), state: normal.withAppearance(.mineralLight))
            .padding(12).frame(width: 371).background(Color.black, in: RoundedRectangle(cornerRadius: 44))
        try save(render(island, size: CGSize(width: 371, height: 170), scheme: .light), named: "theme-island-expanded-always-dark")
    }

    func testCompleteSetIsPresentOnlyWhileInProgressAndMeetsTheTouchTarget() throws {
        let attributes = attributes()
        let button = WorkoutCompleteSetButton(attributes: attributes, state: normal)
        XCTAssertGreaterThanOrEqual(fittingHeight(button, width: 124), 44, "Complete Set needs a 44 pt target.")
        XCTAssertGreaterThan(fittingHeight(button, width: 124), 0)

        for phase in [State.Phase.allSetsComplete, .reviewing, .finishing, .saved, .paused] {
            var state = normal
            state.phase = phase
            XCTAssertEqual(fittingHeight(WorkoutCompleteSetButton(attributes: attributes, state: state), width: 124), 0, "\(phase)")
        }
        var noTarget = normal
        noTarget.target = nil
        XCTAssertEqual(fittingHeight(WorkoutCompleteSetButton(attributes: attributes, state: noTarget), width: 124), 0)
    }

    func testDynamicIslandSubviews() throws {
        /// The expanded island: header regions (leading glyph + label,
        /// trailing elapsed) above the shipping bottom region, in a black
        /// capsule on a dark backdrop. The system supplies this chrome on device.
        func island(_ state: State, attributes: WorkoutActivityAttributes) -> some View {
            ZStack(alignment: .top) {
                LinearGradient(colors: [WorkoutActivityTheme.dark.row, WorkoutActivityTheme.dark.page], startPoint: .top, endPoint: .bottom)
                VStack(spacing: 7) {
                    HStack {
                        HStack(spacing: 6) {
                            Image(systemName: "dumbbell.fill").font(.system(size: 10, weight: .semibold))
                            Text("Workout").font(WorkoutActivityType.font(11, 500))
                        }
                        Spacer()
                        WorkoutElapsedText(startedAt: attributes.startedAt, finishedAt: state.finishedAt)
                            .font(WorkoutActivityType.font(11, 500))
                    }
                    WorkoutIslandExpandedBottom(attributes: attributes, state: state)
                }
                .padding(.horizontal, 12).padding(.vertical, 10)
                .frame(width: 371, height: 156)
                .background(RoundedRectangle(cornerRadius: 35, style: .continuous).fill(Color.black))
                .padding(.top, 7)
                .foregroundStyle(.white)
            }
            .frame(width: 393, height: 200)
            .background(WorkoutActivityTheme.dark.page)
        }
        let attributes = attributes()
        let states: [(String, State)] = [("G-island-expanded-normal-previous-current", normal),
                                         ("H-island-expanded-final-current-up-next", finalSet),
                                         ("K-island-expanded-post-final-completed-up-next", postFinal),
                                         ("I-island-expanded-active-rest-countdown", { var s = normal; s.rest = countdown(elapsed: 17, remaining: 73); return s }())]
        for (name, state) in states {
            let expanded = WorkoutIslandExpandedBottom(attributes: attributes, state: state)
                .padding(.horizontal, 12).padding(.vertical, 10)
            let height = fittingHeight(expanded, width: 371)
            XCTAssertLessThanOrEqual(height, 160, "\(name) expanded content is \(height) pt")
            let image = render(island(state, attributes: attributes), size: CGSize(width: 393, height: 200))
            assertNotBlank(image, name)
            try save(image, named: name)
        }

        let compactWorkout = HStack(spacing: 0) {
            WorkoutIslandCompactLeading().frame(width: 48, alignment: .leading)
            Spacer(minLength: 25)
            WorkoutIslandCompactTrailing(attributes: attributes, state: { var s = normal; s.rest = nil; return s }())
        }.padding(.horizontal, 10).frame(width: 139, height: 37).background(Capsule().fill(Color.black))
        let compactRest = HStack(spacing: 0) {
            WorkoutIslandCompactLeading().frame(width: 48, alignment: .leading)
            Spacer(minLength: 25)
            WorkoutIslandCompactTrailing(attributes: attributes, state: normal)
        }.padding(.horizontal, 10).frame(width: 139, height: 37).background(Capsule().fill(Color.black))
        let minimal = WorkoutIslandMinimal(state: normal).frame(width: 37, height: 37).background(Circle().fill(Color.black))
        for (name, view) in [("J1-island-compact-workout", AnyView(compactWorkout)), ("J2-island-compact-rest", AnyView(compactRest)),
                             ("J3-island-minimal-rest", AnyView(minimal))] {
            let image = render(view.padding(10).foregroundStyle(.white), size: CGSize(width: 200, height: 60))
            assertNotBlank(image, name)
            try save(image, named: name)
        }
    }

    func testPrivacyRedactionHidesExerciseDetailsAndTheCompleteSetAction() throws {
        XCTAssertTrue(WorkoutActivityPrivacy.showsSetDetails(redaction: []))
        XCTAssertFalse(WorkoutActivityPrivacy.showsSetDetails(redaction: .privacy))
        XCTAssertTrue(WorkoutActivityPrivacy.showsSetDetails(redaction: .placeholder), "Only the privacy reason hides details.")

        let view = lockScreen(attributes(), normal).environment(\.redactionReasons, .privacy)
        XCTAssertLessThanOrEqual(fittingHeight(view, width: 365), 160)
        let image = render(scene(view), size: CGSize(width: 393, height: 852))
        assertNotBlank(image, "privacy")
        try save(image, named: "P-lock-privacy-redacted")
        let light = lockScreen(attributes(), normal, scheme: .light).environment(\.redactionReasons, .privacy)
        try save(render(scene(light, scheme: .light), size: CGSize(width: 393, height: 852), scheme: .light), named: "P-lock-privacy-redacted-mineral")

        let island = WorkoutIslandExpandedBottom(attributes: attributes(), state: normal).environment(\.redactionReasons, .privacy)
        try save(render(island.padding(12).frame(width: 393, height: 200).background(Color.black), size: CGSize(width: 393, height: 200)), named: "P2-island-privacy-redacted")
    }

    func testPresentationDecisionsForPrivacyStalenessAndPhase() {
        typealias P = WorkoutActivityPresentation
        // Normal: details and Complete Set.
        XCTAssertEqual(P.make(state: normal, isStale: false, redaction: []), .init(phase: .inProgress, showsSetDetails: true, showsCompleteSet: true))
        // Privacy hides names/values AND Complete Set (you cannot confirm a set you cannot see).
        XCTAssertEqual(P.make(state: normal, isStale: false, redaction: .privacy), .init(phase: .inProgress, showsSetDetails: false, showsCompleteSet: false))
        // Stale stopwatch / Off: safe state, no Complete Set.
        XCTAssertEqual(P.make(state: normal, isStale: true, redaction: []), .init(phase: .paused, showsSetDetails: true, showsCompleteSet: false))
        var off = normal; off.rest = nil
        XCTAssertEqual(P.make(state: off, isStale: true, redaction: []).phase, .paused)
        // A Countdown reaching zero is "stale" only visually: still in progress, still completable.
        var expired = normal; expired.rest = countdown(elapsed: 95, remaining: -5)
        XCTAssertEqual(P.make(state: expired, isStale: true, redaction: []), .init(phase: .inProgress, showsSetDetails: true, showsCompleteSet: true))
        // Non-progress phases never offer Complete Set.
        for phase in [State.Phase.allSetsComplete, .reviewing, .finishing, .saved, .paused] {
            var state = normal; state.phase = phase
            XCTAssertFalse(P.make(state: state, isStale: false, redaction: []).showsCompleteSet, "\(phase)")
        }
        // No target, no button.
        var noTarget = normal; noTarget.target = nil
        XCTAssertFalse(P.make(state: noTarget, isStale: false, redaction: []).showsCompleteSet)
    }

    func testStaleActivityShowsTheSafeStateExceptForACountdownReachingZero() throws {
        let stale = lockScreen(attributes(), normal, stale: true)
        try save(render(scene(stale), size: CGSize(width: 393, height: 852)), named: "Q-lock-stale-safe")
        let staleLight = lockScreen(attributes(), normal, stale: true, scheme: .light)
        try save(render(scene(staleLight, scheme: .light), size: CGSize(width: 393, height: 852), scheme: .light), named: "Q-lock-stale-safe-mineral")
        var expiredCountdown = normal
        expiredCountdown.rest = countdown(elapsed: 95, remaining: -5)
        let expired = lockScreen(attributes(), expiredCountdown, stale: true)
        try save(render(scene(expired), size: CGSize(width: 393, height: 852)), named: "R-lock-countdown-complete")
        XCTAssertLessThanOrEqual(fittingHeight(stale, width: 365), 160)
        XCTAssertLessThanOrEqual(fittingHeight(expired, width: 365), 160)
    }

    // MARK: Clock block (Build 89 integration: no-rest WORKOUT stopwatch)

    /// Glyphs that must never mark the elapsed WORKOUT clock: the workout
    /// identity glyph and any bars / equalizer / level semantic.
    private func assertNotAWorkoutOrBarsGlyph(_ glyph: String, _ context: String, file: StaticString = #filePath, line: UInt = #line) {
        for forbidden in ["dumbbell", "figure.", "chart.bar", "waveform", "equalizer", "cellularbars", "slider"] {
            XCTAssertFalse(glyph.contains(forbidden), "\(context): \(glyph) is a workout/bars glyph", file: file, line: line)
        }
    }

    func testNoRestAndPreFirstSetWorkoutClockUsesTheStopwatchGlyph() throws {
        typealias C = WorkoutClockPresentation
        let preFirstSet = state(layout: .currentAndUpNext, rows: [
            row(.current, "Incline Dumbbell Press", 1, 4, "80 lb × 10", target: true),
            row(.upNext, "Incline Dumbbell Press", 2, 4, "80 lb × 10"),
        ], rest: nil, completed: 0)
        var restOff = normal; restOff.rest = nil
        let workout = C(clock: .workoutElapsed, glyph: "stopwatch", label: "WORKOUT", accessibilityLabel: "Workout time")
        for (name, state, stale, showsRest) in [
            ("pre-first-set", preFirstSet, false, true),
            ("rest-off", restOff, false, true),
            ("rest-off-stale", restOff, true, true),
            ("privacy-with-rest", normal, false, false),
            ("all-sets-complete", self.state(phase: .allSetsComplete, layout: .completedOnly, rows: [], rest: nil, completed: 18), false, true),
        ] {
            let presentation = C.make(state: state, isStale: stale, showsRest: showsRest)
            XCTAssertEqual(presentation, workout, name)
            assertNotAWorkoutOrBarsGlyph(presentation.glyph, name)
        }
        // The pre-first-set Lock Screen still renders within budget, both appearances.
        for scheme in [ColorScheme.dark, .light] {
            let view = lockScreen(attributes(elapsed: 95), preFirstSet, scheme: scheme)
            XCTAssertLessThanOrEqual(fittingHeight(view, width: 365), 160)
            let image = render(scene(view, scheme: scheme), size: CGSize(width: 393, height: 852), scheme: scheme)
            assertNotBlank(image, "pre-first-set")
            try save(image, named: scheme == .light ? "T-lock-pre-first-set-workout-stopwatch-mineral" : "T-lock-pre-first-set-workout-stopwatch")
        }
    }

    func testActiveRestClockPresentationIsUnchanged() throws {
        typealias C = WorkoutClockPresentation
        XCTAssertEqual(C.make(state: normal, isStale: false, showsRest: true),
                       C(clock: .rest, glyph: "stopwatch", label: "REST · STOPWATCH", accessibilityLabel: "Rest stopwatch"))
        var countdown = normal; countdown.rest = self.countdown(elapsed: 17, remaining: 73)
        XCTAssertEqual(C.make(state: countdown, isStale: false, showsRest: true),
                       C(clock: .rest, glyph: "timer", label: "REST · COUNTDOWN", accessibilityLabel: "Rest countdown"))
        XCTAssertEqual(C.make(state: countdown, isStale: true, showsRest: true),
                       C(clock: .rest, glyph: "timer", label: "REST · COMPLETE", accessibilityLabel: "Rest countdown"))
        // Green treatment: the block tints every clock glyph with the locked green.
        XCTAssertEqual(WorkoutActivityTheme.dark.green, Color.activityHex(0x55E39A))
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        let source = try String(contentsOf: root.appendingPathComponent("PhysiqueOSShared/WorkoutLiveActivityViews.swift"), encoding: .utf8)
        let block = try XCTUnwrap(source.range(of: "private func block<Clock: View>(glyph: String"))
        let body = source[block.upperBound...].prefix(400)
        XCTAssertTrue(body.contains("Image(systemName: glyph)") && body.contains(".foregroundStyle(theme.green)"),
                      "The clock glyph keeps the green treatment.")
        XCTAssertEqual(source.components(separatedBy: "\"dumbbell.fill\", label: \"WORKOUT\"").count, 1,
                       "The WORKOUT clock no longer uses the workout glyph.")
    }

    func testCompleteSetMovesTheClockFromWorkoutToRestStopwatch() {
        typealias C = WorkoutClockPresentation
        let before = state(layout: .currentAndUpNext, rows: [
            row(.current, "Incline Dumbbell Press", 1, 4, "80 lb × 10", target: true),
            row(.upNext, "Incline Dumbbell Press", 2, 4, "80 lb × 10"),
        ], rest: nil, completed: 0)
        var after = before
        after.rest = stopwatch(0)
        after.completedSets = 1
        XCTAssertEqual(C.make(state: before, isStale: false, showsRest: true).clock, .workoutElapsed)
        XCTAssertEqual(C.make(state: before, isStale: false, showsRest: true).glyph, "stopwatch")
        XCTAssertEqual(C.make(state: after, isStale: false, showsRest: true),
                       C(clock: .rest, glyph: "stopwatch", label: "REST · STOPWATCH", accessibilityLabel: "Rest stopwatch"))
    }

    /// The Live Activity uses fixed point sizes (as the approved prototype
    /// does), so Dynamic Type does not rescale it; this guards that the
    /// layout is still intact and within budget when the environment asks
    /// for large sizes.
    func testLargeDynamicTypeSettingsDoNotBreakTheLayout() throws {
        for size in [DynamicTypeSize.large, .accessibility1, .accessibility3] {
            let view = lockScreen(attributes(), finalSet).environment(\.dynamicTypeSize, size)
            XCTAssertLessThanOrEqual(fittingHeight(view, width: 365), 160, "\(size)")
            let image = render(scene(view), size: CGSize(width: 393, height: 852))
            assertNotBlank(image, "\(size)")
            if size == .accessibility3 { try save(image, named: "S-lock-dynamic-type-accessibility3") }
        }
    }
}
