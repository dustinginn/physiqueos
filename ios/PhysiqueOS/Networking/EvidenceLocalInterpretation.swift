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
        prepared.attachments = await withTaskGroup(of: (Int, SandboxAttachment).self) { group in
            for (index, attachment) in draft.attachments.enumerated() {
                group.addTask { (index, await prepare(attachment)) }
            }
            var indexed: [(Int, SandboxAttachment)] = []
            for await value in group { indexed.append(value) }
            return indexed.sorted { $0.0 < $1.0 }.map(\.1)
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
        scenario: EvidenceFixtureScenario
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
            items.append(contentsOf: reviewItems(for: category, draft: draft))
        }
        guard !items.isEmpty else {
            return .failure(.init(message: "No reviewable information was found. Choose a type or add details, then try again."))
        }

        let unresolved = items.contains { !$0.hasRequiredValues }
        return .success(.init(
            id: id,
            sourceAssets: draft.attachments,
            typedDetails: draft.details,
            items: items,
            status: .awaitingConfirmation,
            interpretationMessage: unresolved
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

    private static func reviewItems(for category: EvidenceCategory, draft: EvidenceIntakeDraft) -> [EvidenceReviewItem] {
        switch category {
        case .training: trainingItems(draft)
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

    private static func trainingItems(_ draft: EvidenceIntakeDraft) -> [EvidenceReviewItem] {
        var items: [EvidenceReviewItem] = []
        let exercises = parseExercises(draft.submittedText)
        if !exercises.isEmpty {
            items.append(.init(
                id: "strength-\(UUID().uuidString)",
                category: .training,
                title: "Traditional Strength Training",
                occurrenceDate: draft.occurrenceDate,
                fields: [],
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

    private static func parseExercises(_ text: String) -> [EvidenceReviewExercise] {
        let lines = text.components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        var order: [String] = []
        var setsByExercise: [String: [EvidenceReviewSet]] = [:]
        var displayNames: [String: String] = [:]
        var current: String?

        for line in lines {
            if let inline = capture(#"^(.+?)\s+(\d+(?:\.\d+)?)\s*(?:p|lb|lbs|pounds?)\s+(\d+(?:\.\d+)?)\s*(?:r|reps?)\s*[x×]\s*(\d+)\s*$"#, in: line), inline.count >= 5 {
                appendExercise(inline[1], load: inline[2], reps: inline[3], count: inline[4], order: &order, sets: &setsByExercise, names: &displayNames)
                current = normalizeExercise(inline[1])
                continue
            }
            if let metric = capture(#"^(\d+(?:\.\d+)?)\s*(?:p|lb|lbs|pounds?)\s+(\d+(?:\.\d+)?)\s*(?:r|reps?)\s*[x×]\s*(\d+)\s*$"#, in: line), metric.count >= 4, let current {
                appendSets(load: metric[1], reps: metric[2], count: metric[3], to: current, sets: &setsByExercise)
                continue
            }
            if let metric = capture(#"^(\d+)\s*(?:sets?|x)\s*(?:of\s*)?(\d+(?:\.\d+)?)\s*(?:reps?|r)?\s*(?:@|at|with)?\s*#?(\d+(?:\.\d+)?)\s*(?:lb|lbs|p|pounds?)?\s*$"#, in: line), metric.count >= 4, let current {
                appendSets(load: metric[3], reps: metric[2], count: metric[1], to: current, sets: &setsByExercise)
                continue
            }
            if looksLikeExerciseName(line) {
                let key = normalizeExercise(line)
                current = key
                if !order.contains(key) { order.append(key) }
                displayNames[key] = displayExerciseName(line)
                setsByExercise[key, default: []] = setsByExercise[key, default: []]
            }
        }

        return order.compactMap { key in
            guard let sets = setsByExercise[key], !sets.isEmpty else { return nil }
            return .init(id: "exercise-\(key.replacingOccurrences(of: " ", with: "-"))", name: displayNames[key] ?? key.capitalized, variant: nil, relationship: nil, sets: sets)
        }
    }

    private static func appendExercise(
        _ name: String,
        load: String,
        reps: String,
        count: String,
        order: inout [String],
        sets: inout [String: [EvidenceReviewSet]],
        names: inout [String: String]
    ) {
        let key = normalizeExercise(name)
        if !order.contains(key) { order.append(key) }
        names[key] = displayExerciseName(name)
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
        return .init(id: id, category: .training, title: title, occurrenceDate: date, fields: compact([
            numericField("duration", "Duration", text, labels: ["duration"], unit: "min"),
            numericField("activeCalories", "Active calories", text, labels: ["active calories", "active energy"], unit: "cal"),
            numericField("heartRate", "Average heart rate", text, labels: ["average heart rate", "avg heart rate"], unit: "bpm"),
            numericField("distance", "Distance", text, labels: ["distance"], unit: distanceUnit(text)),
        ]))
    }

    private static func nutritionItem(_ draft: EvidenceIntakeDraft) -> EvidenceReviewItem {
        let text = draft.submittedText
        let fields = [
            numericField("calories", "Calories", text, labels: ["calories", "total calories"], unit: "cal", required: false) ?? field("calories", "Calories", "", "cal", required: false),
            numericField("protein", "Protein", text, labels: ["protein"], unit: "g", required: false) ?? field("protein", "Protein", "", "g", required: false),
            numericField("carbs", "Carbohydrates", text, labels: ["carbohydrates", "carbs"], unit: "g", required: false) ?? field("carbs", "Carbohydrates", "", "g", required: false),
            numericField("fat", "Fat", text, labels: ["total fat", "fat"], unit: "g", required: false) ?? field("fat", "Fat", "", "g", required: false),
        ]
        return .init(id: "nutrition-\(UUID().uuidString)", category: .nutrition, title: "Nutrition", occurrenceDate: draft.occurrenceDate, fields: fields, meals: parseMeals(text))
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
            numericField("steps", "Steps", text, labels: ["steps"], unit: "steps", required: false) ?? field("steps", "Steps", "", "steps", required: false),
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
                if candidate.isEmpty || candidate.range(of: #"\b(calories|protein|carbs|carbohydrates|fat|total)\b"#, options: [.regularExpression, .caseInsensitive]) != nil { continue }
                guard candidate.count >= 3, candidate.count <= 80, candidate.rangeOfCharacter(from: .letters) != nil else { continue }
                foods.append(.init(id: "food-\(index)-\(foods.count)", name: candidate, detail: "From submitted evidence", calories: nil))
                if foods.count == 8 { break }
            }
            result.append(.init(id: "meal-\(index)", name: line.capitalized, summary: foods.isEmpty ? "No food details were read" : "\(foods.count) food\(foods.count == 1 ? "" : "s") read", foods: foods))
        }
        return result
    }

    private static func numericField(_ id: String, _ label: String, _ text: String, labels: [String], unit: String?, required: Bool = true) -> EvidenceReviewField? {
        guard let value = firstNumber(in: text, labels: labels) else { return nil }
        return field(id, label, cleanNumber(value), unit, required: required)
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
    private static func looksLikeExerciseName(_ line: String) -> Bool {
        line.range(of: #"\b(press|raise|curl|fly|row|squat|deadlift|extension|pulldown|pullup|pushup|lunge|crunch|plank|machine)\b"#, options: [.regularExpression, .caseInsensitive]) != nil &&
        line.range(of: #"\b(calories|heart rate|duration|workout time)\b"#, options: [.regularExpression, .caseInsensitive]) == nil
    }
    private static func isCardioText(_ text: String) -> Bool { text.range(of: #"\b(outdoor walk|indoor walk|run|running|cycling|treadmill|stair stepper|elliptical|rowing|hiking)\b"#, options: [.regularExpression, .caseInsensitive]) != nil }
    private static func cardioTitle(_ text: String) -> String {
        let titles = ["Outdoor Walk", "Indoor Walk", "Outdoor Run", "Indoor Run", "Stair Stepper", "Indoor Cycling", "Outdoor Cycling", "Elliptical", "Rowing", "Hiking"]
        return titles.first { text.localizedCaseInsensitiveContains($0) } ?? "Cardio Workout"
    }
    private static func distanceUnit(_ text: String) -> String { text.range(of: #"\bkm\b"#, options: [.regularExpression, .caseInsensitive]) == nil ? "mi" : "km" }

    private static func recognizeText(in data: Data) async -> String? {
        await Task.detached(priority: .userInitiated) {
            let request = VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = true
            let handler = VNImageRequestHandler(data: data)
            do {
                try handler.perform([request])
                let lines = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
                let value = lines.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
                return value.isEmpty ? nil : value
            } catch {
                return nil
            }
        }.value
    }
}
