import SwiftUI

/// One complete Watch palette: the locked utility translation's semantic
/// tokens (`utility-surfaces-design-20261004` + acceptance corrections).
/// Every screen reads these roles; no screen swaps colors by appearance.
struct WatchPalette: Equatable {
    var background: Color
    /// Quiet cell (`utility.surface`).
    var surface: Color
    /// The current set's cell.
    var secondarySurface: Color
    var progressTrack: Color
    var purple: Color
    var text: Color
    var secondaryText: Color
    var muted: Color
    var success: Color
    var warning: Color
    var destructive: Color
    /// Label color on filled purple / amber actions.
    var onPrimary: Color
    /// Metric icon accents: the shipping production identity, retained by
    /// the Founder's acceptance correction (light: same hue, darkened).
    var timeAccent: Color
    var activeEnergyAccent: Color
    var totalEnergyAccent: Color
    var nutritionAccent: Color
    var heartRateAccent: Color
    /// Always-On / display-inactive treatment (same content, dimmer).
    var reducedSaturation: Double
    var reducedBrightness: Double
    /// watchOS always draws the system time in white. On a light palette a
    /// compact ink capsule behind the time keeps it legible (Founder-selected
    /// Option A, 2026-10-06); Dark needs none.
    var clockCapsule: Color? = nil
    /// The primary workout action (Complete Set / Finish): the iPhone Logger's
    /// Finish Workout amber for this appearance, with its dark ink label
    /// (`WorkoutPrimaryActionToken`, Founder decision 2026-10-08).
    var workoutPrimary: Color = Color(watchHex: WorkoutPrimaryActionToken.darkHex)
    var onWorkoutPrimary: Color = Color(watchHex: WorkoutPrimaryActionToken.foregroundHex)

    /// OLED Dark (the default).
    static let dark = WatchPalette(
        background: Color(watchHex: 0x061019),
        surface: Color(watchHex: 0x0F1C2A),
        secondarySurface: Color(watchHex: 0x132735),
        progressTrack: Color(watchHex: 0x20303C),
        purple: Color(watchHex: 0xAA98FF),
        text: Color(watchHex: 0xF3F8FA),
        secondaryText: Color(watchHex: 0xC3D2D9),
        muted: Color(watchHex: 0x92A5AF),
        success: Color(watchHex: 0x55E39A),
        warning: Color(watchHex: 0xEFB84F),
        destructive: Color(watchHex: 0xFF697A),
        onPrimary: Color(watchHex: 0x061019),
        timeAccent: Color(watchHex: 0x60A5FA),
        activeEnergyAccent: Color(watchHex: 0xFBBF24),
        totalEnergyAccent: Color(watchHex: 0x4ADE80),
        nutritionAccent: Color(watchHex: 0xC084FC),
        heartRateAccent: Color(watchHex: 0xFF697A),
        reducedSaturation: 0.45,
        reducedBrightness: -0.08
    )

    /// Mineral Light: the locked light Watch board (paper cells on mineral,
    /// ink text, white labels on filled actions). Quiet labels use the
    /// acceptance board's #5B7179, which stays legible on paper.
    static let mineralLight = WatchPalette(
        background: Color(watchHex: 0xE8ECE5),
        surface: Color(watchHex: 0xFBFAF4),
        secondarySurface: Color(watchHex: 0xD5ECE6),
        progressTrack: Color(watchHex: 0xCBD5D1),
        purple: Color(watchHex: 0x5C3FD2),
        text: Color(watchHex: 0x102431),
        secondaryText: Color(watchHex: 0x526970),
        muted: Color(watchHex: 0x5B7179),
        success: Color(watchHex: 0x16875F),
        warning: Color(watchHex: 0xC88228),
        destructive: Color(watchHex: 0xB83D4B),
        onPrimary: .white,
        timeAccent: Color(watchHex: 0x2563B8),
        activeEnergyAccent: Color(watchHex: 0xA85A00),
        totalEnergyAccent: Color(watchHex: 0x137847),
        nutritionAccent: Color(watchHex: 0x7540B8),
        heartRateAccent: Color(watchHex: 0xC73850),
        reducedSaturation: 0.5,
        reducedBrightness: -0.05,
        clockCapsule: Color(watchHex: 0x102431),
        workoutPrimary: Color(watchHex: WorkoutPrimaryActionToken.mineralLightHex),
        onWorkoutPrimary: Color(watchHex: WorkoutPrimaryActionToken.foregroundHex)
    )

    static func of(_ appearance: WatchAppearancePreference) -> WatchPalette {
        switch appearance {
        case .dark: .dark
        case .mineralLight: .mineralLight
        }
    }

    var colorScheme: ColorScheme { self == .mineralLight ? .light : .dark }
}

/// Semantic Watch tokens resolved against the active palette. The root view
/// sets `current` from the Founder's Watch appearance and rebuilds the tree
/// when it changes, so every screen resolves the same roles.
enum WatchPhysiqueOSTheme {
    nonisolated(unsafe) static var current: WatchPalette = .dark

    static var background: Color { current.background }
    static var surface: Color { current.surface }
    static var secondarySurface: Color { current.secondarySurface }
    static var progressTrack: Color { current.progressTrack }
    static var purple: Color { current.purple }
    static var text: Color { current.text }
    static var secondaryText: Color { current.secondaryText }
    static var muted: Color { current.muted }
    static var success: Color { current.success }
    static var warning: Color { current.warning }
    static var destructive: Color { current.destructive }
    static var onPrimary: Color { current.onPrimary }
    static var workoutPrimary: Color { current.workoutPrimary }
    static var onWorkoutPrimary: Color { current.onWorkoutPrimary }
    /// Set progress shares the success green.
    static var progress: Color { current.success }
    static var timeAccent: Color { current.timeAccent }
    static var activeEnergyAccent: Color { current.activeEnergyAccent }
    static var totalEnergyAccent: Color { current.totalEnergyAccent }
    static var nutritionAccent: Color { current.nutritionAccent }
    static var heartRateAccent: Color { current.heartRateAccent }
}

extension Color {
    init(watchHex hex: UInt32) {
        self.init(
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255
        )
    }
}

/// Watch typography: Plus Jakarta Sans for product-owned labels, values and
/// controls (the utility translation's family). Sizes are the locked board's
/// true-point geometry (205 x 251 pt, 49 mm), with 7 pt board labels raised to
/// an 8 pt legibility floor per the package's Watch type rule.
enum WatchType {
    static func font(_ size: CGFloat, _ weight: CGFloat) -> Font {
        PlusJakartaSans.font(size: size, weight: weight)
    }

    /// Reflowing text (panels, confirmations, summary) grows at the
    /// accessibility Dynamic Type sizes, capped so a page scrolls instead of
    /// clipping. watchOS defaults larger cases to an above-`large` size, so
    /// the standard sizes keep the board geometry on every case. The fixed
    /// execution page keeps its own fit-to-screen sizing.
    static func scale(_ size: DynamicTypeSize) -> CGFloat {
        switch size {
        case .accessibility1, .accessibility2: return 1.2
        case .accessibility3, .accessibility4, .accessibility5: return 1.35
        default: return 1
        }
    }

    static let eyebrowTracking: CGFloat = 0.09
}

/// A centered panel title (18 pt / 760), the locked board's `watch-panel-title`.
struct WatchPanelTitle: View {
    let text: String
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    init(_ text: String) { self.text = text }

    var body: some View {
        let scale = WatchType.scale(dynamicTypeSize)
        let size = 18 * scale
        // At the default size a title keeps the board's two lines, shrinking
        // slightly if needed; larger Dynamic Type sizes reflow freely.
        Text(text)
            .font(WatchType.font(size, 760))
            .tracking(-0.025 * size)
            .multilineTextAlignment(.center)
            .lineLimit(scale == 1 ? 2 : nil)
            .minimumScaleFactor(scale == 1 ? 0.8 : 1)
            .frame(maxWidth: .infinity)
    }
}

/// Supporting copy (10 pt, secondary text, 1.3 line height).
struct WatchPanelCopy: View {
    let text: String
    var color: Color = WatchPhysiqueOSTheme.secondaryText
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    init(_ text: String, color: Color = WatchPhysiqueOSTheme.secondaryText) {
        self.text = text
        self.color = color
    }

    var body: some View {
        let size = 10 * WatchType.scale(dynamicTypeSize)
        Text(text)
            .font(WatchType.font(size, 500))
            .lineSpacing(size * 0.3)
            .foregroundStyle(color)
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// The small tracked uppercase page title (9 pt / 760, purple by default).
struct WatchEyebrow: View {
    let text: String
    var color: Color = WatchPhysiqueOSTheme.purple

    init(_ text: String, color: Color = WatchPhysiqueOSTheme.purple) {
        self.text = text
        self.color = color
    }

    var body: some View {
        Text(text)
            .font(WatchType.font(9, 760))
            .tracking(9 * WatchType.eyebrowTracking)
            .foregroundStyle(color)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
    }
}

/// A panel page laid out like the locked board: content from just below the
/// clock, actions centered in the space below it, scrolling only when Dynamic
/// Type or a small case makes the page taller than the screen.
///
/// Build 91 (Mineral Light bottom bar, Founder D5): a page that fits is laid
/// out with NO ScrollView, so no system scroll chrome (the watchOS 26+ bottom
/// scroll edge effect, drawn light under Mineral) can sit under the action.
/// The page paints its own background full-bleed. Only an overflowing page
/// (accessibility text sizes) scrolls, with the bottom edge effect hidden.
/// Geometry is unchanged: the same `WatchPanelActionLayout`, insets and
/// 18 pt minimum gap.
struct WatchPanelPage<Content: View, Actions: View>: View {
    @ViewBuilder let content: () -> Content
    @ViewBuilder let actions: () -> Actions

    var body: some View {
        GeometryReader { geometry in
            let fullHeight = geometry.size.height + geometry.safeAreaInsets.top + geometry.safeAreaInsets.bottom
            let topInset = WatchExecutionLayout.topInset(safeAreaTop: geometry.safeAreaInsets.top)
            // `minHeight` keeps the ideal height at the natural height when
            // that is taller, so ViewThatFits picks the ScrollView exactly
            // when the page overflows.
            ViewThatFits(in: .vertical) {
                panel(topInset: topInset)
                    .frame(minHeight: fullHeight, alignment: .top)
                    .accessibilityElement(children: .contain)
                    .accessibilityIdentifier("watch.panel.fixed")
                ScrollView {
                    panel(topInset: topInset)
                        .frame(minHeight: fullHeight, alignment: .top)
                }
                .scrollBounceBehavior(.basedOnSize)
                .contentMargins(.horizontal, 0, for: .scrollContent)
                .watchPanelBottomScrollEdgeEffectHidden()
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("watch.panel.scroll")
            }
            .frame(height: fullHeight, alignment: .top)
            .background(WatchPhysiqueOSTheme.background)
            .ignoresSafeArea(edges: [.top, .bottom])
        }
    }

    private func panel(topInset: CGFloat) -> some View {
        WatchPanelActionLayout {
            VStack(spacing: 6) { content() }
            VStack(spacing: 6) { actions() }
        }
        .padding(.horizontal, 9)
        .padding(.top, topInset)
        .padding(.bottom, 8)
    }
}

private extension View {
    /// Hides only this ScrollView's bottom scroll edge effect (watchOS 26+);
    /// no other watchOS affordance is touched.
    @ViewBuilder
    func watchPanelBottomScrollEdgeEffectHidden() -> some View {
        if #available(watchOS 26.0, *) {
            scrollEdgeEffectHidden(true, for: .bottom)
        } else {
            self
        }
    }
}

/// Content at the top; the actions are centered vertically in the free space
/// left below it (Founder Build 90, Option A). The 18 pt minimum gap equals
/// the original VStack (6 pt spacing either side of a `Spacer(minLength: 6)`),
/// so when the page is taller than the screen the gap collapses to 18 pt and
/// the enclosing ScrollView scrolls exactly as before. Button size, style and
/// tap target are untouched; only the vertical position moved.
struct WatchPanelActionLayout: Layout {
    static let minimumGap: CGFloat = 18

    /// The actions' top edge: centered in the space below the content.
    static func actionsOriginY(contentHeight: CGFloat, actionsHeight: CGFloat, boundsHeight: CGFloat) -> CGFloat {
        let free = max(0, boundsHeight - contentHeight - minimumGap - actionsHeight)
        return contentHeight + minimumGap + free / 2
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        guard subviews.count == 2 else { return .zero }
        let width = proposal.width
        let content = subviews[0].sizeThatFits(ProposedViewSize(width: width, height: nil))
        let actions = subviews[1].sizeThatFits(ProposedViewSize(width: width, height: nil))
        let natural = content.height + Self.minimumGap + actions.height
        return CGSize(width: width ?? max(content.width, actions.width), height: max(natural, proposal.height ?? natural))
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        guard subviews.count == 2 else { return }
        let width = ProposedViewSize(width: bounds.width, height: nil)
        let content = subviews[0].sizeThatFits(width)
        let actions = subviews[1].sizeThatFits(width)
        subviews[0].place(at: CGPoint(x: bounds.midX, y: bounds.minY), anchor: .top, proposal: ProposedViewSize(width: bounds.width, height: content.height))
        let actionsY = bounds.minY + Self.actionsOriginY(contentHeight: content.height, actionsHeight: actions.height, boundsHeight: bounds.height)
        subviews[1].place(at: CGPoint(x: bounds.midX, y: actionsY), anchor: .top, proposal: ProposedViewSize(width: bounds.width, height: actions.height))
    }
}

/// The 25 pt state glyph above a panel title.
struct WatchPanelIcon: View {
    let systemName: String
    let color: Color

    var body: some View {
        Image(systemName: systemName)
            .font(.system(size: 22, weight: .semibold))
            .foregroundStyle(color)
            .frame(height: 25)
            .accessibilityHidden(true)
    }
}

/// Full-width capsule actions: primary (filled), quiet (surface) and
/// destructive (filled red, or quiet with red text). 38 pt tall, 15 pt / 760.
struct WatchActionButton: View {
    enum Style { case primary, warning, quiet, quietDestructive, destructive }

    let title: String
    var systemImage: String? = nil
    var style: Style = .primary
    var height: CGFloat = 38
    var enabled = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 5) {
                if let systemImage {
                    Image(systemName: systemImage).font(.system(size: 12, weight: .bold))
                }
                Text(title)
                    .font(WatchType.font(15, 760))
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
            }
            .frame(maxWidth: .infinity)
            .frame(height: height)
            .padding(.horizontal, 6)
            .background(background)
            .foregroundStyle(foreground)
            .clipShape(Capsule())
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.45)
    }

    private var background: Color {
        switch style {
        case .primary: return WatchPhysiqueOSTheme.purple
        case .warning: return WatchPhysiqueOSTheme.warning
        case .destructive: return WatchPhysiqueOSTheme.destructive
        case .quiet, .quietDestructive: return WatchPhysiqueOSTheme.surface
        }
    }

    private var foreground: Color {
        switch style {
        case .primary: return WatchPhysiqueOSTheme.onPrimary
        // Amber fill: the iPhone execution ink, legible in both appearances.
        case .warning: return WatchPhysiqueOSTheme.onWorkoutPrimary
        case .destructive: return .white
        case .quiet: return WatchPhysiqueOSTheme.text
        case .quietDestructive: return WatchPhysiqueOSTheme.destructive
        }
    }
}

/// Authoritative structured session time from the phone's anchors: the
/// same formula as `TrainingSessionAuthority.activeElapsedSeconds`, ticked
/// locally (never per-second network traffic).
enum WatchWorkoutClock {
    static func sessionSeconds(_ projection: WatchWorkoutProjection, at date: Date) -> TimeInterval? {
        guard let startedAt = projection.startedAt else { return projection.elapsedWorkoutSeconds }
        let reference = projection.finishedAt ?? date
        let openPause = projection.pausedAt.map { max(0, reference.timeIntervalSince($0)) } ?? 0
        return max(0, reference.timeIntervalSince(startedAt) - projection.accumulatedPausedSeconds - openPause)
    }

    static func format(_ seconds: TimeInterval, showSeconds: Bool = true) -> String {
        let total = max(0, Int(seconds.rounded(.down)))
        let hours = total / 3600, minutes = (total % 3600) / 60, secs = total % 60
        if !showSeconds { return hours > 0 ? String(format: "%d:%02d", hours, minutes) : "\(minutes) min" }
        return hours > 0 ? String(format: "%d:%02d:%02d", hours, minutes, secs) : String(format: "%d:%02d", minutes, secs)
    }

    static func wholeNumber(_ value: Double?) -> String {
        guard let value, value.isFinite else { return "—" }
        return Int(value.rounded()).formatted()
    }
}

/// Fixed execution layout metrics. The execution page never scrolls:
/// sizes start at the locked board's geometry (26 pt context rows, 49 pt
/// value tiles, 28 pt values, 25 pt rest, a 38 pt action) and shrink toward
/// legible minimums until the whole page fits the space below the clock.
/// Critical values never go below the minimums (Load/Reps 24 pt, rest 22 pt,
/// a 32 pt tall primary action).
struct WatchExecutionLayout: Equatable {
    static let minimumMetricFont: CGFloat = 24
    static let minimumRestFont: CGFloat = 22
    static let minimumButtonHeight: CGFloat = 32

    var isCompact: Bool
    var spacing: CGFloat
    var headerHeight: CGFloat
    var rowHeight: CGFloat
    var metricHeight: CGFloat
    var metricFont: CGFloat
    var restFont: CGFloat
    var buttonHeight: CGFloat
    var bottomPadding: CGFloat
    var horizontalInset: CGFloat

    init(size: CGSize, hasRest: Bool = true) {
        isCompact = size.height < 190 || size.width < 170
        spacing = isCompact ? 2 : 4
        headerHeight = isCompact ? 15 : 17
        bottomPadding = isCompact ? 3 : 8
        horizontalInset = isCompact ? 6 : 9
        rowHeight = 26
        metricHeight = 49
        metricFont = 28
        restFont = 25
        buttonHeight = 38
        var steps = 0
        while requiredHeight(hasRest: hasRest) > size.height, steps < 60 {
            rowHeight = max(19, rowHeight - 0.5)
            metricHeight = max(38, metricHeight - 1)
            metricFont = max(Self.minimumMetricFont, metricFont - 0.5)
            restFont = max(Self.minimumRestFont, restFont - 0.5)
            buttonHeight = max(Self.minimumButtonHeight, buttonHeight - 0.5)
            steps += 1
        }
    }

    /// Header, two context rows, Load/Reps, rest, primary action.
    func requiredHeight(hasRest: Bool = true) -> CGFloat {
        headerHeight + rowHeight * 2 + spacing + metricHeight
            + (hasRest ? restLineHeight : 0)
            + buttonHeight + bottomPadding
            + spacing * (hasRest ? 4 : 3)
    }

    /// The board's 32 pt rest line at the 25 pt value.
    var restLineHeight: CGFloat { (restFont * 1.28).rounded(.up) }

    /// Where content starts: just below the system clock. A vertical page
    /// reserves more than the clock needs (Ultra 56 pt for a clock ending
    /// near 38 pt), so the page starts at 70% of that inset.
    static func topInset(safeAreaTop: CGFloat) -> CGFloat { (safeAreaTop * 0.7).rounded() }
}

struct WatchWorkoutRootView: View {
    @Bindable var store: WatchWorkoutStore
    @Environment(\.isLuminanceReduced) private var isLuminanceReduced

    var body: some View {
        let palette = WatchPalette.of(store.appearance)
        WatchPhysiqueOSTheme.current = palette
        return ZStack {
            WatchPhysiqueOSTheme.background.ignoresSafeArea()
            if let projection = store.projection {
                switch store.presentedPhase {
                case .prepared:
                    WatchWorkoutStartView(store: store, projection: projection)
                case .active, .paused, .finishConfirmation, .finishing:
                    workoutPager(projection)
                case .committed:
                    WatchWorkoutSummaryView(store: store, projection: projection)
                case .none:
                    unavailable
                }
            } else {
                unavailable
            }
        }
        .foregroundStyle(WatchPhysiqueOSTheme.text)
        .overlay(alignment: .top) {
            if let capsule = palette.clockCapsule { WatchClockCapsule(color: capsule) }
        }
        .environment(\.colorScheme, palette.colorScheme)
        // A different appearance rebuilds every screen against its palette.
        .id(store.appearance)
    }

    /// Controls are the page to the LEFT of the workout: a physical swipe
    /// RIGHT reveals them (system page physics), a swipe left returns.
    /// Vertical Crown paging stays inside the workout page.
    private func workoutPager(_ projection: WatchWorkoutProjection) -> some View {
        TabView(selection: $store.page) {
            WatchWorkoutControlsView(store: store)
                .tag(WatchWorkoutStore.Page.controls)
            WatchWorkoutVerticalPages(store: store, projection: projection)
                .tag(WatchWorkoutStore.Page.workout)
        }
        .tabViewStyle(.page(indexDisplayMode: .never))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("watch.workoutPager")
    }

    @ViewBuilder
    private var unavailable: some View {
        if store.orphanedHealthSessionId != nil {
            WatchOrphanHealthBanner(store: store)
        } else {
            idle
        }
    }

    private var idle: some View {
        let phoneUnavailable = store.connectionState == .phoneUnavailable
        return WatchPanelPage {
            WatchPanelIcon(
                systemName: phoneUnavailable ? "iphone.slash" : "applewatch",
                color: phoneUnavailable ? WatchPhysiqueOSTheme.warning : WatchPhysiqueOSTheme.purple
            )
            WatchPanelTitle(phoneUnavailable ? "Phone unavailable" : "Prepare a workout on iPhone")
            WatchPanelCopy(phoneUnavailable
                 ? (store.health.recordingCorrelationId != nil
                    ? "Apple Health keeps recording. Set logging waits for iPhone."
                    : "Set logging waits for iPhone.")
                 : "Start a workout on iPhone, then choose Ready on Watch.")
        } actions: {
            WatchActionButton(title: "Refresh") { store.refresh() }
                .accessibilityIdentifier("watch.idle.refresh")
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("watch.idle")
    }
}

/// Mineral Light's clock contrast (Founder-selected Option A): a compact ink
/// capsule localized behind the watchOS system time. It is anchored to where
/// watchOS draws the time (top-trailing, vertically centered in the top safe
/// area) and sized to the time actually shown, re-measured each minute, so the
/// white digits sit on ink with even margins. No header band, and the real
/// system clock is never replaced or redrawn.
struct WatchClockCapsule: View {
    let color: Color

    var body: some View {
        GeometryReader { geometry in
            TimelineView(.everyMinute) { context in
                let frame = Self.frame(
                    screenWidth: geometry.size.width,
                    safeAreaTop: geometry.safeAreaInsets.top,
                    clockWidth: Self.clockWidth(at: context.date)
                )
                Capsule(style: .continuous)
                    .fill(color)
                    .frame(width: frame.width, height: frame.height)
                    // Local coordinates start below the top safe area.
                    .position(x: frame.midX, y: frame.midY - geometry.safeAreaInsets.top)
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    static let height: CGFloat = 21
    static let horizontalPadding: CGFloat = 8

    /// Measured on the Ultra 3 and 42 mm simulators: each digit of the time is
    /// ~10 pt wide and the colon ~4 pt.
    static func clockWidth(at date: Date, locale: Locale = .current, timeZone: TimeZone = .current) -> CGFloat {
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.timeZone = timeZone
        formatter.setLocalizedDateFormatFromTemplate("jmm")
        let digits = formatter.string(from: date).filter(\.isNumber).count
        return CGFloat(min(max(digits, 3), 4)) * 10 + 4
    }

    /// The capsule in page coordinates (top = screen top): the time's trailing
    /// edge sits ~8% of the page width in from the edge and its center at half
    /// the top safe area (measured on 49 mm and 42 mm).
    static func frame(screenWidth: CGFloat, safeAreaTop: CGFloat, clockWidth: CGFloat) -> CGRect {
        let clockTrailing = screenWidth - (screenWidth * 0.08).rounded()
        let width = clockWidth + horizontalPadding * 2
        // Centered on the time, but always ending at least 1 pt above where
        // page content starts (the shared below-clock inset).
        let contentTop = WatchExecutionLayout.topInset(safeAreaTop: safeAreaTop)
        let centerY = min(safeAreaTop * 0.5, contentTop - 1 - height / 2)
        return CGRect(
            x: clockTrailing - clockWidth / 2 - width / 2,
            y: centerY - height / 2,
            width: width,
            height: height
        )
    }
}

/// Crown / vertical paging: Execution -> Workout Metrics -> Daily Totals.
struct WatchWorkoutVerticalPages: View {
    enum Page: Hashable { case execution, metrics, dailyTotals }

    @Bindable var store: WatchWorkoutStore
    let projection: WatchWorkoutProjection
    @State private var selection: Page

    init(store: WatchWorkoutStore, projection: WatchWorkoutProjection) {
        self.store = store
        self.projection = projection
        switch store.debugSurface {
        case "metrics": _selection = State(initialValue: .metrics)
        case "daily-totals", "daily-totals-stale", "daily-totals-missing": _selection = State(initialValue: .dailyTotals)
        default: _selection = State(initialValue: .execution)
        }
    }

    var body: some View {
        TabView(selection: $selection) {
            WatchWorkoutExecutionView(
                store: store,
                projection: projection,
                forceReducedLuminance: store.debugSurface == "always-on"
            )
            .tag(Page.execution)
            WatchWorkoutMetricsView(store: store, projection: projection)
                .tag(Page.metrics)
            WatchDailyTotalsView(store: store, projection: projection)
                .tag(Page.dailyTotals)
        }
        .tabViewStyle(.verticalPage)
    }
}

struct WatchWorkoutStartView: View {
    @Bindable var store: WatchWorkoutStore
    let projection: WatchWorkoutProjection

    var body: some View {
        WatchPanelPage {
            WatchEyebrow("READY FOR WATCH")
            WatchPanelTitle(projection.title)
            WatchPanelCopy("\(projection.totalSets) planned sets")
            if store.orphanedHealthSessionId != nil {
                WatchOrphanHealthContent()
                    .padding(.top, 8)
            }
        } actions: {
            WatchActionButton(title: "Start Workout", systemImage: "play.fill",
                              enabled: store.isStartWorkoutEnabled) {
                store.startPreparedWorkout()
            }
            .accessibilityIdentifier("watch.start")
            if store.orphanedHealthSessionId != nil {
                WatchOrphanHealthActions(store: store)
            }
        }
    }
}

/// An Apple Health workout still recording on this Watch for a session the
/// iPhone is not showing (Save & Leave, a newer session, a lost record).
/// Nothing is discarded automatically; the Founder chooses.
struct WatchOrphanHealthBanner: View {
    @Bindable var store: WatchWorkoutStore

    var body: some View {
        WatchPanelPage {
            WatchOrphanHealthContent()
        } actions: {
            WatchOrphanHealthActions(store: store)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("watch.orphan")
    }
}

struct WatchOrphanHealthContent: View {
    var body: some View {
        VStack(spacing: 6) {
            WatchPanelIcon(systemName: "heart.fill", color: WatchPhysiqueOSTheme.warning)
            WatchPanelTitle("Apple Health workout still recording")
            WatchPanelCopy("iPhone isn't showing this workout.")
        }
    }
}

struct WatchOrphanHealthActions: View {
    @Bindable var store: WatchWorkoutStore

    var body: some View {
        WatchActionButton(title: "End & Save") { store.saveOrphanedWorkout() }
            .accessibilityIdentifier("watch.orphan.save")
        WatchActionButton(title: "Discard", style: .quietDestructive) { store.discardOrphanedWorkout() }
            .accessibilityIdentifier("watch.orphan.discard")
    }
}

// MARK: - Execution (fixed, non-scrolling)

struct WatchWorkoutExecutionView: View {
    @Bindable var store: WatchWorkoutStore
    let projection: WatchWorkoutProjection
    var forceReducedLuminance = false
    @Environment(\.isLuminanceReduced) private var isLuminanceReduced

    private var reduced: Bool { isLuminanceReduced || forceReducedLuminance }

    var body: some View {
        TimelineView(.periodic(from: .now, by: reduced ? 15 : 1)) { context in
            GeometryReader { geometry in
                // Insets come from this safe-area-respecting reader; only the
                // content below extends to the physical top and bottom.
                let fullHeight = geometry.size.height + geometry.safeAreaInsets.top + geometry.safeAreaInsets.bottom
                let topInset = WatchExecutionLayout.topInset(safeAreaTop: geometry.safeAreaInsets.top)
                let available = CGSize(width: geometry.size.width, height: fullHeight - topInset)
                let layout = WatchExecutionLayout(size: available, hasRest: store.visibleRest != nil)
                VStack(spacing: layout.spacing) {
                    // The confirmation and saving panels own the whole page
                    // (locked W6/W7): no set header above them.
                    if store.presentedPhase != .finishConfirmation, store.presentedPhase != .finishing {
                        header(layout)
                    } else {
                        // Keeps the panel a distinct accessibility container
                        // (a sole child would be flattened into the page).
                        Color.clear.frame(height: 0).accessibilityHidden(true)
                    }
                    switch store.presentedPhase {
                    case .finishConfirmation:
                        WatchFinishConfirmationPanel(store: store, projection: projection, layout: layout, date: context.date)
                    case .finishing:
                        WatchFinishingPanel(store: store, projection: projection, layout: layout, date: context.date)
                    default:
                        Group {
                            contextRows(layout)
                            if let row = store.currentRow { splitMetrics(row, layout) }
                        }
                        .padding(.trailing, Self.pageIndicatorClearance)
                        rest(at: context.date, layout)
                        Spacer(minLength: 0)
                        primaryAction(layout)
                            .opacity(reduced ? 0.65 : 1)
                    }
                }
                .padding(.horizontal, layout.horizontalInset)
                .padding(.top, topInset)
                .frame(width: geometry.size.width, height: fullHeight, alignment: .top)
                // Always-On: the same content at reduced luminance/saturation.
                .saturation(reduced ? WatchPhysiqueOSTheme.current.reducedSaturation : 1)
                .brightness(reduced ? WatchPhysiqueOSTheme.current.reducedBrightness : 0)
                .overlay(alignment: .topLeading) {
                    if store.debugSurface == "geometry" {
                        Text("avail \(Int(available.width))x\(Int(available.height)) need \(Int(layout.requiredHeight(hasRest: store.visibleRest != nil))) top \(Int(topInset))")
                            .font(.system(size: 9)).foregroundStyle(.yellow).background(.black)
                            .offset(y: fullHeight - 30)
                    }
                }
                .ignoresSafeArea(edges: [.top, .bottom])
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("watch.execution")
    }

    /// Set progress (green, like the phone Logger) and, in one line, the
    /// session title, or the status that matters more right now.
    private func header(_ layout: WatchExecutionLayout) -> some View {
        VStack(spacing: layout.isCompact ? 2 : 3) {
            HStack(spacing: 4) {
                Text("\(projection.completedSets)/\(projection.totalSets) SETS")
                    .font(WatchType.font(8, 760))
                    .foregroundStyle(WatchPhysiqueOSTheme.muted)
                    .fixedSize()
                Spacer(minLength: 2)
                if let status = statusText {
                    Text(status.text)
                        .font(WatchType.font(8, 800))
                        .foregroundStyle(status.color)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                } else {
                    Text(projection.title.uppercased())
                        .font(WatchType.font(8, 760))
                        .foregroundStyle(WatchPhysiqueOSTheme.muted)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
            }
            WatchProgressBar(completed: projection.completedSets, total: projection.totalSets)
                .frame(height: layout.isCompact ? 3 : 4)
        }
        .frame(height: layout.headerHeight, alignment: .bottom)
        .padding(.trailing, Self.pageIndicatorClearance)
    }

    /// The vertical page indicator sits on the trailing edge just below the
    /// clock; upper content keeps clear of it.
    static let pageIndicatorClearance: CGFloat = 9

    private var statusText: (text: String, color: Color)? {
        if store.shouldShowAuthorityWarning(at: Date()) {
            return (store.healthStatus.authorityWarningText, WatchPhysiqueOSTheme.warning)
        }
        if projection.phase == .paused { return ("PAUSED", WatchPhysiqueOSTheme.warning) }
        switch store.notice {
        case .setPending: return ("SET PENDING…", WatchPhysiqueOSTheme.muted)
        case .staleRefreshed: return ("STATE REFRESHED", WatchPhysiqueOSTheme.muted)
        case .healthStartFailed: return ("HEALTH START FAILED", WatchPhysiqueOSTheme.warning)
        case .rejected(let reason):
            if reason == WatchWorkoutAcknowledgement.Reason.noCompletedSets.rawValue {
                return ("COMPLETE A SET FIRST", WatchPhysiqueOSTheme.warning)
            }
            return ("NOT RECORDED · \(reason.uppercased())", WatchPhysiqueOSTheme.warning)
        case .finishPending, nil: break
        }
        if let health = store.healthHeaderText {
            return (health, store.healthStatus == .starting ? WatchPhysiqueOSTheme.muted : WatchPhysiqueOSTheme.warning)
        }
        if store.isReviewingOnPhone { return ("REVIEWING ON IPHONE", WatchPhysiqueOSTheme.muted) }
        return nil
    }

    private func contextRows(_ layout: WatchExecutionLayout) -> some View {
        VStack(spacing: layout.spacing) {
            ForEach(Array(projection.rows.enumerated()), id: \.offset) { _, row in
                HStack(spacing: 4) {
                    Text(row.role == "upNext" ? "UP NEXT" : row.role.uppercased())
                        .font(WatchType.font(8, 780))
                        .foregroundStyle(row.isCompletionTarget ? WatchPhysiqueOSTheme.purple : WatchPhysiqueOSTheme.muted)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .frame(width: 42, alignment: .leading)
                    Text(WatchExecutionValues.rowTitle(row))
                        .font(WatchType.font(10, 700))
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Text(row.setCount == 1 ? "ONLY SET" : "\(row.setNumber)/\(row.setCount)")
                        .font(WatchType.font(8, 500))
                        .foregroundStyle(WatchPhysiqueOSTheme.muted)
                        .fixedSize()
                }
                .padding(.horizontal, 6)
                .frame(height: layout.rowHeight)
                .background(row.isCompletionTarget ? WatchPhysiqueOSTheme.secondarySurface : WatchPhysiqueOSTheme.surface)
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }
        }
    }

    private func splitMetrics(_ row: WatchWorkoutProjection.Row, _ layout: WatchExecutionLayout) -> some View {
        let values = WatchExecutionValues(row: row)
        return HStack(spacing: 4) {
            metricTile(value: values.load, label: "LOAD", layout)
            metricTile(value: values.primary, label: values.primaryLabel, layout)
        }
    }

    private func metricTile(value: String, label: String, _ layout: WatchExecutionLayout) -> some View {
        VStack(spacing: 1) {
            Text(value)
                .font(WatchType.font(layout.metricFont, 700))
                .tracking(-0.05 * layout.metricFont)
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            Text(label)
                .font(WatchType.font(8, 760))
                .foregroundStyle(WatchPhysiqueOSTheme.muted)
        }
        .frame(maxWidth: .infinity)
        .frame(height: layout.metricHeight)
        .background(WatchPhysiqueOSTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private func rest(at date: Date, _ layout: WatchExecutionLayout) -> some View {
        if let rest = store.visibleRest {
            let seconds: TimeInterval = {
                if projection.phase == .paused {
                    return rest.mode == .countdown
                        ? max(0, rest.frozenRemainingSeconds ?? 0)
                        : max(0, rest.frozenElapsedSeconds ?? 0)
                }
                if rest.mode == .countdown, let endsAt = rest.endsAt { return max(0, endsAt.timeIntervalSince(date)) }
                return max(0, date.timeIntervalSince(rest.startedAt))
            }()
            HStack(alignment: .firstTextBaseline, spacing: 7) {
                Text(rest.mode == .countdown ? "REST LEFT" : "REST")
                    .font(WatchType.font(8, 760))
                    .foregroundStyle(WatchPhysiqueOSTheme.muted)
                    .fixedSize()
                Text(WatchWorkoutClock.format(seconds))
                    .font(WatchType.font(layout.restFont, 700))
                    .tracking(-0.04 * layout.restFont)
                    .monospacedDigit()
            }
            .frame(height: layout.restLineHeight)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("watch.rest")
        }
    }

    @ViewBuilder
    private func primaryAction(_ layout: WatchExecutionLayout) -> some View {
        if store.shouldShowAuthorityWarning(at: Date()) {
            WatchEdgeCapsuleButton(
                title: "Retry iPhone", systemImage: "arrow.clockwise", layout: layout, enabled: true,
                tint: WatchPhysiqueOSTheme.warning
            ) { store.retryAuthorityConnection() }
                .accessibilityIdentifier("watch.execution.retryPhone")
        } else if projection.completedSets == projection.totalSets, projection.totalSets > 0 {
            WatchEdgeCapsuleButton(title: "Finish Workout", layout: layout, enabled: store.connectionState == .reachable) {
                store.requestFinish()
            }
            .accessibilityIdentifier("watch.execution.finishWorkout")
        } else {
            WatchEdgeCapsuleButton(
                title: projection.phase == .paused ? "Paused" : "Complete Set",
                layout: layout,
                enabled: store.isCompleteSetAvailable
            ) { store.completeSet() }
            .accessibilityIdentifier("watch.execution.completeSet")
            .onChange(of: store.isCompleteSetAvailable, initial: true) { _, available in
                store.noteCompleteSetAvailability(available)
            }
        }
    }
}

/// Execution tile values (pure, testable). A timed set shows its entered
/// seconds in the second tile ("SECONDS", like the phone Logger's column)
/// instead of an empty reps tile; reps sets are unchanged.
struct WatchExecutionValues: Equatable {
    var load: String
    var primary: String
    var primaryLabel: String

    init(load: String, primary: String, primaryLabel: String) {
        self.load = load
        self.primary = primary
        self.primaryLabel = primaryLabel
    }

    /// "A · Spider Curls · Static Hold": superset letter, exercise, then the
    /// phone-selected execution variant (display only, Build 92).
    static func rowTitle(_ row: WatchWorkoutProjection.Row) -> String {
        [row.supersetLabel, row.exerciseName, row.variantLabel].compactMap { $0 }.joined(separator: " · ")
    }

    init(row: WatchWorkoutProjection.Row) {
        load = row.loadText ?? "—"
        if let duration = row.durationText {
            primary = duration
            primaryLabel = "SECONDS"
        } else {
            primary = row.repsText ?? "—"
            primaryLabel = "REPS"
        }
    }
}

/// The 4 pt set-progress bar (green fill on a quiet track).
struct WatchProgressBar: View {
    let completed: Int
    let total: Int

    var body: some View {
        GeometryReader { geometry in
            let fraction = total > 0 ? min(1, max(0, Double(completed) / Double(total))) : 0
            ZStack(alignment: .leading) {
                Capsule().fill(WatchPhysiqueOSTheme.progressTrack)
                Capsule().fill(WatchPhysiqueOSTheme.progress)
                    .frame(width: geometry.size.width * fraction)
            }
        }
        .accessibilityElement()
        .accessibilityLabel("Sets")
        .accessibilityValue("\(completed) of \(total)")
        .accessibilityIdentifier("watch.progress")
    }
}

/// The bottom primary action: a capsule sitting on the lower edge of the
/// display, inset so its rounded ends follow the Watch's corner curve.
struct WatchEdgeCapsuleButton: View {
    let title: String
    var systemImage: String? = nil
    let layout: WatchExecutionLayout
    var enabled = true
    /// Defaults to the primary workout action (iPhone Finish Workout amber);
    /// warning / destructive callers pass their own tint.
    var tint: Color = WatchPhysiqueOSTheme.workoutPrimary
    var foreground: Color = WatchPhysiqueOSTheme.onWorkoutPrimary
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 5) {
                if let systemImage {
                    Image(systemName: systemImage).font(.system(size: 12, weight: .bold))
                }
                Text(title)
                    .font(WatchType.font(layout.isCompact ? 14 : 15, 760))
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
            }
            .padding(.horizontal, 10)
            .frame(maxWidth: .infinity)
            .frame(height: layout.buttonHeight)
            .background(tint)
            .foregroundStyle(foreground)
            .clipShape(Capsule())
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.45)
        .padding(.bottom, layout.bottomPadding)
    }
}

/// One confirmation for both surfaces (primary and controls): explicit
/// Finish / Not Yet. Never presented as "finishing".
struct WatchFinishConfirmationPanel: View {
    @Bindable var store: WatchWorkoutStore
    let projection: WatchWorkoutProjection
    let layout: WatchExecutionLayout
    let date: Date

    var body: some View {
        let remaining = max(0, projection.totalSets - projection.completedSets)
        let waiting = store.connectionState != .reachable || store.isWaitingForPhone(at: date)
        VStack(spacing: layout.spacing + 1) {
            if !layout.isCompact {
                WatchPanelIcon(systemName: "flag.fill", color: WatchPhysiqueOSTheme.purple)
            }
            WatchPanelTitle("Finish workout?")
            WatchPanelCopy(remaining == 0
                 ? "All \(projection.totalSets) sets complete."
                 : "\(remaining) set\(remaining == 1 ? "" : "s") not done. Only completed sets count.")
                .lineLimit(2)
                .minimumScaleFactor(0.85)
            if waiting {
                Text("Waiting for iPhone")
                    .font(WatchType.font(10, 760))
                    .foregroundStyle(WatchPhysiqueOSTheme.warning)
            }
            Spacer(minLength: 0)
            WatchActionButton(title: "Not Yet", style: .quiet, height: layout.buttonHeight) { store.cancelFinish() }
                .accessibilityIdentifier("watch.finishConfirmation.notYet")
            if waiting {
                WatchEdgeCapsuleButton(title: "Retry", systemImage: "arrow.clockwise", layout: layout,
                                       tint: WatchPhysiqueOSTheme.warning) {
                    store.retryPending()
                }
                .accessibilityIdentifier("watch.finishConfirmation.retry")
            } else {
                WatchEdgeCapsuleButton(
                    title: store.notice == .finishPending ? "Finishing…" : "Finish",
                    layout: layout,
                    enabled: store.notice != .finishPending
                ) { store.confirmFinish() }
                .accessibilityIdentifier("watch.finishConfirmation.finish")
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("watch.finishConfirmation")
    }
}

/// Confirmed finish in progress. Bounded: after `waitingForPhoneAfter` it
/// names the reason and offers Retry instead of an indefinite spinner.
struct WatchFinishingPanel: View {
    @Bindable var store: WatchWorkoutStore
    let projection: WatchWorkoutProjection
    let layout: WatchExecutionLayout
    let date: Date

    var body: some View {
        VStack(spacing: layout.spacing + 2) {
            if let reason = store.finishWaitReason(at: date) {
                if !layout.isCompact {
                    WatchPanelIcon(systemName: "exclamationmark.arrow.triangle.2.circlepath", color: WatchPhysiqueOSTheme.warning)
                }
                WatchPanelTitle(reason)
                    .lineLimit(2)
                legs
                WatchPanelCopy("Sets are safe on iPhone.")
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
                Spacer(minLength: 0)
                WatchEdgeCapsuleButton(title: "Retry", systemImage: "arrow.clockwise", layout: layout,
                                       tint: WatchPhysiqueOSTheme.warning) {
                    store.retryPending()
                }
                .accessibilityIdentifier("watch.finishing.retry")
            } else {
                ProgressView()
                    .tint(WatchPhysiqueOSTheme.purple)
                    .frame(height: 25)
                WatchPanelTitle("Saving workout…")
                legs
                WatchPanelCopy("Sets are safe on iPhone.")
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
                Spacer(minLength: 0)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("watch.finishing")
    }

    private var legs: some View {
        VStack(spacing: 3) {
            leg("PhysiqueOS", done: projection.finish?.serverCommitted == true)
            if projection.finish?.healthExpected != false {
                leg("Apple Health", done: projection.finish?.healthSaved == true, failed: projection.finish?.healthFailed == true)
            }
        }
    }

    private func leg(_ title: String, done: Bool, failed: Bool = false) -> some View {
        HStack(spacing: 5) {
            Image(systemName: done ? "checkmark.circle.fill" : failed ? "exclamationmark.circle" : "circle.dotted")
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(done ? WatchPhysiqueOSTheme.success : failed ? WatchPhysiqueOSTheme.warning : WatchPhysiqueOSTheme.muted)
            Text(title).font(WatchType.font(10, 600)).foregroundStyle(WatchPhysiqueOSTheme.muted)
        }
        .accessibilityElement(children: .combine)
        .accessibilityValue(done ? "Saved" : failed ? "Needs retry" : "Saving")
    }
}

/// A page laid out from just below the system clock (the same rule as the
/// execution page), so a title never meets the clock on any Watch size.
struct WatchBelowClockPage<Content: View>: View {
    @ViewBuilder let content: (CGSize) -> Content

    var body: some View {
        GeometryReader { geometry in
            let fullHeight = geometry.size.height + geometry.safeAreaInsets.top + geometry.safeAreaInsets.bottom
            let topInset = WatchExecutionLayout.topInset(safeAreaTop: geometry.safeAreaInsets.top)
            content(CGSize(width: geometry.size.width, height: fullHeight - topInset))
                .padding(.top, topInset)
                .frame(width: geometry.size.width, height: fullHeight, alignment: .top)
                .ignoresSafeArea(edges: [.top, .bottom])
        }
    }
}

// MARK: - Crown page 2: workout-only metrics

struct WatchWorkoutMetricsView: View {
    @Bindable var store: WatchWorkoutStore
    let projection: WatchWorkoutProjection
    @Environment(\.isLuminanceReduced) private var isLuminanceReduced

    var body: some View {
        TimelineView(.periodic(from: .now, by: isLuminanceReduced ? 15 : 1)) { context in
            WatchBelowClockPage { size in
            let compact = size.height < 190
            VStack(spacing: compact ? 3 : 4) {
                let values = WatchWorkoutMetricsPresentation(health: store.health)
                if let caption = store.healthHeaderText {
                    WatchEyebrow(caption, color: WatchPhysiqueOSTheme.warning)
                        .accessibilityIdentifier("watch.metrics.healthStatus")
                } else {
                    WatchEyebrow("WORKOUT METRICS")
                }
                WatchMetricRow(
                    compact: compact,
                    label: "TIME",
                    value: WatchWorkoutClock.sessionSeconds(projection, at: context.date)
                        .map { WatchWorkoutClock.format($0, showSeconds: !isLuminanceReduced) } ?? "—",
                    icon: "timer", accent: WatchPhysiqueOSTheme.timeAccent
                )
                WatchMetricRow(
                    compact: compact,
                    label: "ACTIVE CALORIES",
                    value: values.activeCalories,
                    icon: "flame.fill", accent: WatchPhysiqueOSTheme.activeEnergyAccent
                )
                WatchMetricRow(
                    compact: compact,
                    label: "TOTAL CALORIES",
                    value: values.totalCalories,
                    icon: "sum", accent: WatchPhysiqueOSTheme.totalEnergyAccent
                )
                WatchMetricRow(
                    compact: compact,
                    label: "HEART RATE",
                    value: values.heartRate,
                    icon: "heart.fill", accent: WatchPhysiqueOSTheme.heartRateAccent
                )
            }
            .padding(.horizontal, 9)
            .padding(.trailing, WatchWorkoutExecutionView.pageIndicatorClearance - 4)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("watch.metrics")
    }
}

/// Workout Metrics values. Heart rate and energy come only from the Watch's
/// live HealthKit workout builder; with no workout recording they are "—",
/// never a daily total or any other substitute. TIME is separate: it is the
/// phone's structured session clock (`WatchWorkoutClock`).
struct WatchWorkoutMetricsPresentation: Equatable {
    var activeCalories: String
    var totalCalories: String
    var heartRate: String

    @MainActor
    init(health: any WatchWorkoutHealthRecording) {
        activeCalories = health.activeCalories.map { "\(WatchWorkoutClock.wholeNumber($0)) CAL" } ?? "—"
        totalCalories = health.totalCalories.map { "\(WatchWorkoutClock.wholeNumber($0)) CAL" } ?? "—"
        heartRate = health.currentHeartRateBPM.map { "\(Int($0.rounded())) BPM" } ?? "—"
    }
}

/// One metric row. Only the icon carries the accent (the retained
/// production icon and per-metric color); every card shares the same quiet
/// surface, an 8 pt label and a 15 pt tabular value.
struct WatchMetricRow: View {
    var compact = false
    let label: String
    let value: String
    let icon: String
    let accent: Color
    var caption: String? = nil

    var body: some View {
        HStack(spacing: 7) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(accent)
                .frame(width: 23)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 4) {
                    Text(label).font(WatchType.font(8, 760)).foregroundStyle(WatchPhysiqueOSTheme.muted)
                    if let caption {
                        Text(caption).font(WatchType.font(8, 760)).foregroundStyle(WatchPhysiqueOSTheme.muted.opacity(0.75))
                    }
                }
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                Text(value)
                    .font(WatchType.font(15, 700))
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 7)
        .padding(.vertical, compact ? 4 : 6)
        .background(WatchPhysiqueOSTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 9))
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Crown page 3: Daily Totals

/// Today's totals from the phone's canonical daily snapshot (the same one
/// Home and the Home Widget render) plus the ticking session time. Values
/// for another day are never shown; missing values are "—".
struct WatchDailyTotalsView: View {
    @Bindable var store: WatchWorkoutStore
    let projection: WatchWorkoutProjection
    @Environment(\.isLuminanceReduced) private var isLuminanceReduced

    var body: some View {
        TimelineView(.periodic(from: .now, by: isLuminanceReduced ? 15 : 1)) { context in
            let totals = WatchDailyTotalsPresentation.todaysTotals(store.dailyTotals, at: context.date)
            WatchBelowClockPage { size in
            let compact = size.height < 190
            VStack(spacing: compact ? 3 : 4) {
                WatchEyebrow("DAILY TOTALS")
                WatchMetricRow(
                    compact: compact,
                    label: "TRAINING SESSION",
                    value: WatchWorkoutClock.sessionSeconds(projection, at: context.date)
                        .map { WatchWorkoutClock.format($0, showSeconds: !isLuminanceReduced) } ?? "—",
                    icon: "stopwatch", accent: WatchPhysiqueOSTheme.timeAccent
                )
                WatchMetricRow(
                    compact: compact,
                    label: "ACTIVE CALORIES",
                    value: totals?.activeCalories.map { "\(WatchWorkoutClock.wholeNumber($0)) CAL" } ?? "—",
                    icon: "flame.fill", accent: WatchPhysiqueOSTheme.activeEnergyAccent,
                    caption: totals?.isActivityPartialDay == true && totals?.activeCalories != nil ? "SO FAR" : nil
                )
                WatchMetricRow(
                    compact: compact,
                    label: "NUTRITION",
                    value: totals?.nutritionCalories.map { "\(WatchWorkoutClock.wholeNumber($0)) CAL" } ?? "—",
                    icon: "fork.knife", accent: WatchPhysiqueOSTheme.nutritionAccent
                )
                Text(WatchDailyTotalsPresentation.freshness(store.dailyTotals, connection: store.connectionState, at: context.date))
                    .font(WatchType.font(9, 650))
                    .foregroundStyle(WatchPhysiqueOSTheme.muted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                    .padding(.top, 1)
                    .accessibilityIdentifier("watch.dailyTotals.freshness")
            }
            .padding(.horizontal, 9)
            .padding(.trailing, WatchWorkoutExecutionView.pageIndicatorClearance - 4)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("watch.dailyTotals")
    }
}

/// Daily Totals presentation rules (pure, testable): only today's values,
/// whole numbers, "—" when missing, and an honest freshness line.
enum WatchDailyTotalsPresentation {
    static let staleAfter: TimeInterval = 15 * 60

    static func localDateKey(_ date: Date, calendar: Calendar = .current) -> String {
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    /// Only today's values; another day's snapshot shows nothing.
    static func todaysTotals(_ totals: WatchDailyTotals?, at date: Date) -> WatchDailyTotals? {
        guard let totals, totals.localDate == localDateKey(date) else { return nil }
        return totals
    }

    static func freshness(
        _ totals: WatchDailyTotals?,
        connection: WatchWorkoutStore.ConnectionState,
        at date: Date
    ) -> String {
        let confirmedUnavailable = connection == .phoneUnavailable || connection == .reconnecting
        guard let totals else {
            return confirmedUnavailable ? "iPhone unavailable" : "Waiting for iPhone"
        }
        guard totals.localDate == localDateKey(date) else { return "Today not loaded yet" }
        let time = (totals.refreshedAt ?? totals.writtenAt).formatted(date: .omitted, time: .shortened)
        if totals.refreshedAt == nil { return "Not loaded yet" }
        if totals.isOffline || confirmedUnavailable { return "Offline · as of \(time)" }
        if let refreshed = totals.refreshedAt, date.timeIntervalSince(refreshed) > staleAfter { return "As of \(time)" }
        return "Updated \(time)"
    }
}

// MARK: - Controls (swipe right)

struct WatchWorkoutControlsView: View {
    @Bindable var store: WatchWorkoutStore

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            GeometryReader { geometry in
                let fullHeight = geometry.size.height + geometry.safeAreaInsets.top + geometry.safeAreaInsets.bottom
                let topInset = WatchExecutionLayout.topInset(safeAreaTop: geometry.safeAreaInsets.top)
                let layout = WatchExecutionLayout(size: CGSize(width: geometry.size.width, height: fullHeight - topInset))
                Group {
                    if store.cancelConfirmationVisible {
                        cancelConfirmation(layout)
                    } else if store.presentedPhase == .finishConfirmation, let projection = store.projection {
                        WatchFinishConfirmationPanel(store: store, projection: projection, layout: layout, date: context.date)
                    } else {
                        controls(layout)
                    }
                }
                .padding(.horizontal, layout.horizontalInset)
                .padding(.top, topInset)
                .frame(width: geometry.size.width, height: fullHeight, alignment: .top)
                .ignoresSafeArea(edges: [.top, .bottom])
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("watch.controls")
    }

    private func controls(_ layout: WatchExecutionLayout) -> some View {
        let phase = store.presentedPhase
        let canControl = (phase == .active || phase == .paused)
            && !store.isMutationPending && store.connectionState == .reachable
        // A failed Health start leads the page (W13): the status names the
        // lane and Retry Health Start comes first.
        let healthStartFailed = (phase == .active || phase == .paused)
            && store.canStartHealthManually && store.healthStatus == .failed
        let height: CGFloat = layout.isCompact ? 34 : 38
        return VStack(spacing: layout.isCompact ? 5 : 7) {
            WatchEyebrow(healthStartFailed ? "HEALTH START FAILED" : "WORKOUT CONTROLS",
                         color: healthStartFailed ? WatchPhysiqueOSTheme.warning : WatchPhysiqueOSTheme.purple)
                .accessibilityIdentifier("watch.controls.title")
            if store.shouldShowAuthorityWarning(at: Date()) {
                WatchActionButton(title: "Retry iPhone", systemImage: "arrow.clockwise", style: .warning, height: height) {
                    store.retryAuthorityConnection()
                }
                .accessibilityIdentifier("watch.controls.retryPhone")
            }
            if healthStartFailed {
                WatchActionButton(title: "Retry Health Start", systemImage: "heart.fill", style: .warning, height: height) {
                    store.retryHealthStart()
                }
                .accessibilityIdentifier("watch.controls.recordHealth")
            }
            if phase == .active || phase == .paused {
                WatchActionButton(title: phase == .paused ? "Resume" : "Pause",
                                  systemImage: phase == .paused ? "play.fill" : "pause.fill",
                                  height: height, enabled: canControl) {
                    store.pauseOrResume()
                }
                .accessibilityIdentifier("watch.controls.pauseResume")
                WatchActionButton(title: "Finish Workout", systemImage: "flag.fill", style: .quiet, height: height,
                                  enabled: canControl && (store.projection?.completedSets ?? 0) > 0) { store.requestFinish() }
                    .accessibilityIdentifier("watch.controls.finish")
                WatchActionButton(title: "Cancel Workout", systemImage: "xmark", style: .quietDestructive, height: height,
                                  enabled: canControl) { store.requestCancelWorkout() }
                    .accessibilityIdentifier("watch.controls.cancel")
                if store.canStartHealthManually, !healthStartFailed {
                    WatchActionButton(title: "Record to Health", systemImage: "heart", style: .quiet, height: height) {
                        store.retryHealthStart()
                    }
                    .accessibilityIdentifier("watch.controls.recordHealth")
                }
            } else {
                WatchPanelCopy(phase == .finishing ? "Finishing — controls are closed." : "No workout in progress.",
                               color: WatchPhysiqueOSTheme.muted)
                if store.projection?.finish?.healthFailed == true {
                    WatchActionButton(title: "Retry Health Save", systemImage: "heart.fill", style: .warning, height: height) {
                        store.retryHealthFinish()
                    }
                }
            }
            Spacer(minLength: 0)
        }
    }

    private func cancelConfirmation(_ layout: WatchExecutionLayout) -> some View {
        VStack(spacing: layout.spacing + 2) {
            WatchPanelTitle("Cancel this workout?")
            WatchPanelCopy("This discards the workout. Completed sets will not be saved to training history.")
                .minimumScaleFactor(0.85)
            Spacer(minLength: 0)
            WatchActionButton(title: "Keep Workout", style: .quiet, height: layout.buttonHeight) {
                store.dismissCancelWorkout()
            }
            .accessibilityIdentifier("watch.controls.keepWorkout")
            WatchEdgeCapsuleButton(
                title: "Cancel Workout", layout: layout,
                enabled: !store.isMutationPending && store.connectionState == .reachable,
                tint: WatchPhysiqueOSTheme.destructive, foreground: .white
            ) { store.confirmCancelWorkout() }
            .accessibilityIdentifier("watch.controls.confirmCancel")
        }
    }
}

// MARK: - Workout Saved

struct WatchWorkoutSummaryView: View {
    @Bindable var store: WatchWorkoutStore
    let projection: WatchWorkoutProjection

    var body: some View {
        GeometryReader { geometry in
            let layout = WatchExecutionLayout(size: geometry.size)
            VStack(spacing: 4) {
                ScrollView {
                    VStack(spacing: 5) {
                        WatchPanelIcon(systemName: "checkmark", color: WatchPhysiqueOSTheme.success)
                        WatchPanelTitle("WORKOUT SAVED")
                        WatchPanelCopy("\(projection.completedSets) completed sets")
                        LazyVGrid(
                            columns: [.init(.flexible(), spacing: 4), .init(.flexible(), spacing: 4)],
                            spacing: 4
                        ) {
                            if let duration = projection.summary?.activeDurationSeconds {
                                summaryMetric("\(Int(duration) / 60)m", "ACTIVE")
                            }
                            if let volume = projection.summary?.volume {
                                summaryMetric("\(Int(volume.rounded()).formatted())", "LB VOLUME")
                            }
                            if let calories = store.health.activeCalories {
                                summaryMetric(WatchWorkoutClock.wholeNumber(calories), "ACTIVE CAL")
                            }
                            if let heartRate = store.health.averageHeartRateBPM {
                                summaryMetric("\(Int(heartRate.rounded()))", "AVG BPM")
                            }
                            if let prs = projection.summary?.authoritativePRCount {
                                summaryMetric("\(prs)", "PR\(prs == 1 ? "" : "S")")
                            }
                        }
                        .padding(.top, 2)
                        if let health = healthLine {
                            Text(health)
                                .font(WatchType.font(9, 500))
                                .foregroundStyle(WatchPhysiqueOSTheme.muted)
                                .multilineTextAlignment(.center)
                        }
                    }
                    .padding(.horizontal, 9)
                }
                WatchEdgeCapsuleButton(title: "Done", layout: layout) { store.dismissSummary() }
                    .padding(.horizontal, 9)
                    .accessibilityIdentifier("watch.summary.done")
            }
            .frame(width: geometry.size.width, height: geometry.size.height)
        }
        .ignoresSafeArea(edges: .bottom)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("watch.summary")
    }

    private var healthLine: String? {
        guard let finish = projection.finish, finish.healthExpected else { return nil }
        if finish.healthSaved { return "Saved to Apple Health" }
        if finish.healthFailed { return "Apple Health save needs retry" }
        return "Saving to Apple Health…"
    }

    private func summaryMetric(_ value: String, _ label: String) -> some View {
        VStack(spacing: 1) {
            Text(value)
                .font(WatchType.font(14, 700))
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.65)
            Text(label).font(WatchType.font(8, 760)).foregroundStyle(WatchPhysiqueOSTheme.muted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 6)
        .padding(.horizontal, 3)
        .background(WatchPhysiqueOSTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .accessibilityElement(children: .combine)
    }
}
