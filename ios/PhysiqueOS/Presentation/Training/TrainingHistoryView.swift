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
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var viewModel: TrainingHistoryViewModel?

    @State private var isLatestDayExpanded = false
    @State private var isReportingExpanded = false
    @State private var isProtocolExpanded = false
    @State private var isHistorySheetPresented = false

    private let m = EvidenceMetrics(family: .training)

    var body: some View {
        EvidenceScrollPage {
            content
        }
        .evidencePageChrome("Training", arrowBack: true)
        .evidenceFamily(.training)
        .task {
            if viewModel == nil { viewModel = TrainingHistoryViewModel(api: environment.trainingAPI) }
            await viewModel?.load()
        }
        .onChange(of: environment.nativeAuthority) { _, _ in
            viewModel = TrainingHistoryViewModel(api: environment.trainingAPI)
            Task { await viewModel?.load() }
        }
        .refreshesOnForegroundWhenVisible { await viewModel?.load() }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel?.state {
        case .none, .loading:
            EvidenceStatePanel(kind: .loading("Loading Training Evidence"), identifier: "training.loading")
        case .failed(let message):
            EvidenceStatePanel(kind: .failure(message, nil), identifier: "training.failure")
        case .loaded(let landing):
            EvidencePageHeader(
                showsMark: true,
                eyebrow: "Evidence Report",
                title: landing.title,
                subtitle: landing.subtitle ?? "What PhysiqueOS currently understands."
            )
            EvidenceScopePicker(scope: landing.scope) { scopeID in
                Task { await viewModel?.selectScope(pillID: scopeID) }
            }
            latestTrainingDaySection(landing.latestTrainingDay)
            trainingAreasSection(landing.trainingAreas)
            reportingSection(landing.reportingLinks)
            recentHistorySection(landing)
            currentProtocolSection(landing.currentProtocol)
            RelatedGoalsView(goals: landing.relatedGoals)
        }
    }

    // MARK: - Latest Training Day

    /// The label/summary stays the inline disclosure toggle (approved
    /// Native V1 behavior); "View Training Day →" is its own link to the
    /// same `day.destination` every other Training Day link uses.
    private func latestTrainingDaySection(_ day: TrainingLandingDay?) -> some View {
        EvidenceSection(title: "Latest Training Day", identifier: "training.latestDay") {
            if let day {
                EvidenceField {
                    VStack(alignment: .leading, spacing: 0) {
                        Button {
                            withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.2)) { isLatestDayExpanded.toggle() }
                        } label: {
                            VStack(alignment: .leading, spacing: 0) {
                                Text(day.label)
                                    .evidenceText(EvidenceTextStyle(size: 12, weight: 760, lineHeight: 15.84))
                                    .foregroundStyle(m.c.ink)
                                if let daySummary = day.daySummary {
                                    Text(daySummary)
                                        .evidenceText(EvidenceTextStyle(size: 10, weight: 400, lineHeight: 14))
                                        .foregroundStyle(m.c.muted)
                                        .padding(.top, m.pt(2))
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(.isButton)
                        .accessibilityValue(isLatestDayExpanded ? "Expanded" : "Collapsed")

                        NavigationLink(value: day.destination) {
                            Text("View Training Day →")
                                .evidenceText(.normal(10, 800))
                                .foregroundStyle(m.c.purple)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .evidenceHitTarget(visualHeight: m.pt(12))
                        }
                        .buttonStyle(.plain)
                        .padding(.top, m.pt(7))
                        .accessibilityIdentifier("training.latestDay.view")

                        if isLatestDayExpanded {
                            EvidenceDividedList(data: day.sessions) { session in
                                NavigationLink(value: session.destination) {
                                    EvidenceRailRow(
                                        label: session.label,
                                        detail: session.detail,
                                        value: session.value,
                                        tone: .strength
                                    )
                                }
                                .buttonStyle(.plain)
                            }
                            .padding(.top, m.pt(10))
                        }
                    }
                }
            } else {
                Text("Upload or enter a workout to begin building your training history.")
                    .evidenceText(EvidenceTextStyle(size: 10, weight: 400, lineHeight: 14))
                    .foregroundStyle(m.c.muted)
            }
        }
    }

    // MARK: - Training Areas (all 10, exact order and counts)

    private func trainingAreasSection(_ areas: [TrainingAreaSummary]) -> some View {
        EvidenceSection(title: "Training Areas", identifier: "training.areas") {
            NavigationLink(value: AppDestination.progressStream(streamId: "training/library")) {
                EvidenceSectionAction(label: "Browse >")
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("training.areas.browse")
        } content: {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: m.pt(7)), GridItem(.flexible(), spacing: m.pt(7))], spacing: m.pt(7)) {
                ForEach(areas) { area in
                    NavigationLink(value: area.destination) {
                        TrainingAreaTile(area: area)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("training.area.\(area.id)")
                }
            }
        }
    }

    // MARK: - Reporting (one disclosure over all six reporting routes)

    private func reportingSection(_ links: [TrainingReportingLink]) -> some View {
        EvidenceSection(title: "Reporting", identifier: "training.reporting") {
            EvidenceField {
                PhysiqueOSDisclosureRow(
                    isExpanded: $isReportingExpanded,
                    chrome: .none,
                    toggleLabel: "Review trends and summaries",
                    toggleHint: "Resistance, cardio, volume, frequency, consistency, and history.",
                    toggleIdentifier: "training-reporting-disclosure"
                ) {
                    EvidenceKitDisclosureRow(
                        label: "Review trends and summaries",
                        detail: "Resistance, cardio, volume, frequency, consistency, and history.",
                        isExpanded: isReportingExpanded
                    )
                } expanded: {
                    EvidenceDividedList(data: links) { link in
                        NavigationLink(value: link.destination) {
                            EvidenceLinkRow(label: link.label, detail: link.detail)
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("training-report-\(link.id)")
                    }
                    .overlay(alignment: .top) { Rectangle().fill(m.c.line).frame(height: m.pt(1)) }
                }
            }
        }
    }

    // MARK: - Recent Training History (preview row + Show All sheet)

    private func recentHistorySection(_ landing: TrainingLandingReadModel) -> some View {
        EvidenceSection(title: "Recent Training History", style: .open, identifier: "training.recentHistory") {
            Button {
                isHistorySheetPresented = true
            } label: {
                EvidenceSectionAction(label: "Show All >")
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("training.recentHistory.showAll")
        } content: {
            if let mostRecent = landing.trainingDays.first {
                NavigationLink(value: mostRecent.destination) {
                    TrainingDayRailRow(day: mostRecent)
                }
                .buttonStyle(.plain)
            } else {
                Text("Training days will appear as workouts are uploaded or connected.")
                    .evidenceText(EvidenceTextStyle(size: 10, weight: 400, lineHeight: 14))
                    .foregroundStyle(m.c.muted)
            }
        }
        .sheet(isPresented: $isHistorySheetPresented) {
            TrainingHistorySheet(days: landing.trainingDays)
        }
    }

    // MARK: - Current Protocol

    private func currentProtocolSection(_ protocolSummary: TrainingProtocolSummary) -> some View {
        EvidenceSection(title: "Current Protocol", identifier: "training.protocol") {
            EvidenceField {
                PhysiqueOSDisclosureRow(isExpanded: $isProtocolExpanded, chrome: .none) {
                    EvidenceKitDisclosureRow(
                        label: protocolSummary.sourceOfTruth,
                        detail: protocolSummary.goal,
                        isExpanded: isProtocolExpanded,
                        trailingText: "View protocol details"
                    )
                } expanded: {
                    EvidenceDefinitionList(rows: [
                        ("Source of truth", protocolSummary.sourceOfTruth),
                        ("Daily activity target", protocolSummary.dailyActivityTarget),
                        ("Training objective", protocolSummary.trainingObjective),
                        ("Goal", protocolSummary.goal),
                        ("Future protocol settings", "Coming soon"),
                    ])
                    .padding(.top, m.pt(4))
                }
            }
        }
    }
}

// MARK: - "Show All" history sheet (locked T2)

private struct TrainingHistorySheet: View {
    @Environment(\.dismiss) private var dismiss
    let days: [TrainingDaySummary]

    private let m = EvidenceMetrics(family: .training)

    var body: some View {
        NavigationStack {
            ScrollView {
                EvidenceDividedList(data: days) { day in
                    NavigationLink(value: day.destination) {
                        TrainingDayRailRow(day: day)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, m.pt(16))
                .padding(.top, m.pt(10))
                .padding(.bottom, m.pt(30))
            }
            .background(m.c.page)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(m.c.page, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: {
                        Text("Done")
                            .evidenceText(.normal(13, 750))
                            .foregroundStyle(m.c.muted)
                            .frame(minWidth: 44, minHeight: 44, alignment: .leading)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("training.history.done")
                }
                .evidenceFlatToolbarItem()
                ToolbarItem(placement: .principal) {
                    Text("Recent Training History")
                        .evidenceText(.normal(13, 750))
                        .foregroundStyle(m.c.ink)
                }
            }
            .navigationDestination(for: AppDestination.self) { AppDestinationRouterView(destination: $0) }
        }
        .environment(\.evidenceBackTrail, nil)
        .evidenceFamily(.training)
        .presentationDetents([.medium, .large])
    }
}

/// A Training day in the locked rail-row language: the type line is the
/// canonical summary's own classification (body areas = Strength; Walking,
/// Cardio and Cooldown are activity classes), never a new label.
struct TrainingDayRailRow: View {
    let day: TrainingDaySummary

    var body: some View {
        let kind = TrainingDayKindLabel(summary: day.summary)
        EvidenceRailRow(type: kind.type, label: day.label, detail: day.summary, tone: kind.tone)
            .accessibilityElement(children: .combine)
    }
}

/// Classifies a canonical Training day summary ("Chest · Triceps ·
/// Walking", "Cardio") into the locked row type and rail tone.
struct TrainingDayKindLabel: Equatable {
    static let activityClasses = ["Walking", "Cardio", "Cooldown"]

    let type: String?
    let tone: EvidenceRailTone

    init(summary: String?) {
        let tokens = (summary ?? "").components(separatedBy: " · ").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        let activities = tokens.filter { Self.activityClasses.contains($0) }
        let hasStrength = tokens.contains { !Self.activityClasses.contains($0) }
        var parts: [String] = hasStrength ? ["Strength"] : []
        for activity in activities where !parts.contains(activity) { parts.append(activity) }
        type = parts.isEmpty ? nil : parts.joined(separator: " + ")
        if hasStrength {
            tone = .strength
        } else if activities.contains("Cooldown") && activities.count == 1 {
            tone = .cooldown
        } else if activities.isEmpty {
            tone = .neutral
        } else {
            tone = activities.contains("Walking") && !activities.contains("Cardio") ? .walking : .cardio
        }
    }
}

/// `.tile`: an area mark, label and exercise count (locked T1 grid).
private struct TrainingAreaTile: View {
    let area: TrainingAreaSummary
    private let m = EvidenceMetrics(family: .training)

    var body: some View {
        HStack(spacing: m.pt(8)) {
            Image(systemName: TrainingAreaIcon.systemImage(for: area.id))
                .resizable()
                .fontWeight(.medium)
                .scaledToFit()
                .frame(width: m.pt(TrainingAreaIcon.glyphBox), height: m.pt(TrainingAreaIcon.glyphBox))
                .foregroundStyle(m.c.muted)
                .frame(width: m.pt(22), height: m.pt(22))
                .overlay(Circle().strokeBorder(m.c.line, lineWidth: m.pt(1)))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 0) {
                Text(area.label)
                    .evidenceText(.normal(10, 760))
                    .foregroundStyle(m.c.ink)
                    .lineLimit(1)
                Text("\(area.exerciseCount) exercise\(area.exerciseCount == 1 ? "" : "s")")
                    .evidenceText(.normal(8, 400))
                    .foregroundStyle(m.c.muted)
                    .lineLimit(1)
                    .padding(.top, m.pt(2))
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, m.pt(9))
        .padding(.horizontal, m.pt(10))
        .frame(maxWidth: .infinity, minHeight: max(44, m.pt(50)), alignment: .leading)
        .background(m.c.surface2, in: RoundedRectangle(cornerRadius: m.pt(11)))
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

/// A disclosure row: label, detail, trailing text or `›` that turns down
/// when expanded.
struct EvidenceKitDisclosureRow: View {
    @Environment(\.evidenceFamily) private var family
    @Environment(\.evidenceDomain) private var domain
    let label: String
    var detail: String?
    let isExpanded: Bool
    var trailingText: String?

    var body: some View {
        let m = EvidenceMetrics(family: family, domain: domain)
        HStack(spacing: m.pt(10)) {
            VStack(alignment: .leading, spacing: 0) {
                Text(label)
                    .evidenceText(EvidenceTextStyle(size: 12, weight: 760, lineHeight: 15.84))
                    .foregroundStyle(m.c.ink)
                if let detail {
                    Text(detail)
                        .evidenceText(EvidenceTextStyle(size: 10, weight: 400, lineHeight: 14))
                        .foregroundStyle(m.c.muted)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, m.pt(2))
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if let trailingText {
                Text(trailingText)
                    .evidenceText(.normal(10, 800))
                    .foregroundStyle(m.c.purple)
            }
            Text("›")
                .evidenceText(EvidenceTextStyle(size: 17, weight: 400, lineHeight: 17))
                .foregroundStyle(m.c.purple)
                .rotationEffect(.degrees(isExpanded ? 90 : 0))
        }
        .padding(.horizontal, m.pt(5))
        .padding(.vertical, m.pt(9))
        .frame(minHeight: max(44, m.pt(48)))
        .contentShape(Rectangle())
    }
}

// MARK: - Shared small pieces local to the Training landing page

/// Mirrors `SectionHeader` (`DeepPagePrimitives.jsx`): a bold title with an
/// optional trailing action link — visually distinct from the small
/// uppercase `SectionHeading` eyebrow style used on Home/Log cards.
/// Internal (not `private`): also reused by `TrainingAreaView`.
struct TrainingSectionHeaderView<Action: View>: View {
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

/// Mirrors `CompactAction` (`DeepPagePrimitives.jsx:7-18`) and
/// `TrainingHistorySheet.jsx`'s own "Show All &gt;" trigger literally: both
/// render `{label} &gt;`, a plain greater-than character — not an arrow.
/// "View Training Day →" (`latestTrainingDayCard`) is a different, genuine
/// web string that really does use "→" and is left as-is; this label was
/// previously (incorrectly) unified with that one. Not `private`: also
/// reused by `ActivityHistoryView`'s own "Show All" trigger, the identical
/// `CompactAction` shape on that page.
struct TrainingCompactActionLabel: View {
    let label: String

    var body: some View {
        Text("\(label) >")
            .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
            .foregroundStyle(PhysiqueOSTheme.accent)
            // A plain `Text` with no opaque background only hit-tests its
            // rendered glyphs by default — `contentShape` makes the whole
            // frame (including inter-glyph gaps) tappable, matching the
            // real touch target every other row-styled control gets for
            // free from its `.background(...)` fill.
            .contentShape(Rectangle())
    }
}

/// The Training Area icon system. SF Symbols has no muscle-anatomy
/// glyphs, so every area uses one consistent metaphor: the native SF
/// fitness figure (or equipment) for a movement that primarily trains that
/// area. Biceps and Triceps deliberately share the arm-oriented dumbbell.
/// The icon sits in the locked T1 22-pt ring tile mark; only the glyph
/// content changed from the harness's abstract marks (◉ ⌁ ◌ …).
enum TrainingAreaIcon {
    /// The 10 canonical muscle-group Training Area ids, in
    /// `TRAINING_AREA_NAV_GROUPS` order. Also doubles as the set
    /// `AppDestinationRouterView` uses to tell an area-grid row's
    /// `.trainingExercise(exerciseId:)` destination (e.g. `"chest"`) apart
    /// from an individual exercise leaf's destination using the exact same
    /// case (e.g. `"bench-press"`) — both are real, typed
    /// `training.exercise` destinations, so only the id value disambiguates
    /// them.
    static let canonicalAreaIds: Set<String> = [
        "chest", "back", "shoulders", "biceps", "triceps",
        "core", "quads", "hamstrings", "glutes", "calves",
    ]

    /// Every glyph is fitted into this square inside the 22-pt ring
    /// (before harness scaling), so wide figures (Core, the dumbbell) keep
    /// the same clearance from the ring as the upright ones.
    static let glyphBox: CGFloat = 12

    static func systemImage(for areaId: String) -> String {
        switch areaId {
        case "chest": "figure.strengthtraining.traditional" // barbell press
        case "back": "figure.rower" // row / pull
        case "shoulders": "figure.mixed.cardio" // arms overhead
        case "biceps", "triceps": "dumbbell.fill" // arm work
        case "core": "figure.core.training" // floor core work
        case "quads": "figure.strengthtraining.functional" // loaded lunge
        case "hamstrings": "figure.flexibility" // hinge / hamstring reach
        case "glutes": "figure.step.training" // step-up / hip extension
        case "calves": "figure.run" // ankle push-off
        default: "dumbbell.fill"
        }
    }
}

/// Not `private`: also reused by `TrainingReportingView` for PR/highlight/
/// needs-attention/category-rollup rows, which share this exact
/// label+detail+chevron shape.
struct TrainingLinkRow: View {
    let label: String
    var detail: String?

    var body: some View {
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                if let detail {
                    Text(detail)
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
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

/// `TrainingTimelineSelector` — the "Build Lean Mass" / "Visible Abs" /
/// "All ___" scope pills plus the date-range label beneath them
/// ("Complete history" when All is selected). Internal (not `private`):
/// every Training Library page (Chest included), Activity, and now
/// Nutrition/Weight all show this same selector.
///
/// `onSelect == nil` (every Training Library page, Activity's original
/// usage) renders the prior inert display-only pills — a browse page
/// showing the current scope isn't expected to let you change it web-side
/// either. Passing `onSelect` (Training's own landing page, Activity after
/// its chronology adoption, and Nutrition/Weight) makes the pills real
/// `Button`s: this is the fix for the pills being "an accurate but inert
/// snapshot of the current scope" this type's doc comment previously
/// recorded as a known deviation — tapping a pill now actually re-fetches
/// a differently date-windowed report via `EvidenceChronology`, the same
/// shared mechanism backing the web's own re-fetch-on-select behavior.
struct TrainingScopeSelectorView: View {
    let scope: TrainingScopeContext
    /// Called with the tapped option's raw `TrainingScopeOption.id` (a
    /// `EvidenceScopeSelection.pillID` string) — from either the primary
    /// Goal row or the contextual Phase row below it. The caller parses it
    /// via `EvidenceScopeSelection(pillID:)`.
    var onSelect: ((String) -> Void)?

    init(scope: TrainingScopeContext, onSelect: ((String) -> Void)? = nil) {
        self.scope = scope
        self.onSelect = onSelect
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Viewing")
                .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                .foregroundStyle(PhysiqueOSTheme.textMuted)
            HStack(spacing: 6) {
                ForEach(scope.options) { option in
                    pill(for: option, style: .primary)
                }
            }
            // Contextual secondary row: only appears when the focused Goal
            // has more than one canonical Phase (`EvidenceChronology.
            // scopeContext`) — "a selected Goal may expose its Phases
            // contextually" rather than one giant flat row of every Goal
            // and Phase.
            if !scope.phaseOptions.isEmpty {
                HStack(spacing: 6) {
                    ForEach(scope.phaseOptions) { option in
                        pill(for: option, style: .phase)
                    }
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

    private enum PillStyle { case primary, phase }

    @ViewBuilder
    private func pill(for option: TrainingScopeOption, style: PillStyle) -> some View {
        let selectedBackground = style == .primary ? PhysiqueOSTheme.accent : PhysiqueOSTheme.accent.opacity(0.7)
        let label = Text(option.label)
            .physiqueOSFont(style == .primary ? PhysiqueOSTypography.caption12Semibold : PhysiqueOSTypography.caption12Medium)
            .foregroundStyle(option.selected ? .white : PhysiqueOSTheme.textSecondary)
            .padding(.horizontal, style == .primary ? 10 : 8)
            .padding(.vertical, style == .primary ? 6 : 4)
            .background(option.selected ? selectedBackground : PhysiqueOSTheme.surfaceMuted)
            .clipShape(Capsule())

        if let onSelect {
            Button {
                onSelect(option.id)
            } label: {
                label
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(option.selected ? [.isButton, .isSelected] : .isButton)
        } else {
            label
        }
    }
}

/// `RelatedGoalsCard` (`EvidenceReportContext.jsx`) — a plain card of
/// tappable goal pills, only rendered when non-empty.
private struct RelatedGoalsView: View {
    let goals: [TrainingRelatedGoal]
    private let m = EvidenceMetrics(family: .training)

    var body: some View {
        if !goals.isEmpty {
            EvidenceSection(title: "Related Goals", style: .open, identifier: "training.relatedGoals") {
                FlowLayout(spacing: m.pt(6)) {
                    ForEach(goals) { goal in
                        NavigationLink(value: goal.destination) {
                            Text(goal.title)
                                .evidenceText(.normal(10, 700))
                                .foregroundStyle(m.c.muted)
                                .padding(.horizontal, m.pt(9 + 1))
                                .padding(.vertical, m.pt(7 + 1))
                                .background(m.c.surface2, in: RoundedRectangle(cornerRadius: m.pt(9)))
                                .overlay(RoundedRectangle(cornerRadius: m.pt(9)).strokeBorder(m.c.line, lineWidth: m.pt(1)))
                                .evidenceHitTarget(visualHeight: m.pt(28))
                        }
                        .buttonStyle(.plain)
                    }
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

/// Not `private`: also used by `TrainingExerciseHistoryCalculator` for
/// benchmark/history-row date formatting.
enum TrainingDateFormatting {
    private static let dateKeyFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = TimeZone(identifier: "UTC")
        return formatter
    }()

    /// Handles both full ISO-8601 session timestamps and the bare
    /// `"YYYY-MM-DD"` date keys `TrainingPerformanceEvent.workoutDate`
    /// uses (`isDateKey` on the web) — `ISO8601DateFormatter` alone
    /// rejects the latter.
    static func date(from value: String) -> Date? {
        ISO8601DateFormatter().date(from: value) ?? dateKeyFormatter.date(from: value)
    }

    /// Formats a calendar DATE KEY. Passing an ISO-8601 instant here is a
    /// defect, not a convenience: the first ten characters of an instant are
    /// its UTC date, so an evening timestamp in a western time zone renders as
    /// tomorrow. That is exactly how the Evidence Review header came to show
    /// "Sep 13" for a Sep 12 DEXA scan.
    static func short(_ value: String) -> String {
        // Web `formatDate` treats the first ten characters as a calendar
        // date, not an instant. Preserve that date key so a UTC midnight
        // never appears as the prior day in a western device time zone.
        if let date = dateKeyFormatter.date(from: String(value.prefix(10))) {
            let display = DateFormatter()
            display.dateFormat = "MMM d"
            display.timeZone = TimeZone(identifier: "UTC")
            return display.string(from: date)
        }
        return String(value.prefix(10))
    }
}
