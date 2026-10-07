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
    @State private var viewModelAuthority: NativeAPIEnvironment?
    let date: String

    private let m = EvidenceMetrics(family: .daily, domain: .activity)

    var body: some View {
        EvidenceScrollPage {
            content
        }
        .evidencePageChrome(TrainingDateFormatting.short(date))
        .evidenceFamily(.daily)
        .evidenceDomain(.activity)
        .task(id: environment.nativeAuthority) {
            if viewModelAuthority != environment.nativeAuthority {
                viewModel = ActivityDayViewModel(api: environment.activityAPI, date: date)
                viewModelAuthority = environment.nativeAuthority
            }
            await viewModel?.load()
        }
        // Matches `ActivityHistoryView`'s refresh (Build 58 stale-Detail fix);
        // `fetchActivityDay(date:)` itself always bypasses the cache.
        .refreshable {
            if environment.nativeAuthority == .founderProduction {
                await environment.productionNativeAPI.invalidateReadResources(["activity"])
            }
            await viewModel?.load()
        }
        .refreshesOnForegroundWhenVisible { await viewModel?.load() }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel?.state {
        case .none, .loading:
            EvidenceStatePanel(kind: .loading("Loading Activity Evidence…"), identifier: "activity.day.loading")
        case .failed(let message):
            EvidenceStatePanel(kind: .failure(message, nil), identifier: "activity.day.failure")
        case .loaded(.none):
            EvidenceStatePanel(kind: .empty("No activity evidence for this day.", nil), identifier: "activity.day.empty")
        case .loaded(.some(let day)):
            header(for: day)
            if day.isInProgress {
                EvidenceDailyProvenance(title: "Still updating from Apple Health", detail: "Partial-day coverage; values remain provisional.")
                    .padding(.top, m.pt(-(16 - 9)))
            }
            EvidenceSection(title: "Activity Metrics", style: .containedDeep, identifier: "activity.day.metrics") {
                VStack(alignment: .leading, spacing: 0) {
                    ActivityMetricGridView(day: day)
                    if let warning = day.energyAnomalyMessage {
                        EvidenceDailyWarning(text: warning, provisional: day.energyAnomalyIsProvisional)
                    }
                }
            }
        }
    }

    /// `.report-head`: eyebrow, date title, value, detail, protocol status.
    private func header(for day: ActivityDayRecord) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            EvidencePageHeader(eyebrow: "Activity Day", title: TrainingDayView.formatCompactDate(day.date), subtitle: day.value, dateTitle: true)
            Text(day.detail)
                .evidenceText(EvidenceTextStyle(size: 9, weight: 600, lineHeight: 12.42))
                .foregroundStyle(m.c.muted)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, m.pt(3 - 2))
            Text(day.protocolStatus)
                .evidenceText(EvidenceTextStyle(size: 9, weight: 400, lineHeight: 12.15))
                .foregroundStyle(m.c.muted)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, m.pt(7))
        }
    }
}
