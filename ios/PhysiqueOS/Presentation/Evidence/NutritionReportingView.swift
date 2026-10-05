import SwiftUI

/// `/progress/nutrition/reporting/{calories,macros,meals}` — the 3 real
/// Nutrition Reporting screens, previously reduced to informational rows
/// and now ported. One view handles all 3 report ids, following
/// `TrainingReportingView`'s established convention; section order below
/// is read directly from source and is test-locked on web
/// (`NutritionMacrosProductionRoute.test.js`/`NutritionMealsProductionRoute.test.js`
/// assert these exact section titles, in this exact order):
///
/// **Calories**: Period Summary → Calories Over Time → Weekly Averages →
/// Recent Daily Calories → Data Sources.
/// **Macros**: macro selector → Period Summary → Macro Distribution →
/// Average Daily Macros → Macro Trends Over Time → Weekly Averages →
/// Recent Daily Macros → Data Sources.
/// **Meals**: Period Summary → Meal Distribution → Meal Macro Mix →
/// Meal Trends Over Time → Weekly Meal Summary → Recurring Meals →
/// Recent Meal History → Data Sources.
///
/// All 3 reports derive from the same already Goal/Phase-scoped day list
/// the Nutrition Evidence landing page itself fetches — selecting a scope
/// pill here re-derives every section, exactly like the landing page.
/// Interaction on every line-trend chart is tap-to-select (verified: none
/// of the 3 report charts has hover/drag on web, unlike Weight's) with a
/// below-chart detail panel, defaulting to the latest week until touched.
///
/// One disclosed adaptation: the web's per-day FloatingSheet on "Recent
/// Meal History" rows is not duplicated here — a day row instead pushes to
/// the existing `NutritionDayView` (Totals + Meals), which already shows
/// everything that sheet would, reusing infrastructure instead of building
/// a second day-detail surface.
struct NutritionReportingView: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var viewModel: NutritionReportingViewModel?
    @State private var viewModelAuthority: NativeAPIEnvironment?

    @State private var selectedCaloriesWeek: String?
    @State private var selectedMacrosWeek: String?
    @State private var selectedMealsWeek: String?

    @State private var isCaloriesWeeklySheetPresented = false
    @State private var isCaloriesDailySheetPresented = false
    @State private var isMacrosWeeklySheetPresented = false
    @State private var isMacrosDailySheetPresented = false
    @State private var isMealsWeeklySheetPresented = false
    @State private var isRecurringMealsSheetPresented = false
    @State private var isMealHistorySheetPresented = false

    static let previewLimit = 3

    let reportId: String

    private let m = EvidenceMetrics(family: .daily)

    var body: some View {
        EvidenceScrollPage(top: 10) {
            content
        }
        .evidencePageChrome(viewModel?.loadedReport?.title ?? "Reporting")
        .evidenceFamily(.daily)
        .task(id: environment.nativeAuthority) {
            if viewModelAuthority != environment.nativeAuthority {
                viewModel = NutritionReportingViewModel(api: environment.nutritionAPI, reportId: reportId)
                viewModelAuthority = environment.nativeAuthority
            }
            await viewModel?.load()
        }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel?.state {
        case .none, .loading:
            EvidenceStatePanel(kind: .loading("Loading Nutrition Evidence…"), identifier: "nutrition.report.loading")
        case .failed(let message):
            EvidenceStatePanel(kind: .failure(message, nil), identifier: "nutrition.report.failure")
        case .loaded(.none):
            EvidenceStatePanel(kind: .empty("This report could not be found.", nil), identifier: "nutrition.report.notFound")
        case .loaded(.some(let report)):
            header(for: report)
            EvidenceScopePicker(scope: report.scope) { pillID in
                Task { await viewModel?.selectScope(pillID: pillID) }
            }
            if let calories = report.calories { caloriesContent(calories) }
            if let macros = report.macros { macrosContent(macros) }
            if let meals = report.meals { mealsContent(meals) }
        }
    }

    /// `.report-head`: eyebrow, 25 px title, subtitle.
    private func header(for report: NutritionReportingReadModel) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(report.eyebrow.uppercased())
                .evidenceText(.normal(9, 900, tracking: 1.44, uppercase: true))
                .foregroundStyle(m.c.teal)
            Text(report.title)
                .evidenceText(EvidenceTextStyle(size: 25, weight: 820, lineHeight: 26, tracking: -0.875))
                .foregroundStyle(m.c.ink)
                .padding(.top, m.pt(3))
                .accessibilityAddTraits(.isHeader)
            Text(report.subtitle)
                .evidenceText(EvidenceTextStyle(size: 11, weight: 600, lineHeight: 15.62))
                .foregroundStyle(m.c.muted)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, m.pt(5))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// `.range`: 1M · 3M · 6M · 1Y · All.
    private func rangeSelector() -> some View {
        HStack(spacing: m.pt(5)) {
            ForEach(EvidenceChartRange.allCases) { range in
                let isSelected = range == viewModel?.range
                Button {
                    Task { await viewModel?.selectRange(range) }
                } label: {
                    Text(range.label)
                        .evidenceText(.normal(8, 850))
                        .foregroundStyle(isSelected ? m.c.page : m.c.muted)
                        .padding(.horizontal, m.pt(6))
                        .padding(.vertical, m.pt(5))
                        .frame(minWidth: m.pt(29))
                        .background(isSelected ? m.c.ink : m.c.surface2, in: Capsule())
                        .evidenceHitTarget(visualHeight: m.pt(20))
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
                .accessibilityIdentifier("nutrition.report.range.\(range.id)")
            }
        }
        .padding(.bottom, m.pt(9))
    }

    /// Bare bordered pill row (macro / meal-slot selectors).
    private func pillRow<Option: Identifiable>(_ options: [Option], selected: Option.ID, identifier: String, label: @escaping (Option) -> String, onSelect: @escaping (Option) -> Void) -> some View {
        HStack(spacing: m.pt(6)) {
            ForEach(options) { option in
                let isSelected = option.id == selected
                Button { onSelect(option) } label: {
                    Text(label(option))
                        .evidenceText(EvidenceTextStyle(size: 9, weight: 800, lineHeight: 9))
                        .foregroundStyle(isSelected ? m.c.page : m.c.muted)
                        .padding(.horizontal, m.pt(9 + 1))
                        .padding(.vertical, m.pt(7 + 1))
                        .background(isSelected ? m.c.ink : .clear, in: Capsule())
                        .overlay(Capsule().strokeBorder(isSelected ? m.c.ink : m.c.line, lineWidth: m.pt(1)))
                        .evidenceHitTarget(visualHeight: m.pt(25))
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
                .accessibilityIdentifier("\(identifier).\(label(option))")
            }
        }
    }

    private func sectionNote(_ text: String) -> some View {
        Text(text)
            .evidenceText(EvidenceTextStyle(size: 9, weight: 400, lineHeight: 12.15))
            .foregroundStyle(m.c.muted)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, m.pt(-3))
            .padding(.bottom, m.pt(10))
    }

    /// `.summary-grid`: Period Summary, target status on the right.
    private func periodSummarySection(_ items: [NutritionReportSummaryItem], targetLabel: String? = nil) -> some View {
        EvidenceSection(title: "Period Summary", style: .containedDeep, identifier: "nutrition.report.summary") {
            if let targetLabel {
                Text(targetLabel)
                    .evidenceText(.normal(9, 800))
                    .foregroundStyle(m.c.teal)
            }
        } content: {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: m.pt(7), alignment: .top), GridItem(.flexible(), spacing: m.pt(7), alignment: .top)], spacing: m.pt(7)) {
                ForEach(items) { item in
                    VStack(alignment: .leading, spacing: 0) {
                        Text(item.label)
                            .evidenceText(.normal(8, 900, tracking: 0.72, uppercase: true))
                            .foregroundStyle(m.c.quiet)
                            .fixedSize(horizontal: false, vertical: true)
                        Text(item.value)
                            .evidenceText(EvidenceTextStyle(size: 11, weight: 850, lineHeight: 13.75))
                            .foregroundStyle(m.c.ink)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.top, m.pt(5))
                    }
                    .padding(m.pt(10))
                    .frame(maxWidth: .infinity, minHeight: m.pt(64), alignment: .topLeading)
                    .background(m.c.surface2, in: RoundedRectangle(cornerRadius: m.pt(10)))
                    .accessibilityElement(children: .combine)
                }
            }
        }
    }

    // MARK: - Calories

    @ViewBuilder
    private func caloriesContent(_ report: NutritionCaloriesReport) -> some View {
        periodSummarySection(report.periodSummary, targetLabel: report.targetLabel)
        EvidenceSection(title: "Calories Over Time", style: .containedDeep, identifier: "nutrition.report.caloriesTrend") {
            VStack(alignment: .leading, spacing: 0) {
                rangeSelector()
                NutritionTrendChartView(
                    points: report.weeklyTrend, color: m.c.teal,
                    valueLabel: { "\(Int($0.rounded())) cal" },
                    emptyMessage: "No calorie evidence available in this period",
                    selectedWeekID: $selectedCaloriesWeek
                )
            }
        }
        rowsSection(
            title: "Weekly Averages", rows: report.weeklyRows, isPresented: $isCaloriesWeeklySheetPresented,
            emptyMessage: "No weekly calorie evidence available.",
            row: { row in NutritionWeeklyStatRow(range: "\(TrainingDateFormatting.short(row.weekStart)) – \(TrainingDateFormatting.short(row.weekEnd))", value: row.averageCalories.map { "\(Int($0.rounded())) cal" } ?? "Pending", detail: "\(row.loggedDayCount) logged") }
        )
        rowsSection(
            title: "Recent Daily Calories", rows: report.dailyRows, isPresented: $isCaloriesDailySheetPresented,
            emptyMessage: "No daily calorie evidence available.",
            row: { row in
                NavigationLink(value: AppDestination.nutritionDay(dayId: row.id)) { NutritionDailyCalorieRowView(row: row) }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("nutrition.report.day.\(row.id)")
            }
        )
    }

    // MARK: - Macros

    @ViewBuilder
    private func macrosContent(_ report: NutritionMacrosReport) -> some View {
        pillRow(NutritionMacroKey.allCases, selected: report.selectedMacro.id, identifier: "nutrition.report.macro", label: { $0.label }) { macro in
            Task { await viewModel?.selectMacro(macro) }
        }
        .padding(.bottom, m.pt(14 - 16))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("nutrition.report.macroSelector")
        periodSummarySection(report.periodSummary, targetLabel: report.targetLabel)
        EvidenceSection(title: "Macro Distribution", style: .containedDeep, identifier: "nutrition.report.macroDistribution") {
            VStack(alignment: .leading, spacing: 0) {
                sectionNote("Share of macro-derived calories across the selected period.")
                NutritionDonutChartView(
                    slices: report.distribution.map { donutSlice($0) },
                    centerLabel: "Macro-derived calories",
                    emptyMessage: "Macro distribution is not available for this period."
                )
            }
        }
        EvidenceSection(title: "Average Daily Macros", style: .containedDeep, identifier: "nutrition.report.averageMacros") {
            VStack(alignment: .leading, spacing: 0) {
                sectionNote("Average grams per logged Nutrition day across the selected period.")
                NutritionBarChartView(
                    bars: report.averageDailyMacros.map { bar in
                        NutritionBarChartView.Bar(id: bar.id.rawValue, label: bar.id.label, value: bar.averageGrams, caption: "\(bar.loggedDayCount) days", color: macroColor(bar.id), valueText: "\(Int(bar.averageGrams.rounded()))g")
                    },
                    emptyMessage: "Average macro values are not available for this period."
                )
            }
        }
        EvidenceSection(title: "Macro Trends Over Time", style: .containedDeep, identifier: "nutrition.report.macroTrend") {
            VStack(alignment: .leading, spacing: 0) {
                sectionNote("Weekly average \(report.selectedMacro.label.lowercased()) intake across the selected period.")
                rangeSelector()
                NutritionTrendChartView(
                    points: report.weeklyTrend, color: macroColor(report.selectedMacro),
                    valueLabel: { "\(Int($0.rounded()))g" },
                    emptyMessage: "No \(report.selectedMacro.label.lowercased()) evidence available in this period",
                    selectedWeekID: $selectedMacrosWeek
                )
            }
        }
        rowsSection(
            title: "Weekly Averages", rows: report.weeklyRows, isPresented: $isMacrosWeeklySheetPresented,
            emptyMessage: "No weekly macro evidence available.",
            row: { row in NutritionWeeklyMacroRowView(row: row, selectedMacro: report.selectedMacro) }
        )
        rowsSection(
            title: "Recent Daily Macros", rows: report.dailyRows, isPresented: $isMacrosDailySheetPresented,
            emptyMessage: "No daily macro evidence available.",
            row: { row in
                NavigationLink(value: AppDestination.nutritionDay(dayId: row.id)) { NutritionDailyMacroRowView(row: row, selectedMacro: report.selectedMacro) }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("nutrition.report.day.\(row.id)")
            }
        )
    }

    // MARK: - Meals

    @ViewBuilder
    private func mealsContent(_ report: NutritionMealsReport) -> some View {
        periodSummarySection(report.periodSummary)
        EvidenceSection(title: "Meal Distribution", style: .containedDeep, identifier: "nutrition.report.mealDistribution") {
            VStack(alignment: .leading, spacing: 0) {
                sectionNote("Average calories by meal across the selected period.")
                NutritionBarChartView(
                    bars: report.distribution.map { average in
                        NutritionBarChartView.Bar(id: average.id.rawValue, label: average.id.label, value: average.averageCalories ?? 0, caption: "\(average.occurrenceCount)×", color: mealSlotColor(average.id), valueText: average.averageCalories.map { "\(Int($0.rounded())) cal" } ?? "—")
                    },
                    emptyMessage: "No meal evidence available for this period."
                )
            }
        }
        EvidenceSection(title: "Meal Macro Mix", style: .containedDeep, identifier: "nutrition.report.mealMacroMix") {
            VStack(alignment: .leading, spacing: 0) {
                pillRow(NutritionMealSlotFilter.allCases.filter { $0 != .all }, selected: report.selectedMacroMixSlot.id, identifier: "nutrition.report.mixSlot", label: { $0.label }) { slot in
                    Task { await viewModel?.selectMealMacroMixSlot(slot) }
                }
                .padding(.bottom, m.pt(10))
                NutritionDonutChartView(
                    slices: report.macroMix.map { donutSlice($0) },
                    centerLabel: report.selectedMacroMixSlot.label,
                    emptyMessage: "Macro distribution is not available for this period."
                )
            }
        }
        EvidenceSection(title: "Meal Trends Over Time", style: .containedDeep, identifier: "nutrition.report.mealTrend") {
            VStack(alignment: .leading, spacing: 0) {
                sectionNote("One selected weekly meal metric across the selected period.")
                pillRow(NutritionMealSlotFilter.allCases, selected: report.selectedTrendSlot.id, identifier: "nutrition.report.trendSlot", label: { $0.label }) { slot in
                    Task { await viewModel?.selectMealTrendSlot(slot) }
                }
                .padding(.bottom, m.pt(9))
                metricSelector(selected: report.selectedTrendMetric) { metric in
                    Task { await viewModel?.selectMealTrendMetric(metric) }
                }
                .padding(.bottom, m.pt(9))
                rangeSelector()
                NutritionTrendChartView(
                    points: report.weeklyTrend, color: m.c.teal,
                    valueLabel: { "\(Int($0.rounded()))\(report.selectedTrendMetric.unit)" },
                    emptyMessage: "No contributing meal evidence.",
                    selectedWeekID: $selectedMealsWeek
                )
            }
        }
        rowsSection(
            title: "Weekly Meal Summary", rows: report.weeklyRows, isPresented: $isMealsWeeklySheetPresented,
            emptyMessage: "No weekly meal evidence available.",
            row: { row in NutritionWeeklyMealRowView(row: row) }
        )
        rowsSection(
            title: "Recurring Meals", rows: report.recurringMeals, isPresented: $isRecurringMealsSheetPresented,
            emptyMessage: "No recurring meals identified yet.",
            row: { meal in NutritionRecurringMealRow(meal: meal) }
        )
        rowsSection(
            title: "Recent Meal History", rows: report.historyGroups, isPresented: $isMealHistorySheetPresented,
            emptyMessage: "No meal history available.",
            row: { group in
                NavigationLink(value: AppDestination.nutritionDay(dayId: group.dayId)) { NutritionMealHistoryGroupRow(group: group) }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("nutrition.report.day.\(group.dayId)")
            }
        )
    }

    private func metricSelector(selected: NutritionMealTrendMetric, onSelect: @escaping (NutritionMealTrendMetric) -> Void) -> some View {
        Menu {
            ForEach(NutritionMealTrendMetric.allCases) { metric in
                Button(metric.label) { onSelect(metric) }
            }
        } label: {
            HStack(spacing: m.pt(4)) {
                Text(selected.label)
                Text("⌄")
            }
            .evidenceText(EvidenceTextStyle(size: 9, weight: 800, lineHeight: 9))
            .foregroundStyle(m.c.ink)
            .padding(.horizontal, m.pt(9 + 1))
            .padding(.vertical, m.pt(7 + 1))
            .overlay(Capsule().strokeBorder(m.c.line, lineWidth: m.pt(1)))
            .evidenceHitTarget(visualHeight: m.pt(25))
        }
        .accessibilityLabel("Metric: \(selected.label)")
        .accessibilityIdentifier("nutrition.report.metricSelector")
    }

    // MARK: - Shared open-list section (3-row preview + Show All sheet)

    /// `nutrition.report.rows.recent-daily-calories` etc.
    static func rowsIdentifier(_ title: String) -> String {
        "nutrition.report.rows." + title.lowercased().split(separator: " ").joined(separator: "-")
    }

    private func rowsSection<Row: Identifiable, Content: View>(
        title: String, rows: [Row], isPresented: Binding<Bool>, emptyMessage: String,
        @ViewBuilder row: @escaping (Row) -> Content
    ) -> some View {
        let preview = Array(rows.prefix(Self.previewLimit))
        return VStack(alignment: .leading, spacing: 0) {
            EvidenceDailySectionHead(title: title) {
                if rows.count > Self.previewLimit {
                    Button { isPresented.wrappedValue = true } label: { EvidenceSectionAction(label: "Show All >") }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("\(Self.rowsIdentifier(title)).showAll")
                }
            }
            if preview.isEmpty {
                Text(emptyMessage)
                    .evidenceText(EvidenceTextStyle(size: 9, weight: 400, lineHeight: 12.15))
                    .foregroundStyle(m.c.muted)
            } else {
                EvidenceDailyOpenList(data: preview) { item in row(item) }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier(Self.rowsIdentifier(title))
        .sheet(isPresented: isPresented) {
            NutritionReportListSheet(title: title) {
                EvidenceDailyOpenList(data: rows) { item in row(item) }
            }
        }
    }
}

extension NutritionReportingViewModel {
    var loadedReport: NutritionReportingReadModel? {
        if case .loaded(let report) = state { return report }
        return nil
    }
}

// MARK: - Color helpers (shared macro/meal-slot tokens)

private func macroColor(_ macro: NutritionMacroKey) -> Color {
    switch macro {
    case .protein: EvidencePalette.daily.protein
    case .carbohydrates: EvidencePalette.daily.carbs
    case .fat: EvidencePalette.daily.fat
    }
}

private func mealSlotColor(_ slot: NutritionMealSlot) -> Color {
    switch slot {
    case .breakfast: EvidencePalette.daily.breakfast
    case .lunch: EvidencePalette.daily.lunch
    case .dinner: EvidencePalette.daily.dinner
    case .snacks: EvidencePalette.daily.snacks
    }
}

private func donutSlice(_ slice: NutritionMacroDistributionSlice) -> NutritionDonutChartView.Slice {
    NutritionDonutChartView.Slice(id: slice.id.rawValue, label: slice.id.label, percentage: slice.percentage, grams: slice.grams, color: macroColor(slice.id))
}
