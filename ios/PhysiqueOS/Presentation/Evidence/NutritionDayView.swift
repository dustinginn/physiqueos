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
    @State private var viewModelAuthority: NativeAPIEnvironment?
    let dayId: String

    private let m = EvidenceMetrics(family: .daily)

    var body: some View {
        EvidenceScrollPage(top: 10) {
            content
        }
        .evidencePageChrome(TrainingDateFormatting.short(viewModel?.loadedDay?.date ?? ""))
        .evidenceFamily(.daily)
        .task(id: environment.nativeAuthority) {
            if viewModelAuthority != environment.nativeAuthority {
                viewModel = NutritionDayViewModel(api: environment.nutritionAPI, dayId: dayId)
                viewModelAuthority = environment.nativeAuthority
            }
            await viewModel?.load()
        }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel?.state {
        case .none, .loading:
            EvidenceStatePanel(kind: .loading("Loading Nutrition Evidence…"), identifier: "nutrition.day.loading")
        case .failed(let message):
            EvidenceStatePanel(kind: .failure(message, nil), identifier: "nutrition.day.failure")
        case .loaded(.none):
            EvidenceStatePanel(kind: .empty("No nutrition evidence for this day.", nil), identifier: "nutrition.day.empty")
        case .loaded(.some(let day)):
            EvidencePageHeader(eyebrow: "Nutrition Day", title: TrainingDayView.formatCompactDate(day.date), subtitle: day.value, dateTitle: true)
            EvidenceSection(title: "Summary", style: .containedDeep, identifier: "nutrition.day.summary") {
                VStack(alignment: .leading, spacing: 0) {
                    Text(day.detail)
                        .evidenceText(EvidenceTextStyle(size: 9, weight: 600, lineHeight: 12.42))
                        .foregroundStyle(m.c.muted)
                        .fixedSize(horizontal: false, vertical: true)
                    if !day.sourceEvidence.isEmpty {
                        EvidenceDailyProvenance(title: "Source · \(day.sourceEvidence.joined(separator: ", "))")
                            .padding(.top, m.pt(9))
                    }
                }
            }
            EvidenceSection(title: "Totals", style: .containedDeep, identifier: "nutrition.day.totals") {
                NutritionMacroGridView(totals: day.totals)
            }
            EvidenceSection(title: "Meals", style: .containedDeep, identifier: "nutrition.day.meals") {
                if day.meals.isEmpty {
                    NutritionDayTotalsOnlyPanel(text: NutritionDayView.emptyMealsCopy(totals: day.totals))
                } else {
                    VStack(spacing: 0) {
                        ForEach(day.meals) { meal in
                            NutritionMealRowView(meal: meal)
                        }
                    }
                }
            }
        }
    }
}

extension NutritionDayViewModel {
    var loadedDay: NutritionDayRecord? {
        if case .loaded(let day) = state { return day }
        return nil
    }
}

/// Locked N4: an Apple Health totals-only day stays valid without meals.
private struct NutritionDayTotalsOnlyPanel: View {
    let text: String
    private let m = EvidenceMetrics(family: .daily)

    var body: some View {
        let parts = text.components(separatedBy: ". ")
        VStack(spacing: m.pt(4)) {
            Text("≈")
                .evidenceText(.normal(12, 900))
                .foregroundStyle(m.c.teal)
                .accessibilityHidden(true)
            Text(parts.first.map { $0.hasSuffix(".") ? $0 : $0 + "." } ?? text)
                .evidenceText(.normal(11, 840))
                .foregroundStyle(m.c.ink)
            if parts.count > 1 {
                Text(parts.dropFirst().joined(separator: ". "))
                    .evidenceText(EvidenceTextStyle(size: 9, weight: 400, lineHeight: 12.6))
                    .foregroundStyle(m.c.muted)
            }
        }
        .multilineTextAlignment(.center)
        .padding(m.pt(18 + 1))
        .frame(maxWidth: .infinity, minHeight: m.pt(100))
        .overlay(RoundedRectangle(cornerRadius: m.pt(15)).strokeBorder(m.c.line, lineWidth: m.pt(1)))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(text)
    }
}

extension NutritionDayView {
    /// A day with daily totals and no meal objects (an Apple Health daily total)
    /// is complete and valid; it is described as totals-only, never as missing.
    static func emptyMealsCopy(totals: NutritionMacroTotals) -> String {
        // A partial HealthKit daily-total delivery does not guarantee `calories`
        // specifically is present — any populated macro is a real totals-only
        // day, not a day with nothing recorded.
        [totals.calories, totals.proteinG, totals.carbsG, totals.fatG].contains(where: { $0 != nil })
            ? "Daily totals only. No meal detail for this day."
            : "No meals recorded for this day."
    }
}

/// One meal row — slot glyph/color chip, optional distinct name,
/// completeness copy, macro breakdown, and a compact food list. Colors
/// mirror `nutritionMealPresentation.js`'s dark-theme values exactly
/// (`PhysiqueOSTheme.mealBreakfast/mealLunch/mealDinner/mealSnacks`,
/// confirmed matching hex during this port's audit).
/// `.meal`: glyph + name + calories, identification state, colored macro
/// line, then foods with serving sizes. Ruled above each meal.
private struct NutritionMealRowView: View {
    let meal: NutritionMealRecord
    private let m = EvidenceMetrics(family: .daily)

    private var slotColor: Color {
        switch meal.slot {
        case .breakfast: m.c.breakfast
        case .lunch: m.c.lunch
        case .dinner: m.c.dinner
        case .snacks: m.c.snacks
        }
    }

    private var completenessLabel: String {
        meal.completeness == "complete" ? "Meal identified." : "Partial meal identified."
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: m.pt(7)) {
                Text(meal.slot.glyph)
                    .evidenceText(.normal(12, 900))
                    .foregroundStyle(slotColor)
                    .accessibilityHidden(true)
                Text(meal.name ?? meal.slot.label)
                    .evidenceText(.normal(11, 840))
                    .foregroundStyle(m.c.ink)
                Spacer(minLength: m.pt(8))
                if let calories = meal.totals.calories, calories.isFinite {
                    Text("\(Int(calories)) cal")
                        .evidenceText(.normal(9, 750, digits: true))
                        .foregroundStyle(m.c.muted)
                }
            }
            Text(completenessLabel)
                .evidenceText(.normal(8, 400))
                .foregroundStyle(m.c.quiet)
                .padding(.top, m.pt(3))
            HStack(spacing: m.pt(12)) {
                macroLabel("P", meal.totals.proteinG, m.c[keyPath: NutritionEvidenceMacro.protein.paletteColor])
                macroLabel("C", meal.totals.carbsG, m.c[keyPath: NutritionEvidenceMacro.carbohydrates.paletteColor])
                macroLabel("F", meal.totals.fatG, m.c[keyPath: NutritionEvidenceMacro.fat.paletteColor])
            }
            .padding(.top, m.pt(6))
            ForEach(meal.foods) { food in
                HStack(spacing: m.pt(6)) {
                    Text(food.name)
                        .evidenceText(.normal(9, 750))
                        .foregroundStyle(m.c.ink)
                    if let brand = food.brand {
                        Text(brand)
                            .evidenceText(.normal(9, 400))
                            .foregroundStyle(m.c.muted)
                    }
                    Spacer(minLength: m.pt(8))
                    if let servingSize = food.servingSize {
                        Text(servingSize)
                            .evidenceText(.normal(9, 400, digits: true))
                            .foregroundStyle(m.c.muted)
                    }
                }
                .padding(.top, m.pt(5))
            }
        }
        .padding(.vertical, m.pt(11))
        .padding(.top, m.pt(1))
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .top) { Rectangle().fill(m.c.line).frame(height: m.pt(1)) }
        .accessibilityElement(children: .combine)
    }

    private func macroLabel(_ symbol: String, _ grams: Double?, _ color: Color) -> some View {
        Text("\(symbol) \(grams.map { $0.isFinite ? "\(Int($0))g" : "—" } ?? "—")")
            .evidenceText(.normal(9, 800, digits: true))
            .foregroundStyle(color)
    }
}
