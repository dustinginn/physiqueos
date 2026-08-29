import XCTest
import SwiftUI
@testable import PhysiqueOS

/// Regression coverage for this patch's shared/root fixes: the brand font,
/// the disabled-primary-button rule, and the tab-shell scroll clearance.
/// These run inside the app process (`TEST_HOST`), so the app's own
/// `UIAppFonts`-registered font is genuinely available to these assertions
/// — this is not a mock or a fixture stand-in.
final class SharedUITests: XCTestCase {

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
        let date = try! XCTUnwrap(EvidenceDateParsing.date(fromLocalDateString: "2026-08-28"))
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
}
