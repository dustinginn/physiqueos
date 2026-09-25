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
    @State private var viewModelAuthority: NativeAPIEnvironment?
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
            ProgressView()
                .tint(PhysiqueOSTheme.accent)
                .frame(maxWidth: .infinity, minHeight: 300)
        case .failed(let message):
            Text(message)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                .frame(maxWidth: .infinity, minHeight: 300)
        case .loaded(let landing):
            VStack(alignment: .leading, spacing: 24) {
                header(for: landing)
                TrainingScopeSelectorView(scope: landing.scope) { scopeID in
                    Task { await viewModel?.selectScope(pillID: scopeID) }
                }
                latestNutritionDayCard(landing.latestNutritionDay)
                infoLinksCard(title: "Reporting", links: landing.reportingLinks)
                infoLinksCard(title: "Nutrition Areas", links: landing.nutritionAreas)
                recentHistoryCard(landing.nutritionHistory)
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
    /// Rows with a real `destination` (the 3 real Reporting ids) navigate;
    /// rows without one (Nutrition Areas, still out of scope this pass)
    /// stay informational, matching `ActivityAreaSummary`'s own
    /// non-navigating treatment.
    private func infoLinksCard(title: String, links: [NutritionInfoLink]) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                TrainingSectionHeaderView(title: title)
                VStack(spacing: 8) {
                    ForEach(links) { link in
                        if let destination = link.destination {
                            NavigationLink(value: destination) {
                                infoLinkRow(link)
                            }
                            .buttonStyle(.plain)
                        } else {
                            infoLinkRow(link)
                        }
                    }
                }
            }
        }
    }

    private func infoLinkRow(_ link: NutritionInfoLink) -> some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                Text(link.label)
                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(link.detail)
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
            if link.destination != nil {
                Spacer(minLength: 8)
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(PhysiqueOSTheme.accent)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PhysiqueOSTheme.surfaceMuted)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(link.destination != nil ? .isButton : [])
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
            ("Calories", Self.formatWhole(totals.calories, unit: nil), PhysiqueOSTheme.nutritionCalories),
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

    /// Always renders a whole number. HealthKit-derived Nutrition totals
    /// frequently carry binary floating-point tails (e.g.
    /// `2405.5120239257812`) that must never reach the user; round rather
    /// than truncate so e.g. `2405.51` displays as `2406`, not `2405`.
    /// Internal (not `private`) so `NutritionReadModelTests` can regression-test
    /// it directly via `@testable import`, matching this app's convention
    /// of testing formatting logic through the actual production entry point.
    static func formatWhole(_ value: Double?, unit: String?) -> String {
        guard let value, value.isFinite else { return "Pending" }
        let number = String(Int(value.rounded()))
        return unit.map { "\(number)\($0)" } ?? number
    }
}

/// `TrainingSourceMetadataFooter`'s sibling for Nutrition's own
