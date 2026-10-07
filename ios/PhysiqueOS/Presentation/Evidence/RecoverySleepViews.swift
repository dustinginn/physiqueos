import SwiftUI

// Recovery / Sleep Evidence screens (design report 20261001T032718Z, approved
// prototype 20261001T040311Z). Descriptive only: no score, target, good/bad
// language, coaching, Briefing, Goal or Confidence content.
//
// Presentation follows the Founder-locked Recovery design
// (`energy-weight-recovery-evidence-style-translation-20261004` R1–R6 and
// Founder correction `a21296ec` R1–R2) in the `.weight` harness family it
// shares with Weight and Energy. Every value, status, scope rule, route and
// read is unchanged.

enum RecoverySleepDestination {
    static let trendsStreamId = "recovery/sleep/trends"
    static let nightStreamPrefix = "recovery/sleep/night/"

    static func night(_ sleepDay: String) -> AppDestination {
        .progressStream(streamId: nightStreamPrefix + sleepDay)
    }

    static var trends: AppDestination { .progressStream(streamId: trendsStreamId) }

    /// The sleep day of a `recovery/sleep/night/<YYYY-MM-DD>` stream id.
    static func sleepDay(fromStreamId streamId: String) -> String? {
        guard streamId.hasPrefix(nightStreamPrefix) else { return nil }
        let day = String(streamId.dropFirst(nightStreamPrefix.count))
        return RecoverySleepQuery.isSleepDayKey(day) ? day : nil
    }
}

// MARK: - Shared chrome and components

private let rm = EvidenceMetrics(family: .weight)

private extension View {
    /// The locked flat navigation bar and page canvas. The back label comes
    /// from the Evidence back trail (`‹ Evidence Hub`, `‹ Recovery`,
    /// `‹ Sleep Trends`, `‹ All Nights`). Charts scrub horizontally, so the
    /// content-area pop gesture stays suppressed; the edge swipe still pops.
    func recoverySleepPage(_ trailTitle: String) -> some View {
        self
            .evidencePageChrome(trailTitle)
            .evidenceFamily(.weight)
            .suppressesContentAreaPopGesture()
    }
}

/// `.report-head`: eyebrow, 30 px title, subtitle (locked R1/R2 have no mark).
private struct SleepReportHeader: View {
    let eyebrow: String
    let title: String
    let subtitle: String

    var body: some View {
#if DEBUG
        if EvidenceVisualSystemReview.isEnabled {
            // Build 91 review: Recovery gains the same hero mark as its
            // Weight/Energy siblings.
            HStack(alignment: .top, spacing: rm.pt(12)) {
                EvidenceReviewHeroMark(category: .recovery, diameter: rm.pt(38))
                lockedBody
            }
        } else {
            lockedBody
        }
#else
        lockedBody
#endif
    }

    private var lockedBody: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(eyebrow)
                .evidenceText(.normal(11, 800, jakarta: false, tracking: 1.43, uppercase: true))
                .foregroundStyle(rm.c.accent)
            Text(title)
                .evidenceText(EvidenceTextStyle(size: 30, weight: 780, lineHeight: 31.5, tracking: -1.2))
                .foregroundStyle(rm.c.ink)
                .accessibilityAddTraits(.isHeader)
            Text(subtitle)
                .evidenceText(EvidenceTextStyle(size: 13, weight: 400, lineHeight: 17.55))
                .foregroundStyle(rm.c.muted)
                .padding(.top, rm.pt(4))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, rm.pt(3))
        .padding(.bottom, rm.pt(17))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("evidence.page.header")
    }
}

/// The section action text (`See trends ›`, `12 nights`, `Oct 1`).
private struct SleepSectionAction: View {
    let text: String
    var body: some View {
        Text(text)
            .evidenceText(.normal(10, 760, jakarta: false))
            .foregroundStyle(rm.c.accent)
    }
}

/// `.section` (open, not contained): title + action above a top-ruled list.
private struct SleepOpenSection<Trailing: View, Content: View>: View {
    let title: String
    let identifier: String
    @ViewBuilder var trailing: Trailing
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: rm.pt(8)) {
                Text(title)
                    .evidenceText(.normal(16, 800, jakarta: false, tracking: -0.32))
                    .foregroundStyle(rm.c.ink)
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: 0)
                trailing
            }
            .padding(.bottom, rm.pt(10))
            VStack(spacing: 0) { content }
                .overlay(alignment: .top) { Rectangle().fill(rm.c.line).frame(height: rm.pt(1)) }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier(identifier)
    }
}

/// A contained section whose trailing element is a view (a link or a
/// status), not the plain toggle `WeightSection` takes.
private struct SleepSection<Trailing: View, Content: View>: View {
    let title: String
    let identifier: String
    @ViewBuilder var trailing: Trailing
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: rm.pt(8)) {
                Text(title)
                    .evidenceText(.normal(16, 800, jakarta: false, tracking: -0.32))
                    .foregroundStyle(rm.c.ink)
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: 0)
                trailing
            }
            .padding(.bottom, rm.pt(10))
            content
        }
        .padding(rm.pt(13 + 1))
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(rm.c.surface, in: RoundedRectangle(cornerRadius: rm.pt(15)))
        .overlay(RoundedRectangle(cornerRadius: rm.pt(15)).strokeBorder(rm.c.line, lineWidth: rm.pt(1)))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier(identifier)
    }
}

extension SleepSection where Trailing == EmptyView {
    init(title: String, identifier: String, @ViewBuilder content: () -> Content) {
        self.init(title: title, identifier: identifier, trailing: { EmptyView() }, content: content)
    }
}

/// `.footnote`: 10 px quiet copy.
private struct SleepFootnote: View {
    let text: String
    var body: some View {
        Text(text)
            .evidenceText(EvidenceTextStyle(size: 10, weight: 400, lineHeight: 14))
            .foregroundStyle(rm.c.quiet)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, rm.pt(5))
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// `.notice`: amber-tinted factual note (recalculation, absence).
private struct SleepNotice: View {
    let text: String
    var body: some View {
        Text(text)
            .evidenceText(EvidenceTextStyle(size: 9.5, weight: 500, lineHeight: 13.3))
            .foregroundStyle(rm.c.muted)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, rm.pt(10))
            .padding(.vertical, rm.pt(9))
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(rm.c.amber.opacity(0.12), in: RoundedRectangle(cornerRadius: rm.pt(10)))
            .accessibilityElement(children: .combine)
    }
}

private struct SleepRecalculatingNote: View {
    let detail: String
    var body: some View {
        VStack(alignment: .leading, spacing: rm.pt(2)) {
            Text("Stage detail is being recalculated.")
                .evidenceText(EvidenceTextStyle(size: 9.5, weight: 700, lineHeight: 13.3))
                .foregroundStyle(rm.c.ink)
            Text(detail)
                .evidenceText(EvidenceTextStyle(size: 9.5, weight: 500, lineHeight: 13.3))
                .foregroundStyle(rm.c.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, rm.pt(10))
        .padding(.vertical, rm.pt(9))
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(rm.c.amber.opacity(0.12), in: RoundedRectangle(cornerRadius: rm.pt(10)))
    }
}

private let notAvailableText = "Sleep from Apple Health will appear here once it is available for your account."
private let noDataText = "Sleep from Apple Health will appear here after your first synced night."

/// The shared Goal-context selector (Build Lean Mass / Visible Abs / All
/// Sleep): the same control the other Evidence verticals use, driving one
/// selection that applies to the landing, Trends and the night history.
private struct SleepScopeSelector: View {
    @Environment(AppEnvironment.self) private var environment

    var body: some View {
        let store = environment.recoverySleepScope
        WeightScopePills(scope: store.scopeContext(today: environment.recoverySleepAPI.today())) { pillID in
            if let scope = RecoverySleepScope(pillID: pillID) { store.select(scope) }
        }
        .padding(.bottom, rm.pt(18))
    }
}

/// What a screen shows in place of its content when the selected scope has
/// no range to read (Goal dates unknown) or no Sleep Evidence.
private struct SleepScopeStateCard: View {
    let store: RecoverySleepScopeStore
    let range: RecoverySleepScopeRange?
    let retry: () -> Void

    var body: some View {
        if let range, range.isEmpty {
            WeightStatePanel(title: "No Sleep Evidence falls inside this Goal's dates.", identifier: "sleep.scope.empty")
        } else if store.windowsState == .failed {
            WeightStatePanel(title: "This Goal's dates could not be loaded.", identifier: "sleep.scope.failed",
                             actionLabel: "Try again", onAction: retry)
        } else {
            WeightStatePanel(title: "Loading Goal dates…", loading: true, identifier: "sleep.scope.loading")
        }
    }
}

// MARK: - Night row

/// Locked `.row`: day + `Updating` tag, window (or status), trailing
/// duration with the accent chevron.
struct RecoverySleepNightRow: View {
    let night: RecoverySleepNightSummary

    var body: some View {
        let clock = night.clock
        HStack(alignment: .center, spacing: rm.pt(10)) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: rm.pt(6)) {
                    Text(SleepEvidenceFormat.sleepDay(night.sleepDay))
                        .evidenceText(.normal(12, 790, jakarta: false))
                        .foregroundStyle(rm.c.ink)
                    if night.windowOpen { EnergyTag(text: "Updating", warn: true) }
                }
                Group {
                    if let window = clock.window {
                        Text(window + (!clock.isClockTimeCaution && clock.showsZone ? (clock.zoneLabel.map { " · \($0)" } ?? "") : ""))
                    } else if let status = night.statusText {
                        Text(status)
                    }
                }
                .evidenceText(EvidenceTextStyle(size: 9.5, weight: 400, lineHeight: 12.825))
                .foregroundStyle(rm.c.quiet)
                .padding(.top, rm.pt(3))
                if night.secondaryEpisodeCount > 0, let total = night.totalAsleepIncludingSecondarySeconds, let main = night.asleepSeconds {
                    Text("+ \(SleepEvidenceFormat.duration(total - main)) additional sleep")
                        .evidenceText(EvidenceTextStyle(size: 9.5, weight: 400, lineHeight: 12.825))
                        .foregroundStyle(rm.c.quiet)
                }
            }
            Spacer(minLength: 0)
            Text(night.hasSleep ? SleepEvidenceFormat.duration(night.asleepSeconds) : "—")
                .evidenceText(.normal(11, 760, jakarta: false, digits: true))
                .foregroundStyle(rm.c.muted)
            Text("›")
                .evidenceText(.normal(16, 400, jakarta: false))
                .foregroundStyle(rm.c.accent)
        }
        .padding(.vertical, rm.pt(10))
        .padding(.horizontal, rm.pt(2))
        .padding(.bottom, rm.pt(1))
        .frame(minHeight: 44)
        .overlay(alignment: .bottom) { Rectangle().fill(rm.c.line).frame(height: rm.pt(1)) }
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityText)
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("sleep.night.\(night.sleepDay)")
    }

    private var accessibilityText: String {
        let clock = night.clock
        var parts = [SleepEvidenceFormat.sleepDay(night.sleepDay, style: "EEEE, MMMM d")]
        if night.hasSleep {
            parts.append("\(SleepEvidenceFormat.spokenDuration(night.asleepSeconds)) asleep")
            if let window = clock.window { parts.append(window.replacingOccurrences(of: "≈ ", with: "about ")) }
        } else if let status = night.statusText {
            parts.append(status)
        }
        if clock.isClockTimeCaution { parts.append("Clock times approximate") }
        if night.windowOpen { parts.append("Still updating") }
        return parts.joined(separator: ". ")
    }
}

// MARK: - Paged night list (Show All)

/// Locked R6 All Nights: flat bar with `Done` and a centered title, the
/// paged newest-first open list, a footer indicator while the next page
/// loads. Nights open inside the sheet with `‹ All Nights`.
struct RecoverySleepNightsSheet: View {
    let range: RecoverySleepScopeRange
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel: RecoverySleepNightsViewModel?
    @State private var trail = EvidenceBackTrail(seed: ["All Nights"])

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 0) {
                    switch viewModel?.state {
                    case .none, .loading:
                        WeightStatePanel(title: "Loading Sleep Evidence…", loading: true, identifier: "sleep.nights.loading")
                    case .notAvailable:
                        WeightStatePanel(title: notAvailableText, identifier: "sleep.nights.notAvailable")
                    case .failed(let message):
                        WeightStatePanel(title: message, identifier: "sleep.nights.failed")
                    case .loaded:
                        ForEach(viewModel?.items ?? []) { night in
                            NavigationLink(value: RecoverySleepDestination.night(night.sleepDay)) {
                                RecoverySleepNightRow(night: night)
                            }
                            .buttonStyle(.plain)
                            .onAppear {
                                if night.sleepDay == viewModel?.items.last?.sleepDay { Task { await viewModel?.loadMore() } }
                            }
                        }
                        if viewModel?.isLoadingMore == true {
                            ProgressView().tint(rm.c.accent).padding(rm.pt(14))
                        }
                    }
                }
                .overlay(alignment: .top) {
                    if case .loaded = viewModel?.state { Rectangle().fill(rm.c.line).frame(height: rm.pt(1)) }
                }
                .padding(.horizontal, rm.pt(16))
                .padding(.top, rm.pt(10))
                .padding(.bottom, rm.pt(30))
            }
            .background(rm.c.page)
            .navigationDestination(for: AppDestination.self) { destination in
                if case .progressStream(let streamId) = destination, let sleepDay = RecoverySleepDestination.sleepDay(fromStreamId: streamId) {
                    RecoverySleepNightView(sleepDay: sleepDay)
                }
            }
            .navigationTitle("All Nights")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(rm.c.page, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: {
                        Text("Done")
                            .evidenceText(.normal(12, 750, jakarta: false))
                            .foregroundStyle(rm.c.muted)
                            .frame(minWidth: 44, minHeight: 44, alignment: .leading)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("evidence.sheet.done")
                }
                .evidenceFlatToolbarItem()
                ToolbarItem(placement: .principal) {
                    Text("All Nights")
                        .evidenceText(.normal(12, 800, jakarta: false))
                        .foregroundStyle(rm.c.ink)
                        .accessibilityAddTraits(.isHeader)
                }
            }
            .safeAreaInset(edge: .top, spacing: 0) { Rectangle().fill(rm.c.line).frame(height: rm.pt(1)) }
        }
        .environment(\.evidenceBackTrail, trail)
        .evidenceFamily(.weight)
        .accessibilityIdentifier("sleep.nights.sheet")
        .task {
            if viewModel == nil { viewModel = RecoverySleepNightsViewModel(api: environment.recoverySleepAPI, range: range) }
            await viewModel?.loadFirstPage()
        }
    }
}

// MARK: - Recovery landing

struct RecoveryEvidenceView: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var viewModel: RecoverySleepLandingViewModel?
    @State private var viewModelAuthority: NativeAPIEnvironment?
    @State private var selectedDay: String?
    @State private var showsAllNights = false
    @State private var retryNonce = 0

    private var store: RecoverySleepScopeStore { environment.recoverySleepScope }
    private var scopeRange: RecoverySleepScopeRange? { store.range(today: environment.recoverySleepAPI.today()) }
    private var reloadKey: String { "\(environment.nativeAuthority.rawValue)|\(store.selected.rawValue)|\(retryNonce)" }

    var body: some View {
        EvidenceScrollPage(spacing: 0, top: 10) {
            content
        }
        .recoverySleepPage("Recovery")
        .task(id: reloadKey) {
            if viewModelAuthority != environment.nativeAuthority {
                viewModel = RecoverySleepLandingViewModel(api: environment.recoverySleepAPI)
                viewModelAuthority = environment.nativeAuthority
            }
            selectedDay = nil
            await reload()
        }
        .refreshable {
            if environment.nativeAuthority == .founderProduction {
                await environment.productionNativeAPI.invalidateReadResources([RecoverySleepResource.landing, RecoverySleepResource.trends])
            }
            await reload(policy: .reload)
        }
        .refreshesOnForegroundWhenVisible { await reload() }
        .sheet(isPresented: $showsAllNights) {
            if let range = scopeRange { RecoverySleepNightsSheet(range: range) }
        }
        .accessibilityIdentifier("sleep.recovery.landing")
    }

    /// Resolves the selected scope's range (loading the canonical Goal dates
    /// on demand), then reads inside it. "All Sleep" never needs Goal dates.
    private func reload(policy: RecoverySleepReadPolicy = .cacheFirst) async {
        let api = environment.recoverySleepAPI
        if store.selected.isGoal { await store.loadWindows(api: api, authority: environment.nativeAuthority.rawValue) }
        guard let range = store.range(today: api.today()), !range.isEmpty else { return }
        await viewModel?.load(range: range, policy: policy)
    }

    @ViewBuilder
    private var content: some View {
        SleepReportHeader(eyebrow: "Evidence Report", title: "Recovery", subtitle: "Sleep from Apple Health")
        SleepScopeSelector()
        if scopeRange == nil || scopeRange?.isEmpty == true {
            SleepScopeStateCard(store: store, range: scopeRange) { retryNonce += 1 }
        } else {
            landingContent
        }
    }

    @ViewBuilder
    private var landingContent: some View {
        switch viewModel?.state(for: scopeRange) {
        case .none, .loading:
            WeightStatePanel(title: "Loading Sleep Evidence…", loading: true, identifier: "sleep.loading")
        case .notAvailable:
            WeightStatePanel(title: notAvailableText, identifier: "sleep.notAvailable")
        case .failed(let message):
            WeightStatePanel(title: message, detail: "Pull to refresh, or try again.", identifier: "sleep.failed",
                             actionLabel: "Try again") { retryNonce += 1 }
        case .loaded(let landing):
            if landing.state == .noData || landing.lastNight == nil {
                WeightStatePanel(title: noDataText, identifier: "sleep.noData")
            } else {
                loaded(landing)
            }
        }
    }

    @ViewBuilder
    private func loaded(_ landing: RecoverySleepLanding) -> some View {
        if let lastNight = landing.lastNight {
            lastNightSection(lastNight, average: landing.sevenNightAverage, isCurrent: scopeRange?.isCurrent ?? true)
                .padding(.bottom, rm.pt(19))
        }
        sleepChartSection(landing)
            .padding(.bottom, rm.pt(19))
        sleepWindowSection(landing)
            .padding(.bottom, rm.pt(19))
        recentNightsSection(landing)
            .padding(.bottom, rm.pt(19))
        dataSourcesSection(landing.sources)
    }

    /// Locked R1 Last Night: date action, 25 px duration row into the night,
    /// 7-night average row, `Still updating` tag while the window is open.
    private func lastNightSection(_ night: RecoverySleepNightSummary, average: RecoverySleepAverage, isCurrent: Bool) -> some View {
        SleepSection(title: isCurrent ? "Last Night" : "Final Night", identifier: "sleep.lastNight.section") {
            SleepSectionAction(text: SleepEvidenceFormat.sleepDay(night.sleepDay, style: "MMM d"))
        } content: {
            VStack(alignment: .leading, spacing: 0) {
                NavigationLink(value: RecoverySleepDestination.night(night.sleepDay)) {
                    HStack(alignment: .center, spacing: rm.pt(10)) {
                        VStack(alignment: .leading, spacing: 0) {
                            Text(night.hasSleep ? SleepEvidenceFormat.duration(night.asleepSeconds) : "—")
                                .evidenceText(EvidenceTextStyle(size: 25, weight: 780, lineHeight: 26.25, tracking: -1, monospacedDigits: true))
                                .foregroundStyle(rm.c.ink)
                            Text(lastNightCopy(night))
                                .evidenceText(EvidenceTextStyle(size: 9.5, weight: 400, lineHeight: 12.825))
                                .foregroundStyle(rm.c.quiet)
                                .padding(.top, rm.pt(3))
                        }
                        Spacer(minLength: 0)
                        Text("›")
                            .evidenceText(.normal(16, 400, jakarta: false))
                            .foregroundStyle(rm.c.accent)
                    }
                    .padding(.vertical, rm.pt(10))
                    .padding(.horizontal, rm.pt(2))
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("sleep.lastNight")
                Rectangle().fill(rm.c.line).frame(height: rm.pt(1))
                HStack(alignment: .center) {
                    Text("7-night average")
                        .evidenceText(EvidenceTextStyle(size: 9.5, weight: 400, lineHeight: 12.825))
                        .foregroundStyle(rm.c.quiet)
                    Spacer(minLength: 0)
                    VStack(alignment: .trailing, spacing: 0) {
                        Text(average.asleepSeconds.map { SleepEvidenceFormat.duration($0) } ?? "—")
                            .evidenceText(.normal(10, 800, jakarta: false, digits: true))
                            .foregroundStyle(rm.c.ink)
                        Text("\(average.nightCount) recorded \(average.nightCount == 1 ? "night" : "nights")")
                            .evidenceText(EvidenceTextStyle(size: 10, weight: 400, lineHeight: 13.5))
                            .foregroundStyle(rm.c.muted)
                    }
                }
                .padding(.vertical, rm.pt(10))
                .padding(.horizontal, rm.pt(2))
                .accessibilityElement(children: .combine)
                if night.windowOpen {
                    Rectangle().fill(rm.c.line).frame(height: rm.pt(1))
                    EnergyTag(text: "Still updating from Apple Health", warn: true)
                        .padding(.top, rm.pt(10))
                }
            }
        }
    }

    private func lastNightCopy(_ night: RecoverySleepNightSummary) -> String {
        guard night.hasSleep else { return night.statusText ?? "" }
        var parts = ["asleep"]
        if let window = night.clock.window { parts.append(window) }
        if night.clock.showsZone, !night.clock.isClockTimeCaution, let zone = night.clock.zoneLabel { parts.append(zone) }
        return parts.joined(separator: " · ")
    }

    /// The landing's 14-night snapshot always uses the 2W label density.
    private func axisPlan(_ landing: RecoverySleepLanding) -> SleepAxisPolicy.Plan {
        SleepAxisPolicy.plan(selector: .twoWeeks, pointDates: landing.nights.compactMap { SleepEvidenceFormat.chartDate($0.sleepDay) })
    }

    private func sleepChartSection(_ landing: RecoverySleepLanding) -> some View {
        let points = SleepTotalChartPoint.fromLanding(landing)
        let selected = selectedDay.flatMap { day in landing.nights.first { $0.sleepDay == day } }
        return SleepSection(title: "Sleep", identifier: "sleep.chart.section") {
            NavigationLink(value: RecoverySleepDestination.trends) {
                SleepSectionAction(text: "See trends ›")
                    .evidenceHitTarget(visualHeight: rm.pt(12))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("sleep.trends")
        } content: {
            HStack(spacing: rm.pt(11)) {
                SleepLegendItem(color: SleepPalette.total, label: "Nightly total")
                SleepLegendItem(color: rm.c.ink.opacity(0.72), label: "7-night average", dashed: true)
                Text("\(landing.nights.count) nights")
                    .evidenceText(.normal(9, 700, jakarta: false))
                    .foregroundStyle(rm.c.quiet)
                Spacer(minLength: 0)
            }
            .padding(.bottom, rm.pt(8))
            .accessibilityHidden(true)
            SleepTotalChart(points: points, plan: axisPlan(landing), selectedId: $selectedDay, height: rm.pt(150))
            if let selected {
                NavigationLink(value: RecoverySleepDestination.night(selected.sleepDay)) {
                    HStack(alignment: .firstTextBaseline, spacing: rm.pt(10)) {
                        Text("\(SleepEvidenceFormat.sleepDay(selected.sleepDay)) · \(SleepEvidenceFormat.duration(selected.asleepSeconds)) asleep")
                            .evidenceText(.normal(12, 790, jakarta: false))
                            .foregroundStyle(rm.c.ink)
                        Spacer(minLength: 0)
                        SleepSectionAction(text: "Open night ›")
                    }
                    .padding(.vertical, rm.pt(10))
                    .padding(.horizontal, rm.pt(2))
                    .frame(minHeight: 44)
                    .overlay(alignment: .top) { Rectangle().fill(rm.c.line).frame(height: rm.pt(1)) }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(.top, rm.pt(10))
                .accessibilityIdentifier("sleep.chart.openNight")
            } else {
                HStack(alignment: .top, spacing: rm.pt(7)) {
                    WeightStatTile(label: "Last 7 nights",
                                   value: landing.sevenNightAverage.asleepSeconds.map { SleepEvidenceFormat.duration($0) } ?? "—",
                                   detail: "average")
                    WeightStatTile(label: "Prior 7 nights",
                                   value: landing.priorSevenNightAverage.asleepSeconds.map { SleepEvidenceFormat.duration($0) } ?? "—",
                                   detail: "average")
                }
                .padding(.top, rm.pt(10))
            }
        }
    }

    private func sleepWindowSection(_ landing: RecoverySleepLanding) -> some View {
        let window = landing.sleepWindow
        let rows = SleepWindowChartRow.fromNights(landing.nights)
        let plausible = window.isPlausible(against: rows)
        return SleepSection(title: "Sleep Window", identifier: "sleep.window.section") {
            SleepSectionAction(text: "\(rows.count) nights")
        } content: {
            if rows.isEmpty {
                WeightEmptyLine(text: "Sleep windows will appear after your first synced nights.")
            } else {
                SleepWindowChart(rows: rows, summary: plausible ? window : nil, plan: axisPlan(landing))
                windowStats(window, plausible: plausible)
                    .padding(.top, rm.pt(8))
            }
        }
    }

    @ViewBuilder
    private func windowStats(_ window: RecoverySleepWindowSummary, plausible: Bool) -> some View {
        VStack(alignment: .leading, spacing: rm.pt(7)) {
            if plausible, let start = window.typicalStartMinutes, let end = window.typicalEndMinutes {
                WeightStatTile(label: "Typical window", value: "\(SleepEvidenceFormat.clockFromMinutes(start)) – \(SleepEvidenceFormat.clockFromMinutes(end))",
                               detail: "from \(window.nightsIncluded) \(window.nightsIncluded == 1 ? "night" : "nights")")
                HStack(alignment: .top, spacing: rm.pt(7)) {
                    WeightStatTile(label: "Fell asleep", value: window.startSpreadMinutes.map { "within ±\($0)m" } ?? "—")
                    WeightStatTile(label: "Woke up", value: window.endSpreadMinutes.map { "within ±\($0)m" } ?? "—")
                }
            } else {
                SleepFootnote(text: "A typical window appears once enough nights have reliable clock times.")
            }
            if window.nightsExcludedUncertainTime > 0 {
                SleepFootnote(text: SleepEvidenceCopy.approximateClockTimes)
            }
        }
    }

    private func recentNightsSection(_ landing: RecoverySleepLanding) -> some View {
        SleepOpenSection(title: "Recent Nights", identifier: "sleep.recent") {
            Button { showsAllNights = true } label: {
                SleepSectionAction(text: "Show All ›")
                    .evidenceHitTarget(visualHeight: rm.pt(12))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("sleep.showAll")
        } content: {
            ForEach(landing.nights.prefix(3)) { night in
                NavigationLink(value: RecoverySleepDestination.night(night.sleepDay)) { RecoverySleepNightRow(night: night) }
                    .buttonStyle(.plain)
            }
        }
    }

    private func dataSourcesSection(_ sources: [RecoverySleepSource]) -> some View {
        SleepSection(title: "Data Sources", identifier: "sleep.sources") {
            VStack(spacing: 0) {
                ForEach(Array(sources.enumerated()), id: \.element.id) { index, source in
                    sourceRow(source)
                        .overlay(alignment: .bottom) {
                            if index < sources.count - 1 { Rectangle().fill(rm.c.line).frame(height: rm.pt(1)) }
                        }
                }
            }
            SleepFootnote(text: "One source is counted per night, so nothing is double counted.")
        }
    }

    private func sourceRow(_ source: RecoverySleepSource) -> some View {
        let counted = source.role == .counted
        return HStack(alignment: .center, spacing: rm.pt(10)) {
            VStack(alignment: .leading, spacing: 0) {
                Text(source.label)
                    .evidenceText(.normal(12, 790, jakarta: false))
                    .foregroundStyle(rm.c.ink)
                Text(counted ? "Counted on recent nights" : "Recorded in the last 30 days")
                    .evidenceText(EvidenceTextStyle(size: 9.5, weight: 400, lineHeight: 12.825))
                    .foregroundStyle(rm.c.quiet)
                    .padding(.top, rm.pt(3))
            }
            Spacer(minLength: 0)
            if counted {
                EnergyTag(text: "Counted")
            } else {
                Text("Recorded")
                    .evidenceText(.normal(8, 850, jakarta: false, tracking: 0.24))
                    .foregroundStyle(rm.c.quiet)
                    .padding(.horizontal, rm.pt(6))
                    .padding(.vertical, rm.pt(3))
                    .background(rm.c.surface2, in: Capsule())
            }
        }
        .padding(.vertical, rm.pt(10))
        .padding(.horizontal, rm.pt(2))
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Sleep Trends

struct RecoverySleepTrendsView: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var viewModel: RecoverySleepTrendsViewModel?
    @State private var viewModelAuthority: NativeAPIEnvironment?
    @State private var selectedId: String?
    @State private var showsStageMix = false
    @State private var showsAllNights = false
    @State private var retryNonce = 0

    private var store: RecoverySleepScopeStore { environment.recoverySleepScope }
    private var scopeRange: RecoverySleepScopeRange? { store.range(today: environment.recoverySleepAPI.today()) }
    private var reloadKey: String { "\(environment.nativeAuthority.rawValue)|\(store.selected.rawValue)|\(retryNonce)" }

    private let ranges: [RecoverySleepTrendRange] = [.twoWeeks, .oneMonth, .threeMonths, .sixMonths, .all]

    var body: some View {
        EvidenceScrollPage(spacing: 0, top: 10) {
            SleepReportHeader(eyebrow: "Recovery", title: "Sleep Trends", subtitle: "Inspect nights over time")
            SleepScopeSelector()
            if scopeRange == nil || scopeRange?.isEmpty == true {
                SleepScopeStateCard(store: store, range: scopeRange) { retryNonce += 1 }
            } else {
                rangeSelector
                    .padding(.bottom, rm.pt(19))
                switch viewModel?.state(for: scopeRange) {
                case .none, .loading:
                    WeightStatePanel(title: "Loading Sleep Evidence…", loading: true, identifier: "sleep.trends.loading")
                case .notAvailable:
                    WeightStatePanel(title: notAvailableText, identifier: "sleep.trends.notAvailable")
                case .failed(let message):
                    WeightStatePanel(title: message, identifier: "sleep.trends.failed", actionLabel: "Try again") { retryNonce += 1 }
                case .loaded(let trends):
                    loaded(trends)
                }
            }
        }
        .recoverySleepPage("Sleep Trends")
        .task(id: reloadKey) {
            if viewModelAuthority != environment.nativeAuthority || viewModel == nil {
                viewModel = RecoverySleepTrendsViewModel(api: environment.recoverySleepAPI)
                viewModelAuthority = environment.nativeAuthority
            }
            selectedId = nil
            let api = environment.recoverySleepAPI
            if store.selected.isGoal { await store.loadWindows(api: api, authority: environment.nativeAuthority.rawValue) }
            guard let range = store.range(today: api.today()), !range.isEmpty else { return }
            await viewModel?.load(range: range)
        }
        .sheet(isPresented: $showsAllNights) {
            if let range = scopeRange { RecoverySleepNightsSheet(range: range) }
        }
        .accessibilityIdentifier("sleep.trends.screen")
    }

    /// Locked `.range` pills (2W / 1M / 3M / 6M / All), one selector for
    /// every chart on the page and All Nights.
    private var rangeSelector: some View {
        HStack(spacing: rm.pt(5)) {
            ForEach(ranges) { option in
                let isSelected = viewModel?.selector == option
                Button {
                    selectedId = nil
                    guard let range = scopeRange else { return }
                    Task { await viewModel?.select(option, range: range) }
                } label: {
                    Text(option.label)
                        .evidenceText(.normal(9, 760, jakarta: false))
                        .foregroundStyle(isSelected ? rm.c.accent : rm.c.quiet)
                        .padding(.horizontal, rm.pt(9))
                        .padding(.vertical, rm.pt(7))
                        .background(isSelected ? rm.c.surface2 : rm.c.surface, in: RoundedRectangle(cornerRadius: rm.pt(9)))
                        .overlay {
                            if isSelected {
                                RoundedRectangle(cornerRadius: rm.pt(9)).strokeBorder(rm.c.accent.opacity(0.35), lineWidth: rm.pt(1))
                            }
                        }
                        .evidenceHitTarget(visualHeight: rm.pt(25))
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
                .accessibilityIdentifier("sleep.range.\(option.rawValue)")
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Sleep trends date range")
    }

    @ViewBuilder
    private func loaded(_ trends: RecoverySleepTrends) -> some View {
        let plan = axisPlan(trends)
        totalSection(trends, plan: plan)
            .padding(.bottom, rm.pt(19))
        if trends.granularity == .week {
            weeklyNote
                .padding(.bottom, rm.pt(19))
        } else {
            if let rows = trends.windowRows, !rows.isEmpty {
                windowSection(rows, summary: nil, plan: plan)
                    .padding(.bottom, rm.pt(19))
            }
            if let continuity = trends.continuity {
                continuitySection(continuity, plan: plan)
                    .padding(.bottom, rm.pt(19))
            }
            if let stageMix = trends.stageMix {
                stageMixSection(stageMix, plan: plan)
                    .padding(.bottom, rm.pt(19))
            }
        }
        allNightsSection
    }

    /// One plan for every chart on the screen: the selected range's label
    /// density over the plotted dates (weekly bars span a whole week).
    private func axisPlan(_ trends: RecoverySleepTrends) -> SleepAxisPolicy.Plan {
        SleepAxisPolicy.plan(
            selector: viewModel?.selector ?? .oneMonth,
            pointDates: trends.totalSleep.compactMap { SleepEvidenceFormat.chartDate($0.periodStart) },
            pointSpan: trends.granularity == .week ? 7 * 86_400 : 86_400
        )
    }

    private func totalSection(_ trends: RecoverySleepTrends, plan: SleepAxisPolicy.Plan) -> some View {
        let points = SleepTotalChartPoint.fromTrends(trends)
        let isWeekly = trends.granularity == .week
        let selected = selectedId.flatMap { id in trends.totalSleep.first { $0.periodStart == id } }
        return SleepSection(title: "Total Sleep", identifier: "sleep.trends.total") {
            SleepSectionAction(text: "avg \(SleepEvidenceFormat.duration(trends.averageAsleepSeconds))")
        } content: {
            HStack(spacing: rm.pt(11)) {
                SleepLegendItem(color: SleepPalette.total, label: isWeekly ? "Weekly average" : "Nightly total")
                if !isWeekly { SleepLegendItem(color: rm.c.ink.opacity(0.72), label: "7-night average", dashed: true) }
                Text("\(trends.nightsWithData) nights")
                    .evidenceText(.normal(9, 700, jakarta: false))
                    .foregroundStyle(rm.c.quiet)
                Spacer(minLength: 0)
            }
            .padding(.bottom, rm.pt(8))
            .accessibilityHidden(true)
            SleepTotalChart(points: points, isWeekly: isWeekly, style: isWeekly ? .bars : .area, plan: plan, selectedId: $selectedId, height: rm.pt(isWeekly ? 150 : 170))
            if trends.isTruncated {
                SleepFootnote(text: "Showing the latest \(trends.totalSleep.count) nights. Choose 6M for weekly averages of a longer span.")
            }
            if let selected {
                HStack(alignment: .top, spacing: rm.pt(7)) {
                    WeightStatTile(label: isWeekly ? "Week of \(SleepEvidenceFormat.sleepDay(selected.periodStart, style: "MMM d"))" : SleepEvidenceFormat.sleepDay(selected.periodStart),
                                   value: SleepEvidenceFormat.duration(selected.asleepSeconds),
                                   detail: isWeekly ? "average of \(selected.nightCount) nights" : "asleep")
                    if !isWeekly {
                        WeightStatTile(label: "7-night average", value: SleepEvidenceFormat.duration(selected.trailingAverageSeconds), detail: "through this night")
                    }
                }
                .padding(.top, rm.pt(10))
                .accessibilityIdentifier("sleep.trends.selected")
            }
        }
    }

    /// Locked R3 `.timeline-note`: why the detailed charts are withheld.
    private var weeklyNote: some View {
        HStack(alignment: .top, spacing: rm.pt(8)) {
            Text("▦")
                .evidenceText(.normal(10, 400, jakarta: false))
                .foregroundStyle(rm.c.quiet)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: rm.pt(2)) {
                Text("Weekly view")
                    .evidenceText(.normal(10, 800, jakarta: false))
                    .foregroundStyle(rm.c.ink)
                Text("Longer ranges show weekly averages. Sleep window, continuity and stage mix are shown for ranges up to 3 months.")
                    .evidenceText(EvidenceTextStyle(size: 10, weight: 400, lineHeight: 14))
                    .foregroundStyle(rm.c.quiet)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(rm.pt(13 + 1))
        .background(rm.c.surface, in: RoundedRectangle(cornerRadius: rm.pt(15)))
        .overlay(RoundedRectangle(cornerRadius: rm.pt(15)).strokeBorder(rm.c.line, lineWidth: rm.pt(1)))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("sleep.trends.weeklyNote")
    }

    private func windowSection(_ rows: [RecoverySleepTrends.WindowRow], summary: RecoverySleepWindowSummary?, plan: SleepAxisPolicy.Plan) -> some View {
        SleepSection(title: "Sleep Window", identifier: "sleep.trends.window") {
            if let start = summary?.typicalStartMinutes, let end = summary?.typicalEndMinutes {
                SleepSectionAction(text: "\(SleepEvidenceFormat.clockFromMinutes(start)) – \(SleepEvidenceFormat.clockFromMinutes(end))")
            }
        } content: {
            SleepWindowChart(rows: SleepWindowChartRow.fromTrends(rows), summary: summary, plan: plan, rowHeight: rows.count > 14 ? 11 : 13)
            if let summary, let startSpread = summary.startSpreadMinutes, let endSpread = summary.endSpreadMinutes {
                SleepFootnote(text: "Fell asleep within ±\(startSpread)m · woke within ±\(endSpread)m of the typical window, from \(summary.nightsIncluded) nights.")
            }
            let excluded = summary?.nightsExcludedUncertainTime ?? rows.filter { !$0.includedInConsistency }.count
            if excluded > 0 {
                SleepFootnote(text: SleepEvidenceCopy.approximateClockTimes)
            }
        }
    }

    private func continuitySection(_ rows: [RecoverySleepTrends.ContinuityRow], plan: SleepAxisPolicy.Plan) -> some View {
        let pending = rows.filter { $0.status == .pendingCorrection }.count
        let absent = rows.filter { $0.status == .absent }.count
        return SleepSection(title: "Continuity", identifier: "sleep.trends.continuity") {
            SleepContinuityChart(rows: rows, plan: plan)
            if pending + absent > 0 {
                SleepFootnote(text: continuityGapText(pending: pending, absent: absent))
            }
        }
    }

    private func continuityGapText(pending: Int, absent: Int) -> String {
        var parts: [String] = []
        if pending > 0 { parts.append("\(pending) night\(pending == 1 ? " is" : "s are") being recalculated") }
        if absent > 0 { parts.append("\(absent) night\(absent == 1 ? " has" : "s have") no stage detail") }
        return parts.joined(separator: " and ") + "; shown as gaps."
    }

    private func stageMixSection(_ rows: [RecoverySleepTrends.StageMixRow], plan: SleepAxisPolicy.Plan) -> some View {
        SleepSection(title: "Stage Mix", identifier: "sleep.trends.stageMix") {
            Button { withAnimation(.easeInOut(duration: 0.2)) { showsStageMix.toggle() } } label: {
                SleepSectionAction(text: showsStageMix ? "Hide" : "Show stage mix")
                    .evidenceHitTarget(visualHeight: rm.pt(12))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("sleep.stageMix.toggle")
            .accessibilityValue(showsStageMix ? "Expanded" : "Collapsed")
        } content: {
            if showsStageMix {
                SleepStageMixChart(rows: rows, plan: plan)
                    .padding(.bottom, rm.pt(4))
            }
            SleepFootnote(text: "Stage estimates come from your sleep source and vary between devices.")
        }
    }

    private var allNightsSection: some View {
        SleepSection(title: "All Nights", identifier: "sleep.trends.allNights") {
            Button { showsAllNights = true } label: {
                SleepSectionAction(text: "Show All ›")
                    .evidenceHitTarget(visualHeight: rm.pt(12))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("sleep.trends.showAll")
        } content: {
            EmptyView()
        }
    }
}

// MARK: - Night detail

struct RecoverySleepNightView: View {
    let sleepDay: String
    @Environment(AppEnvironment.self) private var environment
    @State private var viewModel: RecoverySleepNightViewModel?
    @State private var showsSourceDetails = false

    var body: some View {
        EvidenceScrollPage(spacing: 0, top: 10) {
            switch viewModel?.state {
            case .none, .loading:
                WeightStatePanel(title: "Loading this night…", loading: true, identifier: "sleep.night.loading")
            case .notFound:
                WeightStatePanel(title: "No sleep was recorded for this night.", identifier: "sleep.night.notFound")
            case .notAvailable:
                WeightStatePanel(title: notAvailableText, identifier: "sleep.night.notAvailable")
            case .failed(let message):
                WeightStatePanel(title: message, identifier: "sleep.night.failed", actionLabel: "Try again") {
                    Task { await viewModel?.load() }
                }
            case .loaded(let detail):
                loaded(detail)
            }
        }
        .recoverySleepPage("Night of \(SleepEvidenceFormat.sleepDay(sleepDay, style: "MMM d"))")
        .task(id: sleepDay) {
            if viewModel?.sleepDay != sleepDay { viewModel = RecoverySleepNightViewModel(sleepDay: sleepDay, api: environment.recoverySleepAPI) }
            await viewModel?.load()
        }
        .refreshable { await viewModel?.load() }
        .accessibilityIdentifier("sleep.night.screen")
    }

    @ViewBuilder
    private func loaded(_ detail: RecoverySleepNightDetail) -> some View {
        let night = detail.night
        header(night)
            .padding(.bottom, rm.pt(17))
        if let main = detail.main {
            timelineSection(main, night: night)
                .padding(.bottom, rm.pt(19))
            stagesSection(main.stages)
                .padding(.bottom, rm.pt(19))
            continuitySection(main.continuity)
                .padding(.bottom, rm.pt(19))
            if main.inBedSeconds != nil {
                timeInBedSection(main, night: night)
                    .padding(.bottom, rm.pt(19))
            }
        } else {
            WeightStatePanel(title: night.statusText ?? "No sleep was recorded for this night.", identifier: "sleep.night.absent")
                .padding(.bottom, rm.pt(19))
        }
        if !detail.secondary.isEmpty {
            additionalSleepSection(detail, night: night)
                .padding(.bottom, rm.pt(19))
        }
        sourceSection(detail)
    }

    /// Locked R4/R5 head: `Night of …` eyebrow, 30 px duration + `asleep`,
    /// window line, open-window tag, approximate-time footnote.
    private func header(_ night: RecoverySleepNightSummary) -> some View {
        let clock = night.clock
        return VStack(alignment: .leading, spacing: 0) {
            Text("Night of \(SleepEvidenceFormat.sleepDay(night.sleepDay, style: "MMM d"))")
                .evidenceText(.normal(11, 800, jakarta: false, tracking: 1.43, uppercase: true))
                .foregroundStyle(rm.c.accent)
            HStack(alignment: .firstTextBaseline, spacing: rm.pt(6)) {
                Text(night.hasSleep ? SleepEvidenceFormat.duration(night.asleepSeconds) : "—")
                    .evidenceText(EvidenceTextStyle(size: 30, weight: 780, lineHeight: 31.5, tracking: -1.2, monospacedDigits: true))
                    .foregroundStyle(rm.c.ink)
                    .accessibilityAddTraits(.isHeader)
                Text(night.hasSleep ? "asleep" : (night.statusText ?? ""))
                    .evidenceText(EvidenceTextStyle(size: 13, weight: 400, lineHeight: 17.55))
                    .foregroundStyle(rm.c.muted)
            }
            if let window = clock.window {
                Text(window + (!clock.isClockTimeCaution ? (clock.zoneLabel.map { " · \($0)" } ?? "") : ""))
                    .evidenceText(EvidenceTextStyle(size: 13, weight: 400, lineHeight: 17.55))
                    .foregroundStyle(rm.c.muted)
                    .padding(.top, rm.pt(4))
            }
            if night.windowOpen, let closes = SleepEvidenceFormat.instant(night.windowClosesAt) {
                EnergyTag(text: "Still updating until \(SleepEvidenceFormat.clock(closes, in: clock.zone))", warn: true)
                    .padding(.top, rm.pt(7))
            }
            if clock.isClockTimeCaution {
                SleepFootnote(text: SleepEvidenceCopy.approximateClockTimes)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, rm.pt(3))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("sleep.night.header")
    }

    private func timelineSection(_ main: RecoverySleepNightDetail.Main, night: RecoverySleepNightSummary) -> some View {
        SleepSection(title: "Timeline", identifier: "sleep.night.timeline") {
            switch main.timeline.status {
            case .available, .absent:
                SleepHypnogramView(segments: main.timeline.segments, zone: night.clock.zone,
                                   inBedStart: SleepEvidenceFormat.instant(main.inBedStart), inBedEnd: SleepEvidenceFormat.instant(main.inBedEnd),
                                   approximate: night.clock.isClockTimeCaution)
                if main.timeline.status == .absent {
                    SleepFootnote(text: "This source recorded sleep without stages for this night.")
                }
            case .pendingCorrection, .unknown:
                SleepHypnogramView(segments: [.init(stage: .unspecified, start: main.start, end: main.end)], zone: night.clock.zone,
                                   inBedStart: SleepEvidenceFormat.instant(main.inBedStart), inBedEnd: SleepEvidenceFormat.instant(main.inBedEnd),
                                   approximate: night.clock.isClockTimeCaution)
                SleepRecalculatingNote(detail: "The stage timeline will appear once this night is recalculated.")
                    .padding(.top, rm.pt(8))
            }
        }
    }

    private func stagesSection(_ stages: RecoverySleepNightDetail.Stages) -> some View {
        SleepSection(title: "Stages", identifier: "sleep.night.stages") {
            switch stages.status {
            case .available:
                if let deep = stages.deepSeconds, let core = stages.coreSeconds, let rem = stages.remSeconds {
                    SleepStageBar(deep: deep, core: core, rem: rem)
                        .padding(.top, rm.pt(-2))
                        .padding(.bottom, rm.pt(10))
                    VStack(spacing: 0) {
                        stageRow(.deep, deep)
                        stageRow(.core, core)
                        stageRow(.rem, rem)
                        if let awake = stages.awakeSeconds {
                            stageRow(.awake, awake, label: "Awake in sleep window")
                        }
                    }
                }
                SleepFootnote(text: "Stage estimates come from your sleep source and vary between devices. Core is shown as Light in some apps.")
            case .pendingCorrection, .unknown:
                SleepNotice(text: "Total sleep and timing are final. Stage and awake minutes will appear once this night is recalculated.")
            case .absent:
                SleepNotice(text: "Stage detail is not available from this source for this night.")
            }
        }
    }

    /// Locked `.stage-row`: swatch, label, bold trailing duration, 1 px rule.
    private func stageRow(_ stage: RecoverySleepStage, _ seconds: Int, label: String? = nil) -> some View {
        HStack(spacing: rm.pt(7)) {
            RoundedRectangle(cornerRadius: rm.pt(2)).fill(SleepPalette.stage(stage)).frame(width: rm.pt(8), height: rm.pt(8)).accessibilityHidden(true)
            Text(label ?? stage.label)
                .evidenceText(.normal(10, 500, jakarta: false))
                .foregroundStyle(rm.c.muted)
            Spacer(minLength: 0)
            Text(SleepEvidenceFormat.duration(seconds))
                .evidenceText(.normal(10, 800, jakarta: false, digits: true))
                .foregroundStyle(rm.c.ink)
        }
        .padding(.vertical, rm.pt(7))
        .overlay(alignment: .bottom) { Rectangle().fill(rm.c.line).frame(height: rm.pt(1)) }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label ?? stage.label): \(SleepEvidenceFormat.spokenDuration(seconds))")
    }

    private func continuitySection(_ continuity: RecoverySleepNightDetail.Continuity) -> some View {
        SleepSection(title: "Continuity", identifier: "sleep.night.continuity") {
            switch continuity.status {
            case .available:
                HStack(alignment: .top, spacing: rm.pt(7)) {
                    WeightStatTile(label: "Longest continuous", value: SleepEvidenceFormat.duration(continuity.longestAsleepStretchSeconds), detail: "asleep")
                    WeightStatTile(label: "Awake in window", value: SleepEvidenceFormat.duration(continuity.awakeInWindowSeconds), detail: "between sleep")
                }
            case .pendingCorrection, .unknown:
                SleepNotice(text: "Continuity uses awake time, which is recalculated with stages.")
            case .absent:
                SleepNotice(text: "Continuity needs stage detail, which this source didn't record for this night.")
            }
        }
    }

    private func timeInBedSection(_ main: RecoverySleepNightDetail.Main, night: RecoverySleepNightSummary) -> some View {
        let zone = night.clock.zone
        let start = SleepEvidenceFormat.instant(main.inBedStart)
        let end = SleepEvidenceFormat.instant(main.inBedEnd)
        return SleepSection(title: "Time in Bed", identifier: "sleep.night.inBed") {
            SleepSectionAction(text: SleepEvidenceFormat.duration(main.inBedSeconds))
        } content: {
            if let start, let end {
                Text("In bed \(night.clock.isClockTimeCaution ? "≈ " : "")\(SleepEvidenceFormat.clock(start, in: zone)) – \(SleepEvidenceFormat.clock(end, in: zone))")
                    .evidenceText(EvidenceTextStyle(size: 9.5, weight: 400, lineHeight: 12.825))
                    .foregroundStyle(rm.c.quiet)
            }
        }
    }

    private func additionalSleepSection(_ detail: RecoverySleepNightDetail, night: RecoverySleepNightSummary) -> some View {
        let zone = night.clock.zone
        return SleepSection(title: "Additional Sleep", identifier: "sleep.additional") {
            VStack(spacing: 0) {
                ForEach(detail.secondary) { episode in
                    HStack(alignment: .center, spacing: rm.pt(10)) {
                        VStack(alignment: .leading, spacing: 0) {
                            if let start = SleepEvidenceFormat.instant(episode.start), let end = SleepEvidenceFormat.instant(episode.end) {
                                Text("\(night.clock.isClockTimeCaution ? "≈ " : "")\(SleepEvidenceFormat.clock(start, in: zone)) – \(SleepEvidenceFormat.clock(end, in: zone))")
                                    .evidenceText(.normal(12, 790, jakarta: false))
                                    .foregroundStyle(rm.c.ink)
                            }
                            Text(episode.sourceLabel ?? "Another source")
                                .evidenceText(EvidenceTextStyle(size: 9.5, weight: 400, lineHeight: 12.825))
                                .foregroundStyle(rm.c.quiet)
                                .padding(.top, rm.pt(3))
                        }
                        Spacer(minLength: 0)
                        Text(SleepEvidenceFormat.duration(episode.asleepSeconds))
                            .evidenceText(.normal(10, 760, jakarta: false, digits: true))
                            .foregroundStyle(rm.c.muted)
                    }
                    .padding(.vertical, rm.pt(10))
                    .padding(.horizontal, rm.pt(2))
                    .overlay(alignment: .bottom) { Rectangle().fill(rm.c.line).frame(height: rm.pt(1)) }
                    .accessibilityElement(children: .combine)
                }
            }
            if let total = night.totalAsleepIncludingSecondarySeconds {
                SleepFootnote(text: "Total including additional sleep \(SleepEvidenceFormat.duration(total))")
            }
        }
    }

    private func sourceSection(_ detail: RecoverySleepNightDetail) -> some View {
        let night = detail.night
        let clock = night.clock
        return SleepSection(title: "Source & Data", identifier: "sleep.night.source") {
            Button { withAnimation(.easeInOut(duration: 0.2)) { showsSourceDetails.toggle() } } label: {
                Text(showsSourceDetails ? "Hide ⌃" : "Details ⌄")
                    .evidenceText(.normal(10, 760, jakarta: false))
                    .foregroundStyle(rm.c.accent)
                    .evidenceHitTarget(visualHeight: rm.pt(12))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("sleep.sourceData.toggle")
            .accessibilityValue(showsSourceDetails ? "Expanded" : "Collapsed")
        } content: {
            if let provenance = detail.provenance {
                VStack(alignment: .leading, spacing: 0) {
                    Text("Counted from \(provenance.primarySourceLabel) (via Apple Health)")
                        .evidenceText(.normal(10, 500, jakarta: false))
                        .foregroundStyle(rm.c.muted)
                    if showsSourceDetails {
                        VStack(spacing: 0) {
                            detailRow("Also recorded", provenance.corroboratingLabels.isEmpty ? "No other source this night"
                                      : provenance.corroboratingLabels.map { "\($0) — not counted" }.joined(separator: "\n"))
                            detailRow("Time zone", "\(clock.zoneLabel ?? "Unknown") · \(clock.shortProvenance)")
                            detailRow("Clock times", night.includedInConsistency ? "Used for sleep window" : "Not used for sleep window")
                            detailRow("Stage detail", stageDetailText(night.stageStatus))
                            detailRow("Origin", night.origin == .historicalImport ? "Imported from Apple Health history" : "Synced from Apple Health")
                            if let updated = SleepEvidenceFormat.instant(provenance.lastRecomputedAt) {
                                detailRow("Last updated", updated.formatted(.dateTime.month(.abbreviated).day().hour().minute()))
                            }
                            detailRow("Calculation", provenance.algorithmVersion, last: true)
                        }
                        .padding(.top, rm.pt(4))
                    }
                }
                .padding(rm.pt(10))
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(rm.c.surface2, in: RoundedRectangle(cornerRadius: rm.pt(11)))
                if showsSourceDetails {
                    SleepFootnote(text: clock.provenanceText + ". Total sleep never depends on the time zone.")
                }
            } else {
                WeightEmptyLine(text: "No source recorded this night.")
            }
        }
    }

    private func stageDetailText(_ status: RecoverySleepDetailStatus) -> String {
        switch status {
        case .available: "Available"
        case .pendingCorrection: "Being recalculated"
        case .absent: "Not recorded by this source"
        case .unknown: "Not available"
        }
    }

    /// Locked `.detail-row`: 9 px label / value, 1 px rule.
    private func detailRow(_ label: String, _ value: String, last: Bool = false) -> some View {
        HStack(alignment: .top, spacing: rm.pt(14)) {
            Text(label)
                .evidenceText(.normal(9, 500, jakarta: false))
                .foregroundStyle(rm.c.quiet)
            Spacer(minLength: 0)
            Text(value)
                .evidenceText(.normal(9, 600, jakarta: false))
                .foregroundStyle(rm.c.ink)
                .multilineTextAlignment(.trailing)
        }
        .padding(.vertical, rm.pt(7))
        .overlay(alignment: .bottom) {
            if !last { Rectangle().fill(rm.c.line).frame(height: rm.pt(1)) }
        }
        .accessibilityElement(children: .combine)
    }
}
