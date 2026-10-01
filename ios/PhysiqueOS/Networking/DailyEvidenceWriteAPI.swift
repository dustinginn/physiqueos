import Foundation

struct NutritionDayWrite: Equatable, Sendable {
    var localDate: String
    var calories: Double?
    var proteinG: Double?
    var carbsG: Double?
    var fatG: Double?
    var fiberG: Double?
}

struct ActivityDayWrite: Equatable, Sendable {
    var localDate: String
    var activeCalories: Double?
    var totalCalories: Double?
    var exerciseMinutes: Double?
    var standHours: Double?
    var moveGoal: Double?
}

struct DailyEvidenceWriteResult: Decodable, Equatable, Sendable {
    var status: String
    var canonicalId: String?
    var revision: Int?
    var recordVersion: Int?
    var semanticFingerprint: String?
    var intendedDate: String?
    var goalId: String?
    var phaseId: String?
    var continuationWorkItemIds: [String]?
    var lowerLevelWorkItemIds: [String]?
}

enum DailyEvidenceWriteError: Error, Equatable, LocalizedError {
    case noValues
    case missingCorrectionFingerprint(domain: String, date: String)

    var errorDescription: String? {
        switch self {
        case .noValues: "Enter at least one daily value."
        case .missingCorrectionFingerprint(let domain, let date):
            "The existing \(domain) record for \(date) cannot be safely corrected from typed entry. Use screenshot evidence so the server can open a revision-safe review."
        }
    }
}

protocol DailyEvidenceWriteAPI: Sendable {
    func upsertNutrition(_ input: NutritionDayWrite, existingDayPresent: Bool) async throws -> DailyEvidenceWriteResult
    func upsertActivity(_ input: ActivityDayWrite, existingDayPresent: Bool) async throws -> DailyEvidenceWriteResult
}

final class ProductionDailyEvidenceRevisionStore: @unchecked Sendable {
    private let defaults: UserDefaults
    init(defaults: UserDefaults = .standard) { self.defaults = defaults }

    func fingerprint(domain: String, date: String) -> String? {
        defaults.string(forKey: key(domain: domain, date: date))
    }

    func save(_ fingerprint: String, domain: String, date: String) {
        defaults.set(fingerprint, forKey: key(domain: domain, date: date))
    }

    private func key(domain: String, date: String) -> String {
        "physiqueos.founder-production.\(domain).\(date).semantic-fingerprint"
    }
}

struct ProductionDailyEvidenceWriteAPI: DailyEvidenceWriteAPI {
    let api: ProductionNativeAPI
    let idempotencyStore: ProductionIdempotencyKeyStore
    let revisionStore: ProductionDailyEvidenceRevisionStore

    func upsertNutrition(_ input: NutritionDayWrite, existingDayPresent: Bool) async throws -> DailyEvidenceWriteResult {
        try NativeProductWriteGuard.authorize(.nutrition, in: .founderProduction)
        let totals = compact([
            "calories": input.calories,
            "protein_g": input.proteinG,
            "carbs_g": input.carbsG,
            "fat_g": input.fatG,
            "fiber_g": input.fiberG,
        ])
        guard !totals.isEmpty else { throw DailyEvidenceWriteError.noValues }
        let fingerprint = try correctionFingerprint(domain: "nutrition", date: input.localDate, existingDayPresent: existingDayPresent)
        let payload = NutritionPayload(
            localDate: input.localDate,
            dailyTotals: totals,
            meals: [],
            expectedSemanticFingerprint: fingerprint,
            source: ["application": "PhysiqueOS Native", "modality": "typed"]
        )
        let signaturePayload = totals.keys.sorted().map { "\($0)=\(totals[$0]!)" }.joined(separator: ",")
            + "|expected=" + (fingerprint ?? "new")
        return try await submit(
            command: ProductionCommandType.upsertNutritionDay,
            domain: "nutrition",
            date: input.localDate,
            payload: payload,
            signaturePayload: signaturePayload
        )
    }

    func upsertActivity(_ input: ActivityDayWrite, existingDayPresent: Bool) async throws -> DailyEvidenceWriteResult {
        try NativeProductWriteGuard.authorize(.activityEvidence, in: .founderProduction)
        let values = compact([
            "move_calories": input.activeCalories,
            "total_calories_burned": input.totalCalories,
            "exercise_minutes": input.exerciseMinutes,
            "stand_hours": input.standHours,
            "move_goal": input.moveGoal,
        ])
        guard !values.isEmpty else { throw DailyEvidenceWriteError.noValues }
        let fingerprint = try correctionFingerprint(domain: "activity", date: input.localDate, existingDayPresent: existingDayPresent)
        let payload = ActivityPayload(
            localDate: input.localDate,
            dailyActivity: values,
            sourceIdentity: "native-manual-activity-\(input.localDate)",
            source: ["application": "PhysiqueOS Native", "modality": "manual"],
            expectedSemanticFingerprint: fingerprint
        )
        let signaturePayload = values.keys.sorted().map { "\($0)=\(values[$0]!)" }.joined(separator: ",")
            + "|expected=" + (fingerprint ?? "new")
        return try await submit(
            command: ProductionCommandType.upsertActivityDay,
            domain: "activity",
            date: input.localDate,
            payload: payload,
            signaturePayload: signaturePayload
        )
    }

    private func correctionFingerprint(domain: String, date: String, existingDayPresent: Bool) throws -> String? {
        guard existingDayPresent else { return nil }
        guard let value = revisionStore.fingerprint(domain: domain, date: date) else {
            throw DailyEvidenceWriteError.missingCorrectionFingerprint(domain: domain.capitalized, date: date)
        }
        return value
    }

    private func submit<Payload: Encodable & Sendable>(
        command: String,
        domain: String,
        date: String,
        payload: Payload,
        signaturePayload: String
    ) async throws -> DailyEvidenceWriteResult {
        let signature = ProductionIdempotentSubmission.signature([command, date, signaturePayload])
        let scope = "\(domain)-day.\(date)"
        let key = idempotencyStore.resolvedKey(scope: scope, signature: signature)
        let outcome: ProductionCommandOutcome<DailyEvidenceWriteResult> = try await api.submitCommand(
            command, idempotencyKey: key, payload: payload
        )
        guard outcome.outcome != .pending, let result = outcome.receipt.result else {
            throw ProductionNativeError.invalidResponse
        }
        if let fingerprint = result.semanticFingerprint {
            revisionStore.save(fingerprint, domain: domain, date: date)
        }
        return result
    }

    private func compact(_ input: [String: Double?]) -> [String: Double] {
        input.reduce(into: [:]) { output, item in
            if let value = item.value { output[item.key] = value }
        }
    }

    private struct NutritionPayload: Encodable, Sendable {
        var localDate: String
        var dailyTotals: [String: Double]
        var meals: [String]
        var expectedSemanticFingerprint: String?
        var source: [String: String]
    }

    private struct ActivityPayload: Encodable, Sendable {
        var localDate: String
        var dailyActivity: [String: Double]
        var sourceIdentity: String
        var source: [String: String]
        var expectedSemanticFingerprint: String?
    }
}

struct NotAvailableDailyEvidenceWriteAPI: DailyEvidenceWriteAPI {
    struct NotAvailable: Error {}
    func upsertNutrition(_ input: NutritionDayWrite, existingDayPresent: Bool) async throws -> DailyEvidenceWriteResult { throw NotAvailable() }
    func upsertActivity(_ input: ActivityDayWrite, existingDayPresent: Bool) async throws -> DailyEvidenceWriteResult { throw NotAvailable() }
}
