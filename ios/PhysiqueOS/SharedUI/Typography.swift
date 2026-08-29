import SwiftUI

/// PhysiqueOS's native typography, source-derived from the web application.
///
/// The web app (`src/app/layout.js`) loads **Plus Jakarta Sans** as a
/// self-hosted variable font (`next/font/local`, weights 200–800,
/// `@fontsource-variable/plus-jakarta-sans`) — not a system/web-safe stack,
/// and not Google Fonts' CDN (`scripts/checkFontBuild.mjs` asserts the
/// build contains no `fonts.googleapis.com`/`fonts.gstatic.com` reference
/// and no Arial-fallback-only build). It materially contributes to
/// PhysiqueOS's identity: a rounded, geometric sans distinct from SF Pro.
///
/// Native renders with the **San Francisco system font** instead of
/// embedding Plus Jakarta Sans, because the actual font binary is not
/// obtainable inside this task's bounds: it ships only via the
/// `@fontsource-variable/plus-jakarta-sans` npm package, and this
/// environment has neither `node` nor `npm` installed to fetch/extract it,
/// nor any vendored copy already committed to the repository (`node_modules`
/// is gitignored and absent; no font binary is tracked in git; `public/`
/// contains no font asset). Downloading the font from the network was not
/// attempted — that requires the user's explicit permission this task did
/// not request, and the source-of-truth instruction for this slice is
/// repository inspection, not external fetches. See
/// docs/PHYSIQUEOS_NATIVE_V1.md for the resulting Founder decision this
/// creates: whether to supply the actual `.ttf`/`.otf` font files for a
/// later slice to embed via `UIFontDescriptor`/`Font.custom`, which would
/// need no new dependency (Plus Jakarta Sans is SIL Open Font License,
/// free) and no paid service.
///
/// Every value below is copied from an actual Tailwind arbitrary class in
/// the current web source (`text-[Npx]`, `font-*`, `tracking-[Nem]`,
/// `uppercase`) — not estimated. Screens must use `PhysiqueOSTypography`
/// tokens through `.physiqueOSFont(_:)` rather than picking raw
/// `.system(size:weight:)` values, so a future correction (or the eventual
/// switch to the real brand font) happens in one place.
enum PhysiqueOSTypography {
    /// One named point in the hierarchy: a base point size, a weight, and
    /// optional em-relative tracking/case — CSS's `em` unit is a fraction
    /// of the (rendered) font size, so tracking is stored the same way and
    /// resolved against the *scaled* size, not the base size, at render
    /// time.
    struct Style {
        let size: CGFloat
        let weight: Font.Weight
        var trackingEm: CGFloat = 0
        var uppercase: Bool = false
    }

    // MARK: Header (PageHeader.jsx)
    /// `text-[17px] font-medium` — the "Good morning," greeting line.
    static let greeting = Style(size: 17, weight: .medium)
    /// `text-[34px] font-bold leading-none` — the Founder's name.
    static let displayName = Style(size: 34, weight: .bold)

    // MARK: Section labels (SectionTitle.jsx)
    /// `text-[11px] font-bold uppercase tracking-[0.12em]` — "TRAJECTORY",
    /// "YOUR GOALS", "TODAY'S PRIORITIES", a briefing card's section label.
    static let sectionLabel = Style(size: 11, weight: .bold, trackingEm: 0.12, uppercase: true)

    // MARK: Hero (HomeHeroCard.jsx)
    /// `text-[10px] font-extrabold uppercase tracking-[0.08em]` — the goal
    /// name eyebrow above the hero headline.
    static let heroEyebrow = Style(size: 10, weight: .heavy, trackingEm: 0.08, uppercase: true)
    /// `text-[18px] font-extrabold leading-[1.15]` — "On track.", etc.
    static let heroHeadline = Style(size: 18, weight: .heavy)
    /// `text-[12px] font-medium leading-4` — the hero support line.
    static let heroSupportLine = Style(size: 12, weight: .medium)
    /// `text-[10px] font-medium` — "Projected Finish" / "Days Remaining".
    static let metricLabel = Style(size: 10, weight: .medium)
    /// `text-[14px] font-extrabold leading-none` — the metric's value.
    static let metricValue = Style(size: 14, weight: .heavy)

    // MARK: Goals (GoalRow.jsx)
    /// `text-[9px] font-bold uppercase tracking-[0.12em]` — "PRIMARY GOAL".
    static let primaryGoalEyebrow = Style(size: 9, weight: .bold, trackingEm: 0.12, uppercase: true)
    /// `text-[15px] font-semibold leading-tight` — the goal title.
    static let goalTitle = Style(size: 15, weight: .semibold)
    /// `text-[12px] font-medium` — "16.2% → 12.0%".
    static let goalRange = Style(size: 12, weight: .medium)
    /// `text-[18px] font-bold leading-none` — the progress percentage.
    static let goalProgressValue = Style(size: 18, weight: .bold)
    /// `text-[7px] font-bold uppercase tracking-[0.08em]` — "COMPLETE".
    static let goalProgressCaption = Style(size: 7, weight: .bold, trackingEm: 0.08, uppercase: true)
    /// `text-[13px] font-bold leading-tight` — a supporting goal's status
    /// ("Maintaining", "On track").
    static let goalStatusValue = Style(size: 13, weight: .bold)
    /// `text-[9px] font-bold uppercase tracking-[0.08em]` — a supporting
    /// goal's detail line. The web applies `uppercase` unconditionally
    /// here regardless of the source string's own casing.
    static let goalStatusDetail = Style(size: 9, weight: .bold, trackingEm: 0.08, uppercase: true)

    // MARK: Today's priorities (FocusTile.jsx)
    /// `text-[10.5px] font-semibold leading-[1.15]`.
    static let focusLabel = Style(size: 10.5, weight: .semibold)
    /// `text-[10px] font-medium leading-[1.15]`.
    static let focusSubtitle = Style(size: 10, weight: .medium)
    /// `text-[9px] font-extrabold` — the `actionLabel` badge ("Needs Setup").
    static let focusBadge = Style(size: 9, weight: .heavy)

    // MARK: Briefing card (LatestAnalysisCard.jsx)
    /// `text-[11px] font-bold` — the "View" link.
    static let briefingViewLink = Style(size: 11, weight: .bold)
    /// `text-[16px] font-bold leading-tight`.
    static let briefingTitle = Style(size: 16, weight: .bold)
    /// `text-[11px] font-semibold` — the relative date.
    static let briefingTimestamp = Style(size: 11, weight: .semibold)
    /// `text-[13px] font-medium leading-5`.
    static let briefingPrompt = Style(size: 13, weight: .medium)

    // MARK: Primary action (ActionButton.jsx)
    /// `text-[17px] font-semibold`.
    static let primaryActionLabel = Style(size: 17, weight: .semibold)

    // MARK: Floating sheet (FloatingSheet.jsx)
    /// `text-lg font-extrabold` (Tailwind default scale: 18px).
    static let sheetTitle = Style(size: 18, weight: .heavy)
    /// `text-xs font-semibold` (Tailwind default scale: 12px).
    static let sheetDescription = Style(size: 12, weight: .semibold)
    /// `text-sm font-extrabold` (Tailwind default scale: 14px) — a
    /// confidence-detail body heading ("What supports confidence", …).
    static let sheetSectionHeading = Style(size: 14, weight: .heavy)
    /// `text-xs font-semibold leading-5` (Tailwind default scale: 12px) —
    /// confidence-detail list items and the uncertainty-statement box.
    static let sheetBody = Style(size: 12, weight: .semibold)

    // MARK: Screen chrome (LogHubScreen.jsx header — reusable by any screen
    // that needs an eyebrow/title/subtitle header, not just Log)
    /// `text-sm font-semibold uppercase tracking-[0.12em]` (Tailwind
    /// default scale: 14px).
    static let screenEyebrow = Style(size: 14, weight: .semibold, trackingEm: 0.12, uppercase: true)
    /// `text-3xl font-extrabold leading-tight` (Tailwind default scale: 30px).
    static let screenTitle = Style(size: 30, weight: .heavy)
    /// `text-base leading-7`, no weight class (Tailwind default scale: 16px, regular).
    static let screenSubtitle = Style(size: 16, weight: .regular)

    // MARK: Log cards (LogHubScreen.jsx, UploadAnythingForm.jsx)
    /// `text-xl font-black leading-tight` (Tailwind default scale: 20px) —
    /// "Training Logger", "Upload".
    static let cardHeading20 = Style(size: 20, weight: .black)
    /// `text-base font-extrabold` (Tailwind default scale: 16px) —
    /// "Logged Today", "Uploads ready to review".
    static let cardHeading16 = Style(size: 16, weight: .heavy)
    /// `text-sm font-medium leading-6` (Tailwind default scale: 14px) —
    /// a card's descriptive subtitle line.
    static let cardBody14Medium = Style(size: 14, weight: .medium)
    /// `text-xs font-extrabold uppercase tracking-[0.08em]` (Tailwind
    /// default scale: 12px) — a Logged-Today row's eyebrow ("TRAINING").
    static let rowEyebrow = Style(size: 12, weight: .heavy, trackingEm: 0.08, uppercase: true)
    /// `text-sm font-semibold leading-5` (Tailwind default scale: 14px) —
    /// a Logged-Today row's summary line.
    static let rowSummary = Style(size: 14, weight: .semibold)
    /// `text-xs font-medium` (Tailwind default scale: 12px) — the most
    /// common small secondary/caption copy across Log's cards.
    static let caption12Medium = Style(size: 12, weight: .medium)
    /// `text-xs font-semibold` (Tailwind default scale: 12px) — dates and
    /// similarly weighted small labels.
    static let caption12Semibold = Style(size: 12, weight: .semibold)
    /// `text-sm`, no weight class (Tailwind default scale: 14px, regular).
    static let body14Regular = Style(size: 14, weight: .regular)
    /// `text-sm font-extrabold` (Tailwind default scale: 14px) — the
    /// single most repeated label/button style across Log: field labels,
    /// review-card titles, "Save weigh-in"/"Submit evidence" buttons.
    static let label14Heavy = Style(size: 14, weight: .heavy)
    /// `text-sm font-bold` (Tailwind default scale: 14px) — success/error
    /// callout banners.
    static let calloutStrong = Style(size: 14, weight: .bold)
    /// `text-2xl font-extrabold` (Tailwind default scale: 24px) — the
    /// "Uploading your evidence…" busy-state heading.
    static let uploadingHeading24 = Style(size: 24, weight: .heavy)
    /// `text-lg font-black` (Tailwind default scale: 18px) — the weigh-in
    /// weight value itself.
    static let weighInValue18 = Style(size: 18, weight: .black)

    // MARK: Confidence ring (ProgressRing.jsx)
    // The ring's own numeral and label are sized purely as a fraction of
    // the ring's diameter, exactly as the web computes them — not of the
    // user's preferred text size. This matches both the web source and the
    // common native convention for a fixed circular badge (e.g. Apple's
    // own Activity rings do not scale their numeral with Dynamic Type
    // either); VoiceOver still receives the exact value via
    // `accessibilityValue`, so no information is lost to accessibility.
    /// `Math.max(22, Math.round(size * 0.25))`, `font-bold`, no tracking.
    static func confidenceValueFontSize(ringDiameter: CGFloat) -> CGFloat {
        max(22, (ringDiameter * 0.25).rounded())
    }
    /// `Math.max(8, Math.round(size * 0.07))`,
    /// `font-bold uppercase tracking-[0.035em]`.
    static func confidenceLabelFontSize(ringDiameter: CGFloat) -> CGFloat {
        max(8, (ringDiameter * 0.07).rounded())
    }
}

private struct PhysiqueOSFontModifier: ViewModifier {
    @ScaledMetric private var scaledSize: CGFloat
    let weight: Font.Weight
    let trackingEm: CGFloat
    let uppercase: Bool

    init(_ style: PhysiqueOSTypography.Style) {
        _scaledSize = ScaledMetric(wrappedValue: style.size)
        weight = style.weight
        trackingEm = style.trackingEm
        uppercase = style.uppercase
    }

    func body(content: Content) -> some View {
        content
            .font(.system(size: scaledSize, weight: weight))
            .tracking(scaledSize * trackingEm)
            .textCase(uppercase ? .uppercase : nil)
    }
}

extension View {
    /// Applies a `PhysiqueOSTypography` token: base size, weight, and
    /// em-relative tracking/case, all scaled together under Dynamic Type
    /// via `@ScaledMetric`. Color is deliberately not part of this token —
    /// apply `.foregroundStyle(_:)` separately, since the same size/weight
    /// often maps to different colors depending on context.
    func physiqueOSFont(_ style: PhysiqueOSTypography.Style) -> some View {
        modifier(PhysiqueOSFontModifier(style))
    }
}
