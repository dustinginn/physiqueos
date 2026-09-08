import SwiftUI

/// Row/sheet views for `NutritionReportingView` — kept in a separate file
/// since there are many small, single-purpose pieces (one row type per
/// weekly/daily/recurring/history list across all 3 reports).

/// A generic "range / value / detail" row — Calories' and Meals' own
/// Weekly rows share this exact 3-field shape.
struct NutritionWeeklyStatRow: View {
    let range: String
    let value: String
    let detail: String

    var body: some View {
        HStack(alignment: .top) {
            Text(range)
                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 2) {
                Text(value)
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(detail)
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
            }
        }
        .padding(.vertical, 4)
    }
}

struct NutritionDailyCalorieRowView: View {
    let row: NutritionDailyCalorieRow

    var body: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                Text(TrainingDateFormatting.short(row.date))
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text("\(row.mealCount) meal\(row.mealCount == 1 ? "" : "s")")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
            }
            Spacer(minLength: 8)
            Text(row.calories.map { "\(Int($0.rounded())) cal" } ?? "Pending")
                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
            Image(systemName: "chevron.right")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(PhysiqueOSTheme.accent)
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }
}

struct NutritionWeeklyMacroRowView: View {
    let row: NutritionWeeklyMacroRow
    let selectedMacro: NutritionMacroKey

    var body: some View {
        HStack(alignment: .top) {
            Text("\(TrainingDateFormatting.short(row.weekStart)) – \(TrainingDateFormatting.short(row.weekEnd))")
                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
            Spacer(minLength: 8)
            HStack(spacing: 8) {
                ForEach(NutritionMacroKey.allCases) { macro in
                    let isSelected = macro == selectedMacro
                    Text("\(macro.label.prefix(1)) \(row.averages[macro].map { "\(Int($0.rounded()))g" } ?? "—")")
                        .physiqueOSFont(isSelected ? PhysiqueOSTypography.caption12Semibold : PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(macroColorFor(macro).opacity(isSelected ? 1 : 0.72))
                }
            }
        }
        .padding(.vertical, 10)
    }
}

struct NutritionDailyMacroRowView: View {
    let row: NutritionDailyMacroRow
    let selectedMacro: NutritionMacroKey

    var body: some View {
        HStack(alignment: .top) {
            Text(TrainingDateFormatting.short(row.date))
                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
            Spacer(minLength: 8)
            HStack(spacing: 8) {
                ForEach(NutritionMacroKey.allCases) { macro in
                    let isSelected = macro == selectedMacro
                    Text("\(macro.label.prefix(1)) \(row.macros[macro].map { "\(Int($0.rounded()))g" } ?? "—")")
                        .physiqueOSFont(isSelected ? PhysiqueOSTypography.caption12Semibold : PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(macroColorFor(macro).opacity(isSelected ? 1 : 0.72))
                }
            }
            Image(systemName: "chevron.right")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(PhysiqueOSTheme.accent)
        }
        .padding(.vertical, 10)
        .accessibilityElement(children: .combine)
    }
}

struct NutritionRecurringMealRow: View {
    let meal: NutritionRecurringMeal

    var body: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 6) {
                Text(meal.name)
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    .lineLimit(1)
                Text("\(meal.slot.label) · Last \(TrainingDateFormatting.short(meal.lastEaten))")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
                HStack(spacing: 6) {
                    Text("\(meal.occurrenceCount) occurrences")
                    Text("•")
                    Text(meal.averageCalories.map { "\(Int($0.rounded())) cal average" } ?? "Calories pending")
                }
                .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                .foregroundStyle(mealSlotColorFor(meal.slot))
                HStack(spacing: 10) {
                    macroValue("P", meal.averageProteinG, color: PhysiqueOSTheme.macroProtein)
                    macroValue("C", meal.averageCarbohydratesG, color: PhysiqueOSTheme.macroCarbohydrates)
                    macroValue("F", meal.averageFatG, color: PhysiqueOSTheme.macroFat)
                }
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 2) {
                Text("\(meal.occurrenceCount)×")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(meal.averageCalories.map { "\(Int($0.rounded())) cal" } ?? "Pending")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PhysiqueOSTheme.surfaceMuted)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .combine)
    }

    private func macroValue(_ label: String, _ value: Double?, color: Color) -> some View {
        Text("\(label) \(value.map { "\(Int($0.rounded()))g" } ?? "—")")
            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
            .foregroundStyle(color)
    }
}

struct NutritionWeeklyMealRowView: View {
    let row: NutritionWeeklyMealRow

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text("\(TrainingDateFormatting.short(row.weekStart)) – \(TrainingDateFormatting.short(row.weekEnd))")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Spacer(minLength: 8)
                Text("\(row.mealCount) meals · \(row.loggedDayCount) days")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
            }
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                ForEach(row.slots) { slot in
                    HStack(spacing: 6) {
                        Text(slot.slot.glyph)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(slot.slot.label)
                            Text(slot.averageCalories.map { "\(slot.occurrenceCount)× · \(Int($0.rounded())) cal avg" } ?? "No entries")
                                .foregroundStyle(PhysiqueOSTheme.textMuted)
                        }
                    }
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(mealSlotColorFor(slot.slot))
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
        .padding(16)
        .background(PhysiqueOSTheme.surfaceMuted)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .combine)
    }
}

struct NutritionMealHistoryGroupRow: View {
    let group: NutritionMealHistoryGroup

    var body: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 4) {
                Text(TrainingDateFormatting.short(group.date))
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                HStack(spacing: 4) {
                    ForEach(group.meals) { meal in
                        Text(meal.slot.glyph)
                            .foregroundStyle(mealSlotColorFor(meal.slot))
                    }
                }
                Text("\(group.mealCount) meal\(group.mealCount == 1 ? "" : "s")")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
            }
            Spacer(minLength: 8)
            Text(group.dailyCalories.map { "\(Int($0.rounded())) cal" } ?? "Pending")
                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
            Image(systemName: "chevron.right")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(PhysiqueOSTheme.accent)
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }
}

private func mealSlotColorFor(_ slot: NutritionMealSlot) -> Color {
    switch slot {
    case .breakfast: PhysiqueOSTheme.mealBreakfast
    case .lunch: PhysiqueOSTheme.mealLunch
    case .dinner: PhysiqueOSTheme.mealDinner
    case .snacks: PhysiqueOSTheme.mealSnacks
    }
}

private func macroColorFor(_ macro: NutritionMacroKey) -> Color {
    switch macro {
    case .protein: PhysiqueOSTheme.macroProtein
    case .carbohydrates: PhysiqueOSTheme.macroCarbohydrates
    case .fat: PhysiqueOSTheme.macroFat
    }
}

// MARK: - Sheets

/// A generic "Show All" sheet — every one of the weekly-row cards
/// (Calories/Macros/Meals) shares this exact scrollable-list-in-a-sheet
/// shape.
struct NutritionReportListSheet<Content: View>: View {
    let title: String
    @ViewBuilder var content: Content

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 8) {
                    content
                }
                .padding(16)
            }
            .background(PhysiqueOSTheme.background)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(PhysiqueOSTheme.background, for: .navigationBar)
            .navigationDestination(for: AppDestination.self) { AppDestinationRouterView(destination: $0) }
        }
        .presentationDetents([.medium, .large])
    }
}

struct NutritionReportDailyCaloriesSheet: View {
    let rows: [NutritionDailyCalorieRow]

    var body: some View {
        NutritionReportListSheet(title: "Recent Daily Calories") {
            ForEach(rows) { row in
                NavigationLink(value: AppDestination.nutritionDay(dayId: row.id)) {
                    NutritionDailyCalorieRowView(row: row)
                }
                .buttonStyle(.plain)
            }
        }
    }
}

struct NutritionReportDailyMacrosSheet: View {
    let rows: [NutritionDailyMacroRow]
    let selectedMacro: NutritionMacroKey

    var body: some View {
        NutritionReportListSheet(title: "Recent Daily Macros") {
            ForEach(rows) { row in
                NavigationLink(value: AppDestination.nutritionDay(dayId: row.id)) {
                    NutritionDailyMacroRowView(row: row, selectedMacro: selectedMacro)
                }
                .buttonStyle(.plain)
            }
        }
    }
}

/// `TrainingSourceMetadataFooter`'s sibling for Nutrition Reporting's own
/// Data Sources card — same per-vertical convention as every other
/// screen's own private copy (`NutritionHistoryView`'s own version stays
/// private to that file).
struct NutritionReportDataSourcesFooterView: View {
    let items: [NutritionDataSource]

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
