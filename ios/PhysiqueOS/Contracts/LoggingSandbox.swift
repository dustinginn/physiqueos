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
        case .nutrition: "Nutrition screenshot"
        case .weight: "Uploaded weight"
        case .activity: "Apple Activity summary"
        case .dexa: "DEXA report"
        case .progressPhotos: "Progress photos"
        case .labs: "Lab results"
        case .recovery: "Sleep / recovery"
        case .mixed: "Mixed upload"
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
}

protocol EvidenceLabeledChoice { var label: String { get } }

enum ProgressPhotoOrientation: String, Codable, CaseIterable, Identifiable, EvidenceLabeledChoice {
    case front, rear, side, leftSide = "left_side", rightSide = "right_side"
    var id: String { rawValue }
    var label: String {
        switch self {
        case .front: "Front"
        case .rear: "Rear"
        case .side: "Side"
        case .leftSide: "Left Side"
        case .rightSide: "Right Side"
        }
    }
}

enum ProgressPhotoContraction: String, Codable, CaseIterable, Identifiable, EvidenceLabeledChoice {
    case relaxed, flexed
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
        if poseVariant == .other, !customLabel.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return customLabel
        }
        let variant = poseVariant == .standard ? "" : " · \(poseVariant.label)"
        return "\(orientation.label) \(contraction.label)\(variant)"
    }
}

struct ProgressPhotoSessionDraft: Codable, Equatable {
    var morning: Bool? = nil
    var fasted: Bool?
    var postWorkout: Bool?
    var pump: Bool?
    var lighting = ""
    var location = ""
    var notes = ""
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
}

enum EvidenceSandboxRouter {
    static func scenario(for draft: EvidenceIntakeDraft) -> EvidenceFixtureScenario {
        guard draft.scenario == .automatic else { return draft.scenario }
        let text = (draft.details + " " + draft.attachments.map(\.displayName).joined(separator: " ")).lowercased()
        let categoryMatches = [
            ["nutrition", "meal", "calorie", "protein", "macro"].contains(where: text.contains),
            ["activity", "rings", "steps", "move goal"].contains(where: text.contains),
            ["workout", "training", "bench", "sets", "cardio", "treadmill", "stair", "run", "cycle"].contains(where: text.contains),
            ["scale", "weigh", "weight"].contains(where: text.contains),
            ["labs", "lab panel", "bloodwork", "blood test"].contains(where: text.contains),
            ["recovery", "sleep", "hrv", "readiness"].contains(where: text.contains),
        ].filter { $0 }.count
        if categoryMatches > 1 { return .mixed }
        if text.contains("dexa") || text.contains("body composition") { return .dexa }
        if ["labs", "lab panel", "bloodwork", "blood test"].contains(where: text.contains) { return .labs }
        if ["recovery", "sleep", "hrv", "readiness"].contains(where: text.contains) { return .recovery }
        if ["progress", "front", "side", "rear", "pose"].contains(where: text.contains) { return .progressPhotos }
        if ["nutrition", "meal", "calorie", "protein", "macro"].contains(where: text.contains) { return .nutrition }
        if ["scale", "weigh", "weight"].contains(where: text.contains) { return .weight }
        if ["activity", "rings", "steps", "move goal"].contains(where: text.contains) { return .activity }
        if ["cardio", "treadmill", "stair", "run", "cycle"].contains(where: text.contains) { return .cardio }
        if ["workout", "training", "bench", "sets"].contains(where: text.contains) { return .training }
        return .generic
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

    var hasRequiredValues: Bool { fields.allSatisfy(\.isValid) }
    var specialReviewComplete: Bool {
        let photoMetadataReady = fields
            .filter { ["timeOfDay", "goalRelationship"].contains($0.id) }
            .allSatisfy { $0.value != "Needs session review" }
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

enum LoggingSandboxFixtureFactory {
    static func review(
        id: String = UUID().uuidString,
        category: EvidenceCategory,
        scenario: EvidenceFixtureScenario,
        draft: EvidenceIntakeDraft,
        now _: Date = Date()
    ) -> LocalEvidenceReview {
        let items: [EvidenceReviewItem]
        switch category {
        case .training:
            let cardio = scenario == .cardio
            items = cardio ? [workoutItem(id: "cardio", title: "Stair Stepper", date: draft.occurrenceDate, duration: "42 min", calories: "386 cal", heartRate: "128 bpm")] : trainingPackage(date: draft.occurrenceDate)
        case .nutrition:
            items = [nutritionItem(date: draft.occurrenceDate)]
        case .weight:
            items = [item("weight", .weight, "Weight", draft.occurrenceDate, [
                field("weight", "Weight", "166.8", "lb"),
                field("source", "Source", "Screenshot", required: false),
            ])]
        case .activity:
            items = [item("activity", .activity, "Activity", draft.occurrenceDate, [
                field("activeCalories", "Active calories", "742", "cal"),
                field("exerciseMinutes", "Exercise", "64", "min"),
                field("duration", "Duration", "16", "hr", required: false),
                field("source", "Source", "Screenshot", required: false),
            ])]
        case .dexa:
            let dexa = draft.dexa
            var fields = [
                field("totalMass", "Weight", dexa.totalMass.isEmpty ? "171.4" : dexa.totalMass, "lb"),
                field("leanMass", "Lean mass", dexa.leanMass.isEmpty ? "150.0" : dexa.leanMass, "lb"),
                field("fatMass", "Fat mass", dexa.fatMass.isEmpty ? "14.3" : dexa.fatMass, "lb"),
                field("bodyFat", "Body fat", dexa.bodyFatPercentage.isEmpty ? "8.3" : dexa.bodyFatPercentage, "%"),
            ]
            fields.append(contentsOf: [
                ("boneMineral", "Bone mineral", dexa.boneMineralContent, "lb"),
                ("rmr", "RMR", dexa.restingMetabolicRate, "kcal"),
                ("vatMass", "VAT mass", dexa.vatMass, "lb"),
                ("vatVolume", "VAT volume", dexa.vatVolume, "in³"),
            ].compactMap { id, label, value, unit in
                value.isEmpty ? nil : field(id, label, value, unit, required: false)
            })
            fields.append(field("source", "Source", "Submitted evidence", required: false))
            items = [item("dexa", .dexa, "DEXA", draft.occurrenceDate, fields)]
        case .progressPhotos:
            let identities = draft.photoIdentities.isEmpty ? defaultPhotoIdentities(for: draft.attachments) : draft.photoIdentities
            let timeOfDay = draft.photoSession.morning == true ? "Morning" : draft.photoSession.morning == false ? "Not morning" : "Needs session review"
            let goalRelationship = identities.contains(where: { $0.goalRole == .primary }) ? "Linked Goal" : "Needs session review"
            items = [.init(id: "photos", category: .progressPhotos, title: "Progress Photos", occurrenceDate: draft.occurrenceDate, fields: [
                field("poses", "Poses", identities.map(\.poseLabel).joined(separator: ", ")),
                field("timeOfDay", "Time of day", timeOfDay, required: false),
                field("goalRelationship", "Goal relationship", goalRelationship, required: false),
                field("source", "Source", "Submitted evidence", required: false),
            ], photoIdentities: identities)]
        case .labs:
            items = [item("labs", .labs, "Lab Panel", draft.occurrenceDate, [
                field("panel", "Panel", "Complete Blood Count", required: false),
                field("hemoglobin", "Hemoglobin", "14.8", "g/dL", required: false),
                field("source", "Source", "Submitted evidence", required: false),
            ])]
        case .recovery:
            items = [item("recovery", .recovery, "Recovery Day", draft.occurrenceDate, [
                field("sleep", "Sleep", "7.8", "hr", required: false),
                field("source", "Source", "Submitted evidence", required: false),
            ])]
        case .generic:
            items = scenario == .mixed ? mixedPackage(date: draft.occurrenceDate) : [item("generic", .generic, "Evidence", draft.occurrenceDate, [field("description", "Details", draft.details.isEmpty ? "Submitted file" : draft.details, required: false)])]
        }
        return .init(
            id: id,
            sourceAssets: draft.attachments,
            typedDetails: draft.details,
            items: items,
            status: .awaitingConfirmation
        )
    }

    private static func item(_ id: String, _ category: EvidenceCategory, _ title: String, _ date: Date, _ fields: [EvidenceReviewField]) -> EvidenceReviewItem {
        .init(id: id, category: category, title: title, occurrenceDate: date, fields: fields)
    }

    private static func workoutItem(id: String, title: String, date: Date, duration: String, calories: String, heartRate: String, exercises: [EvidenceReviewExercise] = []) -> EvidenceReviewItem {
        .init(id: id, category: .training, title: title, occurrenceDate: date, fields: [
            field("duration", "Duration", duration, required: false),
            field("activeCalories", "Active calories", calories, required: false),
            field("heartRate", "Average heart rate", heartRate, required: false),
            field("source", "Source", "Screenshot + Typed evidence", required: false),
        ], exercises: exercises)
    }

    private static func trainingPackage(date: Date) -> [EvidenceReviewItem] {
        let bench = EvidenceReviewExercise(id: "bench", name: "Bench Press", variant: "3-Second Pause", relationship: "Superset with Cable Fly", sets: [
            .init(id: "bench-1", summary: "8 reps @ 180 lb"), .init(id: "bench-2", summary: "8 reps @ 180 lb"), .init(id: "bench-3", summary: "7 reps @ 180 lb"),
        ])
        let fly = EvidenceReviewExercise(id: "fly", name: "Cable Fly", variant: nil, relationship: "Superset with Bench Press", sets: [
            .init(id: "fly-1", summary: "12 reps @ 45 lb"), .init(id: "fly-2", summary: "11 reps @ 45 lb"), .init(id: "fly-3", summary: "10 reps @ 45 lb"),
        ])
        return [
            workoutItem(id: "strength", title: "Traditional Strength Training", date: date, duration: "1 hr 17 min", calories: "483 cal", heartRate: "114 bpm", exercises: [bench, fly]),
            workoutItem(id: "walk", title: "Outdoor Walk", date: date, duration: "31 min", calories: "146 cal", heartRate: "102 bpm"),
            workoutItem(id: "cycle", title: "Indoor Cycling", date: date, duration: "24 min", calories: "238 cal", heartRate: "136 bpm"),
        ]
    }

    private static func nutritionItem(date: Date) -> EvidenceReviewItem {
        let breakfast = EvidenceReviewMeal(id: "breakfast", name: "Breakfast", summary: "440 cal · 62 g protein · 37 g carbs · 6 g fat", foods: [
            .init(id: "eggs", name: "Egg whites and eggs", detail: "1 serving", calories: "280 cal"),
            .init(id: "oats", name: "Oatmeal", detail: "1 bowl", calories: "160 cal"),
        ])
        let dinner = EvidenceReviewMeal(id: "dinner", name: "Dinner", summary: "813 cal · 60 g protein · 74 g carbs · 39 g fat", foods: [
            .init(id: "chicken", name: "Chicken and rice", detail: "1 plate", calories: "813 cal"),
        ])
        return .init(id: "nutrition", category: .nutrition, title: "Nutrition", occurrenceDate: date, fields: [
            field("calories", "Calories", "2475", "cal"), field("protein", "Protein", "188", "g"),
            field("carbs", "Carbs", "262", "g"), field("fat", "Fat", "71", "g"),
            field("source", "Source", "Screenshot + Typed evidence", required: false),
        ], meals: [breakfast, dinner], nutritionReplacementRequired: true)
    }

    private static func mixedPackage(date: Date) -> [EvidenceReviewItem] {
        [
            nutritionItem(date: date),
            item("activity", .activity, "Activity", date, [
                field("activeCalories", "Active calories", "742", "cal"),
                field("exerciseMinutes", "Exercise", "64", "min"),
                field("source", "Source", "Screenshot", required: false),
            ]),
        ]
    }

    static func defaultPhotoIdentities(for attachments: [SandboxAttachment]) -> [ProgressPhotoIdentityDraft] {
        let photos = attachments.filter { $0.source == .photos }
        return photos.enumerated().map { index, attachment in
            let orientations: [ProgressPhotoOrientation] = [.front, .side, .rear]
            return .init(id: "pose-\(attachment.id)", attachmentId: attachment.id, orientation: orientations[index % orientations.count], contraction: .relaxed, poseVariant: .standard, customLabel: "", goalRole: index == 0 ? .primary : .supporting, tags: "", confirmed: false)
        }
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
