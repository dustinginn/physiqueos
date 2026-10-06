import SwiftUI

// Nutrition Reporting rows in the locked daily `.row` language (open-list
// rows: label + copy, muted trailing values, inline `›` when navigable).

struct NutritionWeeklyStatRow: View {
    let range: String
    let value: String
    let detail: String

    var body: some View {
        EvidenceDailyRow(label: range, copy: detail, trailing: [value], showsChevron: false)
    }
}

struct NutritionDailyCalorieRowView: View {
    let row: NutritionDailyCalorieRow

    var body: some View {
        EvidenceDailyRow(
            label: TrainingDateFormatting.short(row.date),
            copy: "\(row.mealCount) meal\(row.mealCount == 1 ? "" : "s")",
            trailing: [row.calories.map { "\(Int($0.rounded())) cal" } ?? "Pending"]
        )
        .accessibilityAddTraits(.isButton)
    }
}

/// Macro rows: each macro in its own ink; the selected macro full strength.
private struct NutritionMacroValues: View {
    let values: [NutritionMacroKey: Double]
    let selectedMacro: NutritionMacroKey
    private let m = EvidenceMetrics(family: .daily)

    var body: some View {
        HStack(spacing: m.pt(8)) {
            ForEach(NutritionMacroKey.allCases) { macro in
                let isSelected = macro == selectedMacro
                Text("\(macro.label.prefix(1)) \(values[macro].map { "\(Int($0.rounded()))g" } ?? "—")")
                    .evidenceText(.normal(9, isSelected ? 850 : 700, digits: true))
                    .foregroundStyle(macroColorFor(macro).opacity(isSelected ? 1 : 0.72))
            }
        }
    }
}

struct NutritionWeeklyMacroRowView: View {
    let row: NutritionWeeklyMacroRow
    let selectedMacro: NutritionMacroKey
    private let m = EvidenceMetrics(family: .daily)

    var body: some View {
        HStack(spacing: m.pt(10)) {
            Text("\(TrainingDateFormatting.short(row.weekStart)) – \(TrainingDateFormatting.short(row.weekEnd))")
                .evidenceText(.normal(11, 810))
                .foregroundStyle(m.c.ink)
            Spacer(minLength: 0)
            NutritionMacroValues(values: row.averages, selectedMacro: selectedMacro)
        }
        .padding(.vertical, m.pt(9))
        .padding(.horizontal, m.pt(2))
        .frame(minHeight: max(44, m.pt(49)))
        .accessibilityElement(children: .combine)
    }
}

struct NutritionDailyMacroRowView: View {
    let row: NutritionDailyMacroRow
    let selectedMacro: NutritionMacroKey
    private let m = EvidenceMetrics(family: .daily)

    var body: some View {
        HStack(spacing: m.pt(10)) {
            Text(TrainingDateFormatting.short(row.date))
                .evidenceText(.normal(11, 810))
                .foregroundStyle(m.c.ink)
            Spacer(minLength: 0)
            NutritionMacroValues(values: row.macros, selectedMacro: selectedMacro)
            Text("›")
                .evidenceText(.normal(10, 750))
                .foregroundStyle(m.c.muted)
        }
        .padding(.vertical, m.pt(9))
        .padding(.horizontal, m.pt(2))
        .frame(minHeight: max(44, m.pt(49)))
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
    }
}

struct NutritionRecurringMealRow: View {
    let meal: NutritionRecurringMeal
    private let m = EvidenceMetrics(family: .daily)

    var body: some View {
        HStack(alignment: .top, spacing: m.pt(10)) {
            VStack(alignment: .leading, spacing: 0) {
                Text(meal.name)
                    .evidenceText(.normal(11, 810))
                    .foregroundStyle(m.c.ink)
                    .lineLimit(1)
                Text("\(meal.slot.label) · Last \(TrainingDateFormatting.short(meal.lastEaten))")
                    .evidenceText(EvidenceTextStyle(size: 9, weight: 400, lineHeight: 12.15))
                    .foregroundStyle(m.c.muted)
                    .padding(.top, m.pt(2))
                Text("\(meal.occurrenceCount) occurrences · \(meal.averageCalories.map { "\(Int($0.rounded())) cal average" } ?? "Calories pending")")
                    .evidenceText(.normal(9, 750))
                    .foregroundStyle(mealSlotColorFor(meal.slot))
                    .padding(.top, m.pt(3))
                HStack(spacing: m.pt(12)) {
                    macroValue("P", meal.averageProteinG, color: m.c[keyPath: NutritionEvidenceMacro.protein.paletteColor])
                    macroValue("C", meal.averageCarbohydratesG, color: m.c[keyPath: NutritionEvidenceMacro.carbohydrates.paletteColor])
                    macroValue("F", meal.averageFatG, color: m.c[keyPath: NutritionEvidenceMacro.fat.paletteColor])
                }
                .padding(.top, m.pt(4))
            }
            Spacer(minLength: 0)
            VStack(alignment: .trailing, spacing: 0) {
                Text("\(meal.occurrenceCount)×")
                    .evidenceText(.normal(10, 750, digits: true))
                    .foregroundStyle(m.c.ink)
                Text(meal.averageCalories.map { "\(Int($0.rounded())) cal" } ?? "Pending")
                    .evidenceText(.normal(10, 750, digits: true))
                    .foregroundStyle(m.c.muted)
            }
        }
        .padding(.vertical, m.pt(9))
        .padding(.horizontal, m.pt(2))
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    private func macroValue(_ label: String, _ value: Double?, color: Color) -> some View {
        Text("\(label) \(value.map { "\(Int($0.rounded()))g" } ?? "—")")
            .evidenceText(.normal(9, 800, digits: true))
            .foregroundStyle(color)
    }
}

struct NutritionWeeklyMealRowView: View {
    let row: NutritionWeeklyMealRow
    private let m = EvidenceMetrics(family: .daily)

    var body: some View {
        VStack(alignment: .leading, spacing: m.pt(8)) {
            HStack(alignment: .firstTextBaseline) {
                Text("\(TrainingDateFormatting.short(row.weekStart)) – \(TrainingDateFormatting.short(row.weekEnd))")
                    .evidenceText(.normal(11, 810))
                    .foregroundStyle(m.c.ink)
                Spacer(minLength: m.pt(8))
                Text("\(row.mealCount) meals · \(row.loggedDayCount) days")
                    .evidenceText(.normal(10, 750, digits: true))
                    .foregroundStyle(m.c.muted)
            }
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], alignment: .leading, spacing: m.pt(6)) {
                ForEach(row.slots) { slot in
                    HStack(alignment: .firstTextBaseline, spacing: m.pt(6)) {
                        Text(slot.slot.glyph)
                            .evidenceText(.normal(10, 900))
                            .foregroundStyle(mealSlotColorFor(slot.slot))
                        VStack(alignment: .leading, spacing: 0) {
                            Text(slot.slot.label)
                                .evidenceText(.normal(9, 750))
                                .foregroundStyle(m.c.ink)
                            Text(slot.averageCalories.map { "\(slot.occurrenceCount)× · \(Int($0.rounded())) cal avg" } ?? "No entries")
                                .evidenceText(EvidenceTextStyle(size: 9, weight: 400, lineHeight: 12.15))
                                .foregroundStyle(m.c.muted)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
        .padding(.vertical, m.pt(9))
        .padding(.horizontal, m.pt(2))
        .accessibilityElement(children: .combine)
    }
}

struct NutritionMealHistoryGroupRow: View {
    let group: NutritionMealHistoryGroup
    private let m = EvidenceMetrics(family: .daily)

    var body: some View {
        HStack(spacing: m.pt(10)) {
            VStack(alignment: .leading, spacing: 0) {
                Text(TrainingDateFormatting.short(group.date))
                    .evidenceText(.normal(11, 810))
                    .foregroundStyle(m.c.ink)
                HStack(spacing: m.pt(4)) {
                    ForEach(group.meals) { meal in
                        Text(meal.slot.glyph)
                            .evidenceText(.normal(10, 900))
                            .foregroundStyle(mealSlotColorFor(meal.slot))
                    }
                    Text("\(group.mealCount) meal\(group.mealCount == 1 ? "" : "s")")
                        .evidenceText(EvidenceTextStyle(size: 9, weight: 400, lineHeight: 12.15))
                        .foregroundStyle(m.c.muted)
                }
                .padding(.top, m.pt(2))
            }
            Spacer(minLength: 0)
            Text("\(group.dailyCalories.map { "\(Int($0.rounded())) cal" } ?? "Pending") ›")
                .evidenceText(.normal(10, 750, digits: true))
                .foregroundStyle(m.c.muted)
        }
        .padding(.vertical, m.pt(9))
        .padding(.horizontal, m.pt(2))
        .frame(minHeight: max(44, m.pt(49)))
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
    }
}

private func mealSlotColorFor(_ slot: NutritionMealSlot) -> Color {
    let c = EvidencePalette.daily
    switch slot {
    case .breakfast: return c.breakfast
    case .lunch: return c.lunch
    case .dinner: return c.dinner
    case .snacks: return c.snacks
    }
}

private func macroColorFor(_ macro: NutritionMacroKey) -> Color {
    NutritionEvidenceMacro(macro).color
}

// MARK: - Sheets

struct NutritionReportListSheet<Content: View>: View {
    @Environment(\.dismiss) private var dismiss
    let title: String
    @ViewBuilder var content: Content
    private let m = EvidenceMetrics(family: .daily)

    var body: some View {
        NavigationStack {
            ScrollView {
                content
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
                    Text(title)
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

struct NutritionReportDailyCaloriesSheet: View {
    let rows: [NutritionDailyCalorieRow]

    var body: some View {
        NutritionReportListSheet(title: "Recent Daily Calories") {
            EvidenceDailyOpenList(data: rows) { row in
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
            EvidenceDailyOpenList(data: rows) { row in
                NavigationLink(value: AppDestination.nutritionDay(dayId: row.id)) {
                    NutritionDailyMacroRowView(row: row, selectedMacro: selectedMacro)
                }
                .buttonStyle(.plain)
            }
        }
    }
}
