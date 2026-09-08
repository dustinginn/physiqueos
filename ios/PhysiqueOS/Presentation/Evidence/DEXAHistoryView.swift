import SwiftUI

/// The DEXA Evidence page (`/progress/dexa`), reached from the Evidence
/// tab's DEXA row. Like Weight, this is genuinely **one page** that is
/// both the scan-history list and the latest-scan report — there is no
/// separate per-scan detail route on the web. Section order mirrors
/// `DEXAReportScreen.jsx` exactly:
///
/// header → scope selector → Latest Scan → summary (5 cards) → delta
/// (since prior scan, when ≥2 scans in scope) → Core Trends (Body Fat
/// chart + Fat/Lean/Total Mass + RMR) → Supplemental Metrics (VAT, A/G
/// ratio, BMC, BMD, T/Z-score) → Regional Tissue Lean Mass → Regional
/// Tissue Fat Mass → Scan History → Data Sources.
///
/// Two real, additional live DEXA surfaces exist on web and are
/// deliberately NOT built here — see `DEXAReadModel.swift`'s type-level
/// doc comment: the "DEXA Event" Briefing narrative
/// (`/briefings/dexa/[scanId]`, a Briefings-namespaced surface excluded by
/// this task's own explicit carve-out) and the DEXA appointment scheduler
/// (`/profile/operating-plan/execution/dexa`, the Operating Plan
/// vertical's territory, not Evidence's).
struct DEXAHistoryView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel: DEXAHistoryViewModel?

    @State private var selectedBodyFatPointID: String?
    /// One selection per secondary metric series, keyed by a
    /// section-namespaced series title (e.g. `"regionalFat-Arms"`) since
    /// "Arms"/"Legs"/etc. titles repeat across the lean and fat regional
    /// sections. Re-verified against source: every DEXA metric chart on the
    /// live web page (Fat/Lean/Total Mass, RMR, VAT Mass, A/G Ratio, and
    /// all 10 regional lean/fat series) reuses the same fully-interactive
    /// hover/drag-scrub chart component as Body Fat % — none of them are
    /// decorative sparklines on web, so none stay sparkline-only here.
    @State private var selectedMetricPointIDs: [String: String] = [:]
    @State private var isSupplementalExpanded = false
    @State private var isRegionalLeanExpanded = false
    @State private var isRegionalFatExpanded = false
    @State private var isHistoryExpanded = false

    static let supplementalPreviewLimit = 3
    static let regionalPreviewLimit = 3
    static let historyPreviewLimit = 3

    var body: some View {
        ScrollView {
            content
                .padding(.horizontal, 16)
                .padding(.top, 12)
        }
        .physiqueOSScrollBottomClearance()
        .background(PhysiqueOSTheme.background)
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .restoresInteractivePopGesture()
        .toolbarBackground(PhysiqueOSTheme.background, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button {
                    dismiss()
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "arrow.left")
                            .font(.system(size: 13, weight: .semibold))
                        Text("Evidence Hub")
                            .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                    }
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
        }
        .task {
            if viewModel == nil { viewModel = DEXAHistoryViewModel(api: environment.dexaAPI) }
            await viewModel?.load()
        }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel?.state {
        case .none, .loading:
            ProgressView()
                .tint(PhysiqueOSTheme.accent)
                .frame(maxWidth: .infinity, minHeight: 300)
        case .failed(let message):
            Text(message)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                .frame(maxWidth: .infinity, minHeight: 300)
        case .loaded(let report):
            VStack(alignment: .leading, spacing: 26) {
                header(for: report)
                TrainingScopeSelectorView(scope: report.scope) { pillID in
                    Task { await viewModel?.selectScope(pillID: pillID) }
                }
                latestScanCard(report.latestScan)
                summaryGrid(report.summary)
                if let delta = report.delta { deltaRow(delta) }
                coreTrendsCard(report)
                supplementalCard(report)
                regionalCard(title: "Regional Tissue Lean Mass", series: report.regionalLeanTrends, namespace: "regionalLean", isExpanded: $isRegionalLeanExpanded)
                regionalCard(title: "Regional Tissue Fat Mass", series: report.regionalFatTrends, namespace: "regionalFat", isExpanded: $isRegionalFatExpanded)
                historyCard(report.history)
                DEXADataSourcesFooterView(items: report.dataSources)
            }
        }
    }

    private func header(for report: DEXAReportReadModel) -> some View {
        HStack(alignment: .top, spacing: 12) {
            IconBadge(systemImage: "list.clipboard.fill", color: .success, size: .lg, isCircular: true)
            VStack(alignment: .leading, spacing: 4) {
                Text("Evidence Report")
                    .physiqueOSFont(PhysiqueOSTypography.screenEyebrow)
                    .foregroundStyle(PhysiqueOSTheme.accent)
                Text(report.title)
                    .physiqueOSFont(PhysiqueOSTypography.screenTitle)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(report.subtitle)
                    .physiqueOSFont(PhysiqueOSTypography.screenSubtitle)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func latestScanCard(_ scan: DEXALatestScan?) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 8) {
                TrainingSectionHeaderView(title: "Latest Scan")
                if let scan {
                    HStack {
                        Text(TrainingDateFormatting.short(scan.date))
                            .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        Spacer(minLength: 8)
                        Text(scan.sourceLabel)
                            .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                            .foregroundStyle(PhysiqueOSTheme.textMuted)
                    }
                } else {
                    Text("No DEXA scans in this period.")
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
        }
    }

    private func summaryGrid(_ items: [DEXASummaryItem]) -> some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
            ForEach(items) { item in
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.label)
                        .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                    Text(item.value)
                        .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                }
                .padding(18)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(PhysiqueOSTheme.surfaceElevated)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .accessibilityElement(children: .combine)
                .accessibilityLabel("\(item.label): \(item.value)")
            }
        }
    }

    /// "Since prior scan" — the inline delta, part of `/progress/dexa`
    /// itself (not the separate DEXA Event Briefing comparison story).
    private func deltaRow(_ delta: DEXADelta) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 8) {
                TrainingSectionHeaderView(title: "Since Prior Scan")
                HStack(spacing: 16) {
                    deltaItem("Body Fat", delta.bodyFatPercentagePoints)
                    deltaItem("Fat Mass", delta.fatMassPounds)
                    deltaItem("Lean Mass", delta.leanMassPounds)
                }
            }
        }
    }

    private func deltaItem(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                .foregroundStyle(PhysiqueOSTheme.textMuted)
            Text(value)
                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                .foregroundStyle(value.hasPrefix("-") ? PhysiqueOSTheme.chartSuccess : PhysiqueOSTheme.textPrimary)
        }
    }

    private func coreTrendsCard(_ report: DEXAReportReadModel) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 4) {
                    TrainingSectionHeaderView(title: "Core Trends")
                    Text("Primary BodySpec trend lines for the selected timeline.")
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
                chartCard(
                    report.bodyFatTrend,
                    namespace: "core",
                    color: PhysiqueOSTheme.chartSuccess,
                    description: "Verified BodySpec scan history."
                )
                ForEach(report.coreTrends) { series in
                    chartCard(
                        series,
                        namespace: "core",
                        color: series.title.contains("Fat") ? PhysiqueOSTheme.chartEffort : PhysiqueOSTheme.chartSuccess,
                        description: "Structured values extracted from BodySpec reports."
                    )
                }
            }
        }
    }

    private func supplementalCard(_ report: DEXAReportReadModel) -> some View {
        let preview = Array(report.supplementalDetails.prefix(Self.supplementalPreviewLimit))
        return CardContainer {
            DEXADisclosureRow(isExpanded: $isSupplementalExpanded) {
                drawerHeader(title: "Supplemental Metrics", subtitle: "Secondary calibration metrics from BodySpec.", expanded: isSupplementalExpanded)
            } expanded: {
                VStack(alignment: .leading, spacing: 10) {
                    VStack(spacing: 0) {
                        ForEach(isSupplementalExpanded ? report.supplementalDetails : preview) { row in
                            HStack {
                                Text(row.label)
                                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                                Spacer(minLength: 8)
                                Text(row.value)
                                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 11)
                            .background(PhysiqueOSTheme.surfaceMuted.opacity(0.55))
                        }
                    }
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    if isSupplementalExpanded {
                        VStack(spacing: 14) {
                            ForEach(report.supplementalTrends) { series in
                                chartCard(
                                    series,
                                    namespace: "supplemental",
                                    color: PhysiqueOSTheme.chartEffort,
                                    description: "Structured values extracted from BodySpec reports."
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    private func regionalCard(title: String, series: [DEXAMetricSeries], namespace: String, isExpanded: Binding<Bool>) -> some View {
        let preview = Array(series.prefix(Self.regionalPreviewLimit))
        return CardContainer {
            DEXADisclosureRow(isExpanded: isExpanded) {
                drawerHeader(title: title, subtitle: title.contains("Lean") ? "Regional lean tissue in pounds." : "Regional fat tissue in pounds.", expanded: isExpanded.wrappedValue)
            } expanded: {
                VStack(spacing: 14) {
                    VStack(spacing: 0) {
                        ForEach(isExpanded.wrappedValue ? series : preview) { item in
                            HStack {
                                Text(item.title)
                                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                                Spacer(minLength: 8)
                                Text(latestValue(item))
                                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 11)
                            .background(PhysiqueOSTheme.surfaceMuted.opacity(0.55))
                        }
                    }
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    if isExpanded.wrappedValue {
                        ForEach(series) { item in
                            chartCard(
                                item,
                                namespace: namespace,
                                color: title.contains("Lean") ? PhysiqueOSTheme.chartEvidence : PhysiqueOSTheme.chartEffort,
                                description: title.contains("Lean") ? "Regional lean tissue mass extracted from BodySpec reports." : "Regional fat tissue mass extracted from BodySpec reports."
                            )
                        }
                    }
                }
            }
        }
    }

    /// A titled, fully-interactive tap-and-drag chart for one secondary
    /// DEXA metric series — see `selectedMetricPointIDs`'s doc comment for
    /// why every series (not just Body Fat %) is interactive here.
    private func chartCard(_ series: DEXAMetricSeries, namespace: String, color: Color, description: String) -> some View {
        let key = "\(namespace)-\(series.title)"
        return VStack(alignment: .leading, spacing: 6) {
            Text(series.title)
                .physiqueOSFont(PhysiqueOSTypography.cardHeading20)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
            Text(description)
                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
            DEXATrendChartView(
                series: series, color: color,
                selectedPointID: Binding(
                    get: { selectedMetricPointIDs[key] },
                    set: { selectedMetricPointIDs[key] = $0 }
                )
            )
        }
        .padding(16)
        .background(PhysiqueOSTheme.surfaceElevated)
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(PhysiqueOSTheme.divider, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 18))
    }

    private func latestValue(_ series: DEXAMetricSeries) -> String {
        guard let value = series.points.last(where: { $0.value != nil })?.value else { return "Unavailable" }
        return series.unit.isEmpty ? String(format: "%.2f", value) : "\(String(format: "%.1f", value))\(series.unit)"
    }

    private func drawerHeader(title: String, subtitle: String?, expanded: Bool) -> some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .physiqueOSFont(PhysiqueOSTypography.cardHeading20)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                if let subtitle {
                    Text(subtitle)
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
            Spacer(minLength: 8)
            Text(expanded ? "Close" : "Show All")
                .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                .foregroundStyle(PhysiqueOSTheme.textMuted)
        }
    }

    private func historyCard(_ rows: [DEXAScanHistoryRow]) -> some View {
        let preview = Array(rows.prefix(Self.historyPreviewLimit))
        return CardContainer {
            DEXADisclosureRow(isExpanded: $isHistoryExpanded) {
                drawerHeader(title: "Scan History", subtitle: nil, expanded: isHistoryExpanded)
            } expanded: {
                if rows.isEmpty {
                    Text("No DEXA scans in this period.")
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                } else {
                    VStack(spacing: 6) {
                        ForEach(isHistoryExpanded ? rows : preview) { row in DEXAScanHistoryRowView(row: row) }
                    }
                }
            }
        }
    }
}

private struct DEXAScanHistoryRowView: View {
    let row: DEXAScanHistoryRow

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(TrainingDateFormatting.short(row.date))
                        .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    Text(row.sourceLabel)
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
                Spacer(minLength: 8)
                Text(row.bodyFatPercentage)
                    .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                    .foregroundStyle(PhysiqueOSTheme.chartSuccess)
            }
            HStack(spacing: 18) {
                historyMetric(row.fatMass, suffix: " fat")
                historyMetric(row.leanMass, suffix: " lean")
                historyMetric(row.restingMetabolicRate, suffix: " RMR")
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PhysiqueOSTheme.surfaceMuted)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .combine)
    }

    private func historyMetric(_ value: String, suffix: String) -> some View {
        Text("\(value)\(suffix)")
            .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
            .foregroundStyle(PhysiqueOSTheme.textSecondary)
    }
}

/// A local disclosure — matches `EvidenceDisclosureRow`'s established
/// shape (`WeightHistoryView.swift`), redefined here per this codebase's
/// own per-file-private convention for small shared UI pieces.
private struct DEXADisclosureRow<Summary: View, Expanded: View>: View {
    @Binding var isExpanded: Bool
    var summary: Summary
    var expanded: Expanded

    init(isExpanded: Binding<Bool>, @ViewBuilder summary: () -> Summary, @ViewBuilder expanded: () -> Expanded) {
        self._isExpanded = isExpanded
        self.summary = summary()
        self.expanded = expanded()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                withAnimation(.easeInOut(duration: 0.2)) { isExpanded.toggle() }
            } label: {
                summary
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(.isButton)
            .accessibilityValue(isExpanded ? "Expanded" : "Collapsed")

            expanded
                .padding(.top, 12)
        }
    }
}

private struct DEXADataSourcesFooterView: View {
    let items: [DEXADataSource]

    var body: some View {
        if !items.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                Divider().overlay(PhysiqueOSTheme.divider)
                Text("Data Sources")
                    .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
                    .padding(.top, 6)
                ForEach(items) { item in
                    HStack {
                        Text(item.name)
                        Spacer(minLength: 8)
                        Text(item.status)
                            .foregroundStyle(PhysiqueOSTheme.textMuted)
                    }
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
        }
    }
}
