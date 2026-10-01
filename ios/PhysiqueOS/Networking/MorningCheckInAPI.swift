import Foundation

protocol MorningCheckInAPI: Sendable {
    func fetchMorningCheckIn() async throws -> MorningCheckInReadModel
}

struct ProductionMorningCheckInAPI: MorningCheckInAPI {
    let api: ProductionNativeAPI

    func fetchMorningCheckIn() async throws -> MorningCheckInReadModel {
        let payload = try await api.readResource("morning-check-in", as: Payload.self).data
        return MorningCheckInReadModel(
            today: payload.today,
            existingWeight: payload.existingWeight,
            previousWeight: payload.previousWeight,
            reconciliationItems: payload.reconciliationItems.map(\.readModel)
        )
    }

    private struct Payload: Decodable, @unchecked Sendable {
        var today: String
        var existingWeight: Double?
        var previousWeight: Double?
        var reconciliationItems: [Item]
    }

    private struct Item: Decodable {
        var id: String
        var occurrenceKey: String
        var date: String
        var title: String
        var context: String?
        var kind: String?

        var readModel: MorningCheckInReconciliationItem {
            MorningCheckInReconciliationItem(id: id, occurrenceKey: occurrenceKey, date: date, title: title, context: context, kind: kind ?? "execution_reconciliation")
        }
    }
}

/// Sandbox continues reading through `LoggingSandboxStore` directly (its
/// own `previousDayUnfinishedPriorities()`/`evidenceRecoveryItems()`) —
/// this stub exists only so the seam is total across authorities.
struct NotAvailableMorningCheckInAPI: MorningCheckInAPI {
    struct NotAvailable: Error {}

    func fetchMorningCheckIn() async throws -> MorningCheckInReadModel {
        throw NotAvailable()
    }
}
