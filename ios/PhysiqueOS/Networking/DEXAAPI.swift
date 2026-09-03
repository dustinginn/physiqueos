import Foundation

/// Mirrors `TrainingAPI`/`WeightEvidenceAPI`'s seam pattern. `/progress/dexa`
/// is both the scan-history list and the latest-scan report, so — like
/// Weight — there is exactly one fetch method, not a separate landing/day
/// split.
protocol DEXAAPI: Sendable {
    /// `scope` reshapes the whole report (summary, delta, every chart,
    /// history) — DEXA has no unscoped fields, matching
    /// `scopeDEXAReportContext` filtering `dexaScans` wholesale before
    /// `buildDEXAReport` ever runs. No-`scope` overload below defaults to
    /// DEXA's own real default context.
    func fetchDEXAReport(scope: EvidenceScopeSelection) async throws -> DEXAReportReadModel
}

extension DEXAAPI {
    func fetchDEXAReport() async throws -> DEXAReportReadModel {
        try await fetchDEXAReport(scope: DEXAScopeDefault.selection)
    }
}

/// DEXA's own real default context is Build Lean Mass, matching every
/// other Evidence vertical's `DEXA_CONTEXT_IDS`-style default except
/// Training.
enum DEXAScopeDefault {
    static let selection: EvidenceScopeSelection = .goal(goalId: EvidenceCanonicalGoalID.buildLeanMass)
}

/// Fixture-backed conformance: decodes one bundled JSON file of raw,
/// chronologically-ascending canonical scans + data sources, then derives
/// the entire scoped report through `DEXAEvidenceCalculator`.
struct FixtureDEXAAPI: DEXAAPI {
    enum FixtureError: Error {
        case resourceNotFound
    }

    private struct DEXAFixtureFile: Codable {
        var scans: [DEXACanonicalScanFixture]
        var dataSources: [DEXADataSource]
    }

    private func loadFixture() throws -> DEXAFixtureFile {
        guard let url = Bundle.main.url(forResource: "DEXAFixture", withExtension: "json") else {
            throw FixtureError.resourceNotFound
        }
        let data = try Data(contentsOf: url)
        return try JSONDecoder().decode(DEXAFixtureFile.self, from: data)
    }

    func fetchDEXAReport(scope: EvidenceScopeSelection) async throws -> DEXAReportReadModel {
        let fixture = try loadFixture()
        return DEXAEvidenceCalculator.report(allScans: fixture.scans, scope: scope, allLabel: "All DEXA", dataSources: fixture.dataSources)
    }
}
