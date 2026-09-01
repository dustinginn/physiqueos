import Foundation
import PDFKit
import UIKit
import Vision

/// Local, read/compute-only interpretation for the Native sandbox. It uses
/// the selected bytes, OCR text, PDF text, and typed details; it never
/// substitutes demonstration values and never writes to a server.
enum EvidenceLocalInterpretation {
    static func prepare(_ draft: EvidenceIntakeDraft) async -> EvidenceIntakeDraft {
        var prepared = draft
        prepared.attachments = []
        prepared.attachments.reserveCapacity(draft.attachments.count)
        for attachment in draft.attachments {
            prepared.attachments.append(await prepare(attachment))
        }
        applyExtractedDEXAValues(to: &prepared)
        return prepared
    }

    static func prepare(_ attachment: SandboxAttachment) async -> SandboxAttachment {
        guard attachment.extractedText == nil, let data = attachment.data else { return attachment }
        var prepared = attachment
        if attachment.isPDF {
            prepared.extractedText = PDFDocument(data: data)?.string?.trimmingCharacters(in: .whitespacesAndNewlines)
        } else if attachment.contentType == "text/plain" {
            prepared.extractedText = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines)
        } else if attachment.isImage {
            prepared.extractedText = await recognizeText(in: data)
        }
        return prepared
    }

    static func buildReview(
        id: String,
        draft: EvidenceIntakeDraft,
        scenario: EvidenceFixtureScenario,
        trainingCatalog: [TrainingLoggerCatalogExercise] = TrainingExerciseCatalogLoader.loadExercises()
    ) -> Result<LocalEvidenceReview, LoggingSandboxError> {
        let categories: [EvidenceCategory]
        if scenario == .mixed {
            categories = EvidenceSandboxRouter.detectedCategories(for: draft)
        } else if let category = scenario.category {
            categories = [category]
        } else {
            categories = EvidenceSandboxRouter.detectedCategories(for: draft)
        }
        guard !categories.isEmpty else {
            return .failure(.init(message: "Choose an evidence type so this upload can be reviewed."))
        }

        var items: [EvidenceReviewItem] = []
        for category in categories {
            items.append(contentsOf: reviewItems(for: category, draft: draft, trainingCatalog: trainingCatalog))
        }
        guard !items.isEmpty else {
            return .failure(.init(message: "No reviewable information was found. Choose a type or add details, then try again."))
        }

        let unresolved = items.contains { !$0.hasRequiredValues }
        let imageOnlyProgressPhotoSuggestion = draft.scenario == .automatic && scenario == .progressPhotos
        return .success(.init(
            id: id,
            sourceAssets: draft.attachments,
            typedDetails: draft.details,
            items: items,
            status: .awaitingConfirmation,
            interpretationMessage: imageOnlyProgressPhotoSuggestion
                ? "These image-only files may be Progress Photos. Confirm each pose and the shared session details before saving."
                : unresolved
                    ? "Some values could not be read. Review and complete the highlighted fields before saving."
                    : nil
        ))
    }

    static func defaultPhotoIdentities(for attachments: [SandboxAttachment]) -> [ProgressPhotoIdentityDraft] {
        attachments.filter(\.isImage).map { attachment in
            .init(
                id: "pose-\(attachment.id)",
                attachmentId: attachment.id,
                orientation: .unconfirmed,
                contraction: .unconfirmed,
                poseVariant: .standard,
                customLabel: "",
                goalRole: .supporting,
                tags: "",
                confirmed: false
            )
        }
    }

    static func applyExtractedDEXAValues(to draft: inout EvidenceIntakeDraft) {
        let text = draft.submittedText
        guard !text.isEmpty else { return }
        fill(&draft.dexa.totalMass, from: text, labels: ["total mass", "weight"])
        fill(&draft.dexa.bodyFatPercentage, from: text, labels: ["body fat", "body fat percentage"])
        fill(&draft.dexa.fatMass, from: text, labels: ["fat tissue", "fat mass"])
        fill(&draft.dexa.leanMass, from: text, labels: ["lean tissue", "lean mass"])
        fill(&draft.dexa.boneMineralContent, from: text, labels: ["bone mineral content", "bmc"])
        fill(&draft.dexa.restingMetabolicRate, from: text, labels: ["resting metabolic rate", "rmr"])
        fill(&draft.dexa.vatMass, from: text, labels: ["vat mass"])
        fill(&draft.dexa.vatVolume, from: text, labels: ["vat volume"])
    }

    private static func reviewItems(
        for category: EvidenceCategory,
        draft: EvidenceIntakeDraft,
        trainingCatalog: [TrainingLoggerCatalogExercise]
    ) -> [EvidenceReviewItem] {
        switch category {
        case .training: trainingItems(draft, catalog: trainingCatalog)
        case .nutrition: [nutritionItem(draft)]
        case .weight: [weightItem(draft)]
        case .activity: [activityItem(draft)]
        case .dexa: [dexaItem(draft)]
        case .progressPhotos: [photoItem(draft)]
        case .labs: [labsItem(draft)]
        case .recovery: [recoveryItem(draft)]
        case .generic: [genericItem(draft)]
        }
    }

    private static func trainingItems(
        _ draft: EvidenceIntakeDraft,
        catalog: [TrainingLoggerCatalogExercise] = TrainingExerciseCatalogLoader.loadExercises()
    ) -> [EvidenceReviewItem] {
        var items: [EvidenceReviewItem] = []
        let exercises = parseExercises(draft.submittedText, catalog: catalog)
        if !exercises.isEmpty {
            let strengthText = draft.attachments.compactMap(\.extractedText).first(where: isStrengthText)
            items.append(.init(
                id: "strength-\(UUID().uuidString)",
                category: .training,
                title: strengthText.map(strengthTitle) ?? "Traditional Strength Training",
                occurrenceDate: draft.occurrenceDate,
                fields: strengthText.map { workoutMetricFields($0, includeDistance: false) } ?? [],
                exercises: exercises
            ))
        }

        var cardioTexts = draft.attachments.compactMap { attachment -> (String, String)? in
            guard let text = attachment.extractedText, isCardioText(text) else { return nil }
            return (attachment.id, text)
        }
        if cardioTexts.isEmpty, isCardioText(draft.details) {
            cardioTexts = [("typed-cardio", draft.details)]
        }
        for (index, entry) in cardioTexts.enumerated() {
            items.append(cardioItem(id: "cardio-\(entry.0)-\(index)", text: entry.1, date: draft.occurrenceDate))
        }

        if items.isEmpty {
            items.append(.init(
                id: "training-\(UUID().uuidString)",
                category: .training,
                title: "Training",
                occurrenceDate: draft.occurrenceDate,
                fields: [field("details", "Workout details", draft.submittedText, required: true)]
            ))
        }
        return items
    }

    /// Preserves exercise-block boundaries before attempting canonical
    /// resolution — each typed heading becomes its own occurrence the
    /// instant it is recognized as a heading, independent of whether its
    /// name later resolves against `catalog`. A heading is recognized
    /// structurally (the next content line reads as a set) rather than by
    /// a closed keyword list, so a real but uncatalogued exercise name
    /// (e.g. "Pull ups", which contains no configured keyword substring)
    /// still opens its own block instead of silently falling through and
    /// letting its sets bleed into whatever exercise preceded it. This is
    /// the fix for the real Founder-reported failure: "Pull ups" typed
    /// after "Bicep curls" previously matched no heading signal at all, so
    /// its four sets were appended to the still-active "Bicep curls"
    /// block, producing a false 8-set Bicep Curls summary instead of two
    /// distinct 4-set occurrences.
    private static func parseExercises(
        _ text: String,
        catalog: [TrainingLoggerCatalogExercise] = TrainingExerciseCatalogLoader.loadExercises()
    ) -> [EvidenceReviewExercise] {
        let lines = text.components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        var order: [String] = []
        var setsByExercise: [String: [EvidenceReviewSet]] = [:]
        var displayNames: [String: String] = [:]
        var variantsByExercise: [String: String] = [:]
        var current: String?

        for (index, line) in lines.enumerated() {
            if let inline = capture(#"^(.+?)\s+(\d+(?:\.\d+)?)\s*(?:p|lb|lbs|pounds?)\s+(\d+(?:\.\d+)?)\s*(?:r|reps?)\s*[x×]\s*(\d+)\s*$"#, in: line), inline.count >= 5 {
                appendExercise(inline[1], load: inline[2], reps: inline[3], count: inline[4], order: &order, sets: &setsByExercise, names: &displayNames, variants: &variantsByExercise)
                current = normalizeExercise(splitVariant(inline[1]).base)
                continue
            }
            if let metric = capture(#"^(\d+(?:\.\d+)?)\s*(?:p|lb|lbs|pounds?)\s+(\d+(?:\.\d+)?)\s*(?:r|reps?)\s*[x×]\s*(\d+)\s*$"#, in: line), metric.count >= 4, let current {
                appendSets(load: metric[1], reps: metric[2], count: metric[3], to: current, sets: &setsByExercise)
                continue
            }
            if let metric = capture(#"^(\d+(?:\.\d+)?)\s*(?:r|reps?)\s+(\d+(?:\.\d+)?)\s*(?:p|lb|lbs|pounds?)\s*[x×]\s*(\d+)\s*$"#, in: line), metric.count >= 4, let current {
                appendSets(load: metric[2], reps: metric[1], count: metric[3], to: current, sets: &setsByExercise)
                continue
            }
            if let metric = capture(#"^(\d+)\s*(?:sets?|x)\s*(?:of\s*)?(\d+(?:\.\d+)?)\s*(?:reps?|r)?\s*(?:@|at|with)?\s*#?(\d+(?:\.\d+)?)\s*(?:lb|lbs|p|pounds?)?\s*$"#, in: line), metric.count >= 4, let current {
                appendSets(load: metric[3], reps: metric[2], count: metric[1], to: current, sets: &setsByExercise)
                continue
            }
            let nextLine = lines.indices.contains(index + 1) ? lines[index + 1] : nil
            if looksLikeExerciseHeading(line, nextLine: nextLine) {
                let (base, variant) = splitVariant(line)
                let key = normalizeExercise(base)
                current = key
                if !order.contains(key) { order.append(key) }
                displayNames[key] = displayExerciseName(base)
                if let variant { variantsByExercise[key] = variant }
                setsByExercise[key, default: []] = setsByExercise[key, default: []]
            }
        }

        return order.compactMap { key in
            guard let sets = setsByExercise[key], !sets.isEmpty else { return nil }
            let name = displayNames[key] ?? key.capitalized
            let resolution = resolveCanonicalExercise(name: name, catalog: catalog)
            return .init(
                id: "exercise-\(key.replacingOccurrences(of: " ", with: "-"))",
                name: resolution?.name ?? name,
                variant: variantsByExercise[key],
                relationship: nil,
                sets: sets,
                canonicalExerciseId: resolution?.canonicalExerciseId,
                isProvisional: resolution == nil
            )
        }
    }

    /// Case-insensitive exact match against the same catalog Workout
    /// Logger resolves exercises against — the only matching strategy the
    /// native catalog itself supports today (it carries no alias map).
    /// Returns `nil` (never a fabricated identity) when no catalog entry's
    /// name matches.
    private static func resolveCanonicalExercise(
        name: String,
        catalog: [TrainingLoggerCatalogExercise]
    ) -> TrainingLoggerCatalogExercise? {
        catalog.first { $0.name.caseInsensitiveCompare(name) == .orderedSame }
    }

    /// Splits a trailing parenthetical off an exercise heading as its
    /// execution variant — freeform captured text, matching
    /// `TrainingExecutionVariant`'s own documented model ("Static Hold",
    /// "3-Second Pause" are real examples; variants are not a closed set).
    /// The base exercise name (before the parenthetical) is what gets
    /// resolved against the catalog; the variant is preserved verbatim
    /// regardless of whether it matches a previously seen variant label.
    private static func splitVariant(_ line: String) -> (base: String, variant: String?) {
        guard let match = capture(#"^(.+?)\s*\(([^()]+)\)\s*$"#, in: line), match.count >= 3 else {
            return (line, nil)
        }
        return (match[1], match[2])
    }

    /// A line reads as a set-shorthand entry independent of any exercise
    /// name preceding it — the load-first, reps-first, and "N sets of M
    /// reps at W" continuation forms `parseExercises` already recognizes.
    /// Used only for one-line lookahead when deciding whether the
    /// *previous* line was an exercise heading.
    private static func isSetShorthandLine(_ line: String) -> Bool {
        capture(#"^(\d+(?:\.\d+)?)\s*(?:p|lb|lbs|pounds?)\s+(\d+(?:\.\d+)?)\s*(?:r|reps?)\s*[x×]\s*(\d+)\s*$"#, in: line) != nil ||
        capture(#"^(\d+(?:\.\d+)?)\s*(?:r|reps?)\s+(\d+(?:\.\d+)?)\s*(?:p|lb|lbs|pounds?)\s*[x×]\s*(\d+)\s*$"#, in: line) != nil ||
        capture(#"^(\d+)\s*(?:sets?|x)\s*(?:of\s*)?(\d+(?:\.\d+)?)\s*(?:reps?|r)?\s*(?:@|at|with)?\s*#?(\d+(?:\.\d+)?)\s*(?:lb|lbs|p|pounds?)?\s*$"#, in: line) != nil
    }

    private static func appendExercise(
        _ name: String,
        load: String,
        reps: String,
        count: String,
        order: inout [String],
        sets: inout [String: [EvidenceReviewSet]],
        names: inout [String: String],
        variants: inout [String: String]
    ) {
        let (base, variant) = splitVariant(name)
        let key = normalizeExercise(base)
        if !order.contains(key) { order.append(key) }
        names[key] = displayExerciseName(base)
        if let variant { variants[key] = variant }
        appendSets(load: load, reps: reps, count: count, to: key, sets: &sets)
    }

    private static func appendSets(load: String, reps: String, count: String, to key: String, sets: inout [String: [EvidenceReviewSet]]) {
        let setCount = min(max(Int(count) ?? 1, 1), 20)
        for _ in 0..<setCount {
            let index = sets[key, default: []].count + 1
            let cleanReps = cleanNumber(reps)
            let cleanLoad = cleanNumber(load)
            sets[key, default: []].append(.init(
                id: "\(key)-set-\(index)",
                summary: "\(cleanReps) reps @ \(cleanLoad) lb",
                reps: cleanReps,
                load: cleanLoad,
                unit: "lb"
            ))
        }
    }

    private static func cardioItem(id: String, text: String, date: Date) -> EvidenceReviewItem {
        let title = cardioTitle(text)
        return .init(
            id: id,
            category: .training,
            title: title,
            occurrenceDate: date,
            fields: workoutMetricFields(text, includeDistance: true)
        )
    }

    private static func workoutMetricFields(_ text: String, includeDistance: Bool) -> [EvidenceReviewField] {
        var fields: [EvidenceReviewField] = []
        if let duration = firstDuration(in: text, labels: ["workout time", "duration"]) {
            fields.append(field("duration", "Workout time", duration, required: false))
        }
        fields.append(contentsOf: compact([
            numericField("activeCalories", "Active calories", text, labels: ["active calories", "active energy"], unit: "cal", required: false),
            numericField("totalCalories", "Total calories", text, labels: ["total calories"], unit: "cal", required: false),
            numericField("heartRate", "Average heart rate", text, labels: ["average heart rate", "avg heart rate", "avg. heart rate"], unit: "bpm", required: false),
            includeDistance ? numericField("distance", "Distance", text, labels: ["distance"], unit: distanceUnit(text), required: false) : nil,
        ]))
        return fields
    }

    private static func nutritionItem(_ draft: EvidenceIntakeDraft) -> EvidenceReviewItem {
        let text = draft.submittedText
        let meals = parseMeals(text)
        let scope = nutritionScope(text: text, meals: meals)
        let totals = scope == .meal
            ? labeledNutritionTotals(in: text)
            : resolvedDailyNutritionTotals(from: draft)
        let fields = [
            field("calories", "Calories", totals.calories.map(formatNutritionNumber) ?? "", "cal", required: false),
            field("protein", "Protein", totals.protein.map(formatNutritionNumber) ?? "", "g", required: false),
            field("carbs", "Carbohydrates", totals.carbohydrates.map(formatNutritionNumber) ?? "", "g", required: false),
            field("fat", "Fat", totals.fat.map(formatNutritionNumber) ?? "", "g", required: false),
        ]
        return .init(
            id: "nutrition-\(UUID().uuidString)",
            category: .nutrition,
            title: "Nutrition",
            occurrenceDate: draft.occurrenceDate,
            fields: fields,
            meals: meals,
            nutritionScope: scope
        )
    }

    private static func weightItem(_ draft: EvidenceIntakeDraft) -> EvidenceReviewItem {
        let text = draft.submittedText
        let value = firstNumber(in: text, labels: ["morning weight", "body weight", "weight", "weighed in"]) ?? capture(#"(?m)^\s*(\d{2,3}(?:\.\d+)?)\s*(?:lb|lbs|kg)\s*$"#, in: text)?.dropFirst().first
        let unit = text.range(of: #"\bkg\b"#, options: [.regularExpression, .caseInsensitive]) == nil ? "lb" : "kg"
        return .init(id: "weight-\(UUID().uuidString)", category: .weight, title: "Weight", occurrenceDate: draft.occurrenceDate, fields: [field("weight", "Weight", value.map(cleanNumber) ?? "", unit)])
    }

    private static func activityItem(_ draft: EvidenceIntakeDraft) -> EvidenceReviewItem {
        let text = draft.submittedText
        return .init(id: "activity-\(UUID().uuidString)", category: .activity, title: "Activity", occurrenceDate: draft.occurrenceDate, fields: [
            numericField("activeCalories", "Active calories", text, labels: ["active calories", "move"], unit: "cal", required: false) ?? field("activeCalories", "Active calories", "", "cal", required: false),
            numericField("exerciseMinutes", "Exercise", text, labels: ["exercise minutes", "exercise"], unit: "min", required: false) ?? field("exerciseMinutes", "Exercise", "", "min", required: false),
            activityStepsField(text) ?? field("steps", "Steps", "", "steps", required: false),
            numericField("duration", "Stand", text, labels: ["stand hours", "stand"], unit: "hr", required: false) ?? field("duration", "Stand", "", "hr", required: false),
        ])
    }

    private static func dexaItem(_ draft: EvidenceIntakeDraft) -> EvidenceReviewItem {
        let value = draft.dexa
        return .init(id: "dexa-\(UUID().uuidString)", category: .dexa, title: "DEXA", occurrenceDate: draft.occurrenceDate, fields: [
            field("totalMass", "Total mass", value.totalMass, "lb"),
            field("bodyFat", "Body fat", value.bodyFatPercentage, "%"),
            field("fatMass", "Fat tissue", value.fatMass, "lb"),
            field("leanMass", "Lean tissue", value.leanMass, "lb"),
            field("boneMineral", "Bone mineral", value.boneMineralContent, "lb", required: false),
            field("rmr", "RMR", value.restingMetabolicRate, "kcal", required: false),
            field("vatMass", "VAT mass", value.vatMass, "lb", required: false),
            field("vatVolume", "VAT volume", value.vatVolume, "in³", required: false),
        ])
    }

    private static func photoItem(_ draft: EvidenceIntakeDraft) -> EvidenceReviewItem {
        let identities = draft.photoIdentities.isEmpty ? defaultPhotoIdentities(for: draft.attachments) : draft.photoIdentities
        return .init(id: "photos-\(UUID().uuidString)", category: .progressPhotos, title: "Progress Photos", occurrenceDate: draft.occurrenceDate, fields: [
            field("timeOfDay", "Time of day", draft.photoSession.timeOfDay?.label ?? "", required: true),
            field("fasted", "Fasted", draft.photoSession.fasted.map { $0 ? "Yes" : "No" } ?? "", required: true),
            field("postWorkout", "Post-workout", draft.photoSession.postWorkout.map { $0 ? "Yes" : "No" } ?? "", required: false),
            field("pump", "Pump", draft.photoSession.pump.map { $0 ? "Present" : "None" } ?? "", required: false),
            field("originalUnedited", "Original photos", draft.photoSession.originalUnedited ? "Confirmed" : "", required: true),
        ], photoIdentities: identities)
    }

    private static func labsItem(_ draft: EvidenceIntakeDraft) -> EvidenceReviewItem {
        let text = draft.submittedText
        var fields: [EvidenceReviewField] = []
        if let hemoglobin = numericField("hemoglobin", "Hemoglobin", text, labels: ["hemoglobin"], unit: "g/dL", required: false) { fields.append(hemoglobin) }
        if let cholesterol = numericField("cholesterol", "Total cholesterol", text, labels: ["total cholesterol"], unit: "mg/dL", required: false) { fields.append(cholesterol) }
        if fields.isEmpty { fields = [field("details", "Lab details", text, required: true)] }
        return .init(id: "labs-\(UUID().uuidString)", category: .labs, title: "Lab Panel", occurrenceDate: draft.occurrenceDate, fields: fields)
    }

    private static func recoveryItem(_ draft: EvidenceIntakeDraft) -> EvidenceReviewItem {
        let text = draft.submittedText
        var fields = compact([
            numericField("sleep", "Sleep", text, labels: ["time asleep", "sleep"], unit: "hr", required: false),
            numericField("hrv", "HRV", text, labels: ["hrv", "heart rate variability"], unit: "ms", required: false),
            numericField("readiness", "Readiness", text, labels: ["readiness", "recovery score"], unit: nil, required: false),
        ])
        if fields.isEmpty { fields = [field("details", "Recovery details", text, required: true)] }
        return .init(id: "recovery-\(UUID().uuidString)", category: .recovery, title: "Recovery", occurrenceDate: draft.occurrenceDate, fields: fields)
    }

    private static func genericItem(_ draft: EvidenceIntakeDraft) -> EvidenceReviewItem {
        .init(id: "evidence-\(UUID().uuidString)", category: .generic, title: "Evidence", occurrenceDate: draft.occurrenceDate, fields: [field("description", "Details", draft.submittedText, required: true)])
    }

    private static func parseMeals(_ text: String) -> [EvidenceReviewMeal] {
        let lines = text.components(separatedBy: .newlines).map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        let mealNames = ["breakfast", "lunch", "dinner", "snack", "snacks"]
        var result: [EvidenceReviewMeal] = []
        for (index, line) in lines.enumerated() where mealNames.contains(line.lowercased()) {
            var foods: [EvidenceReviewFood] = []
            for candidate in lines.dropFirst(index + 1) {
                if mealNames.contains(candidate.lowercased()) { break }
                if candidate.isEmpty || isNutritionSummaryHeader(candidate) { continue }
                if isNutritionInterfaceChrome(candidate) { continue }
                if isMealSummaryLine(candidate) { continue }
                guard candidate.count >= 3, candidate.count <= 80, candidate.rangeOfCharacter(from: .letters) != nil else { continue }
                foods.append(.init(id: "food-\(index)-\(foods.count)", name: candidate, detail: "From submitted evidence", calories: nil))
                if foods.count == 8 { break }
            }
            result.append(.init(id: "meal-\(index)", name: line.capitalized, summary: foods.isEmpty ? "No food details were read" : "\(foods.count) food\(foods.count == 1 ? "" : "s") read", foods: foods))
        }
        return result
    }

    private static func nutritionScope(text: String, meals: [EvidenceReviewMeal]) -> NutritionEvidenceScope {
        if meals.count > 1 || text.range(
            of: #"\b(daily (?:summary|totals?|nutrition)|nutrition day|food diary|day view|total macros?)\b"#,
            options: [.regularExpression, .caseInsensitive]
        ) != nil {
            return .fullDay
        }
        if meals.count == 1 || text.range(
            of: #"\b(breakfast|lunch|dinner|snacks?|meal)\b"#,
            options: [.regularExpression, .caseInsensitive]
        ) != nil {
            return .meal
        }
        return .unknown
    }

    private static func numericField(_ id: String, _ label: String, _ text: String, labels: [String], unit: String?, required: Bool = true) -> EvidenceReviewField? {
        guard let value = firstNumber(in: text, labels: labels) else { return nil }
        return field(id, label, cleanNumber(value), unit, required: required)
    }

    private struct NutritionTotals {
        var calories: Double?
        var carbohydrates: Double?
        var fat: Double?
        var protein: Double?

        var populatedCount: Int {
            [calories, carbohydrates, fat, protein].compactMap { $0 }.count
        }
    }

    /// Resolve each daily metric from a recognized recap first. Only when no
    /// recap supplies that metric may a complete set of Breakfast/Lunch/
    /// Dinner/Snacks summaries provide the fallback. Food rows never
    /// participate in daily arithmetic.
    private static func resolvedDailyNutritionTotals(from draft: EvidenceIntakeDraft) -> NutritionTotals {
        let sources = ([draft.details] + draft.attachments.compactMap(\.extractedText))
            .filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        let recap = sources.compactMap(explicitDailyRecapTotals)
            .max { $0.populatedCount < $1.populatedCount } ?? .init()
        let meals = mealDerivedDailyTotals(from: sources)
        return .init(
            calories: recap.calories ?? meals.calories,
            carbohydrates: recap.carbohydrates ?? meals.carbohydrates,
            fat: recap.fat ?? meals.fat,
            protein: recap.protein ?? meals.protein
        )
    }

    private static func explicitDailyRecapTotals(in text: String) -> NutritionTotals? {
        if let table = myFitnessPalTableTotals(in: text) { return table }
        let normalized = normalizedNutritionText(text)
        let hasMealHeading = text.components(separatedBy: .newlines).contains {
            ["breakfast", "lunch", "dinner", "snack", "snacks"].contains(normalizedNutritionText($0))
        }
        let hasDailyContext = normalized.range(
            of: #"\b(daily (?:recap|summary|totals?|nutrition)|nutrition day|food diary|day view)\b"#,
            options: .regularExpression
        ) != nil
        let totals = labeledNutritionTotals(in: text)
        guard hasDailyContext || (!hasMealHeading && totals.populatedCount == 4) else { return nil }
        return totals.populatedCount > 0 ? totals : nil
    }

    private static func labeledNutritionTotals(in text: String) -> NutritionTotals {
        .init(
            calories: nutritionNumber(in: text, labels: ["calories", "total calories", "daily calories", "calories consumed"]),
            carbohydrates: nutritionNumber(in: text, labels: ["carbohydrates", "carbs"]),
            fat: nutritionNumber(in: text, labels: ["total fat", "fat"]),
            protein: nutritionNumber(in: text, labels: ["protein"])
        )
    }

    private static func nutritionNumber(in text: String, labels: [String]) -> Double? {
        let value = firstNumber(in: text, labels: labels)
            ?? firstNumberFollowingNutritionLabel(in: text, labels: labels)
        return value.flatMap(groupedNumber)
    }

    private static func firstNumberFollowingNutritionLabel(in text: String, labels: [String]) -> String? {
        let lines = text.components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        let normalizedLabels = Set(labels.map(normalizedNutritionText))
        for (index, line) in lines.enumerated() where normalizedLabels.contains(normalizedNutritionText(line)) {
            guard lines.indices.contains(index + 1) else { continue }
            let next = lines[index + 1]
            if let match = capture(#"^\s*(\d[\d,]*(?:\.\d+)?)\s*(?:g|cal|kcal)?\s*$"#, in: next), match.count > 1 {
                return match[1]
            }
        }
        return nil
    }

    /// Vision can preserve the MyFitnessPal recap as four column labels
    /// followed by a `Totals` row, or split the header and values across OCR
    /// lines. Parse only a totals marker or a meal-free four-column recap and
    /// retain the product's Calories/Carbohydrates/Fat/Protein order.
    private static func myFitnessPalTableTotals(in text: String) -> NutritionTotals? {
        let normalized = normalizedNutritionText(text)
        guard normalized.contains("calories"), normalized.contains("carbohydrates"),
              normalized.contains("fat"), normalized.contains("protein")
        else { return nil }
        let lines = text.components(separatedBy: .newlines)
        let mealNames = Set(["breakfast", "lunch", "dinner", "snack", "snacks"])
        let containsMeal = lines.contains { mealNames.contains(normalizedNutritionText($0)) }
        let suffix: String
        if let marker = text.range(of: #"\b(?:totals?|daily total)\b"#, options: [.regularExpression, .caseInsensitive]) {
            suffix = String(text[marker.upperBound...])
        } else {
            guard !containsMeal else { return nil }
            let labels = ["calories", "carbohydrates", "fat", "protein"]
            let lastHeaderIndex = labels.compactMap { label in
                lines.lastIndex { normalizedNutritionText($0).split(separator: " ").contains(Substring(label)) }
            }.max()
            guard let lastHeaderIndex, lastHeaderIndex + 1 < lines.count else { return nil }
            suffix = lines[(lastHeaderIndex + 1)...].joined(separator: "\n")
        }
        let values = groupedNumbers(in: suffix, limit: 4)
        guard values.count == 4 else { return nil }
        return .init(calories: values[0], carbohydrates: values[1], fat: values[2], protein: values[3])
    }

    private static func mealDerivedDailyTotals(from sources: [String]) -> NutritionTotals {
        let expectedMeals = ["breakfast", "lunch", "dinner", "snacks"]
        var summaries: [String: NutritionTotals] = [:]
        for source in sources {
            for (name, block) in mealBlocks(in: source) {
                let totals = mealSummaryTotals(in: block)
                if totals.populatedCount > (summaries[name]?.populatedCount ?? -1) { summaries[name] = totals }
            }
        }
        guard expectedMeals.allSatisfy({ summaries[$0] != nil }) else { return .init() }
        func sum(_ keyPath: KeyPath<NutritionTotals, Double?>) -> Double? {
            let values = expectedMeals.compactMap { summaries[$0]?[keyPath: keyPath] }
            return values.count == expectedMeals.count ? values.reduce(0, +) : nil
        }
        return .init(
            calories: sum(\.calories),
            carbohydrates: sum(\.carbohydrates),
            fat: sum(\.fat),
            protein: sum(\.protein)
        )
    }

    private static func mealBlocks(in text: String) -> [(String, String)] {
        let lines = text.components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        let aliases = ["breakfast": "breakfast", "lunch": "lunch", "dinner": "dinner", "snack": "snacks", "snacks": "snacks"]
        var result: [(String, String)] = []
        for (index, line) in lines.enumerated() {
            guard let name = aliases[normalizedNutritionText(line)] else { continue }
            let end = lines[(index + 1)...].firstIndex { aliases[normalizedNutritionText($0)] != nil } ?? lines.endIndex
            result.append((name, lines[index..<end].joined(separator: "\n")))
        }
        return result
    }

    private static func mealSummaryTotals(in text: String) -> NutritionTotals {
        .init(
            calories: capturedNutritionValue(#"\b(\d[\d,]*(?:\.\d+)?)\s*(?:cal|kcal|calories)\b"#, in: text),
            carbohydrates: capturedNutritionValue(#"\b(?:c|carbs?|carbohydrates)\b\s*[:–—-]?\s*(\d[\d,]*(?:\.\d+)?)\s*g\b"#, in: text),
            fat: capturedNutritionValue(#"\b(?:f|fat)\b\s*[:–—-]?\s*(\d[\d,]*(?:\.\d+)?)\s*g\b"#, in: text),
            protein: capturedNutritionValue(#"\b(?:p|protein)\b\s*[:–—-]?\s*(\d[\d,]*(?:\.\d+)?)\s*g\b"#, in: text)
        )
    }

    private static func capturedNutritionValue(_ pattern: String, in text: String) -> Double? {
        guard let match = capture(pattern, in: text), match.count > 1 else { return nil }
        return groupedNumber(match[1])
    }

    private static func isMealSummaryLine(_ line: String) -> Bool {
        if mealSummaryTotals(in: line).populatedCount >= 2 { return true }
        let number = #"\d[\d,]*(?:\.\d+)?"#
        let patterns = [
            #"^\s*"# + number + #"\s*(?:cal|kcal|calories)\s*$"#,
            #"^\s*(?:c|carbs?|carbohydrates|f|fat|p|protein)\s*[:–—-]?\s*"# + number + #"\s*g\s*$"#,
        ]
        return patterns.contains { capture($0, in: line) != nil }
    }

    private static func isNutritionSummaryHeader(_ line: String) -> Bool {
        let normalized = normalizedNutritionText(line)
        let exactHeaders: Set<String> = ["calories", "protein", "carbs", "carbohydrates", "fat", "total", "totals", "daily total"]
        if exactHeaders.contains(normalized) { return true }
        if normalized.hasPrefix("totals ") || normalized.hasPrefix("daily total ") { return true }
        return normalized.contains("calories") && normalized.contains("protein") &&
            (normalized.contains("carbohydrates") || normalized.contains("carbs")) && normalized.contains("fat")
    }

    private static func isNutritionInterfaceChrome(_ line: String) -> Bool {
        let controls: Set<String> = [
            "log more", "add food", "quick add", "scan meal", "complete diary",
            "view diary", "edit meal", "add meal", "show more", "see more",
        ]
        return controls.contains(normalizedNutritionText(line))
    }

    private static func normalizedNutritionText(_ value: String) -> String {
        value.lowercased()
            .replacingOccurrences(of: #"[^a-z0-9]+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespaces)
    }

    private static func activityStepsField(_ text: String) -> EvidenceReviewField? {
        guard let value = activityStepsNumber(in: text) else { return nil }
        return field("steps", "Steps", formatNutritionNumber(value), "steps", required: false)
    }

    private static func activityStepsNumber(in text: String) -> Double? {
        let token = #"(\d{1,3}(?:[ \t]*,[ \t]*\d{3})+|\d{1,6})"#
        let inlinePatterns = [
            #"(?m)^[ \t]*steps?[ \t]*[:–—-]?[ \t]*"# + token + #"[ \t]*$"#,
            #"(?m)^[ \t]*"# + token + #"[ \t]*steps?[ \t]*$"#,
        ]
        for pattern in inlinePatterns {
            if let match = capture(pattern, in: text), match.count > 1, let value = groupedNumber(match[1]) { return value }
        }

        let lines = text.components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        for (index, line) in lines.enumerated() where normalizedNutritionText(line) == "steps" {
            for candidateIndex in [index + 1, index - 1] where lines.indices.contains(candidateIndex) {
                if let match = capture(#"^[ \t]*"# + token + #"[ \t]*(?:steps?)?[ \t]*$"#, in: lines[candidateIndex]),
                   match.count > 1,
                   let value = groupedNumber(match[1]) {
                    return value
                }
            }
        }
        return nil
    }

    private static func groupedNumbers(in text: String, limit: Int) -> [Double] {
        let pattern = #"(?<![A-Za-z0-9])(\d{1,3}(?:[ \t]*,[ \t]*\d{3})+|\d+(?:\.\d+)?)(?![A-Za-z0-9])"#
        guard let expression = try? NSRegularExpression(pattern: pattern) else { return [] }
        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        return expression.matches(in: text, range: range).prefix(limit).compactMap { match in
            guard match.numberOfRanges > 1, let valueRange = Range(match.range(at: 1), in: text) else { return nil }
            return groupedNumber(String(text[valueRange]))
        }
    }

    private static func groupedNumber(_ value: String) -> Double? {
        Double(value.replacingOccurrences(of: #"[,\s]"#, with: "", options: .regularExpression))
    }

    private static func formatNutritionNumber(_ value: Double) -> String {
        value.rounded() == value ? String(Int(value)) : String(value)
    }

    private static func firstNumber(in text: String, labels: [String]) -> String? {
        for label in labels {
            let escaped = NSRegularExpression.escapedPattern(for: label)
            let patterns = [
                "\\b\(escaped)\\b\\s*[:–—-]?\\s*(\\d[\\d,]*(?:\\.\\d+)?)",
                "(\\d[\\d,]*(?:\\.\\d+)?)\\s*(?:g|lb|lbs|kg|cal|kcal|min|hr|hours?|bpm|ms|in³|in3)?\\s*\\b\(escaped)\\b",
            ]
            for pattern in patterns {
                if let match = capture(pattern, in: text), match.count > 1 { return match[1] }
            }
        }
        return nil
    }

    private static func firstDuration(in text: String, labels: [String]) -> String? {
        for label in labels {
            let escaped = NSRegularExpression.escapedPattern(for: label)
            if let match = capture("\\b\(escaped)\\b\\s*[:–—-]?\\s*(\\d{1,2}:\\d{2}(?::\\d{2})?)", in: text), match.count > 1 {
                return match[1]
            }
        }
        return nil
    }

    private static func fill(_ target: inout String, from text: String, labels: [String]) {
        guard target.isEmpty, let value = firstNumber(in: text, labels: labels) else { return }
        target = cleanNumber(value)
    }

    private static func capture(_ pattern: String, in text: String) -> [String]? {
        guard let expression = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { return nil }
        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        guard let match = expression.firstMatch(in: text, range: range) else { return nil }
        return (0..<match.numberOfRanges).map { index in
            let matchRange = match.range(at: index)
            guard matchRange.location != NSNotFound, let range = Range(matchRange, in: text) else { return "" }
            return String(text[range])
        }
    }

    private static func field(_ id: String, _ label: String, _ value: String, _ unit: String? = nil, required: Bool = true) -> EvidenceReviewField {
        .init(id: id, label: label, value: value, unit: unit, required: required)
    }

    private static func compact<T>(_ values: [T?]) -> [T] { values.compactMap { $0 } }
    private static func cleanNumber(_ value: String) -> String { value.replacingOccurrences(of: ",", with: "") }
    private static func normalizeExercise(_ value: String) -> String { value.lowercased().replacingOccurrences(of: #"[^a-z0-9]+"#, with: " ", options: .regularExpression).trimmingCharacters(in: .whitespaces) }
    private static func displayExerciseName(_ value: String) -> String { normalizeExercise(value).split(separator: " ").map { word in ["ez", "rdl"].contains(word) ? word.uppercased() : word.capitalized }.joined(separator: " ") }
    /// Structural boundary detection first, keyword hint second — the
    /// order the task's own domain invariant requires. A line with no
    /// digits whose *next* content line reads as a set (`isSetShorthandLine`)
    /// is recognized as a new exercise heading regardless of its wording,
    /// so an uncatalogued name like "Pull ups" opens its own block exactly
    /// like a catalogued one such as "Spider curls" does. The keyword list
    /// remains only as a fallback for a heading with no immediately
    /// following shorthand line (e.g. "Set details unavailable" follows
    /// instead of a parseable set).
    private static func looksLikeExerciseHeading(_ line: String, nextLine: String?) -> Bool {
        guard !line.isEmpty, line.rangeOfCharacter(from: .decimalDigits) == nil else { return false }
        if let nextLine, isSetShorthandLine(nextLine) { return true }
        return line.range(of: #"\b(press(?:es)?|raises?|curls?|flies?|rows?|squats?|deadlifts?|extensions?|pulldowns?|pull[\s-]?ups?|push[\s-]?ups?|chin[\s-]?ups?|sit[\s-]?ups?|lunges?|crunches?|planks?|machines?)\b"#, options: [.regularExpression, .caseInsensitive]) != nil &&
        line.range(of: #"\b(calories|heart rate|duration|workout time)\b"#, options: [.regularExpression, .caseInsensitive]) == nil
    }
    private static func isCardioText(_ text: String) -> Bool { text.range(of: #"\b(outdoor walk|indoor walk|run|running|cycling|treadmill|stair stepper|elliptical|rowing|hiking)\b"#, options: [.regularExpression, .caseInsensitive]) != nil }
    private static func isStrengthText(_ text: String) -> Bool { text.range(of: #"\b(traditional strength training|functional strength training|strength workout)\b"#, options: [.regularExpression, .caseInsensitive]) != nil }
    private static func strengthTitle(_ text: String) -> String {
        text.localizedCaseInsensitiveContains("functional strength training") ? "Functional Strength Training" : "Traditional Strength Training"
    }
    private static func cardioTitle(_ text: String) -> String {
        let titles = ["Outdoor Walk", "Indoor Walk", "Outdoor Run", "Indoor Run", "Stair Stepper", "Indoor Cycling", "Outdoor Cycling", "Elliptical", "Rowing", "Hiking"]
        return titles.first { text.localizedCaseInsensitiveContains($0) } ?? "Cardio Workout"
    }
    private static func distanceUnit(_ text: String) -> String { text.range(of: #"\bkm\b"#, options: [.regularExpression, .caseInsensitive]) == nil ? "mi" : "km" }

    private static func recognizeText(in data: Data) async -> String? {
        await Task.detached(priority: .userInitiated) {
            autoreleasepool {
                guard let image = EvidenceAttachmentLoader.downsampledCGImage(
                    data: data,
                    maximumPixelSize: 3_000
                ) else { return nil }
                let request = VNRecognizeTextRequest()
                request.recognitionLevel = .accurate
                request.usesLanguageCorrection = true
                let handler = VNImageRequestHandler(cgImage: image)
                do {
                    try handler.perform([request])
                    let lines = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
                    let value = lines.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
                    return value.isEmpty ? nil : value
                } catch {
                    return nil
                }
            }
        }.value
    }
}
