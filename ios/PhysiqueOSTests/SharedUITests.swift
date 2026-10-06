import XCTest
import SwiftUI
@testable import PhysiqueOS

/// Regression coverage for this patch's shared/root fixes: the brand font,
/// the disabled-primary-button rule, and the tab-shell scroll clearance.
/// These run inside the app process (`TEST_HOST`), so the app's own
/// `UIAppFonts`-registered font is genuinely available to these assertions
/// — this is not a mock or a fixture stand-in.
final class SharedUITests: XCTestCase {
    @MainActor
    func testTodayUsesLocalCalendarDateAndRespectsFutureOnlyScheduling() throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = try XCTUnwrap(TimeZone(identifier: "America/Los_Angeles"))
        let now = try XCTUnwrap(ISO8601DateFormatter().date(from: "2026-09-16T00:40:00Z"))
        let today = calendar.startOfDay(for: now)
        XCTAssertEqual(DateField.selectableToday(now: now, minimumDate: nil, maximumDate: .distantFuture, calendar: calendar), today)
        XCTAssertEqual(calendar.component(.day, from: today), 15)
        let tomorrow = try XCTUnwrap(calendar.date(byAdding: .day, value: 1, to: today))
        XCTAssertNil(DateField.selectableToday(now: now, minimumDate: tomorrow, maximumDate: .distantFuture, calendar: calendar))
    }

    @MainActor
    func testTodayDoesNotSelectOutsideHistoricalEvidenceBounds() throws {
        let now = try XCTUnwrap(ISO8601DateFormatter().date(from: "2026-09-16T00:40:00Z"))
        let yesterday = try XCTUnwrap(Calendar.current.date(byAdding: .day, value: -1, to: now))
        XCTAssertNil(DateField.selectableToday(now: now, minimumDate: nil, maximumDate: yesterday))
        XCTAssertNotNil(DateField.selectableToday(now: now, minimumDate: nil, maximumDate: now))
    }

    func testPresentationLanguageSeparatesNamedLabelsFromNaturalProse() {
        XCTAssertEqual(PresentationLanguage.displayName("Build Lean Mass"), "Build Lean Mass")
        XCTAssertEqual(PresentationLanguage.displayName("Lean Mass Build"), "Lean Mass Build")
        XCTAssertEqual(PresentationLanguage.proseName("Build Lean Mass"), "build lean mass")
        XCTAssertEqual(PresentationLanguage.proseName("Lean Mass Build"), "lean mass phase")
        XCTAssertEqual(PresentationLanguage.goalPhrase("Build Lean Mass"), "your goal to build lean mass")
        XCTAssertFalse(PresentationLanguage.goalPhrase("Build Lean Mass").contains("Build Lean Mass"))
    }

    func testAcceptanceFixtureProseDoesNotLeakCanonicalTitleCasing() throws {
        let proseKeys: Set<String> = [
            "body", "narrative", "summary", "opening", "phaseMeaning",
            "biggestTakeaway", "biggestWin", "questionText", "coachInsightBody",
            "nextGoalTitle", "purpose", "goal",
        ]
        let forbidden = ["Build Lean Mass", "Lean Mass Build", "Visible Abs at Rest", "Establish Maintenance"]

        func inspect(_ value: Any, path: String) {
            if let dictionary = value as? [String: Any] {
                for (key, child) in dictionary {
                    if proseKeys.contains(key), let text = child as? String {
                        for phrase in forbidden {
                            XCTAssertFalse(text.contains(phrase), "Canonical display name leaked into prose at \(path).\(key): \(phrase)")
                        }
                    }
                    inspect(child, path: "\(path).\(key)")
                }
            } else if let array = value as? [Any] {
                for (index, child) in array.enumerated() {
                    inspect(child, path: "\(path)[\(index)]")
                }
            }
        }

        for resource in ["BriefingsFixture", "GoalsFixture", "OperatingPlanFixture"] {
            let url = try XCTUnwrap(Bundle.main.url(forResource: resource, withExtension: "json"))
            let json = try JSONSerialization.jsonObject(with: Data(contentsOf: url))
            inspect(json, path: resource)
        }
    }

    func testSharedConfidencePresentationUsesExactLabelAcrossHomeAndEveryBriefing() {
        XCTAssertEqual(ConfidenceRing.presentationLabel, "CONFIDENCE")
        XCTAssertFalse(ConfidenceRing.presentationLabel.contains("GOAL"))
    }

    // MARK: - Plus Jakarta Sans is registered and actually resolves

    func testFontFileIsBundled() throws {
        let url = try XCTUnwrap(
            Bundle.main.url(forResource: "PlusJakartaSans[wght]", withExtension: "ttf"),
            "The vendored variable font must ship inside the app bundle."
        )
        let data = try Data(contentsOf: url)
        XCTAssertGreaterThan(data.count, 100_000, "The font file should be the full variable font, not a stub.")
    }

    func testInfoPlistDeclaresTheFontForRegistration() throws {
        let fonts = try XCTUnwrap(Bundle.main.infoDictionary?["UIAppFonts"] as? [String])
        XCTAssertTrue(fonts.contains("PlusJakartaSans[wght].ttf"))
    }

    /// The real, decisive check: resolving a `PlusJakartaSans.font` must
    /// actually produce a font in the Plus Jakarta Sans family — not a
    /// silent fallback to the system font, which would report a different
    /// family name (e.g. ".AppleSystemUIFont" / "SF Pro").
    func testResolvedFontIsGenuinelyPlusJakartaSansNotASilentFallback() {
        let resolved = PlusJakartaSans.uiFont(size: 17, weight: 700)
        XCTAssertEqual(resolved.familyName, "Plus Jakarta Sans")
        XCTAssertTrue(resolved.fontName.hasPrefix("PlusJakartaSans"))
    }

    func testFontWeightAxisIsActuallyAppliedNotJustTheDefaultInstance() {
        let regular = PlusJakartaSans.uiFont(size: 17, weight: 400)
        let bold = PlusJakartaSans.uiFont(size: 17, weight: 700)
        // Both resolve into the same family; the variation must still be
        // encoded (CoreText names a varied instance distinctly from the
        // bare registered PostScript name), otherwise every weight token
        // would silently render identically.
        XCTAssertNotEqual(regular.fontName, bold.fontName)
    }

    func testOutOfRangeWeightsClampToTheFontsActualDeclaredRange() {
        // Plus Jakarta Sans's own `fvar` axis is 200–800 (verified against
        // the binary before vendoring it) — CSS `font-black` (900) usages
        // render at 800 on the web too, for the same reason.
        let requestedBlack = PlusJakartaSans.uiFont(size: 17, weight: 900)
        let requestedExtraBold = PlusJakartaSans.uiFont(size: 17, weight: 800)
        XCTAssertEqual(requestedBlack.fontName, requestedExtraBold.fontName)
    }

    // MARK: - Shared disabled-primary-button rule never washes out

    /// The bug this replaces used `PhysiqueOSTheme.textPrimary` (near-white,
    /// luminance ≈0.96) as "Submit evidence"'s background. Neither
    /// established tone should come anywhere close to that — `.dark` is
    /// genuinely near-black (≈0.02); `.accent` is a saturated brand purple
    /// (≈0.6), well short of a washed-out near-white pill. The threshold
    /// below sits between "accent" and the bug's near-white value, so a
    /// regression back toward a light/washed background fails this test
    /// while both real, accepted tones keep passing.
    func testPrimaryActionButtonTonesAreNotWashedOutNearWhite() {
        for tone: PrimaryActionButton.Tone in [.accent, .dark] {
            let color = UIColor(PrimaryActionButton.backgroundColor(for: tone))
            var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
            color.getRed(&red, green: &green, blue: &blue, alpha: &alpha)
            let luminance = 0.299 * red + 0.587 * green + 0.114 * blue
            XCTAssertLessThan(luminance, 0.85, "\(tone) should not be washed out toward near-white.")
        }
    }

    /// `.dark` specifically must be genuinely dark (this is the tone
    /// "Submit evidence" uses) — not merely "not white."
    func testDarkToneIsGenuinelyDark() {
        let color = UIColor(PrimaryActionButton.backgroundColor(for: .dark))
        var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
        color.getRed(&red, green: &green, blue: &blue, alpha: &alpha)
        let luminance = 0.299 * red + 0.587 * green + 0.114 * blue
        XCTAssertLessThan(luminance, 0.2)
    }

    /// The dimmed disabled state must be visibly different from enabled
    /// (not silently 1.0) but not so transparent it becomes illegible —
    /// mirrors the web's `disabled:opacity-50`.
    func testDisabledOpacityIsVisiblyDimmedButStillLegible() {
        XCTAssertGreaterThanOrEqual(PrimaryActionButton.disabledOpacity, 0.3)
        XCTAssertLessThanOrEqual(PrimaryActionButton.disabledOpacity, 0.7)
        XCTAssertNotEqual(PrimaryActionButton.disabledOpacity, 1.0)
    }

    // MARK: - Shared tab-shell scroll clearance is real, not zero/guessed-away

    func testScrollBottomClearanceReservesRealSpaceForTheFloatingTabBar() {
        // A regression back to "no clearance" (0) or a token gesture (a
        // handful of points) would reproduce the reported bug where
        // scrolled content is obscured by the tab bar.
        XCTAssertGreaterThanOrEqual(PhysiqueOSLayout.scrollBottomClearance, 80)
    }

    // MARK: - Evidence date parsing (used by the date field's upper bound)

    func testEvidenceDateParsingRoundTripsWithoutTimezoneDrift() {
        let date = try! XCTUnwrap(EvidenceDateParsing.date(fromLocalDateString: "2026-08-28", timeZone: TimeZone(identifier: "UTC")!))
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let components = calendar.dateComponents([.year, .month, .day], from: date)
        XCTAssertEqual(components.year, 2026)
        XCTAssertEqual(components.month, 8)
        XCTAssertEqual(components.day, 28)
    }

    func testEvidenceDateParsingFailsClosedOnMalformedInput() {
        XCTAssertNil(EvidenceDateParsing.date(fromLocalDateString: "not-a-date"))
    }

    /// Regression for a real bug: the parsed `Date` is handed to
    /// `Calendar.current`-based UI (`DateField`'s `DatePicker` and its
    /// default-timezone label formatter), which reads back a `Date`'s
    /// calendar day using the DEVICE's own time zone, not UTC. A
    /// UTC-midnight anchor read back that way on any negative-UTC-offset
    /// device (every US time zone, exercised here via a fixed UTC-8
    /// calendar rather than the device's actual zone, so this doesn't
    /// depend on where the test happens to run) rolled the visible
    /// "Evidence date" back to the PREVIOUS calendar day. Local-noon
    /// anchoring preserves the selected calendar date.
    func testEvidenceDateParsingSurvivesReinterpretationInATimezoneBehindUTC() {
        let date = try! XCTUnwrap(EvidenceDateParsing.date(fromLocalDateString: "2026-08-28", timeZone: TimeZone(identifier: "America/Los_Angeles")!))
        var behindUTC = Calendar(identifier: .gregorian)
        behindUTC.timeZone = TimeZone(identifier: "America/Los_Angeles")!
        let components = behindUTC.dateComponents([.year, .month, .day], from: date)
        XCTAssertEqual(components.year, 2026)
        XCTAssertEqual(components.month, 8)
        XCTAssertEqual(components.day, 28)
    }

    func testEvidenceDateParsingPreservesExtremeOffsetsAndDSTDates() throws {
        for offset in [-12, 14] {
            let zone = try XCTUnwrap(TimeZone(secondsFromGMT: offset * 3600))
            var calendar = Calendar(identifier: .gregorian)
            calendar.timeZone = zone
            for value in ["2026-03-08", "2026-11-01"] {
                let date = try XCTUnwrap(EvidenceDateParsing.date(fromLocalDateString: value, timeZone: zone))
                let formatter = DateFormatter()
                formatter.calendar = calendar
                formatter.locale = Locale(identifier: "en_US_POSIX")
                formatter.timeZone = zone
                formatter.dateFormat = "yyyy-MM-dd"
                XCTAssertEqual(formatter.string(from: date), value)
            }
        }
        XCTAssertNil(EvidenceDateParsing.date(fromLocalDateString: "2026-02-30"))
    }

    func testNutritionCaloriesUsesADistinctGreenIdentityFromCarbohydrates() {
        let calories = UIColor(PhysiqueOSTheme.nutritionCalories)
        let carbohydrates = UIColor(PhysiqueOSTheme.macroCarbohydrates)
        XCTAssertNotEqual(calories, carbohydrates)

        var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
        calories.getRed(&red, green: &green, blue: &blue, alpha: &alpha)
        XCTAssertGreaterThan(green, red)
        XCTAssertGreaterThan(green, blue)
    }

    // MARK: - Tab order and icons — see `AppTabTests` for the full,
    // corrected Home/Goals/Log/Evidence/You coverage (this file's own tab
    // assertions were superseded by that correction and removed here to
    // avoid asserting the same contract twice from two different files).

    // MARK: - Evidence-source selection never claims canonical success

    /// `EvidenceAttachment` only describes what is staged locally in this
    /// session — it must never carry any field implying the item has been
    /// uploaded, reviewed, or confirmed (see
    /// `docs/PHYSIQUEOS_NATIVE_V1.md`, section 8).
    func testEvidenceAttachmentDistinguishesPhotoAndFileSources() {
        let photo = EvidenceAttachment(displayName: "Photo 1", source: .photoLibrary)
        let file = EvidenceAttachment(displayName: "scan.pdf", source: .files)
        XCTAssertNotEqual(photo.source, file.source)
        XCTAssertNotEqual(photo.id, file.id)
    }

    /// `EvidenceSourceMenu` is a native `Menu` (not directly unit-testable
    /// without UI automation), so this guards the one thing that can
    /// regress silently: the option set itself must stay exactly Photos +
    /// Files, in that order — no source silently added, removed, or
    /// reordered.
    func testEvidenceSourceOptionsRemainExactlyPhotosThenFiles() {
        XCTAssertEqual(EvidenceSourceOption.allCases, [.photos, .files])
    }

    // MARK: - Home greeting reflects the device's own clock, not the server's

    /// The server's `home.header.greeting` is computed from the server
    /// process's own clock (effectively UTC), not the Founder's device —
    /// a 10 PM Pacific viewing was shown "Good morning," because that
    /// instant is early morning UTC. Native must compute this from the
    /// device's own calendar/timezone instead of trusting that field.
    func testHomeGreetingUsesDeviceLocalHourAcrossAllThreeDayparts() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/Los_Angeles")!
        func date(hour: Int) -> Date {
            calendar.date(from: DateComponents(year: 2026, month: 9, day: 10, hour: hour))!
        }
        XCTAssertEqual(HomeGreeting.text(for: date(hour: 5), calendar: calendar), "Good morning,")
        XCTAssertEqual(HomeGreeting.text(for: date(hour: 11), calendar: calendar), "Good morning,")
        XCTAssertEqual(HomeGreeting.text(for: date(hour: 12), calendar: calendar), "Good afternoon,")
        XCTAssertEqual(HomeGreeting.text(for: date(hour: 16), calendar: calendar), "Good afternoon,")
        XCTAssertEqual(HomeGreeting.text(for: date(hour: 17), calendar: calendar), "Good evening,")
        XCTAssertEqual(HomeGreeting.text(for: date(hour: 22), calendar: calendar), "Good evening,")
        XCTAssertEqual(HomeGreeting.text(for: date(hour: 0), calendar: calendar), "Good evening,")
        XCTAssertEqual(HomeGreeting.text(for: date(hour: 4), calendar: calendar), "Good evening,")
    }

    /// The exact reported bug: 10 PM Pacific must never resolve to
    /// "Good morning," regardless of which timezone the calling process
    /// happens to be running in — this pins the greeting to the supplied
    /// calendar's timezone, not the host's default.
    func testHomeGreetingAtTenPMPacificIsEveningRegardlessOfHostTimezone() {
        var pacific = Calendar(identifier: .gregorian)
        pacific.timeZone = TimeZone(identifier: "America/Los_Angeles")!
        let tenPMPacific = pacific.date(from: DateComponents(year: 2026, month: 9, day: 10, hour: 22))!
        XCTAssertEqual(HomeGreeting.text(for: tenPMPacific, calendar: pacific), "Good evening,")

        // The same instant, read through a UTC calendar, is early morning —
        // exactly the mismatch that produced the original bug when the
        // computation ran in the server's (UTC) clock instead of the
        // viewer's own.
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC")!
        XCTAssertEqual(HomeGreeting.text(for: tenPMPacific, calendar: utc), "Good morning,")
    }

    // MARK: - Global appearance preference and semantic palette

    @MainActor
    func testAppearanceFreshInstallDefaultsToSystemWithoutPersistingAValue() throws {
        let defaults = try appearanceDefaults()
        let store = AppAppearanceStore(defaults: defaults)
        XCTAssertEqual(store.selection, .system)
        XCTAssertNil(store.preferredColorScheme)
        XCTAssertNil(defaults.object(forKey: AppAppearanceStore.persistenceKey))
    }

    @MainActor
    func testExplicitAppearancePersistsAndSystemClearsTheOverride() throws {
        let defaults = try appearanceDefaults()
        let store = AppAppearanceStore(defaults: defaults)
        store.select(.dark)
        XCTAssertEqual(AppAppearanceStore(defaults: defaults).selection, .dark)
        XCTAssertEqual(defaults.string(forKey: AppAppearanceStore.persistenceKey), "dark")

        store.select(.light)
        XCTAssertEqual(AppAppearanceStore(defaults: defaults).selection, .light)
        XCTAssertEqual(defaults.string(forKey: AppAppearanceStore.persistenceKey), "light")

        store.select(.system)
        XCTAssertNil(AppAppearanceStore(defaults: defaults).preferredColorScheme)
        XCTAssertNil(defaults.object(forKey: AppAppearanceStore.persistenceKey))
    }

    @MainActor
    func testInvalidAppearanceFallsBackSafelyAndResetIsDeterministic() throws {
        let defaults = try appearanceDefaults()
        defaults.set("legacy-sepia", forKey: AppAppearanceStore.persistenceKey)
        let store = AppAppearanceStore(defaults: defaults)
        XCTAssertEqual(store.selection, .system)
        XCTAssertNil(defaults.object(forKey: AppAppearanceStore.persistenceKey))
        store.select(.dark)
        store.resetForTesting()
        XCTAssertEqual(store.selection, .system)
        XCTAssertNil(defaults.object(forKey: AppAppearanceStore.persistenceKey))
    }

    // MARK: Independent Apple Watch appearance (Lane A addendum)

    @MainActor
    func testWatchAppearanceDefaultsToDarkAndIsNeverInferredFromTheIPhone() throws {
        for iPhone in AppAppearance.allCases {
            let defaults = try appearanceDefaults()
            if iPhone != .system { defaults.set(iPhone.rawValue, forKey: AppAppearanceStore.persistenceKey) }
            let store = AppAppearanceStore(defaults: defaults)
            XCTAssertEqual(store.selection, iPhone)
            XCTAssertEqual(store.watchSelection, .dark, "Unset Watch is Dark even when iPhone is \(iPhone)")
            XCTAssertNil(defaults.object(forKey: AppAppearanceStore.watchPersistenceKey), "Default is not written")
        }
    }

    @MainActor
    func testIPhoneAndWatchAppearancesAreIndependentInEveryCombination() throws {
        let combinations: [(AppAppearance, WatchAppearancePreference)] = [
            (.light, .dark), (.dark, .mineralLight), (.system, .dark), (.system, .mineralLight),
        ]
        for (iPhone, watch) in combinations {
            let defaults = try appearanceDefaults()
            let store = AppAppearanceStore(defaults: defaults)
            store.select(iPhone)
            store.selectWatch(watch)
            let relaunched = AppAppearanceStore(defaults: defaults)
            XCTAssertEqual(relaunched.selection, iPhone, "\(iPhone)+\(watch)")
            XCTAssertEqual(relaunched.watchSelection, watch, "\(iPhone)+\(watch)")
        }
    }

    @MainActor
    func testChangingOneDeviceAppearanceNeverChangesTheOther() throws {
        let defaults = try appearanceDefaults()
        let store = AppAppearanceStore(defaults: defaults)
        store.selectWatch(.mineralLight)
        for iPhone in AppAppearance.allCases {
            store.select(iPhone)
            XCTAssertEqual(store.watchSelection, .mineralLight, "iPhone \(iPhone) left the Watch alone")
        }
        store.select(.dark)
        for watch in WatchAppearancePreference.allCases {
            store.selectWatch(watch)
            XCTAssertEqual(store.selection, .dark, "Watch \(watch) left the iPhone alone")
        }
        XCTAssertEqual(defaults.string(forKey: AppAppearanceStore.persistenceKey), "dark")
        XCTAssertEqual(defaults.string(forKey: AppAppearanceStore.watchPersistenceKey), "mineralLight", "Last Watch choice")
    }

    @MainActor
    func testUnknownStoredWatchAppearanceDecodesToDark() throws {
        let defaults = try appearanceDefaults()
        defaults.set("system", forKey: AppAppearanceStore.watchPersistenceKey)
        XCTAssertEqual(AppAppearanceStore(defaults: defaults).watchSelection, .dark)
        XCTAssertNil(WatchAppearancePreference.decode(42))
        XCTAssertNil(WatchAppearancePreference.decode(String(repeating: "x", count: 500)))
        XCTAssertEqual(WatchAppearancePreference.decode("mineralLight"), .mineralLight)
    }

    /// The Watch appearance rides the established replace-whole application
    /// context next to the projection and Daily Totals slots.
    @MainActor
    func testWatchAppearanceTravelsInTheEstablishedApplicationContext() {
        let projection = Data("p".utf8), totals = Data("t".utf8)
        let context = PhoneWatchWorkoutConnectivityBridge.applicationContext(
            projection: projection, dailyTotals: totals, appearance: .mineralLight
        )
        XCTAssertEqual(context[WatchWorkoutContract.applicationContextProjectionKey] as? Data, projection)
        XCTAssertEqual(context[WatchWorkoutContract.applicationContextDailyTotalsKey] as? Data, totals)
        XCTAssertEqual(context[WatchWorkoutContract.applicationContextAppearanceKey] as? String, "mineralLight")

        let appearanceOnly = PhoneWatchWorkoutConnectivityBridge.applicationContext(
            projection: nil, dailyTotals: nil, appearance: .dark
        )
        XCTAssertEqual(appearanceOnly.count, 1, "Not blocked on a projection: an unconnected Watch still gets it later")
    }

    @MainActor
    func testWatchAppearanceSettingMirrorsTheIPhoneAppearanceTitles() {
        XCTAssertEqual(AppAppearance.allCases.map(\.title), ["System", "Dark", "Mineral Light"])
        XCTAssertEqual(WatchAppearancePreference.allCases.map(\.title), ["Dark", "Mineral Light"],
                       "watchOS has no system appearance, so there is no System option")
    }

    @MainActor
    func testAppearanceSchemeMappingKeepsSystemUnforced() {
        XCTAssertNil(AppAppearance.system.preferredColorScheme)
        XCTAssertEqual(AppAppearance.dark.preferredColorScheme, .dark)
        XCTAssertEqual(AppAppearance.light.preferredColorScheme, .light)
    }

    func testLockedDarkAndMineralLightCoreContrast() {
        for style: UIUserInterfaceStyle in [.dark, .light] {
            let traits = UITraitCollection(userInterfaceStyle: style)
            let background = UIColor(PhysiqueOSTheme.background).resolvedColor(with: traits)
            let surface = UIColor(PhysiqueOSTheme.surfaceElevated).resolvedColor(with: traits)
            let primary = UIColor(PhysiqueOSTheme.textPrimary).resolvedColor(with: traits)
            let secondary = UIColor(PhysiqueOSTheme.textSecondary).resolvedColor(with: traits)
            XCTAssertGreaterThanOrEqual(Self.contrast(primary, background), 7.0)
            XCTAssertGreaterThanOrEqual(Self.contrast(primary, surface), 7.0)
            XCTAssertGreaterThanOrEqual(Self.contrast(secondary, background), 4.5)
            XCTAssertNotEqual(background, surface)
        }
    }

    func testRedesignSemanticInkMaintainsAccessibleContrast() {
        for style: UIUserInterfaceStyle in [.dark, .light] {
            let traits = UITraitCollection(userInterfaceStyle: style)
            let canvas = UIColor(PhysiqueOSTheme.redesignCanvas).resolvedColor(with: traits)
            let paper = UIColor(PhysiqueOSTheme.redesignPaper).resolvedColor(with: traits)
            let ink = UIColor(PhysiqueOSTheme.redesignInk).resolvedColor(with: traits)
            let secondary = UIColor(PhysiqueOSTheme.redesignInkSecondary).resolvedColor(with: traits)
            XCTAssertGreaterThanOrEqual(Self.contrast(ink, canvas), 7.0)
            XCTAssertGreaterThanOrEqual(Self.contrast(ink, paper), 7.0)
            XCTAssertGreaterThanOrEqual(Self.contrast(secondary, canvas), 4.5)
        }
    }

    private func appearanceDefaults() throws -> UserDefaults {
        let suite = "SharedUITests.appearance.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defaults.removePersistentDomain(forName: suite)
        return defaults
    }

    private static func contrast(_ first: UIColor, _ second: UIColor) -> Double {
        func luminance(_ color: UIColor) -> Double {
            var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
            color.getRed(&red, green: &green, blue: &blue, alpha: &alpha)
            func channel(_ value: CGFloat) -> Double {
                let value = Double(value)
                return value <= 0.03928 ? value / 12.92 : pow((value + 0.055) / 1.055, 2.4)
            }
            return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue)
        }
        let brighter = max(luminance(first), luminance(second))
        let darker = min(luminance(first), luminance(second))
        return (brighter + 0.05) / (darker + 0.05)
    }
}
