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

    var body: some View {
        ScrollView {
            content
                .padding(.horizontal, 16)
                .padding(.top, 12)
        }
        .physiqueOSScrollBottomClearance()
        .background(PhysiqueOSTheme.background)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(PhysiqueOSTheme.background, for: .navigationBar)
        .task(id: environment.nativeAuthority) {
            viewModel = NutritionReportingViewModel(api: environment.nutritionAPI, reportId: reportId)
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
        case .loaded(.none):
            Text("This report could not be found.")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                .frame(maxWidth: .infinity, minHeight: 300)
        case .loaded(.some(let report)):
            VStack(alignment: .leading, spacing: 24) {
                header(for: report)
                TrainingScopeSelectorView(scope: report.scope) { pillID in
                    Task { await viewModel?.selectScope(pillID: pillID) }
                }
                if let calories = report.calories { caloriesContent(calories) }
                if let macros = report.macros { macrosContent(macros) }
                if let meals = report.meals { mealsContent(meals) }
                NutritionReportDataSourcesFooterView(items: report.dataSources)
            }
        }
    }

    private func header(for report: NutritionReportingReadModel) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(report.eyebrow)
                .physiqueOSFont(PhysiqueOSTypography.screenEyebrow)
                .foregroundStyle(PhysiqueOSTheme.accent)
            Text(report.title)
                .physiqueOSFont(PhysiqueOSTypography.screenTitle)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
            Text(report.subtitle)
                .physiqueOSFont(PhysiqueOSTypography.screenSubtitle)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func rangeSelector() -> some View {
        HStack(spacing: 6) {
            ForEach(EvidenceChartRange.allCases) { range in
                let isSelected = range == viewModel?.range
                Button {
                    Task { await viewModel?.selectRange(range) }
                } label: {
                    Text(range.label)
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(isSelected ? .white : PhysiqueOSTheme.textSecondary)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(isSelected ? PhysiqueOSTheme.accent : PhysiqueOSTheme.surfaceMuted)
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func periodSummaryGrid(_ items: [NutritionReportSummaryItem], targetLabel: String? = nil) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    TrainingSectionHeaderView(title: "Period Summary")
                    if let targetLabel {
                        Text(targetLabel)
                            .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                            .foregroundStyle(PhysiqueOSTheme.textMuted)
                    }
                }
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                    ForEach(items) { item in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.label)
                                .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                                .foregroundStyle(PhysiqueOSTheme.textMuted)
                            Text(item.value)
                                .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        }
                        .padding(16)
                        .frame(maxWidth: .infinity, minHeight: 88, alignment: .leading)
                        .background(PhysiqueOSTheme.surfaceElevated)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                }
            }
        }
    }

    // MARK: - Calories

    private func caloriesContent(_ report: NutritionCaloriesReport) -> some View {
        Group {
            periodSummaryGrid(report.periodSummary, targetLabel: report.targetLabel)
            CardContainer {
                VStack(alignment: .leading, spacing: 12) {
                    TrainingSectionHeaderView(title: "Calories Over Time")
                    rangeSelector()
                    NutritionTrendChartView(
                        points: report.weeklyTrend, color: PhysiqueOSTheme.nutritionCalories,
                        valueLabel: { "\(Int($0.rounded())) cal" },
                        emptyMessage: "No calorie evidence available in this period",
                        selectedWeekID: $selectedCaloriesWeek
                    )
                }
            }
            weeklyRowsCard(
                title: "Weekly Averages", rows: report.weeklyRows, isPresented: $isCaloriesWeeklySheetPresented,
                emptyMessage: "No weekly calorie evidence available.",
                row: { row in NutritionWeeklyStatRow(range: "\(TrainingDateFormatting.short(row.weekStart)) – \(TrainingDateFormatting.short(row.weekEnd))", value: row.averageCalories.map { "\(Int($0.rounded())) cal" } ?? "Pending", detail: "\(row.loggedDayCount) logged") }
            )
            dailyCaloriesCard(report.dailyRows)
        }
    }

    private func dailyCaloriesCard(_ rows: [NutritionDailyCalorieRow]) -> some View {
        let preview = Array(rows.prefix(Self.previewLimit))
        return CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                TrainingSectionHeaderView(title: "Recent Daily Calories") {
                    if rows.count > Self.previewLimit {
                        Button { isCaloriesDailySheetPresented = true } label: { TrainingCompactActionLabel(label: "Show All") }
                    }
                }
                if preview.isEmpty {
                    Text("No daily calorie evidence available.")
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                } else {
                    VStack(spacing: 8) {
                        ForEach(preview) { row in
                            NavigationLink(value: AppDestination.nutritionDay(dayId: row.id)) {
                                NutritionDailyCalorieRowView(row: row)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
        .sheet(isPresented: $isCaloriesDailySheetPresented) {
            NutritionReportDailyCaloriesSheet(rows: rows)
        }
    }

    // MARK: - Macros

    private func macrosContent(_ report: NutritionMacrosReport) -> some View {
        Group {
            CardContainer {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Macro")
                        .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                    HStack(spacing: 6) {
                        ForEach(NutritionMacroKey.allCases) { macro in
                            let isSelected = macro == report.selectedMacro
                            Button {
                                Task { await viewModel?.selectMacro(macro) }
                            } label: {
                                Text(macro.label)
                                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                    .foregroundStyle(isSelected ? .white : PhysiqueOSTheme.textSecondary)
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 6)
                                    .background(isSelected ? macroColor(macro) : PhysiqueOSTheme.surfaceMuted)
                                    .clipShape(Capsule())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            periodSummaryGrid(report.periodSummary, targetLabel: report.targetLabel)
            CardContainer {
                VStack(alignment: .leading, spacing: 12) {
                    TrainingSectionHeaderView(title: "Macro Distribution")
                    Text("Share of macro-derived calories across the selected period.")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                    NutritionDonutChartView(
                        slices: report.distribution.map { donutSlice($0) },
                        centerLabel: "Macro-derived calories",
                        emptyMessage: "Macro distribution is not available for this period."
                    )
                }
            }
            CardContainer {
                VStack(alignment: .leading, spacing: 12) {
                    TrainingSectionHeaderView(title: "Average Daily Macros")
                    Text("Average grams per logged Nutrition day across the selected period.")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                    NutritionBarChartView(
                        bars: report.averageDailyMacros.map { bar in
                            NutritionBarChartView.Bar(id: bar.id.rawValue, label: bar.id.label, value: bar.averageGrams, caption: "\(bar.loggedDayCount) days", color: macroColor(bar.id))
                        },
                        emptyMessage: "Average macro values are not available for this period."
                    )
                }
            }
            CardContainer {
                VStack(alignment: .leading, spacing: 12) {
                    TrainingSectionHeaderView(title: "Macro Trends Over Time")
                    Text("Weekly average \(report.selectedMacro.label.lowercased()) intake across the selected period.")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                    rangeSelector()
                    NutritionTrendChartView(
                        points: report.weeklyTrend, color: macroColor(report.selectedMacro),
                        valueLabel: { "\(Int($0.rounded()))g" },
                        emptyMessage: "No \(report.selectedMacro.label.lowercased()) evidence available in this period",
                        selectedWeekID: $selectedMacrosWeek
                    )
                }
            }
            weeklyRowsCard(
                title: "Weekly Averages", rows: report.weeklyRows, isPresented: $isMacrosWeeklySheetPresented,
                emptyMessage: "No weekly macro evidence available.",
                row: { row in NutritionWeeklyMacroRowView(row: row, selectedMacro: report.selectedMacro) }
            )
            dailyMacrosCard(report.dailyRows, selectedMacro: report.selectedMacro)
        }
    }

    private func dailyMacrosCard(_ rows: [NutritionDailyMacroRow], selectedMacro: NutritionMacroKey) -> some View {
        let preview = Array(rows.prefix(Self.previewLimit))
        return CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                TrainingSectionHeaderView(title: "Recent Daily Macros") {
                    if rows.count > Self.previewLimit {
                        Button { isMacrosDailySheetPresented = true } label: { TrainingCompactActionLabel(label: "Show All") }
                    }
                }
                if preview.isEmpty {
                    Text("No daily macro evidence available.")
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                } else {
                    VStack(spacing: 8) {
                        ForEach(preview) { row in
                            NavigationLink(value: AppDestination.nutritionDay(dayId: row.id)) {
                                NutritionDailyMacroRowView(row: row, selectedMacro: selectedMacro)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
        .sheet(isPresented: $isMacrosDailySheetPresented) {
            NutritionReportDailyMacrosSheet(rows: rows, selectedMacro: selectedMacro)
        }
    }

    // MARK: - Meals

    private func mealsContent(_ report: NutritionMealsReport) -> some View {
        Group {
            periodSummaryGrid(report.periodSummary)
            CardContainer {
                VStack(alignment: .leading, spacing: 12) {
                    TrainingSectionHeaderView(title: "Meal Distribution")
                    Text("Average calories by meal across the selected period.")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                    NutritionBarChartView(
                        bars: report.distribution.map { average in
                            NutritionBarChartView.Bar(id: average.id.rawValue, label: average.id.label, value: average.averageCalories ?? 0, caption: "\(average.occurrenceCount)×", color: mealSlotColor(average.id))
                        },
                        emptyMessage: "No meal evidence available for this period."
                    )
                }
            }
            CardContainer {
                VStack(alignment: .leading, spacing: 12) {
                    TrainingSectionHeaderView(title: "Meal Macro Mix")
                    Text("Macro-derived calorie distribution for the selected meal.")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                    slotSelector(selected: report.selectedMacroMixSlot, includeAll: false) { slot in
                        Task { await viewModel?.selectMealMacroMixSlot(slot) }
                    }
                    NutritionDonutChartView(
                        slices: report.macroMix.map { donutSlice($0) },
                        centerLabel: report.selectedMacroMixSlot.label,
                        emptyMessage: "Macro distribution is not available for this period."
                    )
                }
            }
            CardContainer {
                VStack(alignment: .leading, spacing: 12) {
                    TrainingSectionHeaderView(title: "Meal Trends Over Time")
                    Text("One selected weekly meal metric across the selected period.")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                    slotSelector(selected: report.selectedTrendSlot, includeAll: true) { slot in
                        Task { await viewModel?.selectMealTrendSlot(slot) }
                    }
                    metricSelector(selected: report.selectedTrendMetric) { metric in
                        Task { await viewModel?.selectMealTrendMetric(metric) }
                    }
                    rangeSelector()
                    NutritionTrendChartView(
                        points: report.weeklyTrend, color: PhysiqueOSTheme.accent,
                        valueLabel: { "\(Int($0.rounded()))\(report.selectedTrendMetric.unit)" },
                        emptyMessage: "No contributing meal evidence.",
                        selectedWeekID: $selectedMealsWeek
                    )
                }
            }
            weeklyRowsCard(
                title: "Weekly Meal Summary", rows: report.weeklyRows, isPresented: $isMealsWeeklySheetPresented,
                emptyMessage: "No weekly meal evidence available.",
                row: { row in NutritionWeeklyMealRowView(row: row) }
            )
            recurringMealsCard(report.recurringMeals)
            mealHistoryCard(report.historyGroups)
        }
    }

    private func slotSelector(selected: NutritionMealSlotFilter, includeAll: Bool, onSelect: @escaping (NutritionMealSlotFilter) -> Void) -> some View {
        let options = includeAll ? NutritionMealSlotFilter.allCases : NutritionMealSlotFilter.allCases.filter { $0 != .all }
        return HStack(spacing: 6) {
            ForEach(options) { slot in
                let isSelected = slot == selected
                Button {
                    onSelect(slot)
                } label: {
                    Text(slot.label)
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(isSelected ? .white : PhysiqueOSTheme.textSecondary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(isSelected ? PhysiqueOSTheme.accent.opacity(0.85) : PhysiqueOSTheme.surfaceMuted)
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func metricSelector(selected: NutritionMealTrendMetric, onSelect: @escaping (NutritionMealTrendMetric) -> Void) -> some View {
        Menu {
            ForEach(NutritionMealTrendMetric.allCases) { metric in
                Button(metric.label) { onSelect(metric) }
            }
        } label: {
            HStack(spacing: 4) {
                Text(selected.label)
                Image(systemName: "chevron.up.chevron.down")
            }
            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
            .foregroundStyle(PhysiqueOSTheme.textPrimary)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(PhysiqueOSTheme.surfaceMuted)
            .clipShape(Capsule())
        }
    }

    private func recurringMealsCard(_ meals: [NutritionRecurringMeal]) -> some View {
        let preview = Array(meals.prefix(Self.previewLimit))
        return CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                TrainingSectionHeaderView(title: "Recurring Meals") {
                    if meals.count > Self.previewLimit {
                        Button { isRecurringMealsSheetPresented = true } label: { TrainingCompactActionLabel(label: "Show All") }
                    }
                }
                if preview.isEmpty {
                    Text("No recurring meals identified yet.")
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                } else {
                    VStack(spacing: 8) {
                        ForEach(preview) { meal in NutritionRecurringMealRow(meal: meal) }
                    }
                }
            }
        }
        .sheet(isPresented: $isRecurringMealsSheetPresented) {
            NutritionReportListSheet(title: "Recurring Meals") {
                ForEach(meals) { meal in NutritionRecurringMealRow(meal: meal) }
            }
        }
    }

    private func mealHistoryCard(_ groups: [NutritionMealHistoryGroup]) -> some View {
        let preview = Array(groups.prefix(Self.previewLimit))
        return CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                TrainingSectionHeaderView(title: "Recent Meal History") {
                    if groups.count > Self.previewLimit {
                        Button { isMealHistorySheetPresented = true } label: { TrainingCompactActionLabel(label: "Show All") }
                    }
                }
                if preview.isEmpty {
                    Text("No meal history available.")
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                } else {
                    VStack(spacing: 8) {
                        ForEach(preview) { group in
                            NavigationLink(value: AppDestination.nutritionDay(dayId: group.dayId)) {
                                NutritionMealHistoryGroupRow(group: group)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
        .sheet(isPresented: $isMealHistorySheetPresented) {
            NutritionReportListSheet(title: "Recent Meal History") {
                ForEach(groups) { group in
                    NavigationLink(value: AppDestination.nutritionDay(dayId: group.dayId)) {
                        NutritionMealHistoryGroupRow(group: group)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    // MARK: - Shared weekly-rows card (preview 3 + Show All sheet)

    private func weeklyRowsCard<Row: Identifiable, Content: View>(
        title: String, rows: [Row], isPresented: Binding<Bool>, emptyMessage: String,
        @ViewBuilder row: @escaping (Row) -> Content
    ) -> some View {
        let preview = Array(rows.prefix(Self.previewLimit))
        return CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                TrainingSectionHeaderView(title: title) {
                    if rows.count > Self.previewLimit {
                        Button { isPresented.wrappedValue = true } label: { TrainingCompactActionLabel(label: "Show All") }
                    }
                }
                if preview.isEmpty {
                    Text(emptyMessage)
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                } else {
                    VStack(spacing: 8) {
                        ForEach(preview) { item in row(item) }
                    }
                }
            }
        }
        .sheet(isPresented: isPresented) {
            NutritionReportListSheet(title: title) {
                ForEach(rows) { item in row(item) }
            }
        }
    }
}

// MARK: - Color helpers (shared macro/meal-slot tokens)

private func macroColor(_ macro: NutritionMacroKey) -> Color {
    switch macro {
    case .protein: PhysiqueOSTheme.macroProtein
    case .carbohydrates: PhysiqueOSTheme.macroCarbohydrates
    case .fat: PhysiqueOSTheme.macroFat
    }
}

private func mealSlotColor(_ slot: NutritionMealSlot) -> Color {
    switch slot {
    case .breakfast: PhysiqueOSTheme.mealBreakfast
    case .lunch: PhysiqueOSTheme.mealLunch
    case .dinner: PhysiqueOSTheme.mealDinner
    case .snacks: PhysiqueOSTheme.mealSnacks
    }
}

private func donutSlice(_ slice: NutritionMacroDistributionSlice) -> NutritionDonutChartView.Slice {
    NutritionDonutChartView.Slice(id: slice.id.rawValue, label: slice.id.label, percentage: slice.percentage, grams: slice.grams, color: macroColor(slice.id))
}
