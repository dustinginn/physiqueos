import SwiftUI

/// PhysiqueOS's shared primary-action control, covering both button colors
/// already established on the web (`ActionButton.jsx`'s accent-tinted
/// style; `UploadAnythingForm.jsx`'s near-black `bg-slate-950` style for
/// "Submit evidence") and — critically — a **single shared disabled-state
/// rule**, so no future primary button re-derives (or regresses) its own.
///
/// No dedicated web documentation or test enshrines a "disabled primary
/// button" rule by name — this was verified by searching `docs/`, `src/`
/// for "washed"/"disabled button", and the shared `ActionButton.jsx`/
/// `button.jsx` components directly (checked before writing this file, not
/// assumed). The actual, consistently-applied web pattern found in source
/// is simpler and is what this type mirrors exactly: `disabled:opacity-50`
/// applied to an already-dark/saturated background
/// (`UploadAnythingForm.jsx`'s "Submit evidence"/"Save weigh-in" buttons).
/// Dimming an already-dark color stays dark; the earlier native bug this
/// replaces used a *light* base color, which is what actually washed out.
struct PrimaryActionButton: View {
    enum Tone {
        /// `bg-[var(--primary)]` — Home's CTA, Log's "Save weigh-in".
        case accent
        /// `bg-slate-950` — Log's "Submit evidence".
        case dark
    }

    /// Mirrors the web's `disabled:opacity-50` exactly: dim the whole
    /// control uniformly rather than only the background, and only ever
    /// starting from a dark/saturated tone (never a light one) so the
    /// dimmed result reads as "muted dark," not "washed out." Named and
    /// internal (not `private`) so a test can assert it stays in a
    /// sensible "visibly dimmed but still legible" range.
    static let disabledOpacity: Double = 0.5

    let title: String
    var tone: Tone = .accent
    var isEnabled: Bool = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .physiqueOSFont(PhysiqueOSTypography.primaryActionLabel)
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(Self.backgroundColor(for: tone))
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled)
        .opacity(isEnabled ? 1 : Self.disabledOpacity)
        .accessibilityAddTraits(.isButton)
        .accessibilityLabel(title)
    }

    /// Internal (not `private`) so a test can assert the "dark" tone is
    /// actually dark — the earlier native bug this component replaces used
    /// a *light* base color for "Submit evidence," which is what washed
    /// out once dimmed for the disabled state.
    static func backgroundColor(for tone: Tone) -> Color {
        switch tone {
        case .accent: PhysiqueOSTheme.accent
        case .dark: PhysiqueOSTheme.background
        }
    }
}
