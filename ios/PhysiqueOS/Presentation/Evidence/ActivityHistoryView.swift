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
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel: ActivityHistoryViewModel?
    @State private var isHistorySheetPresented = false

    /// `ACTIVITY_HISTORY_PREVIEW_LIMIT` (`ProgressPlaceholderScreen.jsx`).
    static let historyPreviewLimit = 3

    var body: some View {
        ScrollView {
            content
                .padding(.horizontal, 16)
                .padding(.top, 12)
        }
        .physiqueOSScrollBottomClearance()
        .background(PhysiqueOSTheme.background)
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .restoresInteractivePopGesture()
        .toolbarBackground(PhysiqueOSTheme.background, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button {
                    dismiss()
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "arrow.left")
                            .font(.system(size: 13, weight: .semibold))
                        Text("Evidence Hub")
                            .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                    }
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
        }
        .task {
            if viewModel == nil { viewModel = ActivityHistoryViewModel(api: environment.activityAPI) }
            await viewModel?.load()
        }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel?.state {
        case .none, .loading:
            ProgressView()
                .tint(PhysiqueOSTheme.accent)
                .frame(maxWidth: .infinity, minHeight: 300)
        case .failed(let message):
            Text(message)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                .frame(maxWidth: .infinity, minHeight: 300)
        case .loaded(let landing):
            VStack(alignment: .leading, spacing: 16) {
                header(for: landing)
                TrainingScopeSelectorView(scope: landing.scope)
                latestActivityDayCard(landing.latestActivityDay)
                activityAreasCard(landing.activityAreas)
                linkedTrainingContextCard(landing.linkedTrainingContext)
                recentHistoryCard(landing.activityHistory)
                DataSourcesFooterView(items: landing.dataSources)
            }
        }
    }

    // MARK: - Header ("Evidence Report" eyebrow, IconBadge, title, subtitle)

    private func header(for landing: ActivityLandingReadModel) -> some View {
        HStack(alignment: .top, spacing: 12) {
            IconBadge(systemImage: "list.clipboard.fill", color: landing.tone, size: .lg, isCircular: true)
            VStack(alignment: .leading, spacing: 4) {
                Text("Evidence Report")
                    .physiqueOSFont(PhysiqueOSTypography.screenEyebrow)
                    .foregroundStyle(PhysiqueOSTheme.accent)
                Text(landing.title)
                    .physiqueOSFont(PhysiqueOSTypography.screenTitle)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(landing.subtitle)
                    .physiqueOSFont(PhysiqueOSTypography.screenSubtitle)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Latest Activity Day (always expanded on web; tap navigates to detail)

    private func latestActivityDayCard(_ day: ActivityDayRecord?) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                TrainingSectionHeaderView(title: day?.isToday == true ? "Today's Activity" : "Latest Activity Day")
                if let day {
                    NavigationLink(value: AppDestination.activityDay(date: day.date)) {
                        VStack(alignment: .leading, spacing: 8) {
                            HStack(alignment: .top) {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(TrainingDateFormatting.short(day.date))
                                        .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                                    Text(day.value)
                                        .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                                    Text(day.detail)
                                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                                }
                                Spacer(minLength: 8)
                                Image(systemName: "chevron.right")
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundStyle(PhysiqueOSTheme.accent)
                            }
                            ActivityMetricGridView(day: day)
                        }
                        .padding(12)
                        .background(PhysiqueOSTheme.surfaceMuted)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                    .buttonStyle(.plain)
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("\(TrainingDateFormatting.short(day.date)) activity: \(day.value). \(day.detail)")
                    .accessibilityAddTraits(.isButton)
                } else {
                    Text("Activity days will appear here once daily movement evidence is uploaded or connected.")
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
        }
    }

    // MARK: - Activity Areas (informational: the web's own tap targets 404, see the type-level doc comment)

    private func activityAreasCard(_ areas: [ActivityAreaSummary]) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                TrainingSectionHeaderView(title: "Activity Areas")
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                    ForEach(areas) { area in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(area.label)
                                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                                .lineLimit(1)
                            Text(area.value)
                                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        }
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(PhysiqueOSTheme.surfaceMuted)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel("\(area.label): \(area.value)")
                    }
                }
            }
        }
    }

    // MARK: - Linked Training Context (non-clickable preview, matching web)

    private func linkedTrainingContextCard(_ entries: [ActivityTrainingContextEntry]) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                TrainingSectionHeaderView(title: "Linked Training Context")
                if entries.isEmpty {
                    Text("No linked workouts are available for this activity day.")
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                } else {
                    VStack(spacing: 8) {
                        ForEach(entries) { entry in
                            ActivityTrainingContextRow(entry: entry)
                        }
                    }
                }
            }
        }
    }

    // MARK: - Recent Activity History (preview + "Show All" sheet)

    private func recentHistoryCard(_ history: [ActivityDayRecord]) -> some View {
        let preview = Array(history.prefix(Self.historyPreviewLimit))
        return CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                TrainingSectionHeaderView(title: "Recent Activity History") {
                    if history.count > Self.historyPreviewLimit {
                        Button {
                            isHistorySheetPresented = true
                        } label: {
                            TrainingCompactActionLabel(label: "Show All")
                        }
                    }
                }
                if preview.isEmpty {
                    Text("Activity history will appear as daily movement evidence is uploaded or connected.")
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                } else {
                    VStack(spacing: 8) {
                        ForEach(preview) { day in
                            NavigationLink(value: AppDestination.activityDay(date: day.date)) {
                                ActivityHistoryRow(day: day)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
        .sheet(isPresented: $isHistorySheetPresented) {
            ActivityHistorySheet(days: history)
        }
    }
}

// MARK: - "Show All" history sheet (mirrors `ActivityHistorySheet.jsx`)

private struct ActivityHistorySheet: View {
    let days: [ActivityDayRecord]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 8) {
                    ForEach(days) { day in
                        NavigationLink(value: AppDestination.activityDay(date: day.date)) {
                            HStack(spacing: 8) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(TrainingDateFormatting.short(day.date))
                                        .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                                    Text(day.protocolStatus)
                                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                                }
                                Spacer(minLength: 8)
                                Text(day.value)
                                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                                Image(systemName: "chevron.right")
                                    .font(.system(size: 13, weight: .black))
                                    .foregroundStyle(PhysiqueOSTheme.accent)
                            }
                            .padding(.horizontal, 12)
                            .frame(minHeight: 56)
                            .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.plain)
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel("\(TrainingDateFormatting.short(day.date)) activity: \(day.value). \(day.protocolStatus)")
                        if day.id != days.last?.id {
                            Divider().overlay(PhysiqueOSTheme.divider)
                        }
                    }
                }
                .padding(16)
            }
            .background(PhysiqueOSTheme.background)
            .navigationTitle("Recent Activity History")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(PhysiqueOSTheme.background, for: .navigationBar)
            .navigationDestination(for: AppDestination.self) { AppDestinationRouterView(destination: $0) }
        }
        .presentationDetents([.medium, .large])
    }
}

// MARK: - Shared small pieces local to the Activity landing/history page

/// Mirrors `ActivityDayHistory`'s row content (date + protocolStatus, value
/// trailing) — the web disclosure-toggles this row in place; Native pushes
/// to `ActivityDayView` instead (see the type-level doc comment above).
private struct ActivityHistoryRow: View {
    let day: ActivityDayRecord

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text(TrainingDateFormatting.short(day.date))
                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(day.protocolStatus)
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 2) {
                Text(day.value)
                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(PhysiqueOSTheme.accent)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity)
        .background(PhysiqueOSTheme.surfaceMuted)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
        .accessibilityLabel("\(TrainingDateFormatting.short(day.date)) activity: \(day.value). \(day.protocolStatus)")
    }
}

/// A `RecordPreview` row inside "Linked Training Context" — non-clickable
/// on the web, so unlike `TrainingRecordPreviewRow` this is a plain `View`,
/// not wrapped in a `NavigationLink` by its caller.
private struct ActivityTrainingContextRow: View {
    let entry: ActivityTrainingContextEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .top, spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(entry.label)
                        .physiqueOSFont(PhysiqueOSTypography.calloutStrong)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    Text(entry.detail)
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
                Spacer(minLength: 8)
                VStack(alignment: .trailing, spacing: 2) {
                    Text(entry.value)
                        .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    Text(TrainingDateFormatting.short(entry.date))
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
            }
            if !entry.sourceEvidence.isEmpty {
                Text("Source: \(entry.sourceEvidence.joined(separator: " + "))")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PhysiqueOSTheme.surfaceElevated)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .combine)
    }
}

/// `TrainingSourceMetadataFooter`'s sibling for Activity's own
/// `getDataSources("activity")` shape — plain `{name, status}` text pairs,
/// no color-coding (verified directly against `EvidenceReportContext.jsx`'s
/// `DataSourcesCard`). Not shared with Training's own private
/// `DataSourcesFooterView` in `TrainingHistoryView.swift`: that type reads
/// `{label, sources}`, a different shape for a different section.
private struct DataSourcesFooterView: View {
    let items: [ActivityDataSource]

    var body: some View {
        if !items.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                Divider().overlay(PhysiqueOSTheme.divider)
                Text("Data Sources")
                    .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
                    .padding(.top, 6)
                ForEach(items) { item in
                    HStack {
                        Text(item.name)
                        Spacer(minLength: 8)
                        Text(item.status)
                            .foregroundStyle(PhysiqueOSTheme.textMuted)
                    }
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
        }
    }
}

/// Mirrors `ActivityMetricGrid` (`ProgressPlaceholderScreen.jsx:562-589`)
/// exactly: a 2-column grid of the same 8 metric tiles, in the same order.
/// `internal` (not `private`): shared between the Latest Activity Day card
/// above and `ActivityDayView`'s detail screen — the web itself renders
/// this identical component in both places.
struct ActivityMetricGridView: View {
    let day: ActivityDayRecord

    var body: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
            ForEach(day.metricTiles) { tile in
                VStack(alignment: .leading, spacing: 2) {
                    Text(tile.label)
                        .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                    Text(tile.value)
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                }
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(PhysiqueOSTheme.surfaceElevated)
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .accessibilityElement(children: .combine)
                .accessibilityLabel("\(tile.label): \(tile.value)")
            }
        }
    }
}
