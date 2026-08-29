import SwiftUI
import CoreText

/// PhysiqueOS's native brand font — the same self-hosted Plus Jakarta Sans
/// variable font the web app loads (`src/app/layout.js`), vendored at
/// `Resources/Fonts/PlusJakartaSans[wght].ttf` (SIL Open Font License; see
/// `ATTRIBUTION.md` in that directory) and registered via `UIAppFonts` in
/// `Info.plist`.
///
/// This file's only PostScript name is `PlusJakartaSans-Regular` — its
/// `fvar` table declares seven named instances (ExtraLight…ExtraBold) but,
/// verified directly against the binary, none of them declare a
/// `postscriptNameID`, so CoreText cannot expose them as separately
/// nameable fonts the way `UIFont(name:)` normally finds distinct weights.
/// Specific weights are instead obtained by setting the `wght` variation
/// axis directly on a font descriptor built from the one registered name —
/// the standard, fully-supported CoreText mechanism for variable fonts,
/// requiring no third-party dependency.
enum PlusJakartaSans {
    private static let basePostScriptName = "PlusJakartaSans-Regular"
    /// The four-character-code identifier for the `wght` axis, as an
    /// `NSNumber` (the form `kCTFontVariationAttribute` expects).
    private static let weightAxisIdentifier = NSNumber(value: 0x77676874)

    /// Builds a `Font` at `size` for a CSS-style numeric weight (100–900).
    /// Plus Jakarta Sans's actual declared axis range is 200–800 (matching
    /// the web's own `next/font/local` configuration, `weight: "200 800"`),
    /// so values outside that range are clamped rather than silently
    /// falling back to a different font — this is also what the web build
    /// itself effectively does for its few `font-black` (900) uses, which
    /// render at the font's true maximum (800/ExtraBold).
    static func font(size: CGFloat, weight: CGFloat) -> Font {
        Font(uiFont(size: size, weight: weight))
    }

    static func uiFont(size: CGFloat, weight: CGFloat) -> UIFont {
        let clamped = min(max(weight, 200), 800)
        let descriptor = UIFontDescriptor(name: basePostScriptName, size: size)
            .addingAttributes([
                UIFontDescriptor.AttributeName(rawValue: kCTFontVariationAttribute as String):
                    [weightAxisIdentifier: clamped],
            ])
        return UIFont(descriptor: descriptor, size: size)
    }
}

extension Font.Weight {
    /// Maps SwiftUI's named weights to the CSS-style numeric scale Plus
    /// Jakarta Sans's `wght` axis and the web's own Tailwind classes both
    /// use, so `PhysiqueOSTypography.Style` values need no change to
    /// switch fonts.
    var numericValue: CGFloat {
        switch self {
        case .ultraLight: 200
        case .thin: 200
        case .light: 300
        case .regular: 400
        case .medium: 500
        case .semibold: 600
        case .bold: 700
        case .heavy: 800
        case .black: 800 // clamped — see `PlusJakartaSans.font`.
        default: 400
        }
    }
}
