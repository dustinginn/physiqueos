import SwiftUI

// Recovery / Sleep Evidence screens (design report 20261001T032718Z, approved
// prototype 20261001T040311Z). Descriptive only: no score, target, good/bad
// language, coaching, Briefing, Goal or Confidence content.

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

private struct RecoverySleepChrome: ViewModifier {
    let backLabel: String
    @Environment(\.dismiss) private var dismiss

    func body(content: Content) -> some View {
        content
            .physiqueOSScrollBottomClearance()
            .background(PhysiqueOSTheme.background)
            .navigationBarTitleDisplayMode(.inline)
            .navigationBarBackButtonHidden(true)
            .restoresInteractivePopGesture()
            .suppressesContentAreaPopGesture()
            .toolbarBackground(PhysiqueOSTheme.background, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button { dismiss() } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "arrow.left").font(.system(size: 13, weight: .semibold))
                            Text(backLabel).physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                        }
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        .frame(minHeight: 44)
                    }
                }
            }
    }
}

private extension View {
    func recoverySleepChrome(backLabel: String) -> some View {
        modifier(RecoverySleepChrome(backLabel: backLabel))
    }
}

private struct SleepScreenHeader: View {
    let eyebrow: String
    let title: String
    let subtitle: String

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "bed.double.fill")
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(PhysiqueOSTheme.sleepTotal)
                .frame(width: 48, height: 48)
                .background(PhysiqueOSTheme.sleepTotal.opacity(0.16))
                .clipShape(Circle())
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text(eyebrow)
                    .physiqueOSFont(PhysiqueOSTypography.screenEyebrow)
                    .foregroundStyle(PhysiqueOSTheme.accent)
                Text(title)
                    .physiqueOSFont(PhysiqueOSTypography.screenTitle)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    .accessibilityAddTraits(.isHeader)
                Text(subtitle)
                    .physiqueOSFont(PhysiqueOSTypography.screenSubtitle)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct SleepStatTile: View {
    let label: String
    let value: String
    var detail: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
            Text(value)
                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
            if let detail {
                Text(detail)
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PhysiqueOSTheme.surfaceMuted)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .combine)
    }
}

private struct SleepStatusTag: View {
    let text: String
    let systemImage: String

    var body: some View {
        Label(text, systemImage: systemImage)
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(PhysiqueOSTheme.textSecondary)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(PhysiqueOSTheme.surfaceMuted)
            .clipShape(Capsule())
    }
}

private struct SleepNoteRow: View {
    let systemImage: String
    let title: String
    let detail: String

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: systemImage)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(PhysiqueOSTheme.textMuted)
                .padding(.top, 1)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                Text(detail)
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PhysiqueOSTheme.surfaceMuted)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .accessibilityElement(children: .combine)
    }
}

private struct SleepRecalculatingNote: View {
    let detail: String
    var body: some View {
        SleepNoteRow(systemImage: "arrow.triangle.2.circlepath", title: "Stage detail is being recalculated.", detail: detail)
    }
}

private struct SleepStateMessage: View {
    let text: String
    var body: some View {
        Text(text)
            .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
            .foregroundStyle(PhysiqueOSTheme.textSecondary)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity, minHeight: 240)
            .padding(.horizontal, 24)
    }
}

private func legendSwatch(_ color: Color, _ label: String) -> some View {
    HStack(spacing: 4) {
        RoundedRectangle(cornerRadius: 2).fill(color).frame(width: 10, height: 8)
        Text(label)
    }
    .font(.system(size: 10, weight: .semibold))
    .foregroundStyle(PhysiqueOSTheme.textMuted)
    .accessibilityHidden(true)
}

private func legendDash(_ label: String) -> some View {
    HStack(spacing: 4) {
        Path { path in path.move(to: .init(x: 0, y: 4)); path.addLine(to: .init(x: 14, y: 4)) }
            .stroke(PhysiqueOSTheme.textPrimary.opacity(0.72), style: StrokeStyle(lineWidth: 1.6, dash: [4, 3]))
            .frame(width: 14, height: 8)
        Text(label)
    }
    .font(.system(size: 10, weight: .semibold))
    .foregroundStyle(PhysiqueOSTheme.textMuted)
    .accessibilityHidden(true)
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
        TrainingScopeSelectorView(scope: store.scopeContext(today: environment.recoverySleepAPI.today())) { pillID in
            if let scope = RecoverySleepScope(pillID: pillID) { store.select(scope) }
        }
    }
}

/// What a screen shows in place of its content when the selected scope has
/// no range to read (Goal dates unknown) or no Sleep Evidence.
private struct SleepScopeStateCard: View {
    let store: RecoverySleepScopeStore
    let range: RecoverySleepScopeRange?
    let retry: () -> Void

    var body: some View {
        CardContainer {
            VStack(spacing: 10) {
                if let range, range.isEmpty {
                    SleepStateMessage(text: "No Sleep Evidence falls inside this Goal's dates.")
                } else if store.windowsState == .failed {
                    SleepStateMessage(text: "This Goal's dates could not be loaded.")
                    Button("Try again", action: retry)
                        .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                        .foregroundStyle(PhysiqueOSTheme.accent)
                        .frame(minHeight: 44)
                } else {
                    ProgressView().tint(PhysiqueOSTheme.accent).frame(maxWidth: .infinity, minHeight: 120)
                }
            }
        }
    }
}

// MARK: - Night row

struct RecoverySleepNightRow: View {
    let night: RecoverySleepNightSummary

    var body: some View {
        let clock = night.clock
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(SleepEvidenceFormat.sleepDay(night.sleepDay))
                        .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    if night.windowOpen {
                        Text("Updating")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundStyle(PhysiqueOSTheme.sleepTotal)
                            .padding(.horizontal, 6).padding(.vertical, 2)
                            .background(PhysiqueOSTheme.sleepTotal.opacity(0.14))
                            .clipShape(Capsule())
                    }
                }
                if let window = clock.window {
                    HStack(spacing: 4) {
                        Text(window)
                        if !clock.isClockTimeCaution, clock.showsZone, let zone = clock.zoneLabel { Text(zone) }
                    }
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                } else if let status = night.statusText {
                    Text(status)
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
                if night.secondaryEpisodeCount > 0, let total = night.totalAsleepIncludingSecondarySeconds, let main = night.asleepSeconds {
                    Text("+ \(SleepEvidenceFormat.duration(total - main)) additional sleep")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
            }
            Spacer(minLength: 8)
            Text(night.hasSleep ? SleepEvidenceFormat.duration(night.asleepSeconds) : "–")
                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
            Image(systemName: "chevron.right")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(PhysiqueOSTheme.textMuted)
        }
        .padding(12)
        .frame(minHeight: 56)
        .background(PhysiqueOSTheme.surfaceMuted)
        .clipShape(RoundedRectangle(cornerRadius: 12))
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

struct RecoverySleepNightsSheet: View {
    let range: RecoverySleepScopeRange
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel: RecoverySleepNightsViewModel?

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 8) {
                    switch viewModel?.state {
                    case .none, .loading:
                        ProgressView().tint(PhysiqueOSTheme.accent).frame(maxWidth: .infinity, minHeight: 200)
                    case .notAvailable:
                        SleepStateMessage(text: notAvailableText)
                    case .failed(let message):
                        SleepStateMessage(text: message)
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
                            ProgressView().tint(PhysiqueOSTheme.accent).padding()
                        }
                    }
                }
                .padding(16)
            }
            .background(PhysiqueOSTheme.background)
            .navigationDestination(for: AppDestination.self) { destination in
                if case .progressStream(let streamId) = destination, let sleepDay = RecoverySleepDestination.sleepDay(fromStreamId: streamId) {
                    RecoverySleepNightView(sleepDay: sleepDay)
                }
            }
            .navigationTitle("All Nights")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
        .preferredColorScheme(.dark)
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
        ScrollView {
            content
                .padding(.horizontal, 16)
                .padding(.top, 12)
        }
        .recoverySleepChrome(backLabel: "Evidence Hub")
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
        VStack(alignment: .leading, spacing: 24) {
            SleepScreenHeader(eyebrow: "Evidence Report", title: "Recovery", subtitle: "Sleep from Apple Health")
            SleepScopeSelector()
            if scopeRange == nil || scopeRange?.isEmpty == true {
                SleepScopeStateCard(store: store, range: scopeRange) { retryNonce += 1 }
            } else {
                landingContent
            }
        }
    }

    @ViewBuilder
    private var landingContent: some View {
        VStack(alignment: .leading, spacing: 24) {
            switch viewModel?.state(for: scopeRange) {
            case .none, .loading:
                ProgressView().tint(PhysiqueOSTheme.accent).frame(maxWidth: .infinity, minHeight: 300)
            case .notAvailable:
                CardContainer { SleepStateMessage(text: notAvailableText) }
            case .failed(let message):
                CardContainer { SleepStateMessage(text: message) }
            case .loaded(let landing):
                if landing.state == .noData || landing.lastNight == nil {
                    CardContainer { SleepStateMessage(text: noDataText) }
                } else {
                    loaded(landing)
                }
            }
        }
    }

    @ViewBuilder
    private func loaded(_ landing: RecoverySleepLanding) -> some View {
        if let lastNight = landing.lastNight { lastNightCard(lastNight, average: landing.sevenNightAverage, isCurrent: scopeRange?.isCurrent ?? true) }
        sleepChartCard(landing)
        sleepWindowCard(landing)
        recentNightsCard(landing)
        dataSourcesCard(landing.sources)
    }

    private func lastNightCard(_ night: RecoverySleepNightSummary, average: RecoverySleepAverage, isCurrent: Bool) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                TrainingSectionHeaderView(title: isCurrent ? "Last Night" : "Final Night") {
                    Text(SleepEvidenceFormat.sleepDay(night.sleepDay))
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
                NavigationLink(value: RecoverySleepDestination.night(night.sleepDay)) {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(alignment: .firstTextBaseline) {
                            Text(night.hasSleep ? SleepEvidenceFormat.duration(night.asleepSeconds) : "–")
                                .physiqueOSFont(PhysiqueOSTypography.screenTitle)
                                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                            Text(night.hasSleep ? "asleep" : (night.statusText ?? ""))
                                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(PhysiqueOSTheme.accent)
                        }
                        if let window = night.clock.window {
                            Text(window + (night.clock.showsZone && !night.clock.isClockTimeCaution ? " · \(night.clock.zoneLabel ?? "")" : ""))
                                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        }
                        Divider().overlay(PhysiqueOSTheme.divider)
                        HStack {
                            Text("7-night average")
                                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                            Text(average.asleepSeconds.map { SleepEvidenceFormat.duration($0) } ?? "–")
                                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                            Spacer()
                            Text("\(average.nightCount) recorded \(average.nightCount == 1 ? "night" : "nights")")
                                .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                                .foregroundStyle(PhysiqueOSTheme.textMuted)
                        }
                        if night.windowOpen {
                            SleepStatusTag(text: "Still updating from Apple Health", systemImage: "clock.arrow.circlepath")
                        }
                    }
                    .padding(12)
                    .background(PhysiqueOSTheme.surfaceMuted)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("sleep.lastNight")
            }
        }
    }

    /// The landing's 14-night snapshot always uses the 2W label density.
    private func axisPlan(_ landing: RecoverySleepLanding) -> SleepAxisPolicy.Plan {
        SleepAxisPolicy.plan(selector: .twoWeeks, pointDates: landing.nights.compactMap { SleepEvidenceFormat.chartDate($0.sleepDay) })
    }

    private func sleepChartCard(_ landing: RecoverySleepLanding) -> some View {
        let points = SleepTotalChartPoint.fromLanding(landing)
        let selected = selectedDay.flatMap { day in landing.nights.first { $0.sleepDay == day } }
        return CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                TrainingSectionHeaderView(title: "Sleep") {
                    NavigationLink(value: RecoverySleepDestination.trends) {
                        TrainingCompactActionLabel(label: "See trends").frame(minHeight: 44)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("sleep.trends")
                }
                HStack(spacing: 10) {
                    legendSwatch(PhysiqueOSTheme.sleepTotal, "Nightly total")
                    legendDash("7-night average")
                    Spacer()
                    Text("\(landing.nights.count) nights")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
                SleepTotalChart(points: points, plan: axisPlan(landing), selectedId: $selectedDay)
                if let selected {
                    NavigationLink(value: RecoverySleepDestination.night(selected.sleepDay)) {
                        HStack {
                            Text("\(SleepEvidenceFormat.sleepDay(selected.sleepDay)) · \(SleepEvidenceFormat.duration(selected.asleepSeconds)) asleep")
                                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                            Spacer()
                            TrainingCompactActionLabel(label: "Open night")
                        }
                        .padding(10)
                        .frame(minHeight: 44)
                        .background(PhysiqueOSTheme.surfaceMuted)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                    .buttonStyle(.plain)
                } else {
                    HStack(spacing: 8) {
                        SleepStatTile(label: "Last 7 nights",
                                      value: landing.sevenNightAverage.asleepSeconds.map { SleepEvidenceFormat.duration($0) } ?? "–",
                                      detail: "average")
                        SleepStatTile(label: "Prior 7 nights",
                                      value: landing.priorSevenNightAverage.asleepSeconds.map { SleepEvidenceFormat.duration($0) } ?? "–",
                                      detail: "average")
                    }
                }
            }
        }
    }

    private func sleepWindowCard(_ landing: RecoverySleepLanding) -> some View {
        let window = landing.sleepWindow
        let rows = SleepWindowChartRow.fromNights(landing.nights)
        let plausible = window.isPlausible(against: rows)
        return CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                TrainingSectionHeaderView(title: "Sleep Window") {
                    Text("\(rows.count) nights")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
                if rows.isEmpty {
                    Text("Sleep windows will appear after your first synced nights.")
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                } else {
                    SleepWindowChart(rows: rows, summary: plausible ? window : nil, plan: axisPlan(landing))
                    windowStats(window, plausible: plausible)
                }
            }
        }
    }

    @ViewBuilder
    private func windowStats(_ window: RecoverySleepWindowSummary, plausible: Bool) -> some View {
        if plausible, let start = window.typicalStartMinutes, let end = window.typicalEndMinutes {
            SleepStatTile(label: "Typical window", value: "\(SleepEvidenceFormat.clockFromMinutes(start)) – \(SleepEvidenceFormat.clockFromMinutes(end))",
                          detail: "from \(window.nightsIncluded) \(window.nightsIncluded == 1 ? "night" : "nights")")
            HStack(spacing: 8) {
                SleepStatTile(label: "Fell asleep", value: window.startSpreadMinutes.map { "within ±\($0)m" } ?? "–")
                SleepStatTile(label: "Woke up", value: window.endSpreadMinutes.map { "within ±\($0)m" } ?? "–")
            }
        } else {
            Text("A typical window appears once enough nights have reliable clock times.")
                .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                .foregroundStyle(PhysiqueOSTheme.textMuted)
        }
        if window.nightsExcludedUncertainTime > 0 {
            Text(SleepEvidenceCopy.approximateClockTimes)
                .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                .foregroundStyle(PhysiqueOSTheme.textMuted)
        }
    }

    private func recentNightsCard(_ landing: RecoverySleepLanding) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                TrainingSectionHeaderView(title: "Recent Nights") {
                    Button { showsAllNights = true } label: { TrainingCompactActionLabel(label: "Show All").frame(minHeight: 44) }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("sleep.showAll")
                }
                VStack(spacing: 8) {
                    ForEach(landing.nights.prefix(3)) { night in
                        NavigationLink(value: RecoverySleepDestination.night(night.sleepDay)) { RecoverySleepNightRow(night: night) }
                            .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private func dataSourcesCard(_ sources: [RecoverySleepSource]) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                TrainingSectionHeaderView(title: "Data Sources")
                VStack(spacing: 8) {
                    ForEach(sources) { source in sourceRow(source) }
                }
                Text("One source is counted per night, so nothing is double counted.")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
            }
        }
    }

    private func sourceRow(_ source: RecoverySleepSource) -> some View {
        let counted = source.role == .counted
        return HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(source.label)
                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(counted ? "Counted on recent nights" : "Recorded in the last 30 days")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
            }
            Spacer()
            Text(counted ? "Counted" : "Recorded")
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(counted ? PhysiqueOSTheme.sleepTotal : PhysiqueOSTheme.textMuted)
                .padding(.horizontal, 8).padding(.vertical, 4)
                .background(counted ? PhysiqueOSTheme.sleepTotal.opacity(0.14) : PhysiqueOSTheme.surfaceElevated)
                .clipShape(Capsule())
        }
        .padding(10)
        .background(PhysiqueOSTheme.surfaceMuted)
        .clipShape(RoundedRectangle(cornerRadius: 12))
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
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                SleepScreenHeader(eyebrow: "Recovery", title: "Sleep Trends", subtitle: "Inspect nights over time")
                SleepScopeSelector()
                if scopeRange == nil || scopeRange?.isEmpty == true {
                    SleepScopeStateCard(store: store, range: scopeRange) { retryNonce += 1 }
                } else {
                    rangeSelector
                    switch viewModel?.state(for: scopeRange) {
                    case .none, .loading:
                        ProgressView().tint(PhysiqueOSTheme.accent).frame(maxWidth: .infinity, minHeight: 300)
                    case .notAvailable:
                        CardContainer { SleepStateMessage(text: notAvailableText) }
                    case .failed(let message):
                        CardContainer { SleepStateMessage(text: message) }
                    case .loaded(let trends):
                        loaded(trends)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
        }
        .recoverySleepChrome(backLabel: "Recovery")
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

    private var rangeSelector: some View {
        HStack(spacing: 4) {
            ForEach(ranges) { option in
                let isSelected = viewModel?.selector == option
                Button {
                    selectedId = nil
                    guard let range = scopeRange else { return }
                    Task { await viewModel?.select(option, range: range) }
                } label: {
                    Text(option.label)
                        .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                        .foregroundStyle(isSelected ? PhysiqueOSTheme.accent : PhysiqueOSTheme.textMuted)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .background(isSelected ? PhysiqueOSTheme.surfaceElevated : Color.clear)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(isSelected ? .isSelected : [])
                .accessibilityIdentifier("sleep.range.\(option.rawValue)")
            }
        }
        .padding(4)
        .background(PhysiqueOSTheme.surfaceMuted)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Sleep trends date range")
    }

    @ViewBuilder
    private func loaded(_ trends: RecoverySleepTrends) -> some View {
        let plan = axisPlan(trends)
        totalCard(trends, plan: plan)
        if trends.granularity == .week {
            CardContainer {
                SleepNoteRow(systemImage: "calendar", title: "Weekly view",
                             detail: "Longer ranges show weekly averages. Sleep window, continuity and stage mix are shown for ranges up to 3 months.")
            }
        } else {
            if let rows = trends.windowRows, !rows.isEmpty { windowCard(rows, summary: nil, plan: plan) }
            if let continuity = trends.continuity { continuityCard(continuity, plan: plan) }
            if let stageMix = trends.stageMix { stageMixCard(stageMix, plan: plan) }
        }
        allNightsCard
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

    private func totalCard(_ trends: RecoverySleepTrends, plan: SleepAxisPolicy.Plan) -> some View {
        let points = SleepTotalChartPoint.fromTrends(trends)
        let isWeekly = trends.granularity == .week
        let selected = selectedId.flatMap { id in trends.totalSleep.first { $0.periodStart == id } }
        return CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                TrainingSectionHeaderView(title: "Total Sleep") {
                    Text("avg \(SleepEvidenceFormat.duration(trends.averageAsleepSeconds))")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
                HStack(spacing: 10) {
                    legendSwatch(PhysiqueOSTheme.sleepTotal, isWeekly ? "Weekly average" : "Nightly total")
                    if !isWeekly { legendDash("7-night average") }
                    Spacer()
                    Text("\(trends.nightsWithData) nights")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
                SleepTotalChart(points: points, isWeekly: isWeekly, plan: plan, selectedId: $selectedId, height: 190)
                if trends.isTruncated {
                    Text("Showing the latest \(trends.totalSleep.count) nights. Choose 6M for weekly averages of a longer span.")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
                if let selected {
                    HStack(spacing: 8) {
                        SleepStatTile(label: isWeekly ? "Week of \(SleepEvidenceFormat.sleepDay(selected.periodStart, style: "MMM d"))" : SleepEvidenceFormat.sleepDay(selected.periodStart),
                                      value: SleepEvidenceFormat.duration(selected.asleepSeconds),
                                      detail: isWeekly ? "average of \(selected.nightCount) nights" : "asleep")
                        if !isWeekly {
                            SleepStatTile(label: "7-night average", value: SleepEvidenceFormat.duration(selected.trailingAverageSeconds), detail: "through this night")
                        }
                    }
                }
            }
        }
    }

    private func windowCard(_ rows: [RecoverySleepTrends.WindowRow], summary: RecoverySleepWindowSummary?, plan: SleepAxisPolicy.Plan) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                TrainingSectionHeaderView(title: "Sleep Window") {
                    if let start = summary?.typicalStartMinutes, let end = summary?.typicalEndMinutes {
                        Text("\(SleepEvidenceFormat.clockFromMinutes(start)) – \(SleepEvidenceFormat.clockFromMinutes(end))")
                            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    }
                }
                SleepWindowChart(rows: SleepWindowChartRow.fromTrends(rows), summary: summary, plan: plan, rowHeight: rows.count > 14 ? 11 : 13)
                if let summary, let startSpread = summary.startSpreadMinutes, let endSpread = summary.endSpreadMinutes {
                    Text("Fell asleep within ±\(startSpread)m · woke within ±\(endSpread)m of the typical window, from \(summary.nightsIncluded) nights.")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
                let excluded = summary?.nightsExcludedUncertainTime ?? rows.filter { !$0.includedInConsistency }.count
                if excluded > 0 {
                    Text(SleepEvidenceCopy.approximateClockTimes)
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
            }
        }
    }

    private func continuityCard(_ rows: [RecoverySleepTrends.ContinuityRow], plan: SleepAxisPolicy.Plan) -> some View {
        let pending = rows.filter { $0.status == .pendingCorrection }.count
        let absent = rows.filter { $0.status == .absent }.count
        return CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                TrainingSectionHeaderView(title: "Continuity")
                SleepContinuityChart(rows: rows, plan: plan)
                if pending + absent > 0 {
                    Text(continuityGapText(pending: pending, absent: absent))
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
            }
        }
    }

    private func continuityGapText(pending: Int, absent: Int) -> String {
        var parts: [String] = []
        if pending > 0 { parts.append("\(pending) night\(pending == 1 ? " is" : "s are") being recalculated") }
        if absent > 0 { parts.append("\(absent) night\(absent == 1 ? " has" : "s have") no stage detail") }
        return parts.joined(separator: " and ") + "; shown as gaps."
    }

    private func stageMixCard(_ rows: [RecoverySleepTrends.StageMixRow], plan: SleepAxisPolicy.Plan) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                Button { withAnimation(.easeInOut(duration: 0.2)) { showsStageMix.toggle() } } label: {
                    HStack {
                        Text("Stage Mix")
                            .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        Spacer()
                        Text(showsStageMix ? "Hide" : "Show stage mix")
                            .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                            .foregroundStyle(PhysiqueOSTheme.accent)
                        Image(systemName: showsStageMix ? "chevron.up" : "chevron.down")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(PhysiqueOSTheme.accent)
                    }
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("sleep.stageMix.toggle")
                .accessibilityValue(showsStageMix ? "Expanded" : "Collapsed")
                if showsStageMix { SleepStageMixChart(rows: rows, plan: plan) }
                Text("Stage estimates come from your sleep source and vary between devices.")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
            }
        }
    }

    private var allNightsCard: some View {
        CardContainer {
            HStack {
                Text("All Nights")
                    .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Spacer()
                Button { showsAllNights = true } label: { TrainingCompactActionLabel(label: "Show All").frame(minHeight: 44) }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("sleep.trends.showAll")
            }
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
        ScrollView {
            Group {
                switch viewModel?.state {
                case .none, .loading:
                    ProgressView().tint(PhysiqueOSTheme.accent).frame(maxWidth: .infinity, minHeight: 300)
                case .notFound:
                    SleepStateMessage(text: "No sleep was recorded for this night.")
                case .notAvailable:
                    SleepStateMessage(text: notAvailableText)
                case .failed(let message):
                    SleepStateMessage(text: message)
                case .loaded(let detail):
                    loaded(detail)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
        }
        .recoverySleepChrome(backLabel: "Recovery")
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
        VStack(alignment: .leading, spacing: 24) {
            header(night)
            if let main = detail.main {
                timelineCard(main, night: night)
                stagesCard(main.stages)
                continuityCard(main.continuity)
                if main.inBedSeconds != nil { timeInBedCard(main, night: night) }
            } else {
                CardContainer { SleepStateMessage(text: night.statusText ?? "No sleep was recorded for this night.") }
            }
            if !detail.secondary.isEmpty { additionalSleepCard(detail, night: night) }
            sourceCard(detail)
        }
    }

    private func header(_ night: RecoverySleepNightSummary) -> some View {
        let clock = night.clock
        return VStack(alignment: .leading, spacing: 6) {
            Text("Night of \(SleepEvidenceFormat.sleepDay(night.sleepDay))")
                .physiqueOSFont(PhysiqueOSTypography.screenEyebrow)
                .foregroundStyle(PhysiqueOSTheme.accent)
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(night.hasSleep ? SleepEvidenceFormat.duration(night.asleepSeconds) : "–")
                    .physiqueOSFont(PhysiqueOSTypography.screenTitle)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    .accessibilityAddTraits(.isHeader)
                Text("asleep")
                    .physiqueOSFont(PhysiqueOSTypography.screenSubtitle)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
            if let window = clock.window {
                Text(window + (!clock.isClockTimeCaution ? (clock.zoneLabel.map { " · \($0)" } ?? "") : ""))
                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
            if night.windowOpen, let closes = SleepEvidenceFormat.instant(night.windowClosesAt) {
                SleepStatusTag(text: "Still updating until \(SleepEvidenceFormat.clock(closes, in: clock.zone))", systemImage: "clock.arrow.circlepath")
            }
            if clock.isClockTimeCaution {
                Text(SleepEvidenceCopy.approximateClockTimes)
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func timelineCard(_ main: RecoverySleepNightDetail.Main, night: RecoverySleepNightSummary) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                TrainingSectionHeaderView(title: "Timeline")
                switch main.timeline.status {
                case .available, .absent:
                    SleepHypnogramView(segments: main.timeline.segments, zone: night.clock.zone,
                                       inBedStart: SleepEvidenceFormat.instant(main.inBedStart), inBedEnd: SleepEvidenceFormat.instant(main.inBedEnd),
                                       approximate: night.clock.isClockTimeCaution)
                    if main.timeline.status == .absent {
                        Text("This source recorded sleep without stages for this night.")
                            .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                            .foregroundStyle(PhysiqueOSTheme.textMuted)
                    }
                case .pendingCorrection, .unknown:
                    SleepHypnogramView(segments: [.init(stage: .unspecified, start: main.start, end: main.end)], zone: night.clock.zone,
                                       inBedStart: SleepEvidenceFormat.instant(main.inBedStart), inBedEnd: SleepEvidenceFormat.instant(main.inBedEnd),
                                       approximate: night.clock.isClockTimeCaution)
                    SleepRecalculatingNote(detail: "The stage timeline will appear once this night is recalculated.")
                }
            }
        }
    }

    private func stagesCard(_ stages: RecoverySleepNightDetail.Stages) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                TrainingSectionHeaderView(title: "Stages")
                switch stages.status {
                case .available:
                    if let deep = stages.deepSeconds, let core = stages.coreSeconds, let rem = stages.remSeconds {
                        SleepStageBar(deep: deep, core: core, rem: rem)
                        VStack(spacing: 8) {
                            stageRow(.deep, deep)
                            stageRow(.core, core)
                            stageRow(.rem, rem)
                            if let awake = stages.awakeSeconds {
                                Divider().overlay(PhysiqueOSTheme.divider)
                                stageRow(.awake, awake, label: "Awake in sleep window")
                            }
                        }
                    }
                    Text("Stage estimates come from your sleep source and vary between devices. Core is shown as Light in some apps.")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                case .pendingCorrection, .unknown:
                    SleepRecalculatingNote(detail: "Total sleep and timing are final. Stage and awake minutes will appear once this night is recalculated.")
                case .absent:
                    Text("Stage detail is not available from this source for this night.")
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
        }
    }

    private func stageRow(_ stage: RecoverySleepStage, _ seconds: Int, label: String? = nil) -> some View {
        HStack {
            RoundedRectangle(cornerRadius: 2).fill(PhysiqueOSTheme.sleepColor(stage)).frame(width: 10, height: 10).accessibilityHidden(true)
            Text(label ?? stage.label)
                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
            Spacer()
            Text(SleepEvidenceFormat.duration(seconds))
                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label ?? stage.label): \(SleepEvidenceFormat.spokenDuration(seconds))")
    }

    private func continuityCard(_ continuity: RecoverySleepNightDetail.Continuity) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                TrainingSectionHeaderView(title: "Continuity")
                switch continuity.status {
                case .available:
                    HStack(spacing: 8) {
                        SleepStatTile(label: "Longest continuous", value: SleepEvidenceFormat.duration(continuity.longestAsleepStretchSeconds), detail: "asleep")
                        SleepStatTile(label: "Awake in window", value: SleepEvidenceFormat.duration(continuity.awakeInWindowSeconds), detail: "between sleep")
                    }
                case .pendingCorrection, .unknown:
                    SleepRecalculatingNote(detail: "Continuity uses awake time, which is recalculated with stages.")
                case .absent:
                    Text("Continuity needs stage detail, which this source didn't record for this night.")
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
        }
    }

    private func timeInBedCard(_ main: RecoverySleepNightDetail.Main, night: RecoverySleepNightSummary) -> some View {
        let zone = night.clock.zone
        let start = SleepEvidenceFormat.instant(main.inBedStart)
        let end = SleepEvidenceFormat.instant(main.inBedEnd)
        return CardContainer {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Time in Bed")
                        .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    if let start, let end {
                        Text("In bed \(night.clock.isClockTimeCaution ? "≈ " : "")\(SleepEvidenceFormat.clock(start, in: zone)) – \(SleepEvidenceFormat.clock(end, in: zone))")
                            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    }
                }
                Spacer()
                Text(SleepEvidenceFormat.duration(main.inBedSeconds))
                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
            }
            .accessibilityElement(children: .combine)
        }
    }

    private func additionalSleepCard(_ detail: RecoverySleepNightDetail, night: RecoverySleepNightSummary) -> some View {
        let zone = night.clock.zone
        return CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                TrainingSectionHeaderView(title: "Additional Sleep")
                ForEach(detail.secondary) { episode in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            if let start = SleepEvidenceFormat.instant(episode.start), let end = SleepEvidenceFormat.instant(episode.end) {
                                Text("\(night.clock.isClockTimeCaution ? "≈ " : "")\(SleepEvidenceFormat.clock(start, in: zone)) – \(SleepEvidenceFormat.clock(end, in: zone))")
                                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                            }
                            Text(episode.sourceLabel ?? "Another source")
                                .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                                .foregroundStyle(PhysiqueOSTheme.textMuted)
                        }
                        Spacer()
                        Text(SleepEvidenceFormat.duration(episode.asleepSeconds))
                            .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    }
                    .padding(10)
                    .background(PhysiqueOSTheme.surfaceMuted)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .accessibilityElement(children: .combine)
                }
                if let total = night.totalAsleepIncludingSecondarySeconds {
                    Text("Total including additional sleep \(SleepEvidenceFormat.duration(total))")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
        }
        .accessibilityIdentifier("sleep.additional")
    }

    private func sourceCard(_ detail: RecoverySleepNightDetail) -> some View {
        let night = detail.night
        let clock = night.clock
        return CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                Button { withAnimation(.easeInOut(duration: 0.2)) { showsSourceDetails.toggle() } } label: {
                    HStack {
                        Text("Source & Data")
                            .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        Spacer()
                        Image(systemName: showsSourceDetails ? "chevron.up" : "chevron.down")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(PhysiqueOSTheme.accent)
                    }
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("sleep.sourceData.toggle")
                .accessibilityValue(showsSourceDetails ? "Expanded" : "Collapsed")
                if let provenance = detail.provenance {
                    Text("Counted from \(provenance.primarySourceLabel) (via Apple Health)")
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
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
                        .background(PhysiqueOSTheme.surfaceMuted)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        Text(clock.provenanceText + ". Total sleep never depends on the time zone.")
                            .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                            .foregroundStyle(PhysiqueOSTheme.textMuted)
                    }
                } else {
                    Text("No source recorded this night.")
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
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

    private func detailRow(_ label: String, _ value: String, last: Bool = false) -> some View {
        VStack(spacing: 0) {
            HStack(alignment: .top) {
                Text(label)
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
                Spacer(minLength: 12)
                Text(value)
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    .multilineTextAlignment(.trailing)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .accessibilityElement(children: .combine)
            if !last { Divider().overlay(PhysiqueOSTheme.divider) }
        }
    }
}
