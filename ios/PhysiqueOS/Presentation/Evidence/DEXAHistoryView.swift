import SwiftUI
import PDFKit

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
    static let sincePriorScanColumnLabels = ["Body Fat", "Fat Mass", "Lean Mass"]
    @Environment(AppEnvironment.self) private var environment
    @State private var viewModel: DEXAHistoryViewModel?
    @State private var viewModelAuthority: NativeAPIEnvironment?

    /// One selection per series, keyed by a section-namespaced title (e.g.
    /// `"regionalFat-Arms"`) since region titles repeat across the lean and
    /// fat sections. Every DEXA series is the same interactive chart.
    @State private var selectedMetricPointIDs: [String: String] = [:]
    @State private var isSupplementalExpanded = Self.reviewExpanded("supplemental")
    @State private var isRegionalLeanExpanded = Self.reviewExpanded("lean")
    @State private var isRegionalFatExpanded = Self.reviewExpanded("fat")
    @State private var isHistoryExpanded = Self.reviewExpanded("history")
    @State private var selectedPDF: DEXAPDFPresentation?
    @State private var sourceMediaMessage: String?
    @State private var loadingSourceMediaID: String?

    static let supplementalPreviewLimit = 3
    static let regionalPreviewLimit = 3
    static let historyPreviewLimit = 3
    private let m = EvidenceMetrics(family: .record, domain: .dexa)

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    content
                }
                .padding(.horizontal, m.pt(15))
                .padding(.top, m.pt(14))
                .padding(.bottom, m.pt(42))
            }
            .task(id: reviewLoaded) { scrollToReviewSection(proxy) }
        }
        .physiqueOSScrollBottomClearance()
        .defaultScrollAnchor(Self.reviewScrollAnchor)
        .evidencePageChrome("DEXA")
        .evidenceFamily(.record)
        .evidenceDomain(.dexa)
        .task(id: environment.nativeAuthority) {
            if viewModelAuthority != environment.nativeAuthority {
                viewModel = DEXAHistoryViewModel(api: environment.dexaAPI)
                viewModelAuthority = environment.nativeAuthority
            }
            selectedPDF = nil
            sourceMediaMessage = nil
            loadingSourceMediaID = nil
            await viewModel?.load()
        }
        .sheet(item: $selectedPDF) { presentation in
            DEXAPDFSheet(presentation: presentation)
        }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel?.state {
        case .none, .loading:
            EvidenceStateCard(kind: .loading("Loading DEXA Evidence…"), identifier: "dexa.loading")
        case .failed(let message):
            EvidenceStateCard(kind: .failure(title: message, detail: "Pull to refresh or try again."), identifier: "dexa.failure")
        case .loaded(let report):
            EvidenceHeaderView(domain: .dexa, eyebrow: "Evidence Report", title: report.title, subtitle: report.subtitle, exposesTexts: true)
            EvidenceScopePicker(scope: report.scope) { pillID in
                Task { await viewModel?.selectScope(pillID: pillID) }
            }
            latestScanCard(report.latestScan)
            if let writeback = writebackDisplay {
                writebackCard(writeback)
            }
            summaryGrid(report.summary)
            if let delta = report.delta { sincePriorScanCard(delta) }
            coreTrendsCard(report)
            supplementalSection(report)
            regionalSection(title: "Regional Tissue Lean Mass", subtitle: "Regional lean tissue in pounds.", series: report.regionalLeanTrends, namespace: "regionalLean", color: m.c.green, identifier: "dexa.regionalLean", isExpanded: $isRegionalLeanExpanded)
            regionalSection(title: "Regional Tissue Fat Mass", subtitle: "Regional fat tissue in pounds.", series: report.regionalFatTrends, namespace: "regionalFat", color: m.c.amber, identifier: "dexa.regionalFat", isExpanded: $isRegionalFatExpanded)
            historyCard(report.history)
        }
    }

    private var reviewLoaded: Bool {
        if case .loaded = viewModel?.state { return true }
        return false
    }

    /// Debug review only: `-physiqueos.evidence-review.scroll-to <section>`.
    private func scrollToReviewSection(_ proxy: ScrollViewProxy) {
        #if DEBUG
        let arguments = ProcessInfo.processInfo.arguments
        guard reviewLoaded, let flag = arguments.firstIndex(of: "-physiqueos.evidence-review.scroll-to"),
              arguments.indices.contains(flag + 1) else { return }
        let target = arguments[flag + 1]
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 400_000_000)
            proxy.scrollTo(target, anchor: .top)
        }
        #endif
    }

    // MARK: - Latest Scan

    private func latestScanCard(_ scan: DEXALatestScan?) -> some View {
        RecordCard {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .firstTextBaseline, spacing: m.pt(8)) {
                    Text("Latest Scan")
                        .evidenceText(RecordText.sectionTitle)
                        .foregroundStyle(m.c.ink)
                    Spacer(minLength: 0)
                    if let mediaId = scan?.sourceMediaId {
                        sourceMediaButton(mediaId: mediaId)
                    }
                }
                .padding(.bottom, m.pt(9))
                if let scan {
                    HStack(alignment: .center, spacing: m.pt(10)) {
                        VStack(alignment: .leading, spacing: 0) {
                            Text(RecordDate.long(scan.date))
                                .evidenceText(RecordText.rowLabel)
                                .foregroundStyle(m.c.ink)
                            Text(scan.sourceLabel)
                                .evidenceText(RecordText.rowCopy)
                                .foregroundStyle(m.c.quiet)
                                .padding(.top, m.pt(3))
                        }
                        Spacer(minLength: 0)
                        RecordTag(text: "Latest")
                    }
                    .padding(.vertical, m.pt(9))
                    .padding(.horizontal, m.pt(1))
                    .accessibilityElement(children: .combine)
                    if let sourceMediaMessage {
                        Text(sourceMediaMessage)
                            .evidenceText(RecordText.rowCopy)
                            .foregroundStyle(m.c.muted)
                    }
                } else {
                    Text("No DEXA scans in this period.")
                        .evidenceText(RecordText.body)
                        .foregroundStyle(m.c.muted)
                        .padding(.vertical, m.pt(9))
                }
            }
        }
        .padding(.bottom, m.pt(17))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("dexa.latestScan")
    }

    private func sourceMediaButton(mediaId: String) -> some View {
        Button {
            loadSourcePDF(mediaId: mediaId)
        } label: {
            Text(loadingSourceMediaID == mediaId ? "Loading PDF…" : "View BodySpec PDF")
                .evidenceText(RecordText.action)
                .foregroundStyle(m.c.accent)
                .evidenceHitTarget(visualHeight: m.pt(12))
        }
        .buttonStyle(.plain)
        .disabled(loadingSourceMediaID != nil)
        .accessibilityIdentifier("dexa.latestScan.viewPDF")
    }

    // MARK: - DEXA → Apple Health

    private struct WritebackDisplay {
        let completed: Bool
        let attention: Bool
        let label: String
        let showsRetry: Bool
    }

    /// Founder Production's real writeback coordinator. The Debug review
    /// seam renders the same card in Sandbox for parity capture only.
    private var writebackDisplay: WritebackDisplay? {
        #if DEBUG
        if let label = Self.reviewWritebackLabel {
            return WritebackDisplay(completed: true, attention: false, label: label, showsRetry: false)
        }
        #endif
        guard environment.nativeAuthority == .founderProduction else { return nil }
        let coordinator = environment.dexaHealthKitWritebackCoordinator
        let attention: Bool
        switch coordinator.state {
        case .failed, .permissionNeeded: attention = true
        default: attention = false
        }
        return WritebackDisplay(
            completed: coordinator.state == .current || coordinator.state == .deleted,
            attention: attention,
            label: coordinator.state.label,
            showsRetry: coordinator.isEnabled && coordinator.state != .reconciling
        )
    }

    private func writebackCard(_ display: WritebackDisplay) -> some View {
        RecordCard {
            HStack(alignment: .center, spacing: m.pt(9)) {
                Text(display.completed ? "✓" : (display.attention ? "!" : "○"))
                    .evidenceText(.normal(18, 400, jakarta: false))
                    .foregroundStyle(display.completed ? m.c.green : (display.attention ? m.c.amber : m.c.quiet))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 0) {
                    Text("DEXA → Apple Health")
                        .evidenceText(RecordText.rowLabel)
                        .foregroundStyle(m.c.ink)
                    Text(display.label)
                        .evidenceText(RecordText.rowCopy)
                        .foregroundStyle(m.c.quiet)
                        .padding(.top, m.pt(3))
                }
                Spacer(minLength: 0)
                if display.showsRetry {
                    Button("Retry") {
                        Task { await environment.dexaHealthKitWritebackCoordinator.reconcilePermanent() }
                    }
                    .buttonStyle(.plain)
                    .evidenceText(RecordText.action)
                    .foregroundStyle(m.c.accent)
                    .frame(minWidth: 44, minHeight: 44, alignment: .trailing)
                    .accessibilityIdentifier("dexa.writeback.retry")
                }
            }
            .accessibilityElement(children: .combine)
        }
        .padding(.bottom, m.pt(17))
        .accessibilityIdentifier("dexa.writeback")
    }

    // MARK: - Headline metrics

    /// `.summary-grid`: two columns of `surface2` metrics; an odd last item
    /// spans both columns.
    private func summaryGrid(_ items: [DEXASummaryItem]) -> some View {
        let pairs = stride(from: 0, to: items.count, by: 2).map { Array(items[$0..<min($0 + 2, items.count)]) }
        return VStack(spacing: m.pt(7)) {
            ForEach(Array(pairs.enumerated()), id: \.offset) { _, pair in
                HStack(spacing: m.pt(7)) {
                    ForEach(pair) { item in summaryMetric(item) }
                }
            }
        }
        .padding(.bottom, m.pt(17))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("dexa.summary")
    }

    private func summaryMetric(_ item: DEXASummaryItem) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(item.label)
                .evidenceText(RecordText.metricLabel)
                .foregroundStyle(m.c.quiet)
            Text(item.value)
                .evidenceText(RecordText.metricValue)
                .foregroundStyle(m.c.ink)
                .padding(.top, m.pt(3))
        }
        .padding(m.pt(10))
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(m.c.surface2, in: RoundedRectangle(cornerRadius: m.pt(10)))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(item.label): \(item.value)")
    }

    // MARK: - Since Prior Scan (locked final correction)

    /// One horizontal summary: three equal columns, compact uppercase
    /// labels, semantic value colors and subtle separators — no nested
    /// tiles. Values and units are the canonical delta strings.
    private func sincePriorScanCard(_ delta: DEXADelta) -> some View {
        RecordCard(padding: 14) {
            VStack(alignment: .leading, spacing: 0) {
                Text("Since Prior Scan")
                    .evidenceText(RecordText.sectionTitle)
                    .foregroundStyle(m.c.ink)
                HStack(spacing: 0) {
                    deltaColumn(Self.sincePriorScanColumnLabels[0], delta.bodyFatPercentagePoints, color: m.c.green, separated: false)
                    deltaColumn(Self.sincePriorScanColumnLabels[1], delta.fatMassPounds, color: m.c.amber, separated: true)
                    deltaColumn(Self.sincePriorScanColumnLabels[2], delta.leanMassPounds, color: m.c.blue, separated: true)
                }
                .padding(.top, m.pt(13))
            }
        }
        .padding(.bottom, m.pt(17))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("dexa.sincePriorScan")
        .id("dexa.sincePriorScan")
    }

    private func deltaColumn(_ label: String, _ value: String, color: Color, separated: Bool) -> some View {
        VStack(spacing: 0) {
            Text(label)
                .evidenceText(.normal(9, 500, jakarta: false, tracking: 0.54, uppercase: true, relativeTo: .caption2))
                .foregroundStyle(m.c.quiet)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            Text(value)
                .evidenceText(.normal(16, 500, jakarta: false, relativeTo: .headline))
                .foregroundStyle(value == "0.0 lb" || value == "0.0 pts" ? m.c.quiet : color)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .padding(.top, m.pt(7))
        }
        .padding(.top, m.pt(3))
        .padding(.bottom, m.pt(2))
        .padding(.horizontal, m.pt(12))
        .frame(maxWidth: .infinity)
        .overlay(alignment: .leading) {
            if separated { Rectangle().fill(m.c.line).frame(width: m.pt(1)) }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(label): \(value)")
    }

    // MARK: - Core Trends (always open, five charts)

    private func coreTrendsCard(_ report: DEXAReportReadModel) -> some View {
        let series = [report.bodyFatTrend] + report.coreTrends
        return RecordCard {
            VStack(alignment: .leading, spacing: 0) {
                Text("Core Trends")
                    .evidenceText(RecordText.sectionTitle)
                    .foregroundStyle(m.c.ink)
                Text(series.map(\.title).joined(separator: ", "))
                    .evidenceText(RecordText.rowCopy)
                    .foregroundStyle(m.c.quiet)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, m.pt(3))
                VStack(spacing: m.pt(8)) {
                    ForEach(series) { item in
                        chart(item, namespace: "core", color: item.title.contains("Fat Mass") ? m.c.amber : m.c.green)
                    }
                }
                .padding(.top, m.pt(8))
            }
        }
        .padding(.bottom, m.pt(17))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("dexa.coreTrends")
        .id("dexa.coreTrends")
    }

    private func chart(_ series: DEXAMetricSeries, namespace: String, color: Color) -> some View {
        let key = "\(namespace)-\(series.title)"
        return DEXATrendChartView(
            series: series,
            color: color,
            selectedPointID: Binding(
                get: { selectedMetricPointIDs[key] },
                set: { selectedMetricPointIDs[key] = $0 }
            )
        )
    }

    // MARK: - Disclosures (independent Show All / Close)

    private func metricList(_ rows: [(String, String)], identifier: String) -> some View {
        VStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
                HStack(spacing: m.pt(10)) {
                    Text(row.0)
                        .evidenceText(.normal(10, 400, jakarta: false))
                        .foregroundStyle(m.c.ink)
                    Spacer(minLength: 0)
                    Text(row.1)
                        .evidenceText(.normal(10, 800, jakarta: false))
                        .foregroundStyle(m.c.ink)
                }
                .padding(m.pt(10))
                .background(m.c.surface2.opacity(0.7))
                .overlay(alignment: .bottom) {
                    if index < rows.count - 1 { Rectangle().fill(m.c.line).frame(height: m.pt(1)) }
                }
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("\(identifier).row.\(row.0)")
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: m.pt(11)))
    }

    /// Supplemental Metrics: three rows, or all nine followed by the VAT
    /// Mass and A/G Ratio charts.
    @ViewBuilder
    private func supplementalSection(_ report: DEXAReportReadModel) -> some View {
        let rows = isSupplementalExpanded ? report.supplementalDetails : Array(report.supplementalDetails.prefix(Self.supplementalPreviewLimit))
        RecordCard {
            VStack(alignment: .leading, spacing: 0) {
                RecordDisclosureHead(
                    title: "Supplemental Metrics",
                    subtitle: "Secondary calibration metrics from BodySpec.",
                    isExpanded: isSupplementalExpanded,
                    identifier: "dexa.supplemental.toggle"
                ) { withAnimation(.easeInOut(duration: 0.2)) { isSupplementalExpanded.toggle() } }
                metricList(rows.map { ($0.label, $0.value) }, identifier: "dexa.supplemental")
                    .padding(.top, m.pt(10))
            }
        }
        .padding(.bottom, m.pt(17))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("dexa.supplemental")
        .id("dexa.supplemental")
        if isSupplementalExpanded, !report.supplementalTrends.isEmpty {
            expandedCharts(report.supplementalTrends, namespace: "supplemental", color: m.c.amber, identifier: "dexa.supplemental.charts")
        }
    }

    @ViewBuilder
    private func regionalSection(title: String, subtitle: String, series: [DEXAMetricSeries], namespace: String, color: Color, identifier: String, isExpanded: Binding<Bool>) -> some View {
        let rows = isExpanded.wrappedValue ? series : Array(series.prefix(Self.regionalPreviewLimit))
        RecordCard {
            VStack(alignment: .leading, spacing: 0) {
                RecordDisclosureHead(
                    title: title,
                    subtitle: subtitle,
                    isExpanded: isExpanded.wrappedValue,
                    identifier: "\(identifier).toggle"
                ) { withAnimation(.easeInOut(duration: 0.2)) { isExpanded.wrappedValue.toggle() } }
                metricList(rows.map { ($0.title, latestValue($0)) }, identifier: identifier)
                    .padding(.top, m.pt(10))
            }
        }
        .padding(.bottom, m.pt(17))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier(identifier)
        .id(identifier)
        if isExpanded.wrappedValue, !series.isEmpty {
            expandedCharts(series, namespace: namespace, color: color, identifier: "\(identifier).charts")
        }
    }

    /// The locked expanded state: the section's rows, then its graphs as
    /// standalone chart blocks before the next section.
    private func expandedCharts(_ series: [DEXAMetricSeries], namespace: String, color: Color, identifier: String) -> some View {
        VStack(spacing: m.pt(8)) {
            ForEach(series) { item in chart(item, namespace: namespace, color: color) }
        }
        .padding(.bottom, m.pt(17))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier(identifier)
    }

    private func latestValue(_ series: DEXAMetricSeries) -> String {
        guard let value = series.points.last(where: { $0.value != nil })?.value else { return "Unavailable" }
        return series.unit.isEmpty ? String(format: "%.2f", value) : "\(String(format: "%.1f", value))\(series.unit)"
    }

    // MARK: - Scan History

    private func historyCard(_ rows: [DEXAScanHistoryRow]) -> some View {
        let visible = isHistoryExpanded ? rows : Array(rows.prefix(Self.historyPreviewLimit))
        return RecordCard {
            VStack(alignment: .leading, spacing: 0) {
                RecordDisclosureHead(
                    title: "Scan History",
                    isExpanded: isHistoryExpanded,
                    identifier: "dexa.history.toggle"
                ) { withAnimation(.easeInOut(duration: 0.2)) { isHistoryExpanded.toggle() } }
                if rows.isEmpty {
                    Text("No DEXA scans in this period.")
                        .evidenceText(RecordText.body)
                        .foregroundStyle(m.c.muted)
                        .padding(.top, m.pt(11))
                } else {
                    VStack(spacing: m.pt(7)) {
                        ForEach(visible) { row in
                            DEXAScanHistoryRowView(row: row) {
                                guard let mediaId = row.sourceMediaId else { return }
                                loadSourcePDF(mediaId: mediaId)
                            }
                        }
                    }
                    .padding(.top, m.pt(11))
                    .padding(.bottom, m.pt(7))
                }
            }
        }
        .padding(.bottom, m.pt(17))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("dexa.history")
        .id("dexa.history")
    }

    private func loadSourcePDF(mediaId: String) {
        guard environment.nativeAuthority == .founderProduction else { return }
        loadingSourceMediaID = mediaId
        sourceMediaMessage = nil
        Task {
            do {
                let payload = try await environment.productionNativeAPI.readMedia(mediaId: mediaId)
                guard payload.contentType == "application/pdf", PDFDocument(data: payload.data) != nil else {
                    throw ProductionNativeError.unsupportedMediaType(payload.contentType)
                }
                await MainActor.run {
                    selectedPDF = DEXAPDFPresentation(mediaId: mediaId, data: payload.data)
                    loadingSourceMediaID = nil
                }
            } catch {
                await MainActor.run {
                    sourceMediaMessage = (error as? LocalizedError)?.errorDescription ?? "The BodySpec PDF could not be loaded."
                    loadingSourceMediaID = nil
                }
            }
        }
    }
}

private extension DEXAHistoryView {
    static var reviewScrollAnchor: UnitPoint? {
        #if DEBUG
        EvidenceRedesignReview.scrollsToBottom ? .bottom : nil
        #else
        nil
        #endif
    }

    /// `-physiqueos.evidence-review.dexa-expanded supplemental,lean,fat,history`.
    static func reviewExpanded(_ section: String) -> Bool {
        #if DEBUG
        let arguments = ProcessInfo.processInfo.arguments
        guard let flag = arguments.firstIndex(of: "-physiqueos.evidence-review.dexa-expanded"),
              arguments.indices.contains(flag + 1) else { return false }
        return arguments[flag + 1].split(separator: ",").contains(Substring(section))
        #else
        return false
        #endif
    }

    #if DEBUG
    /// `-physiqueos.evidence-review.dexa-writeback <label>` shows the
    /// Production writeback card in Sandbox for parity capture only.
    static var reviewWritebackLabel: String? {
        let arguments = ProcessInfo.processInfo.arguments
        guard let flag = arguments.firstIndex(of: "-physiqueos.evidence-review.dexa-writeback"),
              arguments.indices.contains(flag + 1) else { return nil }
        return arguments[flag + 1]
    }
    #endif
}

/// `.scan`: date and source, Body Fat in green, the fat · lean · RMR line
/// and View BodySpec PDF only when source media exists. Read-only; no scan
/// detail route.
private struct DEXAScanHistoryRowView: View {
    let row: DEXAScanHistoryRow
    var onOpenSource: () -> Void = {}
    private let m = EvidenceMetrics(family: .record, domain: .dexa)

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: m.pt(12)) {
                VStack(alignment: .leading, spacing: 0) {
                    Text(RecordDate.long(row.date))
                        .evidenceText(RecordText.rowLabel)
                        .foregroundStyle(m.c.ink)
                    Text(row.sourceLabel)
                        .evidenceText(RecordText.rowCopy)
                        .foregroundStyle(m.c.quiet)
                        .padding(.top, m.pt(3))
                }
                Spacer(minLength: 0)
                Text(row.bodyFatPercentage)
                    .evidenceText(.normal(13, 700, jakarta: false))
                    .foregroundStyle(m.c.green)
            }
            Text("\(row.fatMass) fat · \(row.leanMass) lean · \(row.restingMetabolicRate) RMR")
                .evidenceText(.normal(8.5, 400, jakarta: false, relativeTo: .caption2))
                .foregroundStyle(m.c.muted)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, m.pt(7))
            if row.sourceMediaId != nil {
                Button("View BodySpec PDF", action: onOpenSource)
                    .buttonStyle(.plain)
                    .evidenceText(RecordText.action)
                    .foregroundStyle(m.c.accent)
                    .evidenceHitTarget(visualHeight: m.pt(12))
                    .padding(.top, m.pt(8))
                    .accessibilityIdentifier("dexa.history.\(row.id).viewPDF")
            }
        }
        .padding(m.pt(11))
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(m.c.surface2, in: RoundedRectangle(cornerRadius: m.pt(11)))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("dexa.history.\(row.id)")
    }
}

private struct DEXAPDFPresentation: Identifiable {
    let mediaId: String
    let data: Data
    var id: String { mediaId }
}

private struct DEXAPDFSheet: View {
    @Environment(\.dismiss) private var dismiss
    let presentation: DEXAPDFPresentation

    var body: some View {
        NavigationStack {
            ZStack {
                PhysiqueOSTheme.redesignCanvas.ignoresSafeArea()
                DEXAPDFView(data: presentation.data)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(PhysiqueOSTheme.redesignRule))
                    .padding(.horizontal, 10)
                    .padding(.bottom, 10)
            }
                .navigationTitle("BodySpec Report")
                .navigationBarTitleDisplayMode(.inline)
                .toolbarBackground(PhysiqueOSTheme.redesignCanvas, for: .navigationBar)
                .toolbarBackground(.visible, for: .navigationBar)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Label("Read-only PDF", systemImage: "doc.richtext")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
                            .accessibilityLabel("Read-only BodySpec PDF")
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") { dismiss() }
                            .fontWeight(.bold)
                            .tint(PhysiqueOSTheme.redesignTeal)
                    }
                }
                .accessibilityIdentifier("dexa.pdf.sheet")
        }
    }
}

private struct DEXAPDFView: UIViewRepresentable {
    let data: Data

    func makeUIView(context: Context) -> PDFView {
        let view = PDFView()
        view.autoScales = true
        view.displayMode = .singlePageContinuous
        view.displayDirection = .vertical
        view.backgroundColor = UIColor(PhysiqueOSTheme.redesignPaper)
        view.document = PDFDocument(data: data)
        return view
    }

    func updateUIView(_ uiView: PDFView, context: Context) {
        if uiView.document?.dataRepresentation() != data {
            uiView.document = PDFDocument(data: data)
        }
    }
}
