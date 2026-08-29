import SwiftUI

/// Minimal shared presentation tokens for the Stage 1 foundation.
///
/// This is deliberately not a design system: it exists only to keep the
/// five placeholder tab screens visually consistent with each other and
/// with a restrained dark native identity, so the next slice replaces
/// placeholders with real screens rather than also fixing ad hoc styling.
/// Typography, color identity, and card hierarchy remain product-design
/// decisions for later screen work, not this foundation slice.
enum PhysiqueOSTheme {
    static let background = Color(red: 0.05, green: 0.055, blue: 0.07)
    static let surface = Color(red: 0.11, green: 0.12, blue: 0.145)
    static let accent = Color(red: 0.42, green: 0.78, blue: 0.65)
    static let textPrimary = Color.white
    static let textSecondary = Color.white.opacity(0.6)
}
