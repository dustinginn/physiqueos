import Foundation

struct LoggingSandboxError: Error, Equatable, LocalizedError {
    var message: String
    var errorDescription: String? { message }
}

enum WeightUnit: String, Codable, CaseIterable, Identifiable {
    case lb
    case kg

    var id: String { rawValue }
}

struct LocalWeightEntry: Codable, Equatable {
    var dateKey: String
    var value: Double
    var unit: WeightUnit
    var recordedAt: Date
    var correctionCount: Int
}

enum MorningPriorityDisposition: String, Codable, CaseIterable, Identifiable {
    case completed, skipped, note
    var id: String { rawValue }
    var label: String { switch self { case .completed: "Completed"; case .skipped: "Skipped"; case .note: "Add note" } }
}

struct MorningPriorityItem: Codable, Equatable, Identifiable {
    var id: String
    var title: String
    var detail: String
    var occurrenceDate: Date
    var disposition: MorningPriorityDisposition?
    var note: String
}

struct MorningCheckInResult: Equatable {
    var weight: LocalWeightEntry
    var reconciledPriorityCount: Int
}

enum ManualWeighInValidation {
    static var calendar: Calendar {
        var value = Calendar(identifier: .gregorian)
        value.timeZone = TimeZone(identifier: "America/Los_Angeles")!
        return value
    }

    static func error(weightText: String, unit: WeightUnit, date: Date, maximumDate: Date) -> String? {
        let trimmed = weightText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let value = Double(trimmed), value.isFinite else { return "Enter a valid weight." }
        let range = unit == .lb ? 50.0...1000.0 : 22.7...453.6
        guard range.contains(value) else {
            return unit == .lb
                ? "Weight must be between 50 and 1,000 lb."
                : "Weight must be between 22.7 and 453.6 kg."
        }
        guard calendar.startOfDay(for: date) <= calendar.startOfDay(for: maximumDate) else {
            return "A weigh-in cannot be logged for a future date."
        }
        return nil
    }
}

enum EvidenceCategory: String, Codable, CaseIterable, Identifiable {
    case training
    case nutrition
    case weight
    case activity
    case dexa
    case progressPhotos = "progress_photos"
    case labs
    case recovery
    case generic

    var id: String { rawValue }

    var title: String {
        switch self {
        case .training: "Training"
        case .nutrition: "Nutrition"
        case .weight: "Weight"
        case .activity: "Activity"
        case .dexa: "DEXA"
        case .progressPhotos: "Progress Photos"
        case .labs: "Lab Panel"
        case .recovery: "Recovery"
        case .generic: "Evidence"
        }
    }

    var systemImage: String {
        switch self {
        case .training: "dumbbell.fill"
        case .nutrition: "fork.knife"
        case .weight: "scalemass.fill"
        case .activity: "figure.walk"
        case .dexa: "doc.text.fill"
        case .progressPhotos: "camera.fill"
        case .labs: "cross.case.fill"
        case .recovery: "bed.double.fill"
        case .generic: "tray.full.fill"
        }
    }
}

enum EvidenceFixtureScenario: String, Codable, CaseIterable, Identifiable {
    case automatic
    case training
    case cardio
    case nutrition
    case weight
    case activity
    case dexa
    case progressPhotos = "progress_photos"
    case labs
    case recovery
    case mixed
    case generic

    var id: String { rawValue }

    var title: String {
        switch self {
        case .automatic: "Automatic"
        case .training: "Training · strength"
        case .cardio: "Training · cardio"
        case .nutrition: "Nutrition"
        case .weight: "Weight"
        case .activity: "Activity"
        case .dexa: "DEXA"
        case .progressPhotos: "Progress Photos"
        case .labs: "Lab Panel"
        case .recovery: "Recovery"
        case .mixed: "Multiple types"
        case .generic: "Evidence"
        }
    }

    var category: EvidenceCategory? {
        switch self {
        case .automatic: nil
        case .training, .cardio: .training
        case .nutrition: .nutrition
        case .weight: .weight
        case .activity: .activity
        case .dexa: .dexa
        case .progressPhotos: .progressPhotos
        case .labs: .labs
        case .recovery: .recovery
        case .mixed: .generic
        case .generic: .generic
        }
    }
}

struct SandboxAttachment: Codable, Equatable, Identifiable {
    enum Source: String, Codable, Hashable {
        case photos = "Photos"
        case files = "Files"
    }

    var id: String
    var displayName: String
    var source: Source
    var contentType: String? = nil
    var data: Data? = nil
    var extractedText: String? = nil
    var loadError: String? = nil

    var isImage: Bool {
        contentType?.hasPrefix("image/") == true || displayName.range(of: #"\.(png|jpe?g|heic|heif)$"#, options: [.regularExpression, .caseInsensitive]) != nil
    }

    var isPDF: Bool {
        contentType == "application/pdf" || displayName.lowercased().hasSuffix(".pdf")
    }
}

protocol EvidenceLabeledChoice { var label: String { get } }

enum ProgressPhotoOrientation: String, Codable, CaseIterable, Identifiable, EvidenceLabeledChoice {
    case unconfirmed, front, rear, side, leftSide = "left_side", rightSide = "right_side"
    var id: String { rawValue }
    var label: String {
        switch self {
        case .unconfirmed: "Choose orientation"
        case .front: "Front"
        case .rear: "Rear"
        case .side: "Side"
        case .leftSide: "Left Side"
        case .rightSide: "Right Side"
        }
    }
}

enum ProgressPhotoContraction: String, Codable, CaseIterable, Identifiable, EvidenceLabeledChoice {
    case unconfirmed, relaxed, flexed
    var id: String { rawValue }
    var label: String { self == .unconfirmed ? "Choose condition" : rawValue.capitalized }
}

enum ProgressPhotoTimeOfDay: String, Codable, CaseIterable, Identifiable, EvidenceLabeledChoice {
    case morning, afternoon, evening
    var id: String { rawValue }
    var label: String { rawValue.capitalized }
}

enum ProgressPhotoPoseVariant: String, Codable, CaseIterable, Identifiable, EvidenceLabeledChoice {
    case standard, doubleBiceps = "double_biceps", latSpread = "lat_spread", sideChest = "side_chest", other
    var id: String { rawValue }
    var label: String { rawValue.replacingOccurrences(of: "_", with: " ").capitalized }
}

enum ProgressPhotoGoalRole: String, Codable, CaseIterable, Identifiable, EvidenceLabeledChoice {
    case supporting, primary, contextOnly = "context_only"
    var id: String { rawValue }
    var label: String { rawValue.replacingOccurrences(of: "_", with: " ").capitalized }
}

struct ProgressPhotoIdentityDraft: Codable, Equatable, Identifiable {
    var id: String
    var attachmentId: String
    var orientation: ProgressPhotoOrientation
    var contraction: ProgressPhotoContraction
    var poseVariant: ProgressPhotoPoseVariant
    var customLabel: String
    var goalRole: ProgressPhotoGoalRole
    var tags: String
    var confirmed: Bool

    var poseLabel: String {
        guard orientation != .unconfirmed, contraction != .unconfirmed else { return "Pose not confirmed" }
        if poseVariant == .other, !customLabel.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return customLabel
        }
        let variant = poseVariant == .standard ? "" : " · \(poseVariant.label)"
        return "\(orientation.label) \(contraction.label)\(variant)"
    }
}

struct ProgressPhotoSessionDraft: Codable, Equatable {
    var timeOfDay: ProgressPhotoTimeOfDay? = nil
    var fasted: Bool?
    var postWorkout: Bool?
    var pump: Bool?
    var originalUnedited = false
}

struct DEXAIntakeDraft: Codable, Equatable {
    var totalMass = ""
    var bodyFatPercentage = ""
    var fatMass = ""
    var leanMass = ""
    var boneMineralContent = ""
    var restingMetabolicRate = ""
    var vatMass = ""
    var vatVolume = ""
    var valuesConfirmed = false

    var hasRequiredValues: Bool {
        [totalMass, bodyFatPercentage, fatMass, leanMass].allSatisfy {
            guard let value = Double($0), value.isFinite else { return false }
            return value > 0
        }
    }
}

enum EvidenceInterpretationState: Equatable {
    case editing
    case pending
    case ready(reviewId: String)
}

struct EvidencePipelineTimings: Equatable {
    var assetLoadingSeconds: Double?
    var interpretationSeconds: Double?
    var reconciliationSeconds: Double?
    var reviewReadySeconds: Double?
}

struct EvidenceIntakeDraft: Codable, Equatable {
    var occurrenceDate: Date
    var details: String
    var attachments: [SandboxAttachment]
    var scenario: EvidenceFixtureScenario
    var dexa: DEXAIntakeDraft
    var photoIdentities: [ProgressPhotoIdentityDraft]
    var photoSession: ProgressPhotoSessionDraft

    static func fresh(now: Date = Date()) -> Self {
        .init(
            occurrenceDate: now,
            details: "",
            attachments: [],
            scenario: .automatic,
            dexa: .init(),
            photoIdentities: [],
            photoSession: .init()
        )
    }

    var hasContent: Bool {
        !attachments.isEmpty || !details.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var submittedText: String {
        ([details] + attachments.compactMap(\.extractedText))
            .filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
            .joined(separator: "\n\n")
    }
}

enum EvidenceSandboxRouter {
    static func scenario(for draft: EvidenceIntakeDraft) -> EvidenceFixtureScenario {
        guard draft.scenario == .automatic else { return draft.scenario }
        let categories = detectedCategories(for: draft)
        if categories.count > 1 { return .mixed }
        return switch categories.first {
        case .training: draft.submittedText.lowercased().range(of: #"\b(walk|run|cycling|treadmill|stair|elliptical|rowing)\b"#, options: .regularExpression) != nil ? .cardio : .training
        case .nutrition: .nutrition
        case .weight: .weight
        case .activity: .activity
        case .dexa: .dexa
        case .progressPhotos: .progressPhotos
        case .labs: .labs
        case .recovery: .recovery
        case .generic, .none: .automatic
        }
    }

    static func detectedCategories(for draft: EvidenceIntakeDraft) -> [EvidenceCategory] {
        let text = (draft.submittedText + "\n" + draft.attachments.map(\.displayName).joined(separator: "\n")).lowercased()
        var result: [EvidenceCategory] = []
        func add(_ category: EvidenceCategory, when condition: Bool) {
            if condition, !result.contains(category) { result.append(category) }
        }
        add(.dexa, when: containsAny(text, ["dexa", "bodyspec", "body composition", "lean tissue", "fat tissue", "bone mineral content", "vat volume"]))
        add(.labs, when: containsAny(text, ["lab panel", "bloodwork", "blood test", "hemoglobin", "cholesterol", "testosterone"]))
        add(.recovery, when: containsAny(text, ["sleep", "hrv", "readiness", "recovery score", "time asleep"]))
        add(.progressPhotos, when: containsAny(text, ["progress photo", "front relaxed", "rear relaxed", "side relaxed", "pose photo"]))
        add(.nutrition, when: containsAny(text, ["nutrition", "calories", "protein", "carbohydrate", "carbs", "meal", "macros"]))
        let trainingSignal = containsAny(text, ["workout", "training", "sets", "reps", "shoulder press", "bench press", "lateral raise", "squat", "deadlift", "curl", "treadmill", "stair stepper", "outdoor walk", "indoor walk", "cycling", "elliptical", "rowing"])
        add(.training, when: trainingSignal)
        add(.activity, when: containsAny(text, ["activity rings", "move goal", "stand hours", "exercise minutes", "steps"]) && !trainingSignal)
        let weightSignal = containsAny(text, ["morning weight", "body weight", "weighed in", "scale weight"]) || text.range(of: #"(?m)^\s*\d{2,3}(?:\.\d+)?\s*(?:lb|lbs|kg)\s*$"#, options: .regularExpression) != nil
        add(.weight, when: weightSignal && !trainingSignal && !result.contains(.dexa))
        return result
    }

    private static func containsAny(_ text: String, _ terms: [String]) -> Bool {
        terms.contains(where: text.contains)
    }
}

struct EvidenceReviewField: Codable, Equatable, Identifiable {
    var id: String
    var label: String
    var value: String
    var unit: String?
    var required: Bool

    var isValid: Bool {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return !required }
        guard unit != nil else { return true }
        guard let number = Double(trimmed) else { return false }
        return number.isFinite
    }
}

struct EvidenceReviewSet: Codable, Equatable, Identifiable {
    var id: String
    var summary: String
}

struct EvidenceReviewExercise: Codable, Equatable, Identifiable {
    var id: String
    var name: String
    var variant: String?
    var relationship: String?
    var sets: [EvidenceReviewSet]
}

struct EvidenceReviewFood: Codable, Equatable, Identifiable {
    var id: String
    var name: String
    var detail: String
    var calories: String?
}

struct EvidenceReviewMeal: Codable, Equatable, Identifiable {
    var id: String
    var name: String
    var summary: String
    var foods: [EvidenceReviewFood]
}

enum NutritionReviewDisposition: String, Codable, CaseIterable, Identifiable {
    case replaceExisting = "replace_existing"
    case addDistinctMeal = "add_distinct_meal"
    var id: String { rawValue }
    var label: String { self == .replaceExisting ? "Replace existing" : "Add as a distinct meal" }
}

struct EvidenceReviewItem: Codable, Equatable, Identifiable {
    var id: String
    var category: EvidenceCategory
    var title: String
    var occurrenceDate: Date
    var fields: [EvidenceReviewField]
    var exercises: [EvidenceReviewExercise] = []
    var meals: [EvidenceReviewMeal] = []
    var photoIdentities: [ProgressPhotoIdentityDraft] = []
    var included = true
    var nutritionReplacementRequired = false
    var nutritionDisposition: NutritionReviewDisposition?

    var hasRequiredValues: Bool {
        guard fields.allSatisfy(\.isValid) else { return false }
        let populated = Set(fields.filter { !$0.value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }.map(\.id))
        return switch category {
        case .training: !exercises.isEmpty || !populated.isEmpty
        case .nutrition: !populated.intersection(["calories", "protein", "carbs", "fat"]).isEmpty
        case .weight: populated.contains("weight")
        case .activity: !populated.intersection(["activeCalories", "exerciseMinutes", "steps", "duration", "distance", "heartRate"]).isEmpty
        case .dexa: ["totalMass", "bodyFat", "fatMass", "leanMass"].allSatisfy(populated.contains)
        case .progressPhotos: true
        case .labs, .recovery, .generic: !populated.isEmpty
        }
    }
    var specialReviewComplete: Bool {
        let photoMetadataReady = fields
            .filter { ["timeOfDay", "fasted", "originalUnedited"].contains($0.id) }
            .allSatisfy { !$0.value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        return (!nutritionReplacementRequired || nutritionDisposition != nil) &&
        (category != .progressPhotos || (photoIdentities.allSatisfy(\.confirmed) && photoMetadataReady))
    }
    var canConfirm: Bool { included && hasRequiredValues && specialReviewComplete }
}

enum LocalEvidenceReviewStatus: String, Codable, Equatable {
    case awaitingConfirmation
    case confirmed
}

struct LocalEvidenceReview: Codable, Equatable, Identifiable {
    var id: String
    var sourceAssets: [SandboxAttachment]
    var typedDetails: String
    var items: [EvidenceReviewItem]
    var status: LocalEvidenceReviewStatus
    var interpretationMessage: String? = nil

    var category: EvidenceCategory { items.first?.category ?? .generic }
    var occurrenceDate: Date { items.first?.occurrenceDate ?? .distantPast }
    var includedCount: Int { items.filter(\.included).count }
    var excludedCount: Int { items.count - includedCount }
    var canConfirm: Bool { includedCount > 0 && items.filter(\.included).allSatisfy(\.canConfirm) }
    var completionTitle: String {
        let includedCategories = Set(items.filter(\.included).map(\.category))
        guard includedCategories.count == 1, let category = includedCategories.first else {
            return "Evidence review complete"
        }
        return switch category {
        case .training: "Workout review complete"
        case .nutrition: "Nutrition review complete"
        case .activity: "Activity review complete"
        case .weight: "Weight review complete"
        case .dexa: "DEXA review complete"
        case .progressPhotos: "Photo review complete"
        case .labs: "Lab review complete"
        case .recovery: "Recovery review complete"
        case .generic: "Review complete"
        }
    }
}

enum NumericEditingContract {
    static func shouldSelectAllOnFocus(_ text: String) -> Bool { !text.isEmpty }

    static func parsedValue(_ text: String) -> Double? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        return Double(trimmed)
    }

    static func finishActionVisible(step: TrainingLoggerStep?, keyboardVisible: Bool) -> Bool {
        step == .workout && !keyboardVisible
    }
}
