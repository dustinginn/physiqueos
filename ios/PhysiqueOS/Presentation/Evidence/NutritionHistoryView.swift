import SwiftUI

/// The Nutrition Evidence landing/history page (`/progress/nutrition`),
/// reached from the Evidence tab's Nutrition row. Section order, labels,
/// and grouping are read directly from source
/// (`ProgressPlaceholderScreen.jsx`'s `report.id === "nutrition"` render
/// path), following `ActivityHistoryView`'s established structural
/// precedent for this codebase:
///
/// header (Evidence Report / Nutrition / subtitle) → scope selector
/// (Build Lean Mass / Visible Abs / All Nutrition) → Latest Nutrition Day
/// → Reporting → Nutrition Areas → Recent Nutrition History → Data Sources.
///
/// Two documented, honest deviations from full web parity (see
/// `NutritionReadModel.swift`'s type-level doc comment for the audit
/// findings behind both):
///
/// 1. **Reporting and Nutrition Areas rows are informational, not
///    navigating.** Both sections' destinations ARE live routes on the
///    web (Calories/Macros/Meals reports; Calories/Macros/Meals/
///    Micronutrients/Supplements/Hydration library pages) — unlike
///    Activity's Areas rows, which are dead links on the web itself. This
///    pass's scope is landing/history/day-detail; the three deep report
///    screens and the library browse pages are not ported, and this is
///    flagged in the final report rather than silently dropped.
/// 2. **History rows navigate to a dedicated Nutrition Day screen**
///    (`.nutritionDay(dayId:)`) — this matches the live web's own
///    behavior (Nutrition day rows ARE real links to `/progress/nutrition/
///    day/[dayId]`, unlike Activity's inline-accordion rows), so no
///    interaction adaptation was needed here.
struct NutritionHistoryView: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var viewModel: NutritionHistoryViewModel?
    @State private var viewModelAuthority: NativeAPIEnvironment?
    @State private var isHistorySheetPresented = false

    static let historyPreviewLimit = 3
    private let m = EvidenceMetrics(family: .daily)

    var body: some View {
        EvidenceScrollPage {
            content
        }
        .evidencePageChrome("Nutrition")
        .evidenceFamily(.daily)
        .task(id: environment.nativeAuthority) {
            if viewModelAuthority != environment.nativeAuthority {
                viewModel = NutritionHistoryViewModel(api: environment.nutritionAPI)
                viewModelAuthority = environment.nativeAuthority
            }
            await viewModel?.load()
        }
        .refreshable {
            if environment.nativeAuthority == .founderProduction {
                await environment.productionNativeAPI.invalidateReadResources(["nutrition"])
            }
            await viewModel?.load()
        }
        .refreshesOnForegroundWhenVisible { await viewModel?.load() }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel?.state {
        case .none, .loading:
            EvidenceStatePanel(kind: .loading("Loading Nutrition Evidence…"), identifier: "nutrition.loading")
        case .failed(let message):
            EvidenceStatePanel(kind: .failure(message, nil), identifier: "nutrition.failure")
        case .loaded(let landing):
            EvidencePageHeader(symbol: "⌁", eyebrow: "Evidence Report", title: landing.title, subtitle: landing.subtitle ?? "What PhysiqueOS currently understands.")
            EvidenceScopePicker(scope: landing.scope) { scopeID in
                Task { await viewModel?.selectScope(pillID: scopeID) }
            }
            latestNutritionDaySection(landing.latestNutritionDay)
            reportingSection(landing.reportingLinks)
            recentHistorySection(landing.nutritionHistory)
        }
    }

    // MARK: - Latest Nutrition Day (hero field → Nutrition Day)

    private func latestNutritionDaySection(_ day: NutritionDayRecord?) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            EvidenceDailySectionHead(title: "Latest Nutrition Day") { EmptyView() }
            if let day {
                NavigationLink(value: day.destination) {
                    EvidenceDailyHero {
                        VStack(alignment: .leading, spacing: 0) {
                            HStack(alignment: .top, spacing: m.pt(10)) {
                                VStack(alignment: .leading, spacing: 0) {
                                    Text(TrainingDayView.formatCompactDate(day.date))
                                        .evidenceText(.normal(12, 840))
                                        .foregroundStyle(m.c.ink)
                                    Text(day.value)
                                        .evidenceText(.normal(11, 800))
                                        .foregroundStyle(m.c.ink)
                                        .padding(.top, m.pt(2))
                                    Text(day.detail)
                                        .evidenceText(EvidenceTextStyle(size: 9, weight: 600, lineHeight: 12.42))
                                        .foregroundStyle(m.c.muted)
                                        .fixedSize(horizontal: false, vertical: true)
                                        .padding(.top, m.pt(3))
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                Text("›")
                                    .evidenceText(EvidenceTextStyle(size: 20, weight: 400, lineHeight: 20))
                                    .foregroundStyle(m.c.teal)
                            }
                            NutritionMacroGridView(totals: day.totals)
                                .padding(.top, m.pt(10))
                        }
                    }
                }
                .buttonStyle(.plain)
                .accessibilityElement(children: .combine)
                .accessibilityLabel("\(TrainingDateFormatting.short(day.date)) nutrition: \(day.value). \(day.detail)")
                .accessibilityAddTraits(.isButton)
                .accessibilityIdentifier("nutrition.latestDay")
            } else {
                Text("Nutrition days will appear here once meals, macros, or nutrition screenshots are uploaded.")
                    .evidenceText(EvidenceTextStyle(size: 9, weight: 400, lineHeight: 12.15))
                    .foregroundStyle(m.c.muted)
            }
        }
    }

    // MARK: - Reporting (the three functional reports; the duplicate,
    // non-navigating Nutrition Areas block is not presented — locked
    // Founder correction `8e6bd94b`)

    private func reportingSection(_ links: [NutritionInfoLink]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            EvidenceDailySectionHead(title: "Reporting") { EmptyView() }
            EvidenceDailyOpenList(data: links) { link in
                if let destination = link.destination {
                    NavigationLink(value: destination) {
                        EvidenceDailyRow(label: link.label, copy: link.detail, chevron: .center)
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(.isButton)
                    .accessibilityIdentifier("nutrition.report.\(link.id)")
                } else {
                    // A Reporting row without a canonical destination stays
                    // informational, exactly as before — never dropped.
                    EvidenceDailyRow(label: link.label, copy: link.detail, showsChevron: false)
                        .accessibilityElement(children: .combine)
                        .accessibilityIdentifier("nutrition.report.\(link.id)")
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("nutrition.reporting")
    }

    // MARK: - Recent Nutrition History (3-row preview + Show All sheet)

    private func recentHistorySection(_ history: [NutritionDayRecord]) -> some View {
        let preview = Array(history.prefix(Self.historyPreviewLimit))
        return VStack(alignment: .leading, spacing: 0) {
            EvidenceDailySectionHead(title: "Recent Nutrition History") {
                if history.count > Self.historyPreviewLimit {
                    Button {
                        isHistorySheetPresented = true
                    } label: {
                        EvidenceSectionAction(label: "Show All >")
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("nutrition.history.showAll")
                }
            }
            if preview.isEmpty {
                Text("Nutrition history will appear as meals, macros, or nutrition screenshots are uploaded.")
                    .evidenceText(EvidenceTextStyle(size: 9, weight: 400, lineHeight: 12.15))
                    .foregroundStyle(m.c.muted)
            } else {
                EvidenceDailyOpenList(data: preview) { day in
                    NavigationLink(value: day.destination) {
                        NutritionHistoryRow(day: day)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("nutrition.history")
        .sheet(isPresented: $isHistorySheetPresented) {
            NutritionHistorySheet(days: history)
        }
    }
}

// MARK: - "Show All" sheet (locked N2)

private struct NutritionHistorySheet: View {
    @Environment(\.dismiss) private var dismiss
    let days: [NutritionDayRecord]
    private let m = EvidenceMetrics(family: .daily)

    var body: some View {
        NavigationStack {
            ScrollView {
                EvidenceDailyOpenList(data: days) { day in
                    NavigationLink(value: day.destination) {
                        NutritionHistoryRow(day: day)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, m.pt(16))
                .padding(.top, m.pt(6))
                .padding(.bottom, m.pt(30))
            }
            .background(m.c.page)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(m.c.page, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: {
                        Text("‹ Nutrition")
                            .evidenceText(.normal(12, 750))
                            .foregroundStyle(m.c.muted)
                            .fixedSize()
                            .frame(minWidth: 44, minHeight: 44, alignment: .leading)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Close")
                    .accessibilityIdentifier("evidence.sheet.done")
                }
                .evidenceFlatToolbarItem()
                ToolbarItem(placement: .principal) {
                    Text("Recent Nutrition History")
                        .evidenceText(.normal(12, 800))
                        .foregroundStyle(m.c.ink)
                }
            }
            .safeAreaInset(edge: .top, spacing: 0) { Rectangle().fill(m.c.line).frame(height: m.pt(1)) }
            .navigationDestination(for: AppDestination.self) { AppDestinationRouterView(destination: $0) }
        }
        .environment(\.evidenceBackTrail, nil)
        .evidenceFamily(.daily)
        .presentationDetents([.medium, .large])
    }
}

private struct NutritionHistoryRow: View {
    let day: NutritionDayRecord

    var body: some View {
        EvidenceDailyRow(
            label: TrainingDateFormatting.short(day.date),
            copy: day.detail,
            trailing: [day.value],
            chevron: .stacked
        )
        .accessibilityAddTraits(.isButton)
        .accessibilityLabel("\(TrainingDateFormatting.short(day.date)) nutrition: \(day.value). \(day.detail)")
        .accessibilityIdentifier("nutrition.history.day.\(day.date)")
    }
}

struct NutritionMacroGridView: View {
    let totals: NutritionMacroTotals

    var body: some View {
        EvidenceDailyMetricGrid(items: Self.macroItems(totals).map { .init(label: $0.label, value: $0.value, valueColor: $0.macro?.color) })
    }

    /// The grid's labels, values and macro identities in order; colors come
    /// from `NutritionEvidenceMacro`, the shared Nutrition color authority.
    static func macroItems(_ totals: NutritionMacroTotals) -> [(label: String, value: String, macro: NutritionEvidenceMacro?)] {
        [
            ("Calories", formatWhole(totals.calories, unit: nil), .calories),
            ("Protein", formatWhole(totals.proteinG, unit: "g"), .protein),
            ("Carbohydrates", formatWhole(totals.carbsG, unit: "g"), .carbohydrates),
            ("Fat", formatWhole(totals.fatG, unit: "g"), .fat),
            ("Fiber", formatWhole(totals.fiberG, unit: "g"), nil),
        ]
    }

    static func formatWhole(_ value: Double?, unit: String?) -> String {
        guard let value, value.isFinite else { return "Pending" }
        let number = String(Int(value.rounded()))
        return unit.map { "\(number)\($0)" } ?? number
    }
}

/// `TrainingSourceMetadataFooter`'s sibling for Nutrition's own
