import Foundation

/// The read seam for the one canonical Operating Plan execution-item
/// catalog — mirrors `ExecutionItemRepository`'s own read boundary. This
/// is the *only* place the execution-item fixture is decoded; Home, the
/// Priority detail screen, and Morning Check-In all resolve their
/// occurrences from this same catalog via
/// `PriorityOccurrenceCalculator.project`, never a second parallel list.
protocol PriorityAPI: Sendable {
    func fetchExecutionItems() async throws -> [ExecutionItemFixture]
    func fetchPriority(priorityId: String, occurrenceDate: String?) async throws -> PriorityOccurrence?
}

extension PriorityAPI {
    func fetchPriority(priorityId: String) async throws -> PriorityOccurrence? {
        try await fetchPriority(priorityId: priorityId, occurrenceDate: nil)
    }
    func fetchPriority(priorityId: String, occurrenceDate: String?) async throws -> PriorityOccurrence? { nil }
}

struct FixturePriorityAPI: PriorityAPI {
    enum FixtureError: Error {
        case resourceNotFound
    }

    func fetchExecutionItems() async throws -> [ExecutionItemFixture] {
        guard let url = Bundle.main.url(forResource: "PriorityFixture", withExtension: "json") else {
            throw FixtureError.resourceNotFound
        }
        let data = try Data(contentsOf: url)
        return try JSONDecoder().decode([ExecutionItemFixture].self, from: data)
    }
}
