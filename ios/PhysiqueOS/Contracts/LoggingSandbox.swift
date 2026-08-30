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

enum ManualWeighInValidation {
    static func error(weightText: String, unit: WeightUnit, date: Date, maximumDate: Date) -> String? {
        let trimmed = weightText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let value = Double(trimmed), value.isFinite else { return "Enter a valid weight." }
        let range = unit == .lb ? 50.0...1000.0 : 22.7...453.6
        guard range.contains(value) else {
            return unit == .lb
                ? "Weight must be between 50 and 1,000 lb."
                : "Weight must be between 22.7 and 453.6 kg."
        }
        guard Calendar.current.startOfDay(for: date) <= Calendar.current.startOfDay(for: maximumDate) else {
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
        case .recovery: "Energy / Recovery"
        case .generic: "Generic Evidence"
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
        case .recovery: "heart.text.square.fill"
        case .generic: "tray.full.fill"
        }
    }
}

enum EvidenceFixtureScenario: String, Codable, CaseIterable, Identifiable {
    case training
    case cardio
    case nutrition
    case weight
    case activity
    case dexa
    case progressPhotos = "progress_photos"
    case recovery
    case generic
    case ambiguous
    case needsMoreInformation = "needs_more_information"
    case unsupported
    case localFailure = "local_failure"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .training: "Training · strength"
        case .cardio: "Training · cardio"
        case .nutrition: "Nutrition screenshot"
        case .weight: "Uploaded weight"
        case .activity: "Apple Activity summary"
        case .dexa: "DEXA report"
        case .progressPhotos: "Progress photos"
        case .recovery: "Energy / recovery"
        case .generic: "Generic evidence"
        case .ambiguous: "Ambiguous"
        case .needsMoreInformation: "Needs more information"
        case .unsupported: "Unsupported / unrecognized"
        case .localFailure: "Local processing failure"
        }
    }

    var category: EvidenceCategory? {
        switch self {
        case .training, .cardio: .training
        case .nutrition: .nutrition
        case .weight: .weight
        case .activity: .activity
        case .dexa: .dexa
        case .progressPhotos: .progressPhotos
        case .recovery: .recovery
        case .generic: .generic
        case .ambiguous, .needsMoreInformation, .unsupported, .localFailure: nil
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
}

enum EvidenceInterpretationState: Equatable {
    case editing
    case pending
    case ambiguous
    case needsMoreInformation
    case unsupported
    case failed
    case ready(reviewId: String)
}

struct EvidenceIntakeDraft: Codable, Equatable {
    var occurrenceDate: Date
    var details: String
    var attachments: [SandboxAttachment]
    var scenario: EvidenceFixtureScenario
    var clarification: String

    static func fresh(now: Date = Date()) -> Self {
        .init(
            occurrenceDate: now,
            details: "",
            attachments: [],
            scenario: .training,
            clarification: ""
        )
    }

    var hasContent: Bool {
        !attachments.isEmpty || !details.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
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

enum LocalEvidenceReviewStatus: String, Codable, Equatable {
    case awaitingConfirmation
    case confirmedLocally
}

struct LocalEvidenceReview: Codable, Equatable, Identifiable {
    var id: String
    var category: EvidenceCategory
    var title: String
    var occurrenceDate: Date
    var addedAt: Date
    var sourceAssets: [SandboxAttachment]
    var typedDetails: String
    var confidence: String
    var provenance: String
    var fields: [EvidenceReviewField]
    var notes: String
    var included: Bool
    var correctionNote: String
    var status: LocalEvidenceReviewStatus
    var warning: String?

    var hasRequiredValues: Bool {
        fields.allSatisfy(\.isValid)
    }

    var canConfirm: Bool { included && hasRequiredValues }
}

enum LoggingSandboxFixtureFactory {
    static func review(
        id: String = UUID().uuidString,
        category: EvidenceCategory,
        scenario: EvidenceFixtureScenario,
        draft: EvidenceIntakeDraft,
        now: Date = Date(),
        warning: String? = nil
    ) -> LocalEvidenceReview {
        let title: String
        let confidence: String
        let fields: [EvidenceReviewField]
        switch category {
        case .training:
            let cardio = scenario == .cardio
            title = cardio ? "Stair Stepper" : "Detailed strength workout"
            confidence = cardio ? "Medium · type recognized; duration editable" : "High · exercise names need your review"
            fields = cardio ? [
                field("activityType", "Activity type", "Stair Stepper"),
                field("duration", "Duration", "42", "min"),
                field("activeCalories", "Active calories", "386", "cal", required: false),
                field("heartRate", "Average heart rate", "128", "bpm", required: false),
                field("healthLink", "Apple Health relationship", "Not linked in sandbox", required: false),
            ] : [
                field("activityType", "Activity type", "Traditional Strength Training"),
                field("exercise1", "Exercise 1", "Bench Press · 3 sets"),
                field("exercise2", "Exercise 2", "Cable Fly · 3 sets"),
                field("variant", "Execution variant", "Standard"),
                field("relationship", "Exercise relationship", "Standalone · no Superset"),
                field("duration", "Apple duration", "Unavailable", required: false),
                field("healthLink", "Apple Health relationship", "Not linked in sandbox", required: false),
            ]
        case .nutrition:
            title = "Nutrition Day"
            confidence = "Medium · screenshot interpretation fixture"
            fields = [
                field("meal", "Meal / day context", "Full day summary"),
                field("calories", "Calories", "2475", "kcal"),
                field("protein", "Protein", "188", "g"),
                field("carbs", "Carbohydrates", "262", "g"),
                field("fat", "Fat", "71", "g"),
                field("reconciliation", "Existing-day handling", "Replace existing / add distinct meal"),
            ]
        case .weight:
            title = "Uploaded Weight Evidence"
            confidence = "Medium · value must be confirmed"
            fields = [
                field("weight", "Reviewed weight", "166.8", "lb"),
                field("sourceConcept", "Source", "Scale screenshot", required: false),
            ]
        case .activity:
            title = "Daily Activity"
            confidence = "High · Apple Activity summary fixture"
            fields = [
                field("activeCalories", "Active calories", "742", "cal"),
                field("exerciseMinutes", "Exercise", "64", "min"),
                field("standHours", "Stand", "12", "hr", required: false),
                field("separateWorkouts", "Separately owned workouts", "2 referenced · not imported", required: false),
            ]
        case .dexa:
            title = "DEXA Scan"
            confidence = "Medium · PDF fields require confirmation"
            fields = [
                field("totalMass", "Total mass", "171.4", "lb"),
                field("bodyFat", "Body fat", "8.3", "%"),
                field("fatMass", "Fat mass", "14.3", "lb"),
                field("leanMass", "Lean mass", "150.0", "lb"),
                field("bmc", "Bone mineral content", "7.1", "lb"),
                field("rmr", "Resting metabolic rate", "1836", "kcal/day", required: false),
                field("vatMass", "VAT mass", "0.44", "lb", required: false),
                field("vatVolume", "VAT volume", "12.9", "in³", required: false),
            ]
        case .progressPhotos:
            title = "Progress Photo Session"
            confidence = "User supplied · poses remain editable"
            fields = [
                field("grouping", "Session grouping", "One capture session"),
                field("front", "Photo 1 orientation", "Front relaxed"),
                field("side", "Photo 2 orientation", "Side relaxed"),
                field("rear", "Photo 3 orientation", "Rear relaxed", required: false),
                field("timeOfDay", "Time of day", "Morning", required: false),
                field("goalRelationship", "Goal relationship", "No Goal relationship in sandbox", required: false),
            ]
        case .recovery:
            title = "Energy / Recovery"
            confidence = "Medium · generic source-supported interpretation"
            fields = [
                field("energy", "Energy", "7", "/ 10"),
                field("sleep", "Sleep", "7.5", "hr", required: false),
                field("soreness", "Soreness", "Low", required: false),
            ]
        case .generic:
            title = "Generic Evidence"
            confidence = "Unclassified · no AI certainty claimed"
            fields = [field("description", "What this evidence shows", draft.details)]
        }
        return .init(
            id: id,
            category: category,
            title: title,
            occurrenceDate: draft.occurrenceDate,
            addedAt: now,
            sourceAssets: draft.attachments,
            typedDetails: draft.details,
            confidence: confidence,
            provenance: "Device-only fixture interpretation · source evidence retained",
            fields: fields,
            notes: "",
            included: true,
            correctionNote: "",
            status: .awaitingConfirmation,
            warning: warning
        )
    }

    private static func field(
        _ id: String,
        _ label: String,
        _ value: String,
        _ unit: String? = nil,
        required: Bool = true
    ) -> EvidenceReviewField {
        .init(id: id, label: label, value: value, unit: unit, required: required)
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
