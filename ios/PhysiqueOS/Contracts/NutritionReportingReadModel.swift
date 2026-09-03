import Foundation

/// Native transport mirror of the web's three real Nutrition Reporting
/// screens (`/progress/nutrition/reporting/{calories,macros,meals}`) —
/// verified live, non-404 production routes during this correction pass's
/// audit (unlike Activity's own dead reporting links). Follows
/// `TrainingReportingReadModel`'s established "one union read model, one
/// populated payload per report id" convention rather than three
/// independent types with no shared shell.
///
/// All three reports derive from the SAME already Goal/Phase-scoped
/// `[NutritionDayRecord]` list `NutritionHistoryView`'s own landing fetch
/// already produces — mirroring the web's own architecture exactly
/// (`NutritionCaloriesReportingService`/`NutritionMacrosReportingService`/
/// `NutritionMealsReportingService` all build their page model from the
/// same canonical `nutritionDays`, not a separate fixture) — see
/// `NutritionReportingCalculator.swift`, not a second parallel fixture
/// truth.
struct NutritionReportingReadModel: Identifiable {
    var id: String
    var eyebrow: String
    var title: String
    var subtitle: String
    var scope: TrainingScopeContext
    var dataSources: [NutritionDataSource]
    var calories: NutritionCaloriesReport?
    var macros: NutritionMacrosReport?
    var meals: NutritionMealsReport?
}

/// `Period Summary`'s per-card shape — reused across all three reports'
/// summary grids.
struct NutritionReportSummaryItem: Equatable, Identifiable {
    var id: String { label }
    var label: String
    var value: String
}

/// One plotted week on any of the three line-trend charts — `value == nil`
/// weeks are dropped before charting (never plotted as a fabricated zero),
/// matching `buildNutritionCalorieSeriesPaths`/`buildMacroTrendPaths`'s own
/// gap-preserving behavior.
struct NutritionTrendPoint: Equatable, Identifiable {
    var id: String { weekStart }
    var weekStart: String
    var weekEnd: String
    var value: Double?
    var loggedDayCount: Int
}

/// The 5-way client-side chart range selector every line-trend chart
/// shows (`LONG_RANGE_OPTIONS`) — narrows the already Goal/Phase-scoped
/// week/day series further, in-memory, no navigation.
enum NutritionReportRange: String, CaseIterable, Identifiable {
    case oneMonth = "1m", threeMonths = "3m", sixMonths = "6m", oneYear = "1y", all

    var id: String { rawValue }

    var label: String {
        switch self {
        case .oneMonth: "1M"
        case .threeMonths: "3M"
        case .sixMonths: "6M"
        case .oneYear: "1Y"
        case .all: "All"
        }
    }

    /// `nil` for `.all` — no lower bound.
    var months: Int? {
        switch self {
        case .oneMonth: 1
        case .threeMonths: 3
        case .sixMonths: 6
        case .oneYear: 12
        case .all: nil
        }
    }
}

// MARK: - Calories report

struct NutritionCaloriesReport: Equatable {
    var periodSummary: [NutritionReportSummaryItem]
    /// `"Target unavailable for this period"` — target/deficit tracking is
    /// intentionally not implemented, frozen by
    /// `NutritionCaloriesProductionRoute.test.js`.
    var targetLabel: String
    var weeklyTrend: [NutritionTrendPoint]
    var weeklyRows: [NutritionWeeklyCalorieRow]
    var dailyRows: [NutritionDailyCalorieRow]
}

struct NutritionWeeklyCalorieRow: Equatable, Identifiable {
    var id: String { weekStart }
    var weekStart: String
    var weekEnd: String
    var averageCalories: Double?
    var loggedDayCount: Int
}

struct NutritionDailyCalorieRow: Equatable, Identifiable {
    var id: String
    var date: String
    var calories: Double?
    var mealCount: Int
    var sourceLabels: [String]
}

// MARK: - Macros report

enum NutritionMacroKey: String, Codable, CaseIterable, Identifiable {
    case protein, carbohydrates, fat

    var id: String { rawValue }

    var label: String {
        switch self {
        case .protein: "Protein"
        case .carbohydrates: "Carbohydrates"
        case .fat: "Fat"
        }
    }
}

struct NutritionMacrosReport: Equatable {
    var selectedMacro: NutritionMacroKey
    var periodSummary: [NutritionReportSummaryItem]
    var targetLabel: String
    /// Always all 3 macros, period-wide — NOT affected by `selectedMacro`.
    var distribution: [NutritionMacroDistributionSlice]
    /// Always all 3 macros, period-wide — NOT affected by `selectedMacro`.
    var averageDailyMacros: [NutritionMacroAverageBar]
    /// Only the `selectedMacro`'s own weekly series.
    var weeklyTrend: [NutritionTrendPoint]
    var weeklyRows: [NutritionWeeklyMacroRow]
    var dailyRows: [NutritionDailyMacroRow]
}

/// A slice of the macro-distribution donut — shared by the Macros
/// report's own "Macro Distribution" card and the Meals report's "Meal
/// Macro Mix" card (`NutritionMacroDistributionChart` is reused
/// identically for both on the web).
struct NutritionMacroDistributionSlice: Equatable, Identifiable {
    var id: NutritionMacroKey
    var grams: Double
    var calories: Double
    /// Largest-remainder-rounded so the 3 slices sum to exactly 100.
    var percentage: Int
}

struct NutritionMacroAverageBar: Equatable, Identifiable {
    var id: NutritionMacroKey
    var averageGrams: Double
    var loggedDayCount: Int
}

struct NutritionWeeklyMacroRow: Equatable, Identifiable {
    var id: String { weekStart }
    var weekStart: String
    var weekEnd: String
    var averages: [NutritionMacroKey: Double]
    var loggedDayCount: Int
}

struct NutritionDailyMacroRow: Equatable, Identifiable {
    var id: String
    var date: String
    var macros: [NutritionMacroKey: Double]
    var mealCount: Int
}

// MARK: - Meals report

enum NutritionMealTrendMetric: String, CaseIterable, Identifiable {
    case calories, protein, carbohydrates, fat, mealCount

    var id: String { rawValue }

    var label: String {
        switch self {
        case .calories: "Calories"
        case .protein: "Protein"
        case .carbohydrates: "Carbohydrates"
        case .fat: "Fat"
        case .mealCount: "Meal Count"
        }
    }

    /// Appended to the selected-point detail value — `" kcal"` /
    /// `"g"` / `""`, matching `NutritionMealTrendChart.jsx`'s own
    /// per-metric unit.
    var unit: String {
        switch self {
        case .calories: " kcal"
        case .protein, .carbohydrates, .fat: "g"
        case .mealCount: ""
        }
    }
}

/// `"all"` + the 4 real slots — the Meals report's own slot filter
/// (distinct from `NutritionMealSlot`, which has no "all" case).
enum NutritionMealSlotFilter: String, CaseIterable, Identifiable, Equatable {
    case all, breakfast, lunch, dinner, snacks

    var id: String { rawValue }

    var label: String {
        switch self {
        case .all: "All"
        case .breakfast: "Breakfast"
        case .lunch: "Lunch"
        case .dinner: "Dinner"
        case .snacks: "Snacks"
        }
    }

    var slot: NutritionMealSlot? {
        switch self {
        case .all: nil
        case .breakfast: .breakfast
        case .lunch: .lunch
        case .dinner: .dinner
        case .snacks: .snacks
        }
    }
}

struct NutritionMealsReport: Equatable {
    var periodSummary: [NutritionReportSummaryItem]
    /// Always all 4 slots, period-wide.
    var distribution: [NutritionMealSlotAverage]
    var selectedMacroMixSlot: NutritionMealSlotFilter
    var macroMix: [NutritionMacroDistributionSlice]
    var selectedTrendSlot: NutritionMealSlotFilter
    var selectedTrendMetric: NutritionMealTrendMetric
    var weeklyTrend: [NutritionTrendPoint]
    var weeklyRows: [NutritionWeeklyMealRow]
    var recurringMeals: [NutritionRecurringMeal]
    /// Day-grouped, newest-first — each row's meals sorted by canonical
    /// slot order (breakfast → lunch → dinner → snacks).
    var historyGroups: [NutritionMealHistoryGroup]
}

struct NutritionMealSlotAverage: Equatable, Identifiable {
    var id: NutritionMealSlot
    var occurrenceCount: Int
    var averageCalories: Double?
}

struct NutritionWeeklyMealRow: Equatable, Identifiable {
    var id: String { weekStart }
    var weekStart: String
    var weekEnd: String
    var mealCount: Int
    var averageCaloriesPerMeal: Double?
    var loggedDayCount: Int
}

/// A repeated meal — same slot + same food signature (sorted, normalized
/// food-name join) appearing at least twice — `createRecurringMeals`.
struct NutritionRecurringMeal: Equatable, Identifiable {
    var id: String
    var name: String
    var slot: NutritionMealSlot
    var occurrenceCount: Int
    var averageCalories: Double?
    var lastEaten: String
}

struct NutritionMealHistoryGroup: Equatable, Identifiable {
    var id: String
    var date: String
    var mealCount: Int
    var dailyCalories: Double?
    var meals: [NutritionMealRecord]
    var dayId: String
}
