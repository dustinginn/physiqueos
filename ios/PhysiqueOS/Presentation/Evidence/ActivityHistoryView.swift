import SwiftUI

/// The Activity Evidence landing/history page (`/progress/activity`),
/// reached from the Evidence tab's Activity row. Full copy-first port from
/// `ProgressPlaceholderScreen.jsx`'s `report.id === "activity"` render path
/// (`ActivityEvidenceContext` + `ActivityEvidenceReport`,
/// `ActivityEvidenceContextService.getActivityTimelineReport` →
/// `ProgressReportingService.buildActivityReport`). Section order, labels,
/// grouping, and navigation affordances are read directly from source, not
/// reinterpreted:
///
/// header (Evidence Report / Activity / subtitle) → scope selector
/// (Build Lean Mass / Visible Abs / All Activity) → Latest Activity Day →
/// Activity Areas → Linked Training Context → Recent Activity History →
/// Data Sources.
///
/// `report.relatedGoals` and `report.currentActivityProtocol` are real
/// server fields but are explicitly never rendered for this stream on the
/// live page (verified directly against source and its own regression
/// test) — correctly absent here, not a missing section.
///
/// Two deliberate, documented deviations from the literal web markup:
///
/// 1. **Activity Areas is non-navigating.** The live web page's four
///    "Activity Areas" rows link to `/progress/activity/reporting/*`
///    routes that do not exist in the Next.js app (confirmed 404 — no
///    backing route file, unlike Nutrition/Training's own `reporting/*`
///    pages). Porting the tap targets as-is would create the exact
///    dead-end screens this port is explicitly told to avoid; the
///    section's copy/values are preserved without the broken link.
/// 2. **History rows (and the Latest Activity Day card) navigate to a
///    dedicated Activity Day screen (`.activityDay(date:)`) instead of the
///    web's inline `<details>`/`<summary>` accordion expansion.** The
///    web's Activity history rows and Latest Activity Day card both expand
///    in place, with no navigation at all — genuinely different from
///    Nutrition's own history, which does navigate to a day page. This
///    port follows the brief's explicit Detail Navigation requirement
///    rather than the web's inline-only pattern for this one stream — a
///    touch-interaction/navigation adaptation, not new product content:
///    the destination shows the exact same value/detail/protocolStatus/
///    8-tile metric grid the web shows inline, via the shared
///    `ActivityMetricGridView`.
struct ActivityHistoryView: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var viewModel: ActivityHistoryViewModel?
    @State private var viewModelAuthority: NativeAPIEnvironment?
    @State private var isHistorySheetPresented = false

    static let historyPreviewLimit = 3
    private let m = EvidenceMetrics(family: .daily)

    var body: some View {
        EvidenceScrollPage(top: 10) {
            content
        }
        .evidencePageChrome("Activity")
        .evidenceFamily(.daily)
        .task(id: environment.nativeAuthority) {
            if viewModelAuthority != environment.nativeAuthority {
                viewModel = ActivityHistoryViewModel(api: environment.activityAPI)
                viewModelAuthority = environment.nativeAuthority
            }
            await viewModel?.load()
        }
        .refreshable {
            if environment.nativeAuthority == .founderProduction {
                await environment.productionNativeAPI.invalidateReadResources(["activity"])
            }
            await viewModel?.load()
        }
        .refreshesOnForegroundWhenVisible { await viewModel?.load() }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel?.state {
        case .none, .loading:
            EvidenceStatePanel(kind: .loading("Loading Activity Evidence…"), identifier: "activity.loading")
        case .failed(let message):
            EvidenceStatePanel(kind: .failure(message, nil), identifier: "activity.failure")
        case .loaded(let landing):
            EvidencePageHeader(symbol: "⌁", eyebrow: "Evidence Report", title: landing.title, subtitle: landing.subtitle)
            EvidenceScopePicker(scope: landing.scope) { scopeID in
                Task { await viewModel?.selectScope(pillID: scopeID) }
            }
            latestActivityDaySection(landing.latestActivityDay)
            activityAreasSection(landing.activityAreas)
            ActivityLinkedTrainingSection(entries: landing.linkedTrainingContext)
            recentHistorySection(landing.activityHistory)
        }
    }

    // MARK: - Today's / Latest Activity Day (hero field → Activity Day)

    private func latestActivityDaySection(_ day: ActivityDayRecord?) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            EvidenceDailySectionHead(title: day?.isToday == true ? "Today's Activity" : "Latest Activity Day") { EmptyView() }
            if let day {
                NavigationLink(value: AppDestination.activityDay(date: day.date)) {
                    EvidenceDailyHero {
                        VStack(alignment: .leading, spacing: 0) {
                            HStack(alignment: .top, spacing: m.pt(10)) {
                                VStack(alignment: .leading, spacing: 0) {
                                    Text(TrainingDayView.formatCompactDate(day.date))
                                        .evidenceText(.normal(12, 840))
                                        .foregroundStyle(m.c.ink)
                                    Text(day.value)
                                        .evidenceText(.normal(11, 800))
                                        .foregroundStyle(m.c.ink)
                                        .padding(.top, m.pt(2))
                                    Text(day.detail)
                                        .evidenceText(EvidenceTextStyle(size: 9, weight: 600, lineHeight: 12.42))
                                        .foregroundStyle(m.c.muted)
                                        .fixedSize(horizontal: false, vertical: true)
                                        .padding(.top, m.pt(3))
                                    if day.isInProgress {
                                        Text("Still updating from Apple Health")
                                            .evidenceText(EvidenceTextStyle(size: 9, weight: 600, lineHeight: 12.42))
                                            .foregroundStyle(m.c.teal)
                                            .padding(.top, m.pt(3))
                                    }
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                Text("›")
                                    .evidenceText(EvidenceTextStyle(size: 20, weight: 400, lineHeight: 20))
                                    .foregroundStyle(m.c.teal)
                            }
                            ActivityMetricGridView(day: day)
                                .padding(.top, m.pt(10))
                            if let warning = day.energyAnomalyMessage {
                                EvidenceDailyWarning(text: warning, provisional: day.energyAnomalyIsProvisional)
                                    .padding(.top, m.pt(10))
                            }
                        }
                    }
                }
                .buttonStyle(.plain)
                .accessibilityElement(children: .combine)
                .accessibilityLabel("\(TrainingDateFormatting.short(day.date)) activity: \(day.value). \(day.detail)")
                .accessibilityAddTraits(.isButton)
                .accessibilityIdentifier("activity.latestDay")
            } else {
                Text("Activity days will appear here once daily movement evidence is uploaded or connected.")
                    .evidenceText(EvidenceTextStyle(size: 9, weight: 400, lineHeight: 12.15))
                    .foregroundStyle(m.c.muted)
            }
        }
    }

    // MARK: - Activity Areas (informational, not navigation)

    private func activityAreasSection(_ areas: [ActivityAreaSummary]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            EvidenceDailySectionHead(title: "Activity Areas") { EmptyView() }
            EvidenceDailyAreaGrid(items: areas.map { ($0.label, $0.value) })
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("activity.areas")
    }

    // MARK: - Recent Activity History (3-row preview + Show All sheet)

    private func recentHistorySection(_ history: [ActivityDayRecord]) -> some View {
        let preview = Array(history.prefix(Self.historyPreviewLimit))
        return VStack(alignment: .leading, spacing: 0) {
            EvidenceDailySectionHead(title: "Recent Activity History") {
                if history.count > Self.historyPreviewLimit {
                    Button {
                        isHistorySheetPresented = true
                    } label: {
                        EvidenceSectionAction(label: "Show All >")
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("activity.history.showAll")
                }
            }
            if preview.isEmpty {
                Text("Activity history will appear as daily movement evidence is uploaded or connected.")
                    .evidenceText(EvidenceTextStyle(size: 9, weight: 400, lineHeight: 12.15))
                    .foregroundStyle(m.c.muted)
            } else {
                EvidenceDailyOpenList(data: preview) { day in
                    NavigationLink(value: AppDestination.activityDay(date: day.date)) {
                        ActivityHistoryRow(day: day)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("activity.history")
        .sheet(isPresented: $isHistorySheetPresented) {
            ActivityHistorySheet(days: history)
        }
    }
}

/// Current Linked Training Context — real evidence, not navigation.
struct ActivityLinkedTrainingSection: View {
    let entries: [ActivityTrainingContextEntry]
    private let m = EvidenceMetrics(family: .daily)

    var body: some View {
        EvidenceSection(title: "Linked Training Context", style: .containedDeep, identifier: "activity.linkedTraining") {
            if entries.isEmpty {
                Text("No linked workouts are available for this activity day.")
                    .evidenceText(EvidenceTextStyle(size: 9, weight: 400, lineHeight: 12.15))
                    .foregroundStyle(m.c.muted)
            } else {
                VStack(spacing: m.pt(6)) {
                    ForEach(entries) { entry in
                        EvidenceDailyRow(
                            label: entry.label,
                            copy: entry.detail,
                            trailing: [entry.value] + (entry.date.map { [TrainingDateFormatting.short($0)] } ?? []),
                            showsChevron: false,
                            railColor: m.c.purple
                        )
                    }
                }
            }
        }
    }
}

// MARK: - "Show All" history sheet (locked A5)

private struct ActivityHistorySheet: View {
    @Environment(\.dismiss) private var dismiss
    let days: [ActivityDayRecord]
    private let m = EvidenceMetrics(family: .daily)

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 0) {
                    ForEach(days) { day in
                        NavigationLink(value: AppDestination.activityDay(date: day.date)) {
                            ActivityHistoryRow(day: day)
                        }
                        .buttonStyle(.plain)
                        .padding(.bottom, m.pt(1))
                        .overlay(alignment: .bottom) { Rectangle().fill(m.c.line).frame(height: m.pt(1)) }
                    }
                }
                .padding(.horizontal, m.pt(16))
                .padding(.top, m.pt(6))
                .padding(.bottom, m.pt(30))
            }
            .background(m.c.page)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(m.c.page, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: {
                        Text("Done")
                            .evidenceText(.normal(12, 750))
                            .foregroundStyle(m.c.muted)
                            .frame(minWidth: 44, minHeight: 44, alignment: .leading)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("evidence.sheet.done")
                }
                .evidenceFlatToolbarItem()
                ToolbarItem(placement: .principal) {
                    Text("Recent Activity History")
                        .evidenceText(.normal(12, 800))
                        .foregroundStyle(m.c.ink)
                }
            }
            .safeAreaInset(edge: .top, spacing: 0) { Rectangle().fill(m.c.line).frame(height: m.pt(1)) }
            .navigationDestination(for: AppDestination.self) { AppDestinationRouterView(destination: $0) }
        }
        .environment(\.evidenceBackTrail, nil)
        .evidenceFamily(.daily)
        .presentationDetents([.medium, .large])
    }
}

/// One Activity day row: date, protocol status, value split into the
/// locked two trailing lines (`612 active cal` / `48 min ›`).
private struct ActivityHistoryRow: View {
    let day: ActivityDayRecord

    var body: some View {
        EvidenceDailyRow(
            label: TrainingDateFormatting.short(day.date),
            copy: day.protocolStatus,
            trailing: day.value.components(separatedBy: " / ")
        )
        .accessibilityAddTraits(.isButton)
        .accessibilityLabel("\(TrainingDateFormatting.short(day.date)) activity: \(day.value). \(day.protocolStatus)")
        .accessibilityIdentifier("activity.history.day.\(day.date)")
    }
}

struct ActivityMetricGridView: View {
    let day: ActivityDayRecord

    var body: some View {
        EvidenceDailyMetricGrid(items: day.metricTiles.map {
            .init(label: $0.label, value: $0.value, accent: $0.label == "Active Calories")
        })
    }
}
