import SwiftUI

/// The Training evidence landing page (`/progress/training`), reached from
/// the Evidence tab's Training row. Full copy-first rebuild from
/// `ProgressPlaceholderScreen.jsx`'s `report.id === "training"` render path
/// (`TrainingEvidenceContext` + `TrainingEvidenceReport`) — the prior
/// slice's "Training Overview" / "Training Understanding" stat-card
/// composition was a native invention this screen never actually renders
/// server-side, and has been discarded rather than preserved. Section
/// order, labels, grouping, and navigation affordances below are read
/// directly from source, not reinterpreted into a native dashboard:
///
/// header (Evidence Report / Training / subtitle) → scope selector
/// (Build Lean Mass / Visible Abs / All Training + date-range label) →
/// Latest Training Day → Training Areas → Reporting → Recent Training
/// History → Current Protocol → Related Goals → Data Sources.
///
/// Training Day and TrainingSession detail (reached from here) are
/// unchanged in this patch — see `TrainingDayView`/`TrainingSessionDetailView`.
struct TrainingHistoryView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel: TrainingHistoryViewModel?

    @State private var isLatestDayExpanded = false
    @State private var isReportingExpanded = false
    @State private var isProtocolExpanded = false
    @State private var isHistorySheetPresented = false

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
        .toolbarBackground(PhysiqueOSTheme.background, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button {
                    dismiss()
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 13, weight: .semibold))
                        Text("Evidence Hub")
                            .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                    }
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
        }
        .task {
            if viewModel == nil { viewModel = TrainingHistoryViewModel(api: environment.trainingAPI) }
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
                TrainingScopeSelectorView(scope: landing.scope)
                latestTrainingDayCard(landing.latestTrainingDay)
                trainingAreasCard(landing.trainingAreas)
                reportingCard(landing.reportingLinks)
                recentHistoryCard(landing)
                currentProtocolCard(landing.currentProtocol)
                RelatedGoalsView(goals: landing.relatedGoals)
                DataSourcesFooterView(items: landing.sourceEvidence)
            }
        }
    }

    // MARK: - Header ("Evidence Report" eyebrow, IconBadge, title, subtitle)

    private func header(for landing: TrainingLandingReadModel) -> some View {
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

    // MARK: - Latest Training Day

    private func latestTrainingDayCard(_ day: TrainingLandingDay?) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                TrainingSectionHeaderView(title: "Latest Training Day")
                if let day {
                    TrainingDisclosureRow(isExpanded: $isLatestDayExpanded) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(day.label)
                                .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                            if let daySummary = day.daySummary {
                                Text(daySummary)
                                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                            }
                            Text("View Training Day →")
                                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                .foregroundStyle(PhysiqueOSTheme.accent)
                                .padding(.top, 2)
                        }
                    } expanded: {
                        VStack(spacing: 8) {
                            ForEach(day.sessions) { session in
                                NavigationLink(value: session.destination) {
                                    TrainingRecordPreviewRow(
                                        label: session.label,
                                        detail: session.detail,
                                        value: session.value,
                                        date: session.date,
                                        sourceEvidence: session.sourceEvidence
                                    )
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                } else {
                    Text("Upload or enter a workout to begin building your training history.")
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
        }
    }

    // MARK: - Training Areas

    private func trainingAreasCard(_ areas: [TrainingAreaSummary]) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                TrainingSectionHeaderView(title: "Training Areas") {
                    NavigationLink(value: AppDestination.progressStream(streamId: "training/library")) {
                        TrainingCompactActionLabel(label: "Browse")
                    }
                }
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                    ForEach(areas) { area in
                        NavigationLink(value: area.destination) {
                            TrainingAreaRow(area: area)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    // MARK: - Reporting (compact expandable summary of the 5 reporting links)

    private func reportingCard(_ links: [TrainingReportingLink]) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                TrainingSectionHeaderView(title: "Reporting")
                TrainingDisclosureRow(isExpanded: $isReportingExpanded) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Review trends and summaries")
                            .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        Text("Resistance, cardio, volume, frequency, and consistency.")
                            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    }
                } expanded: {
                    VStack(spacing: 8) {
                        ForEach(links) { link in
                            NavigationLink(value: link.destination) {
                                TrainingLinkRow(label: link.label, detail: link.detail)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
    }

    // MARK: - Recent Training History (single preview row + "Show All" sheet)

    private func recentHistoryCard(_ landing: TrainingLandingReadModel) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                TrainingSectionHeaderView(title: "Recent Training History") {
                    Button {
                        isHistorySheetPresented = true
                    } label: {
                        TrainingCompactActionLabel(label: "Show All")
                    }
                }
                if let mostRecent = landing.trainingDays.first {
                    NavigationLink(value: mostRecent.destination) {
                        HStack(spacing: 8) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(mostRecent.label)
                                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                                    .lineLimit(1)
                                if let summary = mostRecent.summary {
                                    Text(summary)
                                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                                }
                            }
                            Spacer(minLength: 8)
                            Image(systemName: "chevron.right")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(PhysiqueOSTheme.accent)
                        }
                        .padding(.horizontal, 12)
                        .frame(minHeight: 48)
                        .frame(maxWidth: .infinity)
                        .background(PhysiqueOSTheme.surfaceMuted)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                    .buttonStyle(.plain)
                } else {
                    Text("Training days will appear as workouts are uploaded or connected.")
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
        }
        .sheet(isPresented: $isHistorySheetPresented) {
            TrainingHistorySheet(days: landing.trainingDays)
        }
    }

    // MARK: - Current Protocol

    private func currentProtocolCard(_ protocolSummary: TrainingProtocolSummary) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                TrainingSectionHeaderView(title: "Current Protocol")
                TrainingDisclosureRow(isExpanded: $isProtocolExpanded) {
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(protocolSummary.sourceOfTruth)
                                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                            Text(protocolSummary.goal)
                                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        }
                        Spacer(minLength: 8)
                        Text("View protocol details")
                            .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                            .foregroundStyle(PhysiqueOSTheme.accent)
                    }
                } expanded: {
                    VStack(spacing: 8) {
                        TrainingProtocolRow(label: "Source of truth", value: protocolSummary.sourceOfTruth)
                        TrainingProtocolRow(label: "Daily activity target", value: protocolSummary.dailyActivityTarget)
                        TrainingProtocolRow(label: "Training objective", value: protocolSummary.trainingObjective)
                        TrainingProtocolRow(label: "Goal", value: protocolSummary.goal)
                        TrainingProtocolRow(label: "Future protocol settings", value: "Coming soon")
                    }
                }
            }
        }
    }
}

// MARK: - "Show All" history sheet (mirrors `TrainingHistorySheet.jsx`)

private struct TrainingHistorySheet: View {
    let days: [TrainingDaySummary]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 8) {
                    ForEach(days) { day in
                        NavigationLink(value: day.destination) {
                            HStack(spacing: 8) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(day.label)
                                        .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                                    if let summary = day.summary {
                                        Text(summary)
                                            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                                    }
                                }
                                Spacer(minLength: 8)
                                Image(systemName: "chevron.right")
                                    .font(.system(size: 13, weight: .black))
                                    .foregroundStyle(PhysiqueOSTheme.accent)
                            }
                            .padding(.horizontal, 12)
                            .frame(minHeight: 56)
                            .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.plain)
                        if day.id != days.last?.id {
                            Divider().overlay(PhysiqueOSTheme.divider)
                        }
                    }
                }
                .padding(16)
            }
            .background(PhysiqueOSTheme.background)
            .navigationTitle("Recent Training History")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(PhysiqueOSTheme.background, for: .navigationBar)
            .navigationDestination(for: AppDestination.self) { AppDestinationRouterView(destination: $0) }
        }
        .presentationDetents([.medium, .large])
    }
}

// MARK: - Shared small pieces local to the Training landing page

/// Mirrors `SectionHeader` (`DeepPagePrimitives.jsx`): a bold title with an
/// optional trailing action link — visually distinct from the small
/// uppercase `SectionHeading` eyebrow style used on Home/Log cards.
private struct TrainingSectionHeaderView<Action: View>: View {
    let title: String
    @ViewBuilder var action: Action

    init(title: String, @ViewBuilder action: () -> Action = { EmptyView() }) {
        self.title = title
        self.action = action()
    }

    var body: some View {
        HStack(alignment: .center) {
            Text(title)
                .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
            Spacer(minLength: 8)
            action
        }
    }
}

private struct TrainingCompactActionLabel: View {
    let label: String

    var body: some View {
        Text("\(label) →")
            .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
            .foregroundStyle(PhysiqueOSTheme.accent)
    }
}

/// A local disclosure (collapsed summary / expanded content) matching the
/// established manual-toggle pattern already used for Log's "Log weigh-in"
/// disclosure — not SwiftUI's `DisclosureGroup`, whose automatic trailing
/// chevron doesn't match the web's plain `&lt;details&gt;`/`&lt;summary&gt;`
/// styling.
private struct TrainingDisclosureRow<Summary: View, Expanded: View>: View {
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
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(.isButton)
            .accessibilityValue(isExpanded ? "Expanded" : "Collapsed")

            if isExpanded {
                expanded
                    .padding(.top, 12)
            }
        }
        .padding(12)
        .background(PhysiqueOSTheme.surfaceMuted)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

private struct TrainingRecordPreviewRow: View {
    let label: String
    let detail: String
    let value: String
    let date: String
    let sourceEvidence: [String]

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .top, spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(label)
                        .physiqueOSFont(PhysiqueOSTypography.calloutStrong)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    Text(detail)
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
                Spacer(minLength: 8)
                VStack(alignment: .trailing, spacing: 2) {
                    Text(value)
                        .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    Text(TrainingDateFormatting.short(date))
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
            }
            if !sourceEvidence.isEmpty {
                Text("Source: \(sourceEvidence.joined(separator: " + "))")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PhysiqueOSTheme.surfaceElevated)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

private struct TrainingAreaRow: View {
    let area: TrainingAreaSummary

    var body: some View {
        HStack(spacing: 8) {
            ZStack {
                Circle()
                    .strokeBorder(PhysiqueOSTheme.divider, lineWidth: 1)
                    .background(Circle().fill(PhysiqueOSTheme.surfaceElevated))
                Image(systemName: TrainingAreaIcon.systemImage(for: area.id))
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
            .frame(width: 28, height: 28)

            VStack(alignment: .leading, spacing: 1) {
                Text(area.label)
                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    .lineLimit(1)
                if area.exerciseCount > 0 {
                    Text("\(area.exerciseCount) exercise\(area.exerciseCount == 1 ? "" : "s")")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 4)
            Image(systemName: "chevron.right")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(PhysiqueOSTheme.accent)
        }
        .padding(.horizontal, 10)
        .frame(minHeight: 56)
        .frame(maxWidth: .infinity)
        .background(PhysiqueOSTheme.surfaceMuted)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

/// `getTrainingAreaIcon` (`ProgressPlaceholderScreen.jsx:1041-1056`) —
/// documented best SF Symbol equivalents of the web's lucide icons per
/// area, not pixel-exact ports.
private enum TrainingAreaIcon {
    static func systemImage(for areaId: String) -> String {
        switch areaId {
        case "chest": "circle.circle.fill" // CircleDot
        case "back", "biceps", "triceps": "dumbbell.fill" // Dumbbell
        case "shoulders", "hamstrings": "waveform.path.ecg" // Activity
        case "core": "shield.fill" // Shield
        case "glutes": "flame.fill" // Flame
        case "quads": "bolt.fill" // Zap
        case "calves": "waveform.path.ecg" // Activity
        default: "dumbbell.fill"
        }
    }
}

private struct TrainingLinkRow: View {
    let label: String
    let detail: String

    var body: some View {
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(detail)
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
            Spacer(minLength: 8)
            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(PhysiqueOSTheme.accent)
        }
        .padding(12)
        .frame(maxWidth: .infinity)
        .background(PhysiqueOSTheme.surfaceElevated)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

private struct TrainingProtocolRow: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                .foregroundStyle(PhysiqueOSTheme.textMuted)
            Text(value)
                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PhysiqueOSTheme.surfaceElevated)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}

/// `TrainingTimelineSelector` — the "Build Lean Mass" / "Visible Abs" /
/// "All Training" scope pills plus the date-range label beneath them
/// ("Complete history" when All Training is selected). Rendered as an
/// accurate but inert snapshot of the current scope: switching pills on
/// the web re-fetches a differently date-windowed report, which this
/// fixture-only slice has no second scoped dataset to honestly back yet —
/// see the final report's noted deviation.
private struct TrainingScopeSelectorView: View {
    let scope: TrainingScopeContext

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Viewing")
                .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                .foregroundStyle(PhysiqueOSTheme.textMuted)
            HStack(spacing: 6) {
                ForEach(scope.options) { option in
                    Text(option.label)
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(option.selected ? .white : PhysiqueOSTheme.textSecondary)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(option.selected ? PhysiqueOSTheme.accent : PhysiqueOSTheme.surfaceMuted)
                        .clipShape(Capsule())
                }
            }
            Text(scope.dateRangeLabel)
                .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                .foregroundStyle(PhysiqueOSTheme.textMuted)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PhysiqueOSTheme.surfaceElevated)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .strokeBorder(PhysiqueOSTheme.divider, lineWidth: 1)
        )
    }
}

/// `RelatedGoalsCard` (`EvidenceReportContext.jsx`) — a plain card of
/// tappable goal pills, only rendered when non-empty.
private struct RelatedGoalsView: View {
    let goals: [TrainingRelatedGoal]

    var body: some View {
        if !goals.isEmpty {
            CardContainer(padding: .sm) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Related Goals")
                        .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    FlowLayout(spacing: 8) {
                        ForEach(goals) { goal in
                            NavigationLink(value: goal.destination) {
                                Text(goal.title)
                                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                    .foregroundStyle(PhysiqueOSTheme.accent)
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 6)
                                    .background(PhysiqueOSTheme.accent.opacity(0.14))
                                    .clipShape(Capsule())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
    }
}

/// `TrainingSourceMetadataFooter` — a plain border-top "Data Sources"
/// footer of label/sources pairs, only rendered when non-empty.
private struct DataSourcesFooterView: View {
    let items: [TrainingSourceEvidenceItem]

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
                        Text(item.label)
                        Spacer(minLength: 8)
                        Text(item.sources.joined(separator: " + "))
                            .foregroundStyle(PhysiqueOSTheme.textMuted)
                    }
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
        }
    }
}

/// A minimal wrapping layout for the Related Goals pill row — `HStack`
/// alone would clip/scroll instead of wrapping to a new line.
private struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var rowWidth: CGFloat = 0
        var totalHeight: CGFloat = 0
        var rowHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if rowWidth + size.width > width, rowWidth > 0 {
                totalHeight += rowHeight + spacing
                rowWidth = 0
                rowHeight = 0
            }
            rowWidth += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        totalHeight += rowHeight
        return CGSize(width: width.isFinite ? width : rowWidth, height: totalHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX
        var y = bounds.minY
        var rowHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > bounds.maxX, x > bounds.minX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            subview.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}

private enum TrainingDateFormatting {
    static func short(_ value: String) -> String {
        let isoWithTime = ISO8601DateFormatter()
        if let date = isoWithTime.date(from: value) {
            let display = DateFormatter()
            display.dateFormat = "MMM d"
            return display.string(from: date)
        }
        return String(value.prefix(10))
    }
}
