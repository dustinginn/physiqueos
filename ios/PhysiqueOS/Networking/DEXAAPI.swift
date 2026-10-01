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
        var fixture = try JSONDecoder().decode(DEXAFixtureFile.self, from: data)
        fixture.scans.append(contentsOf: Self.syntheticHistory(from: fixture.scans))
        fixture.scans.sort { $0.measuredAt < $1.measuredAt }
        return fixture
    }

    func fetchDEXAReport(scope: EvidenceScopeSelection) async throws -> DEXAReportReadModel {
        let fixture = try loadFixture()
        return DEXAEvidenceCalculator.report(allScans: fixture.scans, scope: scope, allLabel: "All DEXA", dataSources: fixture.dataSources)
    }

    /// Noncanonical synthetic history used only to exercise dense charts,
    /// both Goal windows, and both Build Lean Mass phases. Values are
    /// deterministic interpolations between the existing fixture anchors.
    private static func syntheticHistory(from anchors: [DEXACanonicalScanFixture]) -> [DEXACanonicalScanFixture] {
        guard anchors.count >= 5 else { return [] }
        let specifications: [(String, String, Int, Int, Double)] = [
            ("dexa-synthetic-2026-05-31", "2026-05-31", 0, 1, 0.26),
            ("dexa-synthetic-2026-06-07", "2026-06-07", 0, 1, 0.52),
            ("dexa-synthetic-2026-06-28", "2026-06-28", 1, 2, 0.29),
            ("dexa-synthetic-2026-07-05", "2026-07-05", 1, 2, 0.54),
            ("dexa-synthetic-2026-07-26", "2026-07-26", 2, 3, 0.28),
            ("dexa-synthetic-2026-08-08", "2026-08-08", 2, 3, 0.72),
            ("dexa-synthetic-2026-08-15", "2026-08-15", 2, 3, 0.97),
            ("dexa-synthetic-2026-08-23", "2026-08-23", 3, 4, 0.50),
        ]
        return specifications.map { id, date, lower, upper, amount in
            interpolated(id: id, date: date, from: anchors[lower], to: anchors[upper], amount: amount)
        }
    }

    private static func interpolated(
        id: String, date: String, from a: DEXACanonicalScanFixture,
        to b: DEXACanonicalScanFixture, amount t: Double
    ) -> DEXACanonicalScanFixture {
        func value(_ x: Double, _ y: Double) -> Double { (x + (y - x) * t).rounded(toPlaces: 2) }
        func region(_ x: DEXARegionalValueFixture, _ y: DEXARegionalValueFixture) -> DEXARegionalValueFixture {
            .init(leanMassLb: value(x.leanMassLb, y.leanMassLb), fatMassLb: value(x.fatMassLb, y.fatMassLb))
        }
        return .init(
            id: id, measuredAt: date,
            totalMassLb: value(a.totalMassLb, b.totalMassLb),
            bodyFatPercentage: value(a.bodyFatPercentage, b.bodyFatPercentage),
            fatMassLb: value(a.fatMassLb, b.fatMassLb), leanMassLb: value(a.leanMassLb, b.leanMassLb),
            boneMineralContentLb: value(a.boneMineralContentLb, b.boneMineralContentLb),
            restingMetabolicRateKcal: value(a.restingMetabolicRateKcal, b.restingMetabolicRateKcal),
            visceralAdiposeTissueMassLb: value(a.visceralAdiposeTissueMassLb, b.visceralAdiposeTissueMassLb),
            visceralAdiposeTissueVolumeIn3: value(a.visceralAdiposeTissueVolumeIn3, b.visceralAdiposeTissueVolumeIn3),
            androidFatPercentage: value(a.androidFatPercentage, b.androidFatPercentage),
            gynoidFatPercentage: value(a.gynoidFatPercentage, b.gynoidFatPercentage),
            androidGynoidRatio: value(a.androidGynoidRatio, b.androidGynoidRatio),
            regional: .init(
                arms: region(a.regional.arms, b.regional.arms), legs: region(a.regional.legs, b.regional.legs),
                trunk: region(a.regional.trunk, b.regional.trunk), android: region(a.regional.android, b.regional.android),
                gynoid: region(a.regional.gynoid, b.regional.gynoid)
            ),
            totalBMD: value(a.totalBMD, b.totalBMD), tScore: value(a.tScore, b.tScore), zScore: value(a.zScore, b.zScore),
            sourceLabel: "Synthetic BodySpec fixture"
        )
    }
}

private extension Double {
    func rounded(toPlaces places: Int) -> Double {
        let factor = pow(10.0, Double(places))
        return (self * factor).rounded() / factor
    }
}
