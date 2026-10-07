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
/// Recent Daily Energy ("Show All" sheet).
///
/// Presentation follows the Founder-locked Energy design
/// (`energy-weight-recovery-evidence-style-translation-20261004` E1–E2 +
/// Founder correction `a21296ec` E1–E3) in the `.weight` harness family it
/// shares with Weight and Recovery. Values, completeness labels, both
/// sheets and the conditional Nutrition/Activity links are unchanged.
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
    @State private var viewModel: EnergyHistoryViewModel?
    @State private var viewModelAuthority: NativeAPIEnvironment?

    @State private var selectedOverTimeWeekID: String?
    @State private var selectedRecentWeekID: String?
    @State private var isWeeklyHistorySheetPresented = false
    @State private var isDailyHistorySheetPresented = false

    static let historyPreviewLimit = 3
    private let m = EvidenceMetrics(family: .weight)

    var body: some View {
        EvidenceScrollPage(spacing: 0, top: 10) {
            content
        }
        .evidencePageChrome("Energy")
        .evidenceFamily(.weight)
        .task(id: environment.nativeAuthority) {
            if viewModelAuthority != environment.nativeAuthority {
                viewModel = EnergyHistoryViewModel(api: environment.energyAPI)
                viewModelAuthority = environment.nativeAuthority
            }
            await viewModel?.load()
        }
        .refreshable {
            if environment.nativeAuthority == .founderProduction {
                await environment.productionNativeAPI.invalidateReadResources(["energy"])
            }
            await viewModel?.load()
        }
        .refreshesOnForegroundWhenVisible { await viewModel?.load() }
        .accessibilityIdentifier("energy.screen")
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel?.state {
        case .none, .loading:
            WeightStatePanel(title: "Loading Energy Evidence…", loading: true, identifier: "energy.loading")
        case .failed(let message):
            WeightStatePanel(title: message, detail: "Pull to refresh, or try again.", identifier: "energy.failure",
                             actionLabel: "Try again") { Task { await viewModel?.load() } }
        case .loaded(let report):
            header(for: report)
                .padding(.top, m.pt(4))
                .padding(.bottom, m.pt(18))
            WeightScopePills(scope: report.scope) { pillID in
                Task { await viewModel?.selectScope(pillID: pillID) }
            }
            .padding(.bottom, m.pt(18))
            summarySection(report.summary)
                .padding(.bottom, m.pt(19))
            WeightSection(title: "Energy Over Time", identifier: "energy.overTime") {
                EnergyOverTimeChartView(weeksAscending: report.weeklyTrend, selectedWeekID: $selectedOverTimeWeekID)
            }
            .padding(.bottom, m.pt(19))
            WeightSection(title: "Weekly Energy Balance", identifier: "energy.weeklyBalance") {
                EnergyWeeklyBarChartView(weeksAscending: report.recentFourWeeks, selectedWeekID: $selectedRecentWeekID)
            }
            .padding(.bottom, m.pt(19))
            weeklyHistorySection(report.weeklyHistory)
                .padding(.bottom, m.pt(19))
            dailyHistorySection(report.dailyHistory)
        }
    }

    /// Locked E1 header: 38 px lime `ϟ` mark, eyebrow, title, subtitle.
    private func header(for report: EnergyReportReadModel) -> some View {
        HStack(alignment: .top, spacing: m.pt(12)) {
            Text("ϟ")
                .evidenceText(.normal(16, 900, jakarta: false))
                .foregroundStyle(m.c.accent)
                .frame(width: m.pt(38), height: m.pt(38))
                .background(m.c.accent.opacity(0.16), in: Circle())
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 0) {
                Text("EVIDENCE REPORT")
                    .evidenceText(.normal(11, 800, jakarta: false, tracking: 1.43, uppercase: true))
                    .foregroundStyle(m.c.accent)
                Text(report.title)
                    .evidenceText(EvidenceTextStyle(size: 30, weight: 780, lineHeight: 31.5, tracking: -1.2))
                    .foregroundStyle(m.c.ink)
                    .accessibilityAddTraits(.isHeader)
                Text(report.subtitle)
                    .evidenceText(EvidenceTextStyle(size: 13, weight: 400, lineHeight: 17.55))
                    .foregroundStyle(m.c.muted)
                    .padding(.top, m.pt(4))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("evidence.page.header")
    }

    /// Period Summary (locked E1). Expenditure is labeled as an estimate
    /// everywhere it appears, and the footnote states what it is made of,
    /// so a small signed balance never reads as measured precision.
    private func summarySection(_ summary: EnergySummary) -> some View {
        WeightSection(title: "Period Summary", identifier: "energy.summary") {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: m.pt(7), alignment: .top), GridItem(.flexible(), spacing: m.pt(7), alignment: .top)], spacing: m.pt(7)) {
                WeightStatTile(label: "Average Intake", value: EnergyEvidenceCalculator.formatCalories(summary.averageIntake))
                WeightStatTile(label: EnergyEvidenceCopy.summaryExpenditureLabel, value: EnergyEvidenceCalculator.formatCalories(summary.averageExpenditure))
                WeightStatTile(label: "Average Balance", value: EnergyEvidenceCalculator.formatSignedCalories(summary.averageBalance))
                WeightStatTile(label: "Complete Days", value: "\(summary.completeDays) of \(summary.evidenceDays)", detail: "evidence days")
            }
            EnergyEstimateFootnote()
                .padding(.top, m.pt(9))
        }
    }

    private func weeklyHistorySection(_ weeks: [EnergyWeekRecord]) -> some View {
        let preview = Array(weeks.prefix(Self.historyPreviewLimit))
        return WeightSection(
            title: "Weekly History",
            identifier: "energy.weeklyHistory",
            action: weeks.count > Self.historyPreviewLimit ? "Show All ›" : nil,
            onAction: { isWeeklyHistorySheetPresented = true }
        ) {
            if preview.isEmpty {
                WeightEmptyLine(text: "No weekly evidence available.")
            } else {
                EnergyRowList(data: preview) { EnergyWeekHistoryRow(week: $0) }
            }
        }
        .sheet(isPresented: $isWeeklyHistorySheetPresented) {
            EnergyHistorySheet(title: "Weekly History", identifier: "energy.weeklyHistory.sheet") {
                EnergyRowList(data: weeks) { EnergyWeekHistoryRow(week: $0) }
            }
        }
    }

    private func dailyHistorySection(_ days: [EnergyDayRecord]) -> some View {
        let preview = Array(days.prefix(Self.historyPreviewLimit))
        return WeightSection(
            title: "Recent Daily Energy",
            identifier: "energy.dailyHistory",
            action: days.count > Self.historyPreviewLimit ? "Show All ›" : nil,
            onAction: { isDailyHistorySheetPresented = true }
        ) {
            if preview.isEmpty {
                WeightEmptyLine(text: "No daily energy evidence available.")
            } else {
                EnergyRowList(data: preview) { EnergyDayHistoryRow(day: $0) }
            }
        }
        .sheet(isPresented: $isDailyHistorySheetPresented) {
            EnergyHistorySheet(title: "Daily Energy History", identifier: "energy.dailyHistory.sheet") {
                EnergyRowList(data: days) { EnergyDayHistoryRow(day: $0) }
            }
        }
    }
}

/// Founder-approved Energy wording (Build 90, delta 1): expenditure is always
/// named as an estimate, and one footnote says what it is made of. Values
/// keep the canonical `kcal` formatter (delta 2).
enum EnergyEvidenceCopy {
    static let summaryExpenditureLabel = "Avg Est. Expenditure"
    static let rowExpenditureLabel = "Est. expenditure"
    static let weekExpenditureLabel = "Avg est. expenditure"
    static let estimateFootnote = "Expenditure is estimated from RMR plus wearable active calories, so small balances are approximate."

    /// A missing value in a compact row reads as an em dash (locked E1–E3);
    /// the summary tiles keep the canonical "Not available".
    static func compact(_ formatted: String) -> String {
        formatted == "Not available" ? "—" : formatted
    }

    /// Server completeness → the verbatim day tag.
    static func completenessLabel(_ completeness: String) -> String {
        switch completeness {
        case "complete": "Complete · Estimated"
        case "nutrition-only": "Nutrition only"
        case "activity-only": "Activity only"
        case "missing-rmr": "Missing RMR"
        default: "No paired evidence"
        }
    }
}

/// The one estimate disclosure shared by the summary and both charts.
struct EnergyEstimateFootnote: View {
    private let m = EvidenceMetrics(family: .weight)

    var body: some View {
        Text(EnergyEvidenceCopy.estimateFootnote)
            .evidenceText(EvidenceTextStyle(size: 10, weight: 400, lineHeight: 14))
            .foregroundStyle(m.c.quiet)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityIdentifier("energy.estimateNote")
    }
}

// MARK: - "Show All" sheets (locked correction E2 / E3)

/// Medium/large modal history: flat bar with `Done` and a centered title,
/// one contained list. Daily rows keep their own navigation stack so the
/// conditional Nutrition/Activity links still push from inside the sheet.
private struct EnergyHistorySheet<Rows: View>: View {
    @Environment(\.dismiss) private var dismiss
    let title: String
    let identifier: String
    let rows: Rows
    /// The sheet's own back trail, so a page pushed inside it reads
    /// `‹ Daily Energy History` instead of a generic `‹ Back`.
    @State private var trail: EvidenceBackTrail
    @State private var detent: PresentationDetent = .medium
    private let m = EvidenceMetrics(family: .weight)

    init(title: String, identifier: String, @ViewBuilder rows: () -> Rows) {
        self.title = title
        self.identifier = identifier
        self.rows = rows()
        _trail = State(initialValue: EvidenceBackTrail(seed: [title]))
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 0) {
                    rows
                }
                .padding(m.pt(13 + 1))
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(m.c.surface, in: RoundedRectangle(cornerRadius: m.pt(15)))
                .overlay(RoundedRectangle(cornerRadius: m.pt(15)).strokeBorder(m.c.line, lineWidth: m.pt(1)))
                .padding(.horizontal, m.pt(16))
                .padding(.top, m.pt(10))
                .padding(.bottom, m.pt(30))
            }
            .background(m.c.page)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(m.c.page, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: {
                        Text("Done")
                            .evidenceText(.normal(12, 750, jakarta: false))
                            .foregroundStyle(m.c.muted)
                            .frame(minWidth: 44, minHeight: 44, alignment: .leading)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("evidence.sheet.done")
                }
                .evidenceFlatToolbarItem()
                ToolbarItem(placement: .principal) {
                    Text(title)
                        .evidenceText(.normal(12, 800, jakarta: false))
                        .foregroundStyle(m.c.ink)
                        .accessibilityAddTraits(.isHeader)
                }
            }
            .safeAreaInset(edge: .top, spacing: 0) { Rectangle().fill(m.c.line).frame(height: m.pt(1)) }
            .navigationDestination(for: AppDestination.self) { AppDestinationRouterView(destination: $0) }
        }
        .environment(\.evidenceBackTrail, trail)
        .evidenceFamily(.weight)
        .presentationDetents([.medium, .large], selection: $detent)
        .accessibilityIdentifier(identifier)
    }
}

// MARK: - Rows (locked correction `.energy-week` / `.energy-day`)

/// Rows separated by a 1 px rule; the last row has none.
private struct EnergyRowList<Data: RandomAccessCollection, Row: View>: View where Data.Element: Identifiable {
    let data: Data
    @ViewBuilder var row: (Data.Element) -> Row
    private let m = EvidenceMetrics(family: .weight)

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(data.enumerated()), id: \.element.id) { index, element in
                row(element)
                    .overlay(alignment: .bottom) {
                        if index < data.count - 1 { Rectangle().fill(m.c.line).frame(height: m.pt(1)) }
                    }
            }
        }
    }
}

/// `.tag` (lime) / `.tag.warn` (amber) capsule.
struct EnergyTag: View {
    let text: String
    var warn = false
    private let m = EvidenceMetrics(family: .weight)

    var body: some View {
        let color = warn ? m.c.amber : m.c.accent
        Text(text)
            .evidenceText(.normal(8, 850, jakarta: false, tracking: 0.24))
            .foregroundStyle(color)
            .padding(.horizontal, m.pt(6))
            .padding(.vertical, m.pt(3))
            .background(color.opacity(0.15), in: Capsule())
            .fixedSize()
    }
}

/// `.energy-field`: 9 px muted label above a 10 px bold ink value.
struct EnergyField: View {
    let label: String
    let value: String
    private let m = EvidenceMetrics(family: .weight)

    var body: some View {
        VStack(alignment: .leading, spacing: m.pt(1)) {
            Text(label)
                .evidenceText(.normal(9, 400, jakarta: false))
                .foregroundStyle(m.c.quiet)
            Text(value)
                .evidenceText(.normal(10, 760, jakarta: false, digits: true))
                .foregroundStyle(m.c.ink)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

/// `.energy-grid`: two columns, 4 px row gap, 12 px column gap.
struct EnergyFieldGrid: View {
    let fields: [(String, String)]
    private let m = EvidenceMetrics(family: .weight)

    var body: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: m.pt(12), alignment: .top), GridItem(.flexible(), spacing: m.pt(12), alignment: .top)],
                  alignment: .leading, spacing: m.pt(4)) {
            ForEach(Array(fields.enumerated()), id: \.offset) { _, field in
                EnergyField(label: field.0, value: field.1)
            }
        }
    }
}

private func compact(_ formatted: String) -> String { EnergyEvidenceCopy.compact(formatted) }

private struct EnergyWeekHistoryRow: View {
    let week: EnergyWeekRecord
    private let m = EvidenceMetrics(family: .weight)

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: m.pt(8)) {
                Text("\(TrainingDateFormatting.short(week.weekStart)) – \(TrainingDateFormatting.short(week.weekEnd))")
                    .evidenceText(.normal(12, 790, jakarta: false))
                    .foregroundStyle(m.c.ink)
                Spacer(minLength: 0)
                EnergyTag(text: week.partial ? "Partial" : "Complete", warn: week.partial)
            }
            EnergyFieldGrid(fields: [
                ("Intake", compact(EnergyEvidenceCalculator.formatCalories(week.averageIntake))),
                (EnergyEvidenceCopy.rowExpenditureLabel, compact(EnergyEvidenceCalculator.formatCalories(week.averageExpenditure))),
                ("Balance", compact(EnergyEvidenceCalculator.formatSignedCalories(week.averageBalance))),
                ("Completed days", "\(week.completeDayCount)"),
            ])
            .padding(.top, m.pt(7))
        }
        .padding(.vertical, m.pt(11))
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("energy.week.\(week.weekStart)")
    }
}

private struct EnergyDayHistoryRow: View {
    let day: EnergyDayRecord
    private let m = EvidenceMetrics(family: .weight)

    private var completenessLabel: String { EnergyEvidenceCopy.completenessLabel(day.completeness) }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: m.pt(8)) {
                Text(TrainingDateFormatting.short(day.date))
                    .evidenceText(.normal(12, 790, jakarta: false))
                    .foregroundStyle(m.c.ink)
                Spacer(minLength: 0)
                EnergyTag(text: completenessLabel, warn: day.completeness != "complete")
            }
            .accessibilityElement(children: .combine)
            EnergyFieldGrid(fields: [
                ("Intake", compact(EnergyEvidenceCalculator.formatCalories(day.calorieIntake))),
                ("Active calories", compact(EnergyEvidenceCalculator.formatCalories(day.activeCalories))),
                (EnergyEvidenceCopy.rowExpenditureLabel, compact(EnergyEvidenceCalculator.formatCalories(day.estimatedExpenditure))),
                ("Balance", compact(EnergyEvidenceCalculator.formatSignedCalories(day.energyBalance))),
            ])
            .padding(.top, m.pt(7))
            // "Nutrition Day"/"Activity" cross-links — visible iff the
            // corresponding evidence exists for this day, matching the
            // general Evidence pages the web links to
            // (`/progress/nutrition?context=all` /
            // `/progress/activity?context=all`) — not a day-specific route.
            if day.calorieIntake != nil || day.activeCalories != nil {
                HStack(spacing: m.pt(12)) {
                    if day.calorieIntake != nil {
                        NavigationLink(value: AppDestination.progressStream(streamId: "nutrition")) {
                            miniLink("Nutrition Day")
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("energy.day.\(day.date).nutrition")
                    }
                    if day.activeCalories != nil {
                        NavigationLink(value: AppDestination.progressStream(streamId: "activity")) {
                            miniLink("Activity")
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("energy.day.\(day.date).activity")
                    }
                }
                .padding(.top, m.pt(7))
            }
        }
        .padding(.vertical, m.pt(10))
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("energy.day.\(day.date)")
    }

    private func miniLink(_ label: String) -> some View {
        Text(label)
            .evidenceText(.normal(9, 800, jakarta: false))
            .foregroundStyle(m.c.accent)
            .evidenceHitTarget(visualHeight: m.pt(11))
    }
}
