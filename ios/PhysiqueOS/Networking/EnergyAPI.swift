import Foundation

/// Mirrors `DEXAAPI`/`WeightEvidenceAPI`'s seam pattern. `/progress/energy`
/// is Energy's entire vertical — landing, history, and reporting all live
/// on this one page (confirmed by this port's audit: no separate detail/
/// reporting sub-routes exist) — so, like Weight and DEXA, there is exactly
/// one fetch method, not a landing/day split.
protocol EnergyAPI: Sendable {
    /// `scope` reshapes the whole report — summary, both charts, weekly and
    /// daily history all narrow, matching source's own
    /// `getEnergyEvidenceReport` (everything downstream of `scopedEvidenceDays`
    /// is derived from the already-scoped day list). No-`scope` overload
    /// below defaults to Energy's own real default context.
    func fetchEnergyReport(scope: EvidenceScopeSelection) async throws -> EnergyReportReadModel
}

extension EnergyAPI {
    func fetchEnergyReport() async throws -> EnergyReportReadModel {
        try await fetchEnergyReport(scope: EnergyScopeDefault.selection)
    }
}

/// Energy's own real default context is Build Lean Mass — verified
/// directly against source (`getEnergyEvidenceReport`'s own
/// `VALID_CONTEXTS.has(context) ? context : "build-lean-mass"`), matching
/// every other Evidence vertical's default except Training.
enum EnergyScopeDefault {
    static let selection: EvidenceScopeSelection = .goal(goalId: EvidenceCanonicalGoalID.buildLeanMass)
}

/// Fixture-backed conformance: decodes one bundled JSON file of raw,
/// chronologically-unordered canonical daily records + data sources, then
/// derives the entire scoped report through `EnergyEvidenceCalculator`.
struct FixtureEnergyAPI: EnergyAPI {
    enum FixtureError: Error {
        case resourceNotFound
    }

    private struct EnergyFixtureFile: Codable {
        var days: [EnergyDayFixture]
        var dataSources: [EnergyDataSource]
    }

    private func loadFixture() throws -> EnergyFixtureFile {
        guard let url = Bundle.main.url(forResource: "EnergyFixture", withExtension: "json") else {
            throw FixtureError.resourceNotFound
        }
        let data = try Data(contentsOf: url)
        return try JSONDecoder().decode(EnergyFixtureFile.self, from: data)
    }

    func fetchEnergyReport(scope: EvidenceScopeSelection) async throws -> EnergyReportReadModel {
        let fixture = try loadFixture()
        return EnergyEvidenceCalculator.report(allDays: fixture.days, scope: scope, allLabel: "All Energy", dataSources: fixture.dataSources)
    }
}
