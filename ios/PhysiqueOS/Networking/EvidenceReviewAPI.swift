import Foundation

protocol EvidenceReviewAPI: Sendable {
    func fetchReview(reviewId: String) async throws -> EvidenceReviewDetailReadModel?
}

/// This detail screen is only ever reached via the `.evidenceReview`
/// destination, which only `ProductionLogAPI` ever constructs — Sandbox's
/// pending reviews always route through `.localEvidenceReview` to
/// `LocalEvidenceReviewView` instead. This stub exists only so the
/// authority-switching `AppEnvironment.evidenceReviewAPI` has a Sandbox
/// arm at all, matching the pattern every other production-only API
/// (e.g. `NotAvailableTimelineAPI`) follows.
struct NotAvailableEvidenceReviewAPI: EvidenceReviewAPI {
    struct NotAvailable: Error {}

    func fetchReview(reviewId: String) async throws -> EvidenceReviewDetailReadModel? {
        throw NotAvailable()
    }
}

/// Volatile production review state and concurrency identity. Confirmation
/// and disposition use separate canonical commands; no sandbox state is used.
struct ProductionEvidenceReviewAPI: EvidenceReviewAPI {
    let api: ProductionNativeAPI

    func fetchReview(reviewId: String) async throws -> EvidenceReviewDetailReadModel? {
        let envelope = try await api.readResource("evidence-review", query: ["reviewId": reviewId], policy: .reload, as: Payload.self)
        guard let review = envelope.data.review else { return nil }
        return EvidenceReviewDetailReadModel(
            id: review.id,
            status: review.status,
            createdAt: review.createdAt,
            version: review.version,
            items: (envelope.data.presentation?.items ?? []).map { item in
                let raw = (review.interpretedEvidence?.evidenceObjects ?? []).first { $0.id == item.object?.id }
                return EvidenceReviewDetailItem(
                    id: item.object?.id ?? raw?.id ?? UUID().uuidString,
                    type: item.type ?? raw?.evidenceType ?? "evidence",
                    date: item.date ?? raw?.observedAt ?? raw?.date,
                    canonicalDate: raw?.observedAt ?? raw?.date,
                    title: item.title,
                    noun: item.noun,
                    sourceLabel: item.sourceLabel,
                    included: item.included,
                    metrics: item.metrics.map { .init(label: $0.label, value: $0.value) },
                    exercises: (item.exercises + item.strengthSetDetails).map {
                        .init(
                            name: $0.name,
                            sets: $0.sets,
                            occurrenceLabel: $0.occurrenceLabel,
                            variantLabel: $0.variantLabel ?? $0.executionVariant?.label,
                            proposedNewExercise: $0.proposedNewExercise ?? false,
                            supersetWith: $0.supersetWith ?? []
                        )
                    },
                    meals: item.meals.map { meal in
                        .init(
                            id: meal.id ?? "meal-\(meal.name)",
                            name: meal.name,
                            summary: meal.summary,
                            foods: meal.foods.map {
                                .init(id: $0.id ?? "food-\($0.name)", name: $0.name, brand: $0.brand, serving: $0.serving, calories: $0.calories)
                            }
                        )
                    },
                    sourceFiles: item.sourceFiles,
                    typedEvidence: item.typedEvidence,
                    reconciliation: item.reconciliation,
                    photoSession: raw?.photoSession,
                    dexaMeasurements: raw?.dexaMeasurements ?? item.object?.dexaMeasurements
                )
            }.ifEmpty {
                (review.interpretedEvidence?.evidenceObjects ?? []).map { object in
                    EvidenceReviewDetailItem(
                        id: object.id ?? UUID().uuidString,
                        type: object.evidenceType ?? "evidence",
                        date: object.observedAt ?? object.date,
                        canonicalDate: object.observedAt ?? object.date,
                        title: nil,
                        noun: nil,
                        sourceLabel: nil,
                        included: true,
                        metrics: object.fallbackMetrics,
                        exercises: object.fallbackExercises,
                        photoSession: object.photoSession,
                        dexaMeasurements: object.dexaMeasurements
                    )
                }
            },
            summary: envelope.data.presentation?.summary.text,
            excludedSummary: envelope.data.presentation?.summary.excludedText
        )
    }

    private struct Payload: Decodable, @unchecked Sendable {
        var review: Review?
        var presentation: Presentation?
    }

    private struct Presentation: Decodable {
        var items: [PresentedItem]
        var summary: Summary

        struct Summary: Decodable { var text: String?; var excludedText: String? }
    }

    private struct PresentedItem: Decodable {
        var type: String?
        var date: String?
        var title: String?
        var noun: String?
        var sourceLabel: String?
        var included: Bool
        var metrics: [Metric]
        var exercises: [Exercise]
        var strengthSetDetails: [Exercise]
        var meals: [Meal]
        var sourceFiles: [String]
        var typedEvidence: String?
        var reconciliation: String?
        var object: EvidenceObject?

        struct Metric: Decodable { var label: String; var value: String }
        struct Exercise: Decodable {
            var name: String
            var sets: [String]
            var occurrenceLabel: String?
            var variantLabel: String?
            var proposedNewExercise: Bool?
            var supersetWith: [String]?
            var executionVariant: ExecutionVariant?

            struct ExecutionVariant: Decodable { var label: String? }
        }
        struct Meal: Decodable {
            var id: String?
            var name: String
            var summary: String
            var foods: [Food]

            struct Food: Decodable {
                var id: String?
                var name: String
                var brand: String?
                var serving: String?
                var calories: String?
            }
        }

        enum CodingKeys: String, CodingKey {
            case type, date, title, noun, sourceLabel, included, metrics, exercises, strengthSetDetails
            case meals, sourceFiles, typedEvidence, reconciliation, object
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            type = try container.decodeIfPresent(String.self, forKey: .type)
            date = try container.decodeIfPresent(String.self, forKey: .date)
            title = try container.decodeIfPresent(String.self, forKey: .title)
            noun = try container.decodeIfPresent(String.self, forKey: .noun)
            sourceLabel = try container.decodeIfPresent(String.self, forKey: .sourceLabel)
            included = try container.decodeIfPresent(Bool.self, forKey: .included) ?? true
            metrics = try container.decodeIfPresent([Metric].self, forKey: .metrics) ?? []
            exercises = try container.decodeIfPresent([Exercise].self, forKey: .exercises) ?? []
            strengthSetDetails = try container.decodeIfPresent([Exercise].self, forKey: .strengthSetDetails) ?? []
            meals = try container.decodeIfPresent([Meal].self, forKey: .meals) ?? []
            sourceFiles = try container.decodeIfPresent([String].self, forKey: .sourceFiles) ?? []
            typedEvidence = try container.decodeIfPresent(String.self, forKey: .typedEvidence)
            reconciliation = try container.decodeIfPresent(String.self, forKey: .reconciliation)
            object = try container.decodeIfPresent(EvidenceObject.self, forKey: .object)
        }
    }

    private struct Review: Decodable {
        var id: String
        var status: String
        var createdAt: String?
        var version: Int?
        var interpretedEvidence: InterpretedEvidence?
    }

    /// Wire keys are snake_case (`evidence_objects`); the shared decoder's
    /// `.convertFromSnakeCase` already matches these to the camelCase
    /// property names below automatically — explicit `CodingKeys` with
    /// snake_case raw values here would double-convert and fail to decode.
    private struct InterpretedEvidence: Decodable {
        var evidenceObjects: [EvidenceObject]?
    }

    private struct EvidenceObject: Decodable {
        var id: String?
        var evidenceType: String?
        var observedAt: String?
        var date: String?
        var measuredAt: String?
        var totalMass: MassValue?
        var bodyFatPercentage: Double?
        var fatMass: MassValue?
        var leanMass: MassValue?
        var boneMineralContent: MassValue?
        var restingMetabolicRate: MassValue?
        var visceralAdiposeTissue: VisceralAdiposeTissue?
        var metadata: [String: ProductionJSONValue]?
        var dailyTotals: [String: ProductionJSONValue]?
        var exercises: [RawExercise]?
        var photos: [RawPhoto]?
        var captureMetadata: PhotoCaptureMetadata?
        var conditions: PhotoConditions?
        var goalRelationship: PhotoGoalRelationship?

        struct RawExercise: Decodable {
            var name: String?
            var sets: [RawSet]?
        }
        struct RawSet: Decodable {
            var reps: Double?
            var weight: Double?
            var load: Double?
        }
        struct RawPhoto: Decodable {
            var id: String?
            var poseId: String?
            var label: String?
            var orientation: String?
            var contractionState: String?
            var poseVariant: String?
        }
        struct PhotoCaptureMetadata: Decodable { var timeOfDay: String? }
        struct PhotoConditions: Decodable { var timeOfDay: String? }
        struct PhotoGoalRelationship: Decodable { var status: String?; var goalLabel: String? }

        var photoSession: EvidenceReviewPhotoSession? {
            guard ["photo_session", "progress_photo"].contains(evidenceType), let id else { return nil }
            return .init(
                sessionId: id,
                timeOfDay: captureMetadata?.timeOfDay ?? conditions?.timeOfDay,
                goalRelationship: EvidenceReviewPhotoSession.goalRelationshipText(goalLabel: goalRelationship?.goalLabel, status: goalRelationship?.status),
                photos: (photos ?? []).enumerated().map { index, photo in
                    .init(
                        id: photo.id ?? "photo-\(index + 1)", poseId: photo.poseId, label: photo.label,
                        orientation: photo.orientation, contractionState: photo.contractionState,
                        poseVariant: photo.poseVariant
                    )
                }
            )
        }

        /// `applyDexaReviewMeasurements`'s exact stored shape
        /// (`DexaPdfIntakeService.js`) — only present when `evidenceType`
        /// is a DEXA scan. Optional throughout: an object that hasn't
        /// finished interpretation yet (or isn't DEXA at all) simply
        /// decodes every field to `nil`, never a decode failure.
        var dexaMeasurements: DEXAScanMeasurements? {
            guard ["dexa_scan", "dexa", "body_composition"].contains(evidenceType) else { return nil }
            return DEXAScanMeasurements(
                measuredAt: measuredAt ?? observedAt ?? date,
                totalMassLb: totalMass?.value,
                bodyFatPercentage: bodyFatPercentage,
                fatMassLb: fatMass?.value,
                leanMassLb: leanMass?.value,
                boneMineralContentLb: boneMineralContent?.value,
                restingMetabolicRateKcal: restingMetabolicRate?.value,
                visceralAdiposeTissueMassLb: visceralAdiposeTissue?.mass?.value,
                visceralAdiposeTissueVolumeIn3: visceralAdiposeTissue?.volume?.value
            )
        }

        var fallbackMetrics: [EvidenceReviewMetric] {
            if let dexa = dexaMeasurements {
                return [
                    ("Total mass", dexa.totalMassLb, "lb"), ("Body fat", dexa.bodyFatPercentage, "%"),
                    ("Fat tissue", dexa.fatMassLb, "lb"), ("Lean tissue", dexa.leanMassLb, "lb"),
                    ("Bone mineral", dexa.boneMineralContentLb, "lb"), ("RMR", dexa.restingMetabolicRateKcal, "kcal/day"),
                    ("VAT mass", dexa.visceralAdiposeTissueMassLb, "lb"), ("VAT volume", dexa.visceralAdiposeTissueVolumeIn3, "in³")
                ].map { metric in
                    .init(label: metric.0, value: metric.1.map { "\(Self.number($0)) \(metric.2)" } ?? "Needs review")
                }
            }
            return []
        }

        var fallbackExercises: [EvidenceReviewDetailExercise] {
            (exercises ?? []).compactMap { exercise in
                guard let name = exercise.name else { return nil }
                return .init(name: name, sets: (exercise.sets ?? []).map { set in
                    let reps = set.reps.map(Self.number) ?? "—"
                    let load = (set.weight ?? set.load).map(Self.number)
                    return load.map { "\(reps) reps @ \($0) lb" } ?? "\(reps) reps"
                })
            }
        }

        private static func number(_ value: Double) -> String {
            value.rounded() == value ? String(Int(value)) : String(format: "%.1f", value)
        }
    }

    private struct MassValue: Decodable {
        var value: Double?
        var unit: String?
    }

    private struct VisceralAdiposeTissue: Decodable {
        var mass: MassValue?
        var volume: MassValue?
    }
}

private extension Array {
    func ifEmpty(_ fallback: () -> Self) -> Self { isEmpty ? fallback() : self }
}

/// `dexa-review.measurements.v1`'s exact input/output shape
/// (`applyDexaReviewMeasurements`, `DexaPdfIntakeService.js`) — every
/// field Native must resend on every edit, since the server does a full
/// replace, not a merge (an omitted field is silently nulled on the
/// canonical scan, RMR/VAT included).
struct DEXAScanMeasurements: Equatable, Sendable {
    var measuredAt: String?
    var totalMassLb: Double?
    var bodyFatPercentage: Double?
    var fatMassLb: Double?
    var leanMassLb: Double?
    var boneMineralContentLb: Double?
    var restingMetabolicRateKcal: Double?
    var visceralAdiposeTissueMassLb: Double?
    var visceralAdiposeTissueVolumeIn3: Double?
}
