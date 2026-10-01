import Foundation

/// Reproduces `buildDEXAReport`/`scopeDEXAReportContext`
/// (`src/domain/services/ProgressReportingService.js:635-744,192-207`) —
/// pure functions over a chronologically-ascending list of raw canonical
/// scans, mirroring the web's own "raw scans in, scoped report out" shape
/// (`WeightEvidenceCalculator`'s own precedent).
enum DEXAEvidenceCalculator {
    private static func formatWeight(_ value: Double?) -> String {
        guard let value, value.isFinite else { return "Pending" }
        return String(format: "%.1f lb", value)
    }

    private static func formatPercent(_ value: Double?) -> String {
        guard let value, value.isFinite else { return "Pending" }
        return String(format: "%.1f%%", value)
    }

    private static func formatKcal(_ value: Double?) -> String {
        guard let value, value.isFinite else { return "Pending" }
        return "\(Int(value.rounded())) kcal/day"
    }

    private static func formatDelta(_ delta: Double, suffix: String) -> String {
        let sign = delta >= 0 ? "+" : ""
        return String(format: "%@%.1f%@", sign, delta, suffix)
    }

    /// `report.summary` — 5 cards, always present, `"Pending"` when there
    /// is no latest scan in scope.
    static func summary(latest: DEXACanonicalScanFixture?) -> [DEXASummaryItem] {
        [
            DEXASummaryItem(label: "Body Fat", value: formatPercent(latest?.bodyFatPercentage)),
            DEXASummaryItem(label: "Fat Mass", value: formatWeight(latest?.fatMassLb)),
            DEXASummaryItem(label: "Lean Mass", value: formatWeight(latest?.leanMassLb)),
            DEXASummaryItem(label: "Weight", value: formatWeight(latest?.totalMassLb)),
            DEXASummaryItem(label: "RMR", value: formatKcal(latest?.restingMetabolicRateKcal)),
        ]
    }

    /// `latest - previous` where `previous` is the second-to-last scan in
    /// the scoped, ascending list — `nil` for fewer than 2 scans.
    static func delta(scopedScansAscending scans: [DEXACanonicalScanFixture]) -> DEXADelta? {
        guard scans.count >= 2 else { return nil }
        let latest = scans[scans.count - 1]
        let previous = scans[scans.count - 2]
        return DEXADelta(
            bodyFatPercentagePoints: formatDelta(latest.bodyFatPercentage - previous.bodyFatPercentage, suffix: " pts"),
            fatMassPounds: formatDelta(latest.fatMassLb - previous.fatMassLb, suffix: " lb"),
            leanMassPounds: formatDelta(latest.leanMassLb - previous.leanMassLb, suffix: " lb")
        )
    }

    private static func series(_ title: String, unit: String, scans: [DEXACanonicalScanFixture], value: (DEXACanonicalScanFixture) -> Double?) -> DEXAMetricSeries {
        DEXAMetricSeries(title: title, unit: unit, points: scans.map { DEXATrendPoint(id: $0.id, date: $0.measuredAt, value: value($0)) })
    }

    static func bodyFatTrend(scans: [DEXACanonicalScanFixture]) -> DEXAMetricSeries {
        series("Body Fat %", unit: "%", scans: scans) { $0.bodyFatPercentage }
    }

    static func coreTrends(scans: [DEXACanonicalScanFixture]) -> [DEXAMetricSeries] {
        [
            series("Fat Mass", unit: "lb", scans: scans) { $0.fatMassLb },
            series("Lean Mass", unit: "lb", scans: scans) { $0.leanMassLb },
            series("Total Mass", unit: "lb", scans: scans) { $0.totalMassLb },
            series("RMR", unit: "kcal/day", scans: scans) { $0.restingMetabolicRateKcal },
        ]
    }

    static func supplementalDetails(latest: DEXACanonicalScanFixture?) -> [DEXADetailRow] {
        guard let latest else { return [] }
        return [
            DEXADetailRow(label: "VAT Mass", value: formatWeight(latest.visceralAdiposeTissueMassLb)),
            DEXADetailRow(label: "VAT Volume", value: String(format: "%.1f in³", latest.visceralAdiposeTissueVolumeIn3)),
            DEXADetailRow(label: "Android Fat %", value: formatPercent(latest.androidFatPercentage)),
            DEXADetailRow(label: "Gynoid Fat %", value: formatPercent(latest.gynoidFatPercentage)),
            DEXADetailRow(label: "A/G Ratio", value: String(format: "%.2f", latest.androidGynoidRatio)),
            DEXADetailRow(label: "Bone Mineral Content", value: formatWeight(latest.boneMineralContentLb)),
            DEXADetailRow(label: "Total BMD", value: String(format: "%.3f g/cm²", latest.totalBMD)),
            DEXADetailRow(label: "T-Score", value: String(format: "%.1f", latest.tScore)),
            DEXADetailRow(label: "Z-Score", value: String(format: "%.1f", latest.zScore)),
        ]
    }

    static func supplementalTrends(scans: [DEXACanonicalScanFixture]) -> [DEXAMetricSeries] {
        [
            series("VAT Mass", unit: "lb", scans: scans) { $0.visceralAdiposeTissueMassLb },
            series("A/G Ratio", unit: "", scans: scans) { $0.androidGynoidRatio },
        ]
    }

    /// Display order matches `POSE_ORDER`-equivalent web drawer order:
    /// arms → legs → trunk (preview) → android → gynoid (full).
    static func regionalLeanTrends(scans: [DEXACanonicalScanFixture]) -> [DEXAMetricSeries] {
        [
            series("Arms", unit: "lb", scans: scans) { $0.regional.arms.leanMassLb },
            series("Legs", unit: "lb", scans: scans) { $0.regional.legs.leanMassLb },
            series("Trunk", unit: "lb", scans: scans) { $0.regional.trunk.leanMassLb },
            series("Android", unit: "lb", scans: scans) { $0.regional.android.leanMassLb },
            series("Gynoid", unit: "lb", scans: scans) { $0.regional.gynoid.leanMassLb },
        ]
    }

    static func regionalFatTrends(scans: [DEXACanonicalScanFixture]) -> [DEXAMetricSeries] {
        [
            series("Arms", unit: "lb", scans: scans) { $0.regional.arms.fatMassLb },
            series("Legs", unit: "lb", scans: scans) { $0.regional.legs.fatMassLb },
            series("Trunk", unit: "lb", scans: scans) { $0.regional.trunk.fatMassLb },
            series("Android", unit: "lb", scans: scans) { $0.regional.android.fatMassLb },
            series("Gynoid", unit: "lb", scans: scans) { $0.regional.gynoid.fatMassLb },
        ]
    }

    static func historyRows(scopedScansAscending scans: [DEXACanonicalScanFixture]) -> [DEXAScanHistoryRow] {
        scans.reversed().map { scan in
            DEXAScanHistoryRow(
                id: scan.id, date: scan.measuredAt,
                bodyFatPercentage: formatPercent(scan.bodyFatPercentage),
                fatMass: formatWeight(scan.fatMassLb), leanMass: formatWeight(scan.leanMassLb),
                restingMetabolicRate: formatKcal(scan.restingMetabolicRateKcal), sourceLabel: scan.sourceLabel,
                attributedScope: EvidenceChronology.attribution(forOccurrenceDate: scan.measuredAt)
            )
        }
    }

    /// Assembles the full scoped report — the one entry point
    /// `FixtureDEXAAPI` calls.
    static func report(
        allScans: [DEXACanonicalScanFixture], scope: EvidenceScopeSelection, allLabel: String, dataSources: [DEXADataSource]
    ) -> DEXAReportReadModel {
        let scopedScans = EvidenceChronology.filter(allScans, scope: scope, date: \.measuredAt)
        let latest = scopedScans.last
        return DEXAReportReadModel(
            title: "DEXA", subtitle: "BodySpec body-composition scan history.",
            scope: EvidenceChronology.scopeContext(selected: scope, allLabel: allLabel),
            latestScan: latest.map { DEXALatestScan(date: $0.measuredAt, sourceLabel: $0.sourceLabel) },
            summary: summary(latest: latest),
            delta: delta(scopedScansAscending: scopedScans),
            bodyFatTrend: bodyFatTrend(scans: scopedScans),
            coreTrends: coreTrends(scans: scopedScans),
            supplementalDetails: supplementalDetails(latest: latest),
            supplementalTrends: supplementalTrends(scans: scopedScans),
            regionalLeanTrends: regionalLeanTrends(scans: scopedScans),
            regionalFatTrends: regionalFatTrends(scans: scopedScans),
            history: historyRows(scopedScansAscending: scopedScans),
            dataSources: dataSources
        )
    }
}
