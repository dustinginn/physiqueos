import SwiftUI

/// The Energy Evidence page (`/progress/energy`), reached from the
/// Evidence tab's Energy row. Genuinely **one page, no sub-routes** —
/// confirmed by this port's audit of `src/app/progress/energy/`: no nested
/// directories, no dynamic segments, no separate reporting/detail route.
/// Section order mirrors `EnergyEvidenceScreen.jsx` exactly:
///
/// header → scope selector ("Viewing") → Period Summary (4 cards) →
/// Energy Over Time (dual-series chart + range selector) → Weekly Energy
/// Balance (latest-4-weeks bar chart) → Weekly History ("Show All" sheet) →
/// Recent Daily Energy ("Show All" sheet) → Data Sources.
///
/// A separate, real live surface — **Operating Plan → Energy Strategy**
/// ("Current Energy Strategy" / "Maintenance Calibration" phase copy,
/// `/profile/operating-plan/strategy/energy/[protocolId]`) — is
/// deliberately NOT built here: a dedicated web regression test
/// (`EnergyEvidenceScreen.test.js`) asserts this Evidence page itself never
/// renders any of that content. See `EnergyReportReadModel`'s type-level
/// doc comment.
struct EnergyHistoryView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @State private var viewModel: EnergyHistoryViewModel?

    @State private var selectedOverTimeWeekID: String?
    @State private var selectedRecentWeekID: String?
    @State private var isWeeklyHistorySheetPresented = false
    @State private var isDailyHistorySheetPresented = false

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
        .task(id: environment.nativeAuthority) {
            viewModel = EnergyHistoryViewModel(api: environment.energyAPI)
            await viewModel?.load()
        }
        .refreshable {
            if environment.nativeAuthority == .founderProduction {
                await environment.productionNativeAPI.invalidateReadResources(["energy"])
            }
            await viewModel?.load()
        }
        .onChange(of: scenePhase) { _, phase in if phase == .active { Task { await viewModel?.load() } } }
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
        case .loaded(let report):
            VStack(alignment: .leading, spacing: 24) {
                header(for: report)
                TrainingScopeSelectorView(scope: report.scope) { pillID in
                    Task { await viewModel?.selectScope(pillID: pillID) }
                }
                summaryGrid(report.summary)
                overTimeCard(report.weeklyTrend)
                recentWeeksCard(report.recentFourWeeks)
                weeklyHistoryCard(report.weeklyHistory)
                dailyHistoryCard(report.dailyHistory)
            }
        }
    }

    private func header(for report: EnergyReportReadModel) -> some View {
        HStack(alignment: .top, spacing: 12) {
            IconBadge(systemImage: "bolt.fill", color: .primary, size: .lg, isCircular: true)
            VStack(alignment: .leading, spacing: 4) {
                Text(report.title)
                    .physiqueOSFont(PhysiqueOSTypography.screenEyebrow)
                    .foregroundStyle(PhysiqueOSTheme.accent)
                Text(report.heading)
                    .physiqueOSFont(PhysiqueOSTypography.screenTitle)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(report.subtitle)
                    .physiqueOSFont(PhysiqueOSTypography.screenSubtitle)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func summaryGrid(_ summary: EnergySummary) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            TrainingSectionHeaderView(title: "Period Summary")
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                summaryCard("Average Intake", EnergyEvidenceCalculator.formatCalories(summary.averageIntake), supporting: nil)
                summaryCard("Average Expenditure", EnergyEvidenceCalculator.formatCalories(summary.averageExpenditure), supporting: nil)
                summaryCard("Average Balance", EnergyEvidenceCalculator.formatSignedCalories(summary.averageBalance), supporting: nil)
                summaryCard("Complete Days", "\(summary.completeDays)", supporting: "\(summary.completeDays) of \(summary.evidenceDays) evidence days")
            }
        }
    }

    private func summaryCard(_ label: String, _ value: String, supporting: String?) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                .foregroundStyle(PhysiqueOSTheme.textMuted)
            Text(value)
                .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
            if let supporting {
                Text(supporting)
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PhysiqueOSTheme.surfaceElevated)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(label): \(value)\(supporting.map { ". \($0)" } ?? "")")
    }

    private func overTimeCard(_ weeksAscending: [EnergyWeekRecord]) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 8) {
                TrainingSectionHeaderView(title: "Energy Over Time")
                Text("Weekly average intake and estimated expenditure over time.")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
                EnergyOverTimeChartView(weeksAscending: weeksAscending, selectedWeekID: $selectedOverTimeWeekID)
            }
        }
    }

    private func recentWeeksCard(_ recentFourWeeks: [EnergyWeekRecord]) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 8) {
                TrainingSectionHeaderView(title: "Weekly Energy Balance")
                Text("Average daily intake and estimated expenditure across the latest four weeks.")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
                EnergyWeeklyBarChartView(weeksAscending: recentFourWeeks, selectedWeekID: $selectedRecentWeekID)
            }
        }
    }

    private func weeklyHistoryCard(_ weeks: [EnergyWeekRecord]) -> some View {
        let preview = Array(weeks.prefix(Self.historyPreviewLimit))
        return CardContainer {
            VStack(alignment: .leading, spacing: 8) {
                TrainingSectionHeaderView(title: "Weekly History") {
                    if weeks.count > Self.historyPreviewLimit {
                        Button {
                            isWeeklyHistorySheetPresented = true
                        } label: {
                            TrainingCompactActionLabel(label: "Show All")
                        }
                    }
                }
                if preview.isEmpty {
                    Text("No weekly evidence available.")
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                } else {
                    VStack(spacing: 8) {
                        ForEach(preview) { week in EnergyWeekHistoryRow(week: week) }
                    }
                }
            }
        }
        .sheet(isPresented: $isWeeklyHistorySheetPresented) {
            EnergyWeeklyHistorySheet(weeks: weeks)
        }
    }

    private func dailyHistoryCard(_ days: [EnergyDayRecord]) -> some View {
        let preview = Array(days.prefix(Self.historyPreviewLimit))
        return CardContainer {
            VStack(alignment: .leading, spacing: 8) {
                TrainingSectionHeaderView(title: "Recent Daily Energy") {
                    if days.count > Self.historyPreviewLimit {
                        Button {
                            isDailyHistorySheetPresented = true
                        } label: {
                            TrainingCompactActionLabel(label: "Show All")
                        }
                    }
                }
                if preview.isEmpty {
                    Text("No daily energy evidence available.")
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                } else {
                    VStack(spacing: 8) {
                        ForEach(preview) { day in EnergyDayHistoryRow(day: day) }
                    }
                }
            }
        }
        .sheet(isPresented: $isDailyHistorySheetPresented) {
            EnergyDailyHistorySheet(days: days)
        }
    }
}

// MARK: - "Show All" sheets (mirrors the web's own `FloatingSheet` pattern)

private struct EnergyWeeklyHistorySheet: View {
    let weeks: [EnergyWeekRecord]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 8) {
                    ForEach(weeks) { week in EnergyWeekHistoryRow(week: week) }
                }
                .padding(16)
            }
            .background(PhysiqueOSTheme.background)
            .navigationTitle("Weekly History")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(PhysiqueOSTheme.background, for: .navigationBar)
        }
        .presentationDetents([.medium, .large])
    }
}

private struct EnergyDailyHistorySheet: View {
    let days: [EnergyDayRecord]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 8) {
                    ForEach(days) { day in EnergyDayHistoryRow(day: day) }
                }
                .padding(16)
            }
            .background(PhysiqueOSTheme.background)
            .navigationTitle("Daily Energy History")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(PhysiqueOSTheme.background, for: .navigationBar)
            .navigationDestination(for: AppDestination.self) { AppDestinationRouterView(destination: $0) }
        }
        .presentationDetents([.medium, .large])
    }
}

// MARK: - Row views

private struct EnergyWeekHistoryRow: View {
    let week: EnergyWeekRecord

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top) {
                Text("\(TrainingDateFormatting.short(week.weekStart)) – \(TrainingDateFormatting.short(week.weekEnd))")
                    .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Spacer(minLength: 8)
                Text(week.partial ? "Partial" : "Complete")
                    .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
            }
            HStack(alignment: .top, spacing: 18) {
                VStack(alignment: .leading, spacing: 10) {
                    weekValue("Intake", EnergyEvidenceCalculator.formatCalories(week.averageIntake), color: PhysiqueOSTheme.energyIntake)
                    weekValue("Balance", EnergyEvidenceCalculator.formatSignedCalories(week.averageBalance), color: PhysiqueOSTheme.chartSuccess)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                VStack(alignment: .leading, spacing: 10) {
                    weekValue("Estimated expenditure", EnergyEvidenceCalculator.formatCalories(week.averageExpenditure), color: PhysiqueOSTheme.energyExpenditure)
                    weekValue("Completed days", "\(week.completeDayCount)", color: PhysiqueOSTheme.textSecondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PhysiqueOSTheme.surfaceMuted)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .combine)
    }

    private func weekValue(_ label: String, _ value: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                .foregroundStyle(PhysiqueOSTheme.textMuted)
            Text(value)
                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                .foregroundStyle(color)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

private struct EnergyDayHistoryRow: View {
    let day: EnergyDayRecord

    /// `completenessLabel` — verbatim.
    private var completenessLabel: String {
        switch day.completeness {
        case "complete": "Complete · Estimated"
        case "nutrition-only": "Nutrition only"
        case "activity-only": "Activity only"
        case "missing-rmr": "Missing RMR"
        default: "No paired evidence"
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top) {
                Text(TrainingDayView.formatCompactDate(day.date))
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Spacer(minLength: 8)
                Text(completenessLabel)
                    .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
            }
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 4) {
                dailyValue("Intake", EnergyEvidenceCalculator.formatCalories(day.calorieIntake), color: PhysiqueOSTheme.energyIntake)
                dailyValue("Active calories", EnergyEvidenceCalculator.formatCalories(day.activeCalories), color: PhysiqueOSTheme.energyExpenditure)
                dailyValue("Estimated expenditure", EnergyEvidenceCalculator.formatCalories(day.estimatedExpenditure), color: PhysiqueOSTheme.energyExpenditure)
                dailyValue("Balance", EnergyEvidenceCalculator.formatSignedCalories(day.energyBalance), color: PhysiqueOSTheme.chartSuccess)
            }
            // "Nutrition Day"/"Activity" cross-links — visible iff the
            // corresponding evidence exists for this day (verified against
            // source: `nutritionHref` is set only when a nutrition payload
            // matched, `activityHref` only when an activity day record
            // exists), matching the general Evidence pages the web links to
            // (`/progress/nutrition?context=all` /
            // `/progress/activity?context=all`) — not a day-specific route.
            if day.calorieIntake != nil || day.activeCalories != nil {
                HStack(spacing: 16) {
                    if day.calorieIntake != nil {
                        NavigationLink(value: AppDestination.progressStream(streamId: "nutrition")) {
                            Text("Nutrition Day")
                        }
                    }
                    if day.activeCalories != nil {
                        NavigationLink(value: AppDestination.progressStream(streamId: "activity")) {
                            Text("Activity")
                        }
                    }
                }
                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                .foregroundStyle(PhysiqueOSTheme.accent)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PhysiqueOSTheme.surfaceMuted)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .combine)
    }

    private func dailyValue(_ label: String, _ value: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label)
                .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                .foregroundStyle(PhysiqueOSTheme.textMuted)
            Text(value)
                .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                .foregroundStyle(color)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
