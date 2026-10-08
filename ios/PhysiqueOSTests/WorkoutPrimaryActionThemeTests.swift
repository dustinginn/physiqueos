import SwiftUI
import UIKit
import XCTest
@testable import PhysiqueOS

/// Build 93 primary workout action continuity (Founder decision 2026-10-08):
/// the iPhone Logger's Finish Workout amber, per appearance, on the Watch
/// Complete Set and the Live Activity Complete Set; the Live Activity follows
/// the in-app PhysiqueOS appearance.
@MainActor
final class WorkoutPrimaryActionThemeTests: XCTestCase {
    private typealias State = WorkoutActivityAttributes.ContentState
    private typealias F = WorkoutLiveActivityTestFixtures

    private func hex(_ color: Color, _ style: UIUserInterfaceStyle) -> UInt32 {
        let resolved = UIColor(color).resolvedColor(with: UITraitCollection(userInterfaceStyle: style))
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        resolved.getRed(&r, green: &g, blue: &b, alpha: &a)
        return UInt32((r * 255).rounded()) << 16 | UInt32((g * 255).rounded()) << 8 | UInt32((b * 255).rounded())
    }

    private func luminance(_ hex: UInt32) -> Double {
        func channel(_ value: UInt32) -> Double {
            let c = Double(value) / 255
            return c <= 0.03928 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * channel((hex >> 16) & 0xFF) + 0.7152 * channel((hex >> 8) & 0xFF) + 0.0722 * channel(hex & 0xFF)
    }

    private func contrast(_ a: UInt32, _ b: UInt32) -> Double {
        let (l1, l2) = (luminance(a), luminance(b))
        return (max(l1, l2) + 0.05) / (min(l1, l2) + 0.05)
    }

    // MARK: Source token

    func testTheIPhoneFinishWorkoutAmberIsUnchangedAndIsTheSharedToken() {
        // Build 92's literal values: the iPhone button must not change.
        XCTAssertEqual(hex(PhysiqueOSTheme.redesignAmber, .dark), 0xEFB84F)
        XCTAssertEqual(hex(PhysiqueOSTheme.redesignAmber, .light), 0xC88228)
        XCTAssertEqual(hex(PhysiqueOSTheme.redesignOnExecution, .dark), 0x10202A)
        XCTAssertEqual(hex(PhysiqueOSTheme.redesignOnExecution, .light), 0x10202A)
        XCTAssertEqual(WorkoutPrimaryActionToken.darkHex, 0xEFB84F)
        XCTAssertEqual(WorkoutPrimaryActionToken.mineralLightHex, 0xC88228)
        XCTAssertEqual(WorkoutPrimaryActionToken.foregroundHex, 0x10202A)
    }

    func testTheExtensionMirrorEqualsTheSharedToken() {
        XCTAssertEqual(WorkoutActivityPrimaryAction.darkHex, WorkoutPrimaryActionToken.darkHex)
        XCTAssertEqual(WorkoutActivityPrimaryAction.mineralLightHex, WorkoutPrimaryActionToken.mineralLightHex)
        XCTAssertEqual(WorkoutActivityPrimaryAction.foregroundHex, WorkoutPrimaryActionToken.foregroundHex)
    }

    func testTheInkLabelIsLegibleOnBothAmbers() {
        XCTAssertGreaterThanOrEqual(contrast(WorkoutPrimaryActionToken.foregroundHex, WorkoutPrimaryActionToken.darkHex), 4.5)
        XCTAssertGreaterThanOrEqual(contrast(WorkoutPrimaryActionToken.foregroundHex, WorkoutPrimaryActionToken.mineralLightHex), 4.5)
        // Mineral Light small amber text (role labels) reads on paper and page.
        XCTAssertGreaterThanOrEqual(contrast(0x925500, 0xFBFAF4), 4.5)
        XCTAssertGreaterThanOrEqual(contrast(0x925500, 0xE8ECE5), 4.5)
        // Dark amber highlight on the navy row/page.
        XCTAssertGreaterThanOrEqual(contrast(0xEFB84F, 0x132735), 4.5)
    }

    // MARK: Live Activity palette

    func testLiveActivityCompleteSetUsesTheIPhoneAmberPerAppearanceAndNoTeal() {
        XCTAssertEqual(WorkoutActivityTheme.dark.primaryAction, .activityHex(0xEFB84F))
        XCTAssertEqual(WorkoutActivityTheme.mineralLight.primaryAction, .activityHex(0xC88228))
        XCTAssertEqual(WorkoutActivityTheme.dark.onPrimaryAction, .activityHex(0x10202A))
        XCTAssertEqual(WorkoutActivityTheme.mineralLight.onPrimaryAction, .activityHex(0x10202A))
        // Dark highlights are warm amber (teal #3BD2CA retired); Mineral uses amber ink.
        XCTAssertEqual(WorkoutActivityTheme.dark.accent, .activityHex(0xEFB84F))
        XCTAssertEqual(WorkoutActivityTheme.mineralLight.accent, .activityHex(0x925500))
        XCTAssertEqual(WorkoutActivityPalette.accent, .activityHex(0xEFB84F))
        for theme in [WorkoutActivityTheme.dark, .mineralLight] {
            for color in [theme.accent, theme.primaryAction] {
                XCTAssertNotEqual(color, .activityHex(0x3BD2CA))
                XCTAssertNotEqual(color, .activityHex(0x087E78))
            }
        }
        // Option B Mineral Light keeps the mineral-neutral canvas and paper rows.
        XCTAssertEqual(WorkoutActivityTheme.mineralLight.page, .activityHex(0xE8ECE5))
        XCTAssertEqual(WorkoutActivityTheme.mineralLight.row, .activityHex(0xFBFAF4))
        XCTAssertEqual(WorkoutActivityTheme.dark.page, .activityHex(0x061019))
    }

    func testTheLockScreenFollowsTheAppOwnedAppearanceNotJustIOS() {
        XCTAssertEqual(WorkoutActivityTheme.resolve(.mineralLight, system: .dark), .mineralLight)
        XCTAssertEqual(WorkoutActivityTheme.resolve(.dark, system: .light), .dark)
        XCTAssertEqual(WorkoutActivityTheme.resolve(.system, system: .light), .mineralLight)
        XCTAssertEqual(WorkoutActivityTheme.resolve(.system, system: .dark), .dark)
        XCTAssertEqual(WorkoutActivityTheme.resolve(nil, system: .light), .mineralLight, "an older activity follows iOS as before")
        XCTAssertEqual(WorkoutActivityTheme.backgroundTint(for: .mineralLight), WorkoutActivityTheme.mineralLight.page)
        XCTAssertEqual(WorkoutActivityTheme.backgroundTint(for: .dark), WorkoutActivityTheme.dark.page.opacity(0.96))
        XCTAssertEqual(WorkoutActivityTheme.backgroundTint(for: nil), WorkoutActivityTheme.dark.page.opacity(0.96), "Build 92 tint unchanged for old activities")
    }

    func testAppAppearanceMapsOntoTheActivityAppearance() {
        XCTAssertEqual(State.Appearance(AppAppearance.system), .system)
        XCTAssertEqual(State.Appearance(AppAppearance.dark), .dark)
        XCTAssertEqual(State.Appearance(AppAppearance.light), .mineralLight)
    }

    // MARK: ActivityKit content compatibility

    func testOlderActivityStateWithoutAppearanceDecodesAndUnknownValuesAreSafe() throws {
        let state = State(schemaVersion: 1, revision: 4, phase: .inProgress, label: "Push", completedSets: 1, totalSets: 6,
                          layout: .currentOnly, rows: [], target: nil, rest: nil, finishedAt: nil)
        let old = try JSONEncoder().encode(state)
        XCTAssertFalse(String(decoding: old, as: UTF8.self).contains("appearance"), "nil is omitted, so Build 92 decodes new payloads")
        XCTAssertNil(try JSONDecoder().decode(State.self, from: old).appearance)

        let stamped = state.withAppearance(.mineralLight)
        XCTAssertEqual(try JSONDecoder().decode(State.self, from: try JSONEncoder().encode(stamped)), stamped)

        var object = try XCTUnwrap(JSONSerialization.jsonObject(with: try JSONEncoder().encode(stamped)) as? [String: Any])
        object["appearance"] = "sepia"
        let future = try JSONSerialization.data(withJSONObject: object)
        XCTAssertEqual(try JSONDecoder().decode(State.self, from: future).appearance, .system, "unknown → System, never a throw")
    }

    func testAnAppearanceChangeIsASignificantChange() {
        let state = State(schemaVersion: 1, revision: 4, phase: .inProgress, label: "Push", completedSets: 1, totalSets: 6,
                          layout: .currentOnly, rows: [], target: nil, rest: nil, finishedAt: nil)
        XCTAssertNotEqual(state.withAppearance(.dark).significantKey, state.withAppearance(.mineralLight).significantKey)
    }

    // MARK: Coordinator propagation

    private final class AppearanceBox { var value: State.Appearance = .mineralLight }

    private func coordinator(_ client: FakeWorkoutLiveActivityClient, appearance: AppearanceBox) -> (WorkoutLiveActivityCoordinator, TrainingSessionAuthority) {
        let store = TrainingSessionAuthorityTests.RecordingStore([F.session(id: "session-1", [
            F.exercise("bench", "Bench Press", sets: [F.set("b1", 1), F.set("b2", 2)]),
        ], step: .workout, revision: 1)])
        let authority = TrainingSessionAuthority(store: store, environment: .sandbox, restPreferences: FixedTrainingRestPreferences(.stopwatch), now: { F.now })
        let suite = "WorkoutPrimaryActionThemeTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        addTeardownBlock { defaults.removePersistentDomain(forName: suite) }
        let coordinator = WorkoutLiveActivityCoordinator(client: client, defaults: defaults, now: { F.now }, appearance: { appearance.value })
        return (coordinator, authority)
    }

    func testEveryActivityStateCarriesTheAppAppearanceAndAThemeChangeRestylesAtOnce() async {
        let client = FakeWorkoutLiveActivityClient()
        let box = AppearanceBox()
        let (coordinator, authority) = coordinator(client, appearance: box)
        coordinator.attach(to: authority, environment: .sandbox)
        await coordinator.flush()
        XCTAssertEqual(client.requests, 1)
        XCTAssertEqual(client.live.first?.state.appearance, .mineralLight)

        box.value = .dark
        coordinator.appearanceDidChange()
        for _ in 0..<6 { await Task.yield() }
        await coordinator.flush()
        XCTAssertEqual(client.live.first?.state.appearance, .dark)
        XCTAssertEqual(client.requests, 1, "a theme change updates in place, never a second activity")
        XCTAssertEqual(client.updates.last?.state.appearance, .dark)
        // Workout semantics are untouched by the restyle.
        XCTAssertEqual(client.updates.last?.state.target, client.live.first?.state.target)
        XCTAssertEqual(client.updates.last?.state.revision, client.live.first?.state.revision)
    }

    func testAnActivityStartedByAnOlderBuildIsRestampedOnTheNextSync() async {
        let client = FakeWorkoutLiveActivityClient()
        let box = AppearanceBox()
        let (coordinator, authority) = coordinator(client, appearance: box)
        // Build 92 left an activity without an appearance.
        let seeded = WorkoutActivityAttributes(schemaVersion: 1, sessionId: "session-1", authority: "sandbox", startedAt: F.now)
        var oldState = State(schemaVersion: 1, revision: 1, phase: .inProgress, label: "Push", completedSets: 0, totalSets: 2,
                             layout: .currentOnly, rows: [], target: nil, rest: nil, finishedAt: nil)
        oldState.appearance = nil
        client.seed(attributes: seeded, state: oldState)
        coordinator.attach(to: authority, environment: .sandbox)
        await coordinator.flush()
        XCTAssertEqual(client.requests, 0, "the existing activity is adopted, not replaced")
        XCTAssertEqual(client.live.first?.state.appearance, .mineralLight)
    }
}
