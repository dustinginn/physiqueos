import SwiftUI

/// Activity Day detail (`.activityDay(date:)`) — a Native-only push
/// destination, not a literal web route. The live web page shows this
/// exact same content (a `createActivityDayRecord()` object's
/// value/detail/protocolStatus plus its `ActivityMetricGrid`) inline on
/// `/progress/activity` — either always-expanded in the Latest Activity
/// Day card, or revealed by expanding a history row's `<details>` — never
/// as a separate page. Native pushes to a dedicated screen instead: the
/// brief's Detail Navigation requirement (tap an Activity record → its
/// detail, back preserves Evidence context, no dead end) over the web's
/// inline-only accordion is a touch-interaction/navigation adaptation, not
/// new product content — the information shown is unchanged, and reuses
/// `ActivityMetricGridView`, the same component `ActivityHistoryView`'s
/// Latest Activity Day card uses. Mirrors `TrainingDayView`'s structure
/// (header eyebrow/title/subtitle, one grouped `CardContainer` below) for
/// consistency with the sibling Evidence day-detail screen.
struct ActivityDayView: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var viewModel: ActivityDayViewModel?
    let date: String

    var body: some View {
        ScrollView {
            content
                .padding(.horizontal, 16)
                .padding(.top, 12)
        }
        .physiqueOSScrollBottomClearance()
        .background(PhysiqueOSTheme.background)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(PhysiqueOSTheme.background, for: .navigationBar)
        .task {
            if viewModel == nil { viewModel = ActivityDayViewModel(api: environment.activityAPI, date: date) }
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
        case .loaded(.none):
            Text("No activity evidence for this day.")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                .frame(maxWidth: .infinity, minHeight: 300)
        case .loaded(.some(let day)):
            VStack(alignment: .leading, spacing: 16) {
                header(for: day)
                metricsCard(day)
            }
        }
    }

    private func header(for day: ActivityDayRecord) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Activity Day")
                .physiqueOSFont(PhysiqueOSTypography.sectionLabel)
                .foregroundStyle(PhysiqueOSTheme.accent)
            // Reuses `TrainingDayView`'s own UTC-safe, DateComponents-only
            // compact-date formatter rather than a second parallel
            // implementation — this is the exact bug class
            // (midnight-UTC day shift in Pacific time) the brief calls out
            // to avoid, and this codebase has already gotten right once.
            Text(TrainingDayView.formatCompactDate(day.date))
                .physiqueOSFont(PhysiqueOSTypography.screenTitle)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                .accessibilityLabel(TrainingDayView.formatCompactDate(day.date))
            Text(day.value)
                .physiqueOSFont(PhysiqueOSTypography.screenSubtitle)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
            Text(day.detail)
                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                .foregroundStyle(PhysiqueOSTheme.textMuted)
            Text(day.protocolStatus)
                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func metricsCard(_ day: ActivityDayRecord) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                SectionHeading("Activity Metrics")
                ActivityMetricGridView(day: day)
            }
        }
    }
}
