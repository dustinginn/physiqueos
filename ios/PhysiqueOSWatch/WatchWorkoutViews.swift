import SwiftUI

enum WatchPhysiqueOSTheme {
    static let background = Color(red: 8 / 255, green: 13 / 255, blue: 24 / 255)
    static let surface = Color(red: 20 / 255, green: 31 / 255, blue: 49 / 255)
    static let secondarySurface = Color(red: 23 / 255, green: 34 / 255, blue: 53 / 255)
    static let purple = Color(red: 139 / 255, green: 140 / 255, blue: 255 / 255)
    static let text = Color(red: 244 / 255, green: 246 / 255, blue: 255 / 255)
    static let muted = Color(red: 154 / 255, green: 164 / 255, blue: 186 / 255)
    static let success = Color(red: 63 / 255, green: 214 / 255, blue: 141 / 255)
    static let warning = Color(red: 255 / 255, green: 190 / 255, blue: 92 / 255)
    static let destructive = Color(red: 255 / 255, green: 105 / 255, blue: 122 / 255)
    /// The phone Logger's progress green (`PhysiqueOSTheme.chartSuccess`).
    static let progress = Color(red: 74 / 255, green: 222 / 255, blue: 128 / 255)
    /// Metric icon accents (phone chart palette); Heart Rate keeps its pink.
    static let timeAccent = Color(red: 96 / 255, green: 165 / 255, blue: 250 / 255)
    static let activeEnergyAccent = Color(red: 251 / 255, green: 191 / 255, blue: 36 / 255)
    static let totalEnergyAccent = Color(red: 74 / 255, green: 222 / 255, blue: 128 / 255)
    static let nutritionAccent = Color(red: 192 / 255, green: 132 / 255, blue: 252 / 255)
    static let heartRateAccent = destructive
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
/// sizes start generous and shrink toward legible minimums until the whole
/// page fits the space below the clock. Critical values never go below the
/// minimums (Load/Reps 24 pt, rest 22 pt, a 32 pt tall primary action).
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
        spacing = isCompact ? 2 : 3
        headerHeight = isCompact ? 19 : 22
        bottomPadding = isCompact ? 3 : 6
        horizontalInset = isCompact ? 4 : 6
        rowHeight = 24
        metricHeight = 50
        metricFont = 31
        restFont = 29
        buttonHeight = 42
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
        headerHeight + rowHeight * 2 + 2 + metricHeight
            + (hasRest ? restLineHeight : 0)
            + buttonHeight + bottomPadding
            + spacing * (hasRest ? 4 : 3)
    }

    var restLineHeight: CGFloat { (restFont * 1.2).rounded(.up) }

    /// Where content starts: just below the system clock. A vertical page
    /// reserves more than the clock needs (Ultra 56 pt for a clock ending
    /// near 38 pt), so the page starts at 70% of that inset.
    static func topInset(safeAreaTop: CGFloat) -> CGFloat { (safeAreaTop * 0.7).rounded() }
}

struct WatchWorkoutRootView: View {
    @Bindable var store: WatchWorkoutStore
    @Environment(\.isLuminanceReduced) private var isLuminanceReduced

    var body: some View {
        ZStack {
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
            ScrollView { WatchOrphanHealthBanner(store: store).padding(.horizontal, 6) }
        } else {
            idle
        }
    }

    private var idle: some View {
        VStack(spacing: 10) {
            Image(systemName: store.connectionState == .phoneUnavailable ? "iphone.slash" : "applewatch")
                .font(.title2)
                .foregroundStyle(WatchPhysiqueOSTheme.purple)
            Text(store.connectionState == .phoneUnavailable ? "Phone unavailable" : "Prepare a workout on iPhone")
                .font(.headline)
                .multilineTextAlignment(.center)
            Text(store.connectionState == .phoneUnavailable
                 ? "Health may continue. Set logging waits for iPhone."
                 : "Build the exercises and sets, then choose Ready for Watch.")
                .font(.caption2)
                .foregroundStyle(WatchPhysiqueOSTheme.muted)
                .multilineTextAlignment(.center)
            Button("Refresh") { store.refresh() }
                .buttonStyle(.borderedProminent)
                .tint(WatchPhysiqueOSTheme.purple)
        }
        .padding()
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("watch.idle")
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
        ScrollView {
            VStack(spacing: 10) {
                Text("READY FOR WATCH")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(WatchPhysiqueOSTheme.purple)
                Text(projection.title)
                    .font(.title3.bold())
                    .multilineTextAlignment(.center)
                Text("\(projection.totalSets) planned sets")
                    .font(.caption)
                    .foregroundStyle(WatchPhysiqueOSTheme.muted)
                Button {
                    store.startPreparedWorkout()
                } label: {
                    Label("Start Workout", systemImage: "play.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(WatchPhysiqueOSTheme.purple)
                .disabled(store.isMutationPending || store.connectionState != .reachable)
                if store.orphanedHealthSessionId != nil {
                    WatchOrphanHealthBanner(store: store)
                }
            }
            .padding(.horizontal, 8)
        }
    }
}

/// An Apple Health workout still recording on this Watch for a session the
/// iPhone is not showing (Save & Leave, a newer session, a lost record).
/// Nothing is discarded automatically; the Founder chooses.
struct WatchOrphanHealthBanner: View {
    @Bindable var store: WatchWorkoutStore

    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: "heart.text.square").font(.title3).foregroundStyle(WatchPhysiqueOSTheme.warning)
            Text("Apple Health workout still recording")
                .font(.system(size: 14, weight: .bold)).multilineTextAlignment(.center)
            Text("iPhone isn't showing this workout. Save it to Apple Health or discard it.")
                .font(.system(size: 11, weight: .medium)).foregroundStyle(WatchPhysiqueOSTheme.muted)
                .multilineTextAlignment(.center)
            Button("End & Save") { store.saveOrphanedWorkout() }
                .buttonStyle(.borderedProminent).tint(WatchPhysiqueOSTheme.purple)
                .accessibilityIdentifier("watch.orphan.save")
            Button("Discard", role: .destructive) { store.discardOrphanedWorkout() }
                .buttonStyle(.bordered).tint(WatchPhysiqueOSTheme.destructive)
                .accessibilityIdentifier("watch.orphan.discard")
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("watch.orphan")
    }
}

// MARK: - Execution (fixed, non-scrolling)

struct WatchWorkoutExecutionView: View {
    @Bindable var store: WatchWorkoutStore
    let projection: WatchWorkoutProjection
    var forceReducedLuminance = false
    @Environment(\.isLuminanceReduced) private var isLuminanceReduced

    var body: some View {
        TimelineView(.periodic(from: .now, by: (isLuminanceReduced || forceReducedLuminance) ? 15 : 1)) { context in
            GeometryReader { geometry in
                // Insets come from this safe-area-respecting reader; only the
                // content below extends to the physical top and bottom.
                let fullHeight = geometry.size.height + geometry.safeAreaInsets.top + geometry.safeAreaInsets.bottom
                let topInset = WatchExecutionLayout.topInset(safeAreaTop: geometry.safeAreaInsets.top)
                let available = CGSize(width: geometry.size.width, height: fullHeight - topInset)
                let layout = WatchExecutionLayout(size: available, hasRest: store.visibleRest != nil)
                VStack(spacing: layout.spacing) {
                    header(layout)
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
                    }
                }
                .padding(.horizontal, layout.horizontalInset)
                .padding(.top, topInset)
                .frame(width: geometry.size.width, height: fullHeight, alignment: .top)
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
        VStack(spacing: 2) {
            HStack(spacing: 4) {
                Text("\(projection.completedSets)/\(projection.totalSets) SETS")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(WatchPhysiqueOSTheme.muted)
                    .fixedSize()
                Spacer(minLength: 2)
                if let status = statusText {
                    Text(status.text)
                        .font(.system(size: 9, weight: .black))
                        .foregroundStyle(status.color)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                } else {
                    Text(projection.title).font(.system(size: 10, weight: .semibold)).lineLimit(1)
                }
            }
            ProgressView(value: Double(projection.completedSets), total: Double(max(projection.totalSets, 1)))
                .tint(WatchPhysiqueOSTheme.progress)
                .accessibilityIdentifier("watch.progress")
        }
        .frame(height: layout.headerHeight)
        .padding(.trailing, Self.pageIndicatorClearance)
    }

    /// The vertical page indicator sits on the trailing edge just below the
    /// clock; upper content keeps clear of it.
    static let pageIndicatorClearance: CGFloat = 9

    private var statusText: (text: String, color: Color)? {
        if store.shouldShowAuthorityWarning(at: Date()) { return ("IPHONE UNAVAILABLE · HEALTH ON", WatchPhysiqueOSTheme.warning) }
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
        case .finishPending, nil: return nil
        }
    }

    private func contextRows(_ layout: WatchExecutionLayout) -> some View {
        VStack(spacing: 2) {
            ForEach(Array(projection.rows.enumerated()), id: \.offset) { _, row in
                HStack(spacing: 4) {
                    Text(row.role == "upNext" ? "UP NEXT" : row.role.uppercased())
                        .font(.system(size: 8, weight: .bold))
                        .foregroundStyle(row.isCompletionTarget ? WatchPhysiqueOSTheme.purple : WatchPhysiqueOSTheme.muted)
                        .fixedSize()
                    Text([row.supersetLabel, row.exerciseName].compactMap { $0 }.joined(separator: " · "))
                        .font(.system(size: row.isCompletionTarget ? 13 : 11, weight: .bold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                    Spacer(minLength: 2)
                    Text(row.setCount == 1 ? "ONLY SET" : "\(row.setNumber)/\(row.setCount)")
                        .font(.system(size: 9, weight: .semibold))
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
        HStack(spacing: 4) {
            metricTile(value: row.loadText ?? "—", label: "LOAD", layout)
            metricTile(value: row.repsText ?? "—", label: "REPS", layout)
        }
    }

    private func metricTile(value: String, label: String, _ layout: WatchExecutionLayout) -> some View {
        VStack(spacing: 0) {
            Text(value)
                .font(.system(size: layout.metricFont, weight: .black, design: .rounded))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(label).font(.system(size: 8, weight: .bold)).foregroundStyle(WatchPhysiqueOSTheme.muted)
        }
        .frame(maxWidth: .infinity)
        .frame(height: layout.metricHeight)
        .background(WatchPhysiqueOSTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 10))
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
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(rest.mode == .countdown ? "REST LEFT" : "REST")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(WatchPhysiqueOSTheme.muted)
                    .fixedSize()
                Text(WatchWorkoutClock.format(seconds))
                    .font(.system(size: layout.restFont, weight: .black, design: .rounded))
                    .monospacedDigit()
            }
            .frame(height: layout.restLineHeight)
            .accessibilityIdentifier("watch.rest")
        }
    }

    @ViewBuilder
    private func primaryAction(_ layout: WatchExecutionLayout) -> some View {
        if store.shouldShowAuthorityWarning(at: Date()) {
            WatchEdgeCapsuleButton(
                title: "Retry iPhone", layout: layout, enabled: true,
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
                enabled: projection.canCompleteSet && !store.isMutationPending && store.connectionState == .reachable
            ) { store.completeSet() }
            .accessibilityIdentifier("watch.execution.completeSet")
        }
    }
}

/// The bottom primary action: a capsule sitting on the lower edge of the
/// display, inset so its rounded ends follow the Watch's corner curve.
struct WatchEdgeCapsuleButton: View {
    let title: String
    let layout: WatchExecutionLayout
    var enabled = true
    var tint: Color = WatchPhysiqueOSTheme.purple
    var foreground: Color = WatchPhysiqueOSTheme.background
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: layout.isCompact ? 16 : 17, weight: .bold))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity)
                .frame(height: layout.buttonHeight)
                .background(tint)
                .foregroundStyle(foreground)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.45)
        .padding(.horizontal, layout.isCompact ? 6 : 8)
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
        VStack(spacing: layout.spacing + 2) {
            if !layout.isCompact {
                Image(systemName: "flag.checkered")
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(WatchPhysiqueOSTheme.purple)
            }
            Text("Finish workout?")
                .font(.system(size: layout.isCompact ? 17 : 19, weight: .bold))
            Text(remaining == 0
                 ? "All \(projection.totalSets) sets complete."
                 : "\(remaining) set\(remaining == 1 ? "" : "s") not done. Only completed sets count.")
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(WatchPhysiqueOSTheme.muted)
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .minimumScaleFactor(0.85)
            if store.connectionState != .reachable || store.isWaitingForPhone(at: date) {
                Text("Waiting for iPhone")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(WatchPhysiqueOSTheme.warning)
            }
            Spacer(minLength: 0)
            Button(action: store.cancelFinish) {
                Text("Not Yet")
                    .font(.system(size: 15, weight: .semibold))
                    .frame(maxWidth: .infinity)
                    .frame(height: layout.buttonHeight - 4)
                    .background(WatchPhysiqueOSTheme.surface)
                    .foregroundStyle(WatchPhysiqueOSTheme.text)
                    .clipShape(Capsule())
            }
            .buttonStyle(.plain)
            .padding(.horizontal, layout.isCompact ? 6 : 8)
            .accessibilityIdentifier("watch.finishConfirmation.notYet")
            if store.connectionState != .reachable || store.isWaitingForPhone(at: date) {
                WatchEdgeCapsuleButton(title: "Retry", layout: layout, tint: WatchPhysiqueOSTheme.warning) {
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
                    Image(systemName: "exclamationmark.arrow.triangle.2.circlepath")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(WatchPhysiqueOSTheme.warning)
                }
                Text(reason)
                    .font(.system(size: 15, weight: .bold))
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .minimumScaleFactor(0.85)
                Text("Sets are safe on iPhone.")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(WatchPhysiqueOSTheme.muted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
                legs
                Spacer(minLength: 0)
                WatchEdgeCapsuleButton(title: "Retry", layout: layout, tint: WatchPhysiqueOSTheme.warning) {
                    store.retryPending()
                }
                .accessibilityIdentifier("watch.finishing.retry")
            } else {
                ProgressView().tint(WatchPhysiqueOSTheme.purple)
                Text("Saving workout…")
                    .font(.system(size: 16, weight: .bold))
                legs
                Spacer(minLength: 0)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("watch.finishing")
    }

    private var legs: some View {
        VStack(spacing: 2) {
            leg("PhysiqueOS", done: projection.finish?.serverCommitted == true)
            if projection.finish?.healthExpected != false {
                leg("Apple Health", done: projection.finish?.healthSaved == true, failed: projection.finish?.healthFailed == true)
            }
        }
    }

    private func leg(_ title: String, done: Bool, failed: Bool = false) -> some View {
        HStack(spacing: 4) {
            Image(systemName: done ? "checkmark.circle.fill" : failed ? "exclamationmark.circle" : "circle.dotted")
                .foregroundStyle(done ? WatchPhysiqueOSTheme.success : failed ? WatchPhysiqueOSTheme.warning : WatchPhysiqueOSTheme.muted)
            Text(title).font(.system(size: 11, weight: .semibold)).foregroundStyle(WatchPhysiqueOSTheme.muted)
        }
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
                Text("WORKOUT METRICS").font(.system(size: 9, weight: .bold)).foregroundStyle(WatchPhysiqueOSTheme.purple)
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
                    value: store.health.activeCalories.map { "\(WatchWorkoutClock.wholeNumber($0)) CAL" } ?? "—",
                    icon: "flame.fill", accent: WatchPhysiqueOSTheme.activeEnergyAccent
                )
                WatchMetricRow(
                    compact: compact,
                    label: "TOTAL CALORIES",
                    value: store.health.totalCalories.map { "\(WatchWorkoutClock.wholeNumber($0)) CAL" } ?? "—",
                    icon: "sum", accent: WatchPhysiqueOSTheme.totalEnergyAccent
                )
                WatchMetricRow(
                    compact: compact,
                    label: "HEART RATE",
                    value: store.health.currentHeartRateBPM.map { "\(Int($0.rounded())) BPM" } ?? "—",
                    icon: "heart.fill", accent: WatchPhysiqueOSTheme.heartRateAccent
                )
            }
            .padding(.horizontal, 6)
            .padding(.trailing, WatchWorkoutExecutionView.pageIndicatorClearance)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("watch.metrics")
    }
}

/// One metric row. Only the icon carries the accent; every card shares the
/// same PhysiqueOS surface.
struct WatchMetricRow: View {
    var compact = false
    let label: String
    let value: String
    let icon: String
    let accent: Color
    var caption: String? = nil

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(accent)
                .frame(width: 20)
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 4) {
                    Text(label).font(.system(size: 8, weight: .bold)).foregroundStyle(WatchPhysiqueOSTheme.muted)
                    if let caption {
                        Text(caption).font(.system(size: 8, weight: .bold)).foregroundStyle(WatchPhysiqueOSTheme.muted.opacity(0.75))
                    }
                }
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                Text(value)
                    .font(.system(size: 17, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 7)
        .padding(.vertical, compact ? 3 : 5)
        .background(WatchPhysiqueOSTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 9))
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
                Text("DAILY TOTALS").font(.system(size: 9, weight: .bold)).foregroundStyle(WatchPhysiqueOSTheme.purple)
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
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(WatchPhysiqueOSTheme.muted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                    .accessibilityIdentifier("watch.dailyTotals.freshness")
            }
            .padding(.horizontal, 6)
            .padding(.trailing, WatchWorkoutExecutionView.pageIndicatorClearance)
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
                let layout = WatchExecutionLayout(size: geometry.size)
                Group {
                    if store.cancelConfirmationVisible {
                        cancelConfirmation(layout)
                    } else if store.presentedPhase == .finishConfirmation, let projection = store.projection {
                        WatchFinishConfirmationPanel(store: store, projection: projection, layout: layout, date: context.date)
                    } else {
                        controls(layout)
                    }
                }
                .padding(.horizontal, layout.horizontalInset + 2)
                .frame(width: geometry.size.width, height: geometry.size.height, alignment: .top)
            }
        }
        .ignoresSafeArea(edges: .bottom)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("watch.controls")
    }

    private func controls(_ layout: WatchExecutionLayout) -> some View {
        let phase = store.presentedPhase
        let canControl = (phase == .active || phase == .paused)
            && !store.isMutationPending && store.connectionState == .reachable
        return VStack(spacing: layout.isCompact ? 5 : 7) {
            Text("WORKOUT CONTROLS")
                .font(.system(size: 9, weight: .bold))
                .foregroundStyle(WatchPhysiqueOSTheme.muted)
                .accessibilityIdentifier("watch.controls.title")
            if store.shouldShowAuthorityWarning(at: Date()) {
                controlButton(
                    "Retry iPhone", icon: "arrow.clockwise", tint: WatchPhysiqueOSTheme.warning,
                    prominent: true, enabled: true, layout
                ) { store.retryAuthorityConnection() }
                    .accessibilityIdentifier("watch.controls.retryPhone")
            }
            if phase == .active || phase == .paused {
                controlButton(phase == .paused ? "Resume" : "Pause",
                              icon: phase == .paused ? "play.fill" : "pause.fill",
                              tint: WatchPhysiqueOSTheme.purple, prominent: true, enabled: canControl, layout) {
                    store.pauseOrResume()
                }
                .accessibilityIdentifier("watch.controls.pauseResume")
                controlButton("Finish Workout", icon: "flag.checkered", tint: WatchPhysiqueOSTheme.purple,
                              enabled: canControl && (store.projection?.completedSets ?? 0) > 0, layout) { store.requestFinish() }
                    .accessibilityIdentifier("watch.controls.finish")
                controlButton("Cancel Workout", icon: "xmark", tint: WatchPhysiqueOSTheme.destructive,
                              enabled: canControl, layout) { store.requestCancelWorkout() }
                    .accessibilityIdentifier("watch.controls.cancel")
                if store.notice == .healthStartFailed {
                    controlButton("Retry Health Start", icon: "heart", tint: WatchPhysiqueOSTheme.warning, enabled: true, layout) {
                        store.retryHealthStart()
                    }
                }
            } else {
                Text(phase == .finishing ? "Finishing — controls are closed." : "No workout in progress.")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(WatchPhysiqueOSTheme.muted)
                    .multilineTextAlignment(.center)
                if store.projection?.finish?.healthFailed == true {
                    controlButton("Retry Health Save", icon: "heart", tint: WatchPhysiqueOSTheme.warning, enabled: true, layout) {
                        store.retryHealthFinish()
                    }
                }
            }
            Spacer(minLength: 0)
        }
    }

    private func controlButton(
        _ title: String, icon: String, tint: Color, prominent: Bool = false, enabled: Bool,
        _ layout: WatchExecutionLayout, action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Label(title, systemImage: icon)
                .font(.system(size: 15, weight: .semibold))
                .frame(maxWidth: .infinity)
                .frame(height: layout.isCompact ? 34 : 38)
                .background(prominent ? tint : WatchPhysiqueOSTheme.surface)
                .foregroundStyle(prominent ? WatchPhysiqueOSTheme.background : tint)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.45)
    }

    private func cancelConfirmation(_ layout: WatchExecutionLayout) -> some View {
        VStack(spacing: layout.spacing + 2) {
            Text("Cancel this workout?")
                .font(.headline).multilineTextAlignment(.center)
            Text("This discards the workout. Completed sets will not be saved to training history.")
                .font(.caption2).foregroundStyle(WatchPhysiqueOSTheme.muted).multilineTextAlignment(.center)
                .minimumScaleFactor(0.85)
            Spacer(minLength: 0)
            Button("Keep Workout") { store.dismissCancelWorkout() }
                .buttonStyle(.bordered).tint(WatchPhysiqueOSTheme.purple)
            WatchEdgeCapsuleButton(
                title: "Cancel Workout", layout: layout,
                enabled: !store.isMutationPending && store.connectionState == .reachable,
                tint: WatchPhysiqueOSTheme.destructive, foreground: WatchPhysiqueOSTheme.text
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
            VStack(spacing: 0) {
                ScrollView {
                    VStack(spacing: 6) {
                        Image(systemName: "checkmark.circle.fill").font(.title2).foregroundStyle(WatchPhysiqueOSTheme.success)
                        Text("WORKOUT SAVED").font(.headline)
                        Text("\(projection.completedSets) completed sets").font(.caption).foregroundStyle(WatchPhysiqueOSTheme.muted)
                        LazyVGrid(
                            columns: [.init(.flexible()), .init(.flexible())],
                            spacing: 5
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
                        if let health = healthLine {
                            Text(health)
                                .font(.caption2).foregroundStyle(WatchPhysiqueOSTheme.muted).multilineTextAlignment(.center)
                        }
                    }
                    .padding(.horizontal, 6)
                }
                WatchEdgeCapsuleButton(title: "Done", layout: layout) { store.dismissSummary() }
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
        VStack(spacing: 0) {
            Text(value).font(.system(size: 15, weight: .bold, design: .rounded)).lineLimit(1).minimumScaleFactor(0.65)
            Text(label).font(.system(size: 8, weight: .bold)).foregroundStyle(WatchPhysiqueOSTheme.muted)
        }
        .frame(maxWidth: .infinity, minHeight: 36)
        .background(WatchPhysiqueOSTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 9))
    }
}
