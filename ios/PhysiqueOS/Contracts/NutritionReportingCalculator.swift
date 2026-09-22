import Foundation

/// Reproduces `NutritionCaloriesReportingService`/`NutritionMacrosReportingService`/
/// `NutritionMealsReportingService` + their `*PresentationService` range/
/// macro/slot filtering siblings — pure functions over the same
/// `[NutritionDayRecord]` list `NutritionHistoryView`'s own scoped fetch
/// already produces, mirroring the web's own "one canonical `nutritionDays`
/// array, three report projections over it" architecture rather than a
/// second parallel fixture truth.
enum NutritionReportingCalculator {
    // MARK: - Shared: week bucketing, range filtering, extremes

    struct WeekBucket: Identifiable {
        var id: String { weekStart }
        var weekStart: String
        var weekEnd: String
        var days: [NutritionDayRecord]
    }

    /// Sunday–Saturday week buckets (`getCanonicalWeekStart`), ascending by
    /// week start. Only weeks with at least one logged day are produced —
    /// there is no fabricated empty-week padding.
    static func weekBuckets(days: [NutritionDayRecord]) -> [WeekBucket] {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = TimeZone(identifier: "UTC")

        func weekStart(_ dateString: String) -> Date? {
            guard let date = formatter.date(from: String(dateString.prefix(10))) else { return nil }
            let weekday = calendar.component(.weekday, from: date) // 1 = Sunday
            return calendar.date(byAdding: .day, value: -(weekday - 1), to: date)
        }

        var groups: [Date: [NutritionDayRecord]] = [:]
        for day in days {
            guard let key = weekStart(day.date) else { continue }
            groups[key, default: []].append(day)
        }

        return groups.keys.sorted().map { key in
            let end = calendar.date(byAdding: .day, value: 6, to: key) ?? key
            return WeekBucket(
                weekStart: formatter.string(from: key),
                weekEnd: formatter.string(from: end),
                days: (groups[key] ?? []).sorted { $0.date < $1.date }
            )
        }
    }

    /// The 5-way client-side range selector (`resolveLongRangeWindow`) —
    /// narrows to the last N calendar months counted back from the latest
    /// day's own date, or everything for `.all`.
    static func rangeFiltered(days: [NutritionDayRecord], range: EvidenceChartRange) -> [NutritionDayRecord] {
        guard let months = range.months, let latestDate = days.map(\.date).max() else { return days }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = TimeZone(identifier: "UTC")
        guard let latest = formatter.date(from: String(latestDate.prefix(10))),
              let cutoff = calendar.date(byAdding: .month, value: -months, to: latest) else { return days }
        let cutoffString = formatter.string(from: cutoff)
        return days.filter { $0.date >= cutoffString }
    }

    private static func extreme(_ days: [NutritionDayRecord], highest: Bool) -> NutritionDayRecord? {
        days.reduce(into: NutritionDayRecord?.none) { result, day in
            guard let dayCalories = day.totals.calories else { return }
            guard let current = result, let currentCalories = current.totals.calories else { result = day; return }
            if highest ? dayCalories > currentCalories : dayCalories < currentCalories { result = day }
        }
    }

    private static func formatCalories(_ value: Double?) -> String {
        guard let value, value.isFinite else { return "Pending" }
        return String(Int(value.rounded()))
    }

    private static func formatGrams(_ value: Double?) -> String {
        guard let value, value.isFinite else { return "Pending" }
        return "\(Int(value.rounded()))g"
    }

    // MARK: - Calories report

    static func caloriesReport(days: [NutritionDayRecord]) -> NutritionCaloriesReport {
        let loggedDays = days.filter { $0.totals.calories != nil }
        let average = loggedDays.isEmpty ? nil : loggedDays.compactMap(\.totals.calories).reduce(0, +) / Double(loggedDays.count)
        let lowest = extreme(days, highest: false)
        let highest = extreme(days, highest: true)

        let weeks = weekBuckets(days: days)
        let weeklyTrend = weeks.map { week -> NutritionTrendPoint in
            let logged = week.days.filter { $0.totals.calories != nil }
            let value = logged.isEmpty ? nil : logged.compactMap(\.totals.calories).reduce(0, +) / Double(logged.count)
            return NutritionTrendPoint(weekStart: week.weekStart, weekEnd: week.weekEnd, value: value, loggedDayCount: logged.count)
        }
        let weeklyRows = weeks.map { week -> NutritionWeeklyCalorieRow in
            let logged = week.days.filter { $0.totals.calories != nil }
            let average = logged.isEmpty ? nil : logged.compactMap(\.totals.calories).reduce(0, +) / Double(logged.count)
            return NutritionWeeklyCalorieRow(weekStart: week.weekStart, weekEnd: week.weekEnd, averageCalories: average, loggedDayCount: logged.count)
        }
        let dailyRows = days.map {
            NutritionDailyCalorieRow(id: $0.id, date: $0.date, calories: $0.totals.calories, mealCount: $0.meals.count, sourceLabels: $0.sourceEvidence)
        }

        return NutritionCaloriesReport(
            periodSummary: [
                NutritionReportSummaryItem(label: "Average Calories", value: formatCalories(average)),
                NutritionReportSummaryItem(label: "Logged Days", value: "\(loggedDays.count) of \(days.count) days logged"),
                NutritionReportSummaryItem(label: "Lowest Day", value: lowest.map { "\(formatCalories($0.totals.calories)) · \(TrainingDateFormatting.short($0.date))" } ?? "Pending"),
                NutritionReportSummaryItem(label: "Highest Day", value: highest.map { "\(formatCalories($0.totals.calories)) · \(TrainingDateFormatting.short($0.date))" } ?? "Pending"),
            ],
            targetLabel: "Target unavailable for this period",
            weeklyTrend: weeklyTrend,
            weeklyRows: weeklyRows,
            dailyRows: dailyRows
        )
    }

    // MARK: - Macros report

    private static func macroValue(_ totals: NutritionMacroTotals, _ macro: NutritionMacroKey) -> Double? {
        switch macro {
        case .protein: totals.proteinG
        case .carbohydrates: totals.carbsG
        case .fat: totals.fatG
        }
    }

    private static let caloriesPerGram: [NutritionMacroKey: Double] = [.protein: 4, .carbohydrates: 4, .fat: 9]

    /// Largest-remainder rounding so the 3 slices sum to exactly 100,
    /// matching `roundPercentagesToHundred`.
    static func macroDistribution(days: [NutritionDayRecord]) -> [NutritionMacroDistributionSlice] {
        var gramsByMacro: [NutritionMacroKey: Double] = [.protein: 0, .carbohydrates: 0, .fat: 0]
        for day in days {
            for macro in NutritionMacroKey.allCases {
                gramsByMacro[macro, default: 0] += macroValue(day.totals, macro) ?? 0
            }
        }
        let caloriesByMacro = NutritionMacroKey.allCases.reduce(into: [NutritionMacroKey: Double]()) { result, macro in
            result[macro] = (gramsByMacro[macro] ?? 0) * (caloriesPerGram[macro] ?? 0)
        }
        let totalCalories = caloriesByMacro.values.reduce(0, +)
        guard totalCalories > 0 else { return [] }

        let rawPercentages = NutritionMacroKey.allCases.map { macro in (macro, (caloriesByMacro[macro] ?? 0) / totalCalories * 100) }
        let floored = rawPercentages.map { ($0.0, Int($0.1.rounded(.down)), $0.1 - $0.1.rounded(.down)) }
        var remaining = 100 - floored.reduce(0) { $0 + $1.1 }
        var percentages = Dictionary(uniqueKeysWithValues: floored.map { ($0.0, $0.1) })
        for (macro, _, _) in floored.sorted(by: { $0.2 > $1.2 }) where remaining > 0 {
            percentages[macro, default: 0] += 1
            remaining -= 1
        }

        return NutritionMacroKey.allCases.map { macro in
            NutritionMacroDistributionSlice(id: macro, grams: gramsByMacro[macro] ?? 0, calories: caloriesByMacro[macro] ?? 0, percentage: percentages[macro] ?? 0)
        }
    }

    /// Per-macro logged-day divisors — a day missing `protein_g` doesn't
    /// count toward protein's own average denominator, matching the
    /// service test's own explicit assertion of this behavior.
    static func averageDailyMacros(days: [NutritionDayRecord]) -> [NutritionMacroAverageBar] {
        NutritionMacroKey.allCases.map { macro in
            let logged = days.compactMap { macroValue($0.totals, macro) }
            let average = logged.isEmpty ? 0 : logged.reduce(0, +) / Double(logged.count)
            return NutritionMacroAverageBar(id: macro, averageGrams: average, loggedDayCount: logged.count)
        }
    }

    static func macrosReport(days: [NutritionDayRecord], selectedMacro: NutritionMacroKey) -> NutritionMacrosReport {
        let logged = days.compactMap { day -> Double? in macroValue(day.totals, selectedMacro) }
        let average = logged.isEmpty ? nil : logged.reduce(0, +) / Double(logged.count)
        let daysWithMacro = days.filter { macroValue($0.totals, selectedMacro) != nil }
        let lowest = daysWithMacro.min { (macroValue($0.totals, selectedMacro) ?? 0) < (macroValue($1.totals, selectedMacro) ?? 0) }
        let highest = daysWithMacro.max { (macroValue($0.totals, selectedMacro) ?? 0) < (macroValue($1.totals, selectedMacro) ?? 0) }

        let weeks = weekBuckets(days: days)
        let weeklyTrend = weeks.map { week -> NutritionTrendPoint in
            let logged = week.days.compactMap { macroValue($0.totals, selectedMacro) }
            let value = logged.isEmpty ? nil : logged.reduce(0, +) / Double(logged.count)
            return NutritionTrendPoint(weekStart: week.weekStart, weekEnd: week.weekEnd, value: value, loggedDayCount: logged.count)
        }
        let weeklyRows = weeks.map { week -> NutritionWeeklyMacroRow in
            var averages: [NutritionMacroKey: Double] = [:]
            for macro in NutritionMacroKey.allCases {
                let values = week.days.compactMap { macroValue($0.totals, macro) }
                if !values.isEmpty { averages[macro] = values.reduce(0, +) / Double(values.count) }
            }
            return NutritionWeeklyMacroRow(weekStart: week.weekStart, weekEnd: week.weekEnd, averages: averages, loggedDayCount: week.days.count)
        }
        let dailyRows = days.map { day -> NutritionDailyMacroRow in
            var macros: [NutritionMacroKey: Double] = [:]
            for macro in NutritionMacroKey.allCases {
                if let value = macroValue(day.totals, macro) { macros[macro] = value }
            }
            return NutritionDailyMacroRow(id: day.id, date: day.date, macros: macros, mealCount: day.meals.count)
        }

        return NutritionMacrosReport(
            selectedMacro: selectedMacro,
            periodSummary: [
                NutritionReportSummaryItem(label: "Average per Logged Day", value: formatGrams(average)),
                NutritionReportSummaryItem(label: "Logged Days", value: "\(daysWithMacro.count) of \(days.count) days logged"),
                NutritionReportSummaryItem(label: "Lowest Day", value: lowest.map { "\(formatGrams(macroValue($0.totals, selectedMacro))) · \(TrainingDateFormatting.short($0.date))" } ?? "Pending"),
                NutritionReportSummaryItem(label: "Highest Day", value: highest.map { "\(formatGrams(macroValue($0.totals, selectedMacro))) · \(TrainingDateFormatting.short($0.date))" } ?? "Pending"),
            ],
            targetLabel: "Targets unavailable for this period",
            distribution: macroDistribution(days: days),
            averageDailyMacros: averageDailyMacros(days: days),
            weeklyTrend: weeklyTrend,
            weeklyRows: weeklyRows,
            dailyRows: dailyRows
        )
    }

    // MARK: - Meals report

    private static func allMeals(days: [NutritionDayRecord]) -> [(day: NutritionDayRecord, meal: NutritionMealRecord)] {
        days.flatMap { day in day.meals.map { (day, $0) } }
    }

    static func mealDistribution(days: [NutritionDayRecord]) -> [NutritionMealSlotAverage] {
        let meals = allMeals(days: days)
        return [NutritionMealSlot.breakfast, .lunch, .dinner, .snacks].map { slot in
            let slotMeals = meals.filter { $0.meal.slot == slot }
            let calorieValues = slotMeals.compactMap { $0.meal.totals.calories }
            let average = calorieValues.isEmpty ? nil : calorieValues.reduce(0, +) / Double(calorieValues.count)
            return NutritionMealSlotAverage(id: slot, occurrenceCount: slotMeals.count, averageCalories: average)
        }
    }

    static func mealMacroMix(days: [NutritionDayRecord], slotFilter: NutritionMealSlotFilter) -> [NutritionMacroDistributionSlice] {
        let meals = allMeals(days: days).map(\.meal).filter { slotFilter.slot == nil || $0.slot == slotFilter.slot }
        var gramsByMacro: [NutritionMacroKey: Double] = [.protein: 0, .carbohydrates: 0, .fat: 0]
        for meal in meals {
            gramsByMacro[.protein, default: 0] += meal.totals.proteinG ?? 0
            gramsByMacro[.carbohydrates, default: 0] += meal.totals.carbsG ?? 0
            gramsByMacro[.fat, default: 0] += meal.totals.fatG ?? 0
        }
        let caloriesByMacro = NutritionMacroKey.allCases.reduce(into: [NutritionMacroKey: Double]()) { result, macro in
            result[macro] = (gramsByMacro[macro] ?? 0) * (caloriesPerGram[macro] ?? 0)
        }
        let totalCalories = caloriesByMacro.values.reduce(0, +)
        guard totalCalories > 0 else { return [] }
        let rawPercentages = NutritionMacroKey.allCases.map { macro in (macro, (caloriesByMacro[macro] ?? 0) / totalCalories * 100) }
        let floored = rawPercentages.map { ($0.0, Int($0.1.rounded(.down)), $0.1 - $0.1.rounded(.down)) }
        var remaining = 100 - floored.reduce(0) { $0 + $1.1 }
        var percentages = Dictionary(uniqueKeysWithValues: floored.map { ($0.0, $0.1) })
        for (macro, _, _) in floored.sorted(by: { $0.2 > $1.2 }) where remaining > 0 {
            percentages[macro, default: 0] += 1
            remaining -= 1
        }
        return NutritionMacroKey.allCases.map { macro in
            NutritionMacroDistributionSlice(id: macro, grams: gramsByMacro[macro] ?? 0, calories: caloriesByMacro[macro] ?? 0, percentage: percentages[macro] ?? 0)
        }
    }

    static func mealTrend(days: [NutritionDayRecord], slotFilter: NutritionMealSlotFilter, metric: NutritionMealTrendMetric) -> [NutritionTrendPoint] {
        weekBuckets(days: days).map { week -> NutritionTrendPoint in
            let meals = allMeals(days: week.days).map(\.meal).filter { slotFilter.slot == nil || $0.slot == slotFilter.slot }
            let value: Double?
            switch metric {
            case .mealCount:
                value = meals.isEmpty ? nil : Double(meals.count)
            case .calories:
                let values = meals.compactMap(\.totals.calories)
                value = values.isEmpty ? nil : values.reduce(0, +) / Double(values.count)
            case .protein:
                let values = meals.compactMap(\.totals.proteinG)
                value = values.isEmpty ? nil : values.reduce(0, +) / Double(values.count)
            case .carbohydrates:
                let values = meals.compactMap(\.totals.carbsG)
                value = values.isEmpty ? nil : values.reduce(0, +) / Double(values.count)
            case .fat:
                let values = meals.compactMap(\.totals.fatG)
                value = values.isEmpty ? nil : values.reduce(0, +) / Double(values.count)
            }
            return NutritionTrendPoint(weekStart: week.weekStart, weekEnd: week.weekEnd, value: value, loggedDayCount: week.days.count)
        }
    }

    /// Groups meals by `"{slot}:{signature}"` (signature = sorted,
    /// lowercased food-name join) and keeps only groups with ≥2 exact
    /// occurrences, sorted by occurrence count descending then most-recent.
    static func recurringMeals(days: [NutritionDayRecord]) -> [NutritionRecurringMeal] {
        struct Group { var slot: NutritionMealSlot; var name: String; var occurrences: [(date: String, meal: NutritionMealRecord)] }
        var groups: [String: Group] = [:]
        for day in days {
            for meal in day.meals {
                let signature = meal.foods.map { $0.name.lowercased() }.sorted().joined(separator: "|")
                guard !signature.isEmpty else { continue }
                let key = "\(meal.slot.rawValue):\(signature)"
                let displayName = meal.name ?? meal.foods.map(\.name).joined(separator: ", ")
                groups[key, default: Group(slot: meal.slot, name: displayName, occurrences: [])].occurrences.append((day.date, meal))
            }
        }
        return groups.values
            .filter { $0.occurrences.count >= 2 }
            .map { group -> NutritionRecurringMeal in
                let calorieValues = group.occurrences.compactMap { $0.meal.totals.calories }
                let average = calorieValues.isEmpty ? nil : calorieValues.reduce(0, +) / Double(calorieValues.count)
                func macroAverage(_ values: [Double]) -> Double? {
                    values.isEmpty ? nil : values.reduce(0, +) / Double(values.count)
                }
                let lastEaten = group.occurrences.map(\.date).max() ?? ""
                return NutritionRecurringMeal(
                    id: "\(group.slot.rawValue):\(group.name)",
                    name: group.name, slot: group.slot,
                    occurrenceCount: group.occurrences.count,
                    averageCalories: average,
                    averageProteinG: macroAverage(group.occurrences.compactMap { $0.meal.totals.proteinG }),
                    averageCarbohydratesG: macroAverage(group.occurrences.compactMap { $0.meal.totals.carbsG }),
                    averageFatG: macroAverage(group.occurrences.compactMap { $0.meal.totals.fatG }),
                    lastEaten: lastEaten
                )
            }
            .sorted { $0.occurrenceCount != $1.occurrenceCount ? $0.occurrenceCount > $1.occurrenceCount : $0.lastEaten > $1.lastEaten }
    }

    /// Newest-first, each group's meals sorted breakfast → lunch → dinner
    /// → snacks then insertion order.
    static func historyGroups(days: [NutritionDayRecord]) -> [NutritionMealHistoryGroup] {
        let slotOrder: [NutritionMealSlot: Int] = [.breakfast: 0, .lunch: 1, .dinner: 2, .snacks: 3]
        return days
            .sorted { $0.date > $1.date }
            .map { day in
                NutritionMealHistoryGroup(
                    id: day.id, date: day.date, mealCount: day.meals.count, dailyCalories: day.totals.calories,
                    meals: day.meals.sorted { (slotOrder[$0.slot] ?? 9) < (slotOrder[$1.slot] ?? 9) },
                    dayId: day.id
                )
            }
    }

    static func weeklyMealRows(days: [NutritionDayRecord]) -> [NutritionWeeklyMealRow] {
        weekBuckets(days: days).map { week in
            let meals = allMeals(days: week.days).map(\.meal)
            let calorieValues = meals.compactMap(\.totals.calories)
            let average = calorieValues.isEmpty ? nil : calorieValues.reduce(0, +) / Double(calorieValues.count)
            let slots: [NutritionMealSlot] = [.breakfast, .lunch, .dinner, .snacks]
            let breakdown = slots.map { slot -> NutritionWeeklyMealSlotBreakdown in
                let slotMeals = meals.filter { $0.slot == slot }
                let values = slotMeals.compactMap(\.totals.calories)
                return NutritionWeeklyMealSlotBreakdown(
                    slot: slot,
                    occurrenceCount: slotMeals.count,
                    averageCalories: values.isEmpty ? nil : values.reduce(0, +) / Double(values.count)
                )
            }
            return NutritionWeeklyMealRow(
                weekStart: week.weekStart,
                weekEnd: week.weekEnd,
                mealCount: meals.count,
                averageCaloriesPerMeal: average,
                loggedDayCount: week.days.count,
                slots: breakdown
            )
        }
    }

    static func mealsReport(days: [NutritionDayRecord], macroMixSlot: NutritionMealSlotFilter, trendSlot: NutritionMealSlotFilter, trendMetric: NutritionMealTrendMetric) -> NutritionMealsReport {
        let meals = allMeals(days: days)
        // A day that carries daily totals but no meal objects (an Apple Health daily
        // total, for example) is a valid day without meal detail, not a day on which
        // zero meals were eaten, so it does not lower the per-day meal average.
        let mealCountsPerDay = days.filter { !$0.meals.isEmpty }.map { Double($0.meals.count) }
        let averageMealsPerDay = mealCountsPerDay.isEmpty ? nil : mealCountsPerDay.reduce(0, +) / Double(mealCountsPerDay.count)
        let bySlotCount = Dictionary(grouping: meals) { $0.meal.slot }.mapValues(\.count)
        let mostCommonSlot = bySlotCount.max { $0.value < $1.value }?.key
        let calorieValues = meals.compactMap { $0.meal.totals.calories }
        let averageCaloriesPerMeal = calorieValues.isEmpty ? nil : calorieValues.reduce(0, +) / Double(calorieValues.count)

        return NutritionMealsReport(
            periodSummary: [
                NutritionReportSummaryItem(label: "Average Meals per Logged Day", value: averageMealsPerDay.map { String(format: "%.1f", $0) } ?? "Pending"),
                NutritionReportSummaryItem(label: "Most Common Meal Slot", value: mostCommonSlot?.label ?? "Pending"),
                NutritionReportSummaryItem(label: "Average Calories per Meal", value: formatCalories(averageCaloriesPerMeal)),
                NutritionReportSummaryItem(label: "Logged Days", value: "\(days.count) days"),
            ],
            distribution: mealDistribution(days: days),
            selectedMacroMixSlot: macroMixSlot,
            macroMix: mealMacroMix(days: days, slotFilter: macroMixSlot),
            selectedTrendSlot: trendSlot,
            selectedTrendMetric: trendMetric,
            weeklyTrend: mealTrend(days: days, slotFilter: trendSlot, metric: trendMetric),
            weeklyRows: weeklyMealRows(days: days),
            recurringMeals: recurringMeals(days: days),
            historyGroups: historyGroups(days: days)
        )
    }
}
