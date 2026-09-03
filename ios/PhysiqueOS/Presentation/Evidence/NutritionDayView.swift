import SwiftUI

/// A single Nutrition Day (`/progress/nutrition/day/:dayId`) — mirrors
/// `NutritionKnowledgeScreen.jsx`'s `getDayContent` section order exactly:
/// Summary (detail + source evidence) → Totals (day-level macro grid) →
/// Meals (one row per meal, each carrying its own macro breakdown + food
/// list). Totals and per-meal macros are deliberately two separate
/// sections, never merged into one dashboard — matching the live web page,
/// and the brief's explicit "Macro totals must remain distinct from meal
/// detail" requirement.
struct NutritionDayView: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var viewModel: NutritionDayViewModel?
    let dayId: String

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
        .task {
            if viewModel == nil { viewModel = NutritionDayViewModel(api: environment.nutritionAPI, dayId: dayId) }
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
            Text("No nutrition evidence for this day.")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                .frame(maxWidth: .infinity, minHeight: 300)
        case .loaded(.some(let day)):
            VStack(alignment: .leading, spacing: 16) {
                header(for: day)
                summaryCard(day)
                totalsCard(day.totals)
                mealsCard(day.meals)
            }
        }
    }

    private func header(for day: NutritionDayRecord) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Nutrition Day")
                .physiqueOSFont(PhysiqueOSTypography.sectionLabel)
                .foregroundStyle(PhysiqueOSTheme.accent)
            Text(TrainingDayView.formatCompactDate(day.date))
                .physiqueOSFont(PhysiqueOSTypography.screenTitle)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
            Text(day.value)
                .physiqueOSFont(PhysiqueOSTypography.screenSubtitle)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
            EvidenceScopeAttributionChip(attribution: day.attributedScope)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func summaryCard(_ day: NutritionDayRecord) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 8) {
                SectionHeading("Summary")
                Text(day.detail)
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                if !day.sourceEvidence.isEmpty {
                    Text("Source: \(day.sourceEvidence.joined(separator: " + "))")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
            }
        }
    }

    private func totalsCard(_ totals: NutritionMacroTotals) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                SectionHeading("Totals")
                NutritionMacroGridView(totals: totals)
            }
        }
    }

    private func mealsCard(_ meals: [NutritionMealRecord]) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                SectionHeading("Meals")
                if meals.isEmpty {
                    Text("No meals recorded for this day.")
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                } else {
                    VStack(spacing: 10) {
                        ForEach(meals) { meal in
                            NutritionMealRowView(meal: meal)
                        }
                    }
                }
            }
        }
    }
}

/// One meal row — slot glyph/color chip, optional distinct name,
/// completeness copy, macro breakdown, and a compact food list. Colors
/// mirror `nutritionMealPresentation.js`'s dark-theme values exactly
/// (`PhysiqueOSTheme.mealBreakfast/mealLunch/mealDinner/mealSnacks`,
/// confirmed matching hex during this port's audit).
private struct NutritionMealRowView: View {
    let meal: NutritionMealRecord

    private var slotColor: Color {
        switch meal.slot {
        case .breakfast: PhysiqueOSTheme.mealBreakfast
        case .lunch: PhysiqueOSTheme.mealLunch
        case .dinner: PhysiqueOSTheme.mealDinner
        case .snacks: PhysiqueOSTheme.mealSnacks
        }
    }

    private var completenessLabel: String {
        meal.completeness == "complete" ? "Meal identified." : "Partial meal identified."
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text(meal.slot.glyph)
                    .foregroundStyle(slotColor)
                Text(meal.name ?? meal.slot.label)
                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Spacer(minLength: 8)
                if let calories = meal.totals.calories, calories.isFinite {
                    Text("\(Int(calories)) cal")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
            Text(completenessLabel)
                .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                .foregroundStyle(PhysiqueOSTheme.textMuted)
            HStack(spacing: 12) {
                macroLabel("P", meal.totals.proteinG, PhysiqueOSTheme.macroProtein)
                macroLabel("C", meal.totals.carbsG, PhysiqueOSTheme.macroCarbohydrates)
                macroLabel("F", meal.totals.fatG, PhysiqueOSTheme.macroFat)
            }
            if !meal.foods.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(meal.foods) { food in
                        HStack(spacing: 4) {
                            Text(food.name)
                                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                            if let brand = food.brand {
                                Text("(\(brand))")
                                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                                    .foregroundStyle(PhysiqueOSTheme.textMuted)
                            }
                            Spacer(minLength: 8)
                            if let servingSize = food.servingSize {
                                Text(servingSize)
                                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                            }
                        }
                    }
                }
                .padding(.top, 2)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PhysiqueOSTheme.surfaceMuted)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .combine)
    }

    private func macroLabel(_ symbol: String, _ grams: Double?, _ color: Color) -> some View {
        HStack(spacing: 2) {
            Text(symbol)
                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                .foregroundStyle(color)
            Text(grams.map { $0.isFinite ? "\(Int($0))g" : "—" } ?? "—")
                .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
        }
    }
}
