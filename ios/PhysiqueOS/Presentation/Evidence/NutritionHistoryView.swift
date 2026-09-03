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
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel: NutritionHistoryViewModel?
    @State private var isHistorySheetPresented = false

    /// `NUTRITION_HISTORY_PREVIEW_LIMIT` (`ProgressPlaceholderScreen.jsx`).
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
            if viewModel == nil { viewModel = NutritionHistoryViewModel(api: environment.nutritionAPI) }
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
        case .loaded(let landing):
            VStack(alignment: .leading, spacing: 16) {
                header(for: landing)
                TrainingScopeSelectorView(scope: landing.scope) { scopeID in
                    Task { await viewModel?.selectScope(scopeID) }
                }
                latestNutritionDayCard(landing.latestNutritionDay)
                infoLinksCard(title: "Reporting", links: landing.reportingLinks)
                infoLinksCard(title: "Nutrition Areas", links: landing.nutritionAreas)
                recentHistoryCard(landing.nutritionHistory)
                DataSourcesFooterView(items: landing.dataSources)
            }
        }
    }

    private func header(for landing: NutritionLandingReadModel) -> some View {
        HStack(alignment: .top, spacing: 12) {
            IconBadge(systemImage: "list.clipboard.fill", color: landing.tone, size: .lg, isCircular: true)
            VStack(alignment: .leading, spacing: 4) {
                Text("Evidence Report")
                    .physiqueOSFont(PhysiqueOSTypography.screenEyebrow)
                    .foregroundStyle(PhysiqueOSTheme.accent)
                Text(landing.title)
                    .physiqueOSFont(PhysiqueOSTypography.screenTitle)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(landing.subtitle ?? "What PhysiqueOS currently understands.")
                    .physiqueOSFont(PhysiqueOSTypography.screenSubtitle)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func latestNutritionDayCard(_ day: NutritionDayRecord?) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                TrainingSectionHeaderView(title: "Latest Nutrition Day")
                if let day {
                    NavigationLink(value: day.destination) {
                        VStack(alignment: .leading, spacing: 8) {
                            HStack(alignment: .top) {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(TrainingDateFormatting.short(day.date))
                                        .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                                    Text(day.value)
                                        .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                                    Text(day.detail)
                                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                                }
                                Spacer(minLength: 8)
                                Image(systemName: "chevron.right")
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundStyle(PhysiqueOSTheme.accent)
                            }
                            NutritionMacroGridView(totals: day.totals)
                        }
                        .padding(12)
                        .background(PhysiqueOSTheme.surfaceMuted)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                    .buttonStyle(.plain)
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("\(TrainingDateFormatting.short(day.date)) nutrition: \(day.value). \(day.detail)")
                    .accessibilityAddTraits(.isButton)
                } else {
                    Text("Nutrition days will appear here once meals, macros, or nutrition screenshots are uploaded.")
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
        }
    }

    /// "Reporting" / "Nutrition Areas" — informational rows only (see the
    /// type-level doc comment above for why these don't navigate yet).
    private func infoLinksCard(title: String, links: [NutritionInfoLink]) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                TrainingSectionHeaderView(title: title)
                VStack(spacing: 8) {
                    ForEach(links) { link in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(link.label)
                                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                            Text(link.detail)
                                .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        }
                        .padding(12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(PhysiqueOSTheme.surfaceMuted)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .accessibilityElement(children: .combine)
                    }
                }
            }
        }
    }

    private func recentHistoryCard(_ history: [NutritionDayRecord]) -> some View {
        let preview = Array(history.prefix(Self.historyPreviewLimit))
        return CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                TrainingSectionHeaderView(title: "Recent Nutrition History") {
                    if history.count > Self.historyPreviewLimit {
                        Button {
                            isHistorySheetPresented = true
                        } label: {
                            TrainingCompactActionLabel(label: "Show All")
                        }
                    }
                }
                if preview.isEmpty {
                    Text("Nutrition history will appear as meals, macros, or nutrition screenshots are uploaded.")
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                } else {
                    VStack(spacing: 8) {
                        ForEach(preview) { day in
                            NavigationLink(value: day.destination) {
                                NutritionHistoryRow(day: day)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
        .sheet(isPresented: $isHistorySheetPresented) {
            NutritionHistorySheet(days: history)
        }
    }
}

private struct NutritionHistorySheet: View {
    let days: [NutritionDayRecord]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 8) {
                    ForEach(days) { day in
                        NavigationLink(value: day.destination) {
                            NutritionHistoryRow(day: day)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(16)
            }
            .background(PhysiqueOSTheme.background)
            .navigationTitle("Recent Nutrition History")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(PhysiqueOSTheme.background, for: .navigationBar)
            .navigationDestination(for: AppDestination.self) { AppDestinationRouterView(destination: $0) }
        }
        .presentationDetents([.medium, .large])
    }
}

private struct NutritionHistoryRow: View {
    let day: NutritionDayRecord

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text(TrainingDateFormatting.short(day.date))
                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(day.detail)
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                if !day.sourceEvidence.isEmpty {
                    Text("Source: \(day.sourceEvidence.joined(separator: " + "))")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 2) {
                Text(day.value)
                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(PhysiqueOSTheme.accent)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity)
        .background(PhysiqueOSTheme.surfaceMuted)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
        .accessibilityLabel("\(TrainingDateFormatting.short(day.date)) nutrition: \(day.value). \(day.detail)")
    }
}

/// Mirrors the web's exact semantic macro colors, verified directly from
/// `src/app/globals.css`'s dark-theme custom properties (this app's single,
/// fixed dark presentation): `--macro-protein: #fb7185`,
/// `--macro-carbohydrates: #fbbf24`, `--macro-fat: #38bdf8` — these are the
/// same hex values already defined as `PhysiqueOSTheme.macroProtein/
/// macroCarbohydrates/macroFat`, confirmed to match exactly (this port adds
/// no new color tokens for those three). Calories has no dedicated
/// semantic token on the web — `NutritionCaloriesOverTimeChart.jsx` uses
/// the generic chart palette `--chart-3` (`#fbbf24` dark), which is the
/// same hex `PhysiqueOSTheme.chartEffort` already carries, reused here for
/// the same reason rather than defining a redundant fourth token. Fiber
/// has no web color at all (not part of the 3-macro palette) and renders
/// in the neutral text color, matching that absence.
struct NutritionMacroGridView: View {
    let totals: NutritionMacroTotals

    private var tiles: [(label: String, value: String, color: Color)] {
        [
            ("Calories", Self.formatWhole(totals.calories, unit: nil), PhysiqueOSTheme.chartEffort),
            ("Protein", Self.formatWhole(totals.proteinG, unit: "g"), PhysiqueOSTheme.macroProtein),
            ("Carbohydrates", Self.formatWhole(totals.carbsG, unit: "g"), PhysiqueOSTheme.macroCarbohydrates),
            ("Fat", Self.formatWhole(totals.fatG, unit: "g"), PhysiqueOSTheme.macroFat),
            ("Fiber", Self.formatWhole(totals.fiberG, unit: "g"), PhysiqueOSTheme.textPrimary),
        ]
    }

    var body: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
            ForEach(tiles, id: \.label) { tile in
                VStack(alignment: .leading, spacing: 2) {
                    Text(tile.label)
                        .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                    Text(tile.value)
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(tile.color)
                }
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(PhysiqueOSTheme.surfaceElevated)
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .accessibilityElement(children: .combine)
                .accessibilityLabel("\(tile.label): \(tile.value)")
            }
        }
    }

    private static func formatWhole(_ value: Double?, unit: String?) -> String {
        guard let value, value.isFinite else { return "Pending" }
        let number = value.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(value)) : String(value)
        return unit.map { "\(number)\($0)" } ?? number
    }
}

/// `TrainingSourceMetadataFooter`'s sibling for Nutrition's own
/// `getDataSources("nutrition")` shape — mirrors `ActivityHistoryView`'s
/// own private `DataSourcesFooterView` exactly (same `{name, status}`
/// shape) but kept as its own type rather than shared, matching this
/// codebase's established per-vertical convention (see
/// `ActivityHistoryView.swift`'s own doc comment on why Activity's isn't
/// shared with Training's either).
private struct DataSourcesFooterView: View {
    let items: [NutritionDataSource]

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
