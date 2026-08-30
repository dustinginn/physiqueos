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
    case generic

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
        case .generic: "Evidence"
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
}

enum EvidenceInterpretationState: Equatable {
    case editing
    case pending
    case ready(reviewId: String)
}

struct EvidenceIntakeDraft: Codable, Equatable {
    var occurrenceDate: Date
    var details: String
    var attachments: [SandboxAttachment]
    var scenario: EvidenceFixtureScenario

    static func fresh(now: Date = Date()) -> Self {
        .init(
            occurrenceDate: now,
            details: "",
            attachments: [],
            scenario: .training
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
    case confirmed
}

struct LocalEvidenceReview: Codable, Equatable, Identifiable {
    var id: String
    var category: EvidenceCategory
    var title: String
    var occurrenceDate: Date
    var sourceAssets: [SandboxAttachment]
    var typedDetails: String
    var fields: [EvidenceReviewField]
    var included: Bool
    var status: LocalEvidenceReviewStatus

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
        now _: Date = Date()
    ) -> LocalEvidenceReview {
        let title: String
        let fields: [EvidenceReviewField]
        switch category {
        case .training:
            let cardio = scenario == .cardio
            title = cardio ? "Stair Stepper" : "Detailed strength workout"
            fields = cardio ? [
                field("duration", "Duration", "42", "min"),
                field("activeCalories", "Active calories", "386", "cal", required: false),
                field("heartRate", "Average heart rate", "128", "bpm", required: false),
                field("source", "Source", "Apple Health", required: false),
            ] : [
                field("exercises", "Exercises", "2"),
                field("sets", "Sets", "6"),
                field("duration", "Apple duration", "Unavailable", required: false),
                field("activeCalories", "Active calories", "Unavailable", required: false),
                field("appleLink", "Apple link", "Not linked", required: false),
                field("source", "Source", "Submitted evidence", required: false),
                field("benchPress", "Bench Press", "3 sets · Standard"),
                field("cableFly", "Cable Fly", "3 sets"),
            ]
        case .nutrition:
            title = "Nutrition"
            fields = [
                field("calories", "Calories", "2475", "cal"),
                field("protein", "Protein", "188", "g"),
                field("carbs", "Carbs", "262", "g"),
                field("fat", "Fat", "71", "g"),
                field("source", "Source", "Screenshot + Typed evidence", required: false),
                field("meals", "Meals", "Breakfast · Lunch · Dinner"),
            ]
        case .weight:
            title = "Weight"
            fields = [
                field("weight", "Weight", "166.8", "lb"),
                field("source", "Source", "Screenshot", required: false),
            ]
        case .activity:
            title = "Activity"
            fields = [
                field("activeCalories", "Active calories", "742", "cal"),
                field("exerciseMinutes", "Exercise", "64", "min"),
                field("duration", "Duration", "16", "hr", required: false),
                field("source", "Source", "Screenshot", required: false),
            ]
        case .dexa:
            title = "DEXA"
            fields = [
                field("totalMass", "Weight", "171.4", "lb"),
                field("leanMass", "Lean mass", "150.0", "lb"),
                field("fatMass", "Fat mass", "14.3", "lb"),
                field("bodyFat", "Body fat", "8.3", "%"),
                field("source", "Source", "Submitted evidence", required: false),
            ]
        case .progressPhotos:
            title = "Progress Photos"
            fields = [
                field("poses", "Poses", "3 photos · Front Relaxed, Side Relaxed, Rear Relaxed"),
                field("timeOfDay", "Time of day", "Morning", required: false),
                field("goalRelationship", "Goal relationship", "Visible Abs", required: false),
                field("source", "Source", "Submitted evidence", required: false),
            ]
        case .generic:
            title = "Evidence"
            fields = [field("description", "Details", draft.details)]
        }
        return .init(
            id: id,
            category: category,
            title: title,
            occurrenceDate: draft.occurrenceDate,
            sourceAssets: draft.attachments,
            typedDetails: draft.details,
            fields: fields,
            included: true,
            status: .awaitingConfirmation
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
