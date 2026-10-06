import SwiftUI

/// `/briefings/review` — the complete chronological Briefing History in the
/// Founder-locked Final Design Batch 2 presentation (populated / empty /
/// loading / failed). Reads through the authority-switching `BriefingAPI`
/// (`briefing-history` under Founder Production, `BriefingSandboxStore`
/// under Sandbox) — never a second History-only fixture. Server-sorted
/// newest-first already (canonical publication timestamp, then record id);
/// Native does not re-sort, and opening a row reads the published artifact
/// (nothing is generated).
///
/// Verified real behavior: History rows carry only cadence, title and date
/// — no Confidence or Goal/Phase attribution (the bounded row has none).
struct BriefingHistoryView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    var onNavigate: (AppDestination) -> Void = { _ in }

    @State private var state: LoadState = .loading

    enum LoadState: Equatable {
        case loading
        case loaded([BriefingHistoryRowReadModel])
        case failed(String)
    }

    var body: some View {
        VStack(spacing: 0) {
            BriefingHistoryTopBar(onBack: { dismiss() })
            ScrollView {
                BriefingHistoryContent(state: state) { row in
                    onNavigate(.briefingDetail(briefingId: row.artifactId))
                }
                .padding(.horizontal, 18)
            }
            .physiqueOSScrollBottomClearance()
            .refreshable {
                if environment.nativeAuthority == .founderProduction {
                    await environment.productionNativeAPI.invalidateReadResources(["briefing-history"])
                }
                await load(showLoading: false)
            }
        }
        .background(BriefingHistoryPalette.page)
        .toolbar(.hidden, for: .navigationBar)
        .navigationBarBackButtonHidden(true)
        .restoresInteractivePopGesture()
        .task(id: environment.nativeAuthority) {
            await load(showLoading: true)
        }
        .refreshesOnForegroundWhenVisible { await load(showLoading: false) }
    }

    @MainActor
    private func load(showLoading: Bool) async {
        #if DEBUG
        if let reviewState = BriefingReviewLaunchConfiguration.historyState {
            state = reviewState
            return
        }
        #endif
        if showLoading { state = .loading }
        do {
            state = .loaded(try await environment.briefingAPI.fetchHistory())
        } catch {
            state = .failed("Briefing History could not be loaded.")
        }
    }
}

/// Final Design Batch 2 History tokens (SF Pro harness, 402 px).
enum BriefingHistoryPalette {
    static let page = BriefingPalette.d(0x06131E, 0xEFEEE7)
    static let surface2 = BriefingPalette.d(0x132B39, 0xE5F1EE)
    static let line = BriefingPalette.d(0x25404B, 0xC7D1CD)
    static let ink = BriefingPalette.d(0xF2F6F4, 0x0B2030)
    static let secondary = BriefingPalette.d(0xAEC0C7, 0x536B73)
    static let muted = BriefingPalette.d(0x7F98A2, 0x789097)
    static let purple = BriefingPalette.d(0xA88BF5, 0x7658D7)
    static let teal = BriefingPalette.d(0x2CCDC0, 0x0C8F84)
}

/// `.topbar`: 52 px bar, `‹ Back`, bottom rule.
struct BriefingHistoryTopBar: View {
    let onBack: () -> Void

    var body: some View {
        HStack(spacing: 0) {
            Button(action: onBack) {
                HStack(spacing: 7) {
                    // The locked harness's back control renders in the
                    // platform button face: 13.33 px regular, 27 px chevron.
                    Text("‹").briefingText(.sf(27, 400, lineHeight: 27)).accessibilityHidden(true)
                    Text("Back").briefingText(.sf(13.33, 400))
                }
                .foregroundStyle(BriefingHistoryPalette.secondary)
                .frame(minWidth: 44, minHeight: 44, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Back")
            .accessibilityIdentifier("briefingHistory.back")
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 18)
        .frame(height: 52)
        .overlay(alignment: .bottom) { Rectangle().fill(BriefingHistoryPalette.line).frame(height: 1) }
        .background(BriefingHistoryPalette.page)
    }
}

/// Header + list / state body for one History load state.
struct BriefingHistoryContent: View {
    let state: BriefingHistoryView.LoadState
    var onOpen: (BriefingHistoryRowReadModel) -> Void = { _ in }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            switch state {
            case .loading:
                stateCenter(identifier: "briefingHistory.loading") {
                    ProgressView().controlSize(.regular).tint(BriefingHistoryPalette.teal).frame(width: 30, height: 30)
                    Text("Loading published briefings").briefingText(.sf(16, 400))
                }
            case .failed(let message):
                stateCenter(identifier: "briefingHistory.failed") {
                    glyph("!")
                    BriefingParagraph(message, .sf(20, 780, lineHeight: 22, tracking: -0.02), color: BriefingHistoryPalette.secondary, alignment: .center)
                }
            case .loaded(let rows) where rows.isEmpty:
                stateCenter(identifier: "briefingHistory.empty") {
                    glyph("▦")
                    BriefingParagraph("No Briefings have been published yet.", .sf(20, 780, lineHeight: 22, tracking: -0.02), color: BriefingHistoryPalette.secondary, alignment: .center)
                }
            case .loaded(let rows):
                VStack(spacing: 0) {
                    ForEach(rows) { row in
                        BriefingHistoryRow(briefing: row) { onOpen(row) }
                    }
                }
                .briefingRule(.top, BriefingHistoryPalette.line)
                .accessibilityIdentifier("briefingHistory.list")
            }
        }
        .padding(.top, 18)
    }

    private var countText: String {
        if case .loaded(let rows) = state { return "\(rows.count) published \(rows.count == 1 ? "briefing" : "briefings")" }
        return "— published briefings"
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("BRIEFINGS")
                .briefingText(.sf(12, 800, tracking: 0.12))
                .foregroundStyle(BriefingHistoryPalette.purple)
            BriefingParagraph("Briefing History", .sf(31, 800, lineHeight: 31.93, tracking: -0.035, relativeTo: .largeTitle), color: BriefingHistoryPalette.ink)
                .accessibilityAddTraits(.isHeader)
            Text(countText)
                .briefingText(.sf(12, 750))
                .foregroundStyle(BriefingHistoryPalette.muted)
                .padding(.top, 7)
                .accessibilityIdentifier("briefingHistory.count")
        }
        .padding(.bottom, 18)
    }

    private func glyph(_ text: String) -> some View {
        Text(text)
            .briefingText(.sf(25, 400))
            .foregroundStyle(BriefingHistoryPalette.teal)
            // Measured: CoreText sets the glyph 2 pt lower than Chrome's
            // centered `place-items` box; a draw-only correction.
            .offset(y: -2)
            .frame(width: 64, height: 64)
            .background(BriefingHistoryPalette.surface2, in: Circle())
            .accessibilityHidden(true)
    }

    private func stateCenter<Content: View>(identifier: String, @ViewBuilder _ content: () -> Content) -> some View {
        VStack(spacing: 14) { content() }
            .foregroundStyle(BriefingHistoryPalette.secondary)
            .frame(maxWidth: .infinity, minHeight: 560)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier(identifier)
    }
}

/// `.history-row`: 36 px cadence tile, cadence eyebrow, title, timestamp,
/// chevron; 78 px minimum, full-row 44 pt+ target.
struct BriefingHistoryRow: View {
    let briefing: BriefingHistoryRowReadModel
    let onTap: () -> Void

    /// The locked per-cadence glyphs (▦ ◷ ◉ ⌁ ◌) as SF Symbols.
    static func symbol(for briefing: BriefingHistoryRowReadModel) -> String {
        if briefing.isDEXAEvent { return "waveform.path" }
        if briefing.isPhotoEvent { return "smallcircle.filled.circle" }
        switch briefing.cadence {
        case .weekly: return "square.fill"
        case .midweek: return "clock"
        case .monthly: return "circle.dotted"
        case .daily, .event: return "square.fill"
        }
    }

    var body: some View {
        Button(action: onTap) {
            HStack(alignment: .center, spacing: 10) {
                Image(systemName: Self.symbol(for: briefing))
                    .font(.system(size: briefing.cadence == .weekly ? 12 : 14, weight: .semibold))
                    .foregroundStyle(BriefingHistoryPalette.teal)
                    .frame(width: 36, height: 36)
                    .background(BriefingHistoryPalette.surface2, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .frame(width: 42, alignment: .leading)
                VStack(alignment: .leading, spacing: 0) {
                    Text(briefing.displayCadenceLabel.uppercased())
                        .briefingText(.sf(10, 850, tracking: 0.08))
                        .foregroundStyle(BriefingHistoryPalette.purple)
                    Text(briefing.label)
                        .briefingText(.sf(15, 800, lineHeight: 18.75))
                        .foregroundStyle(BriefingHistoryPalette.ink)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 3)
                    if let publicationDate = briefing.publicationDate {
                        Text(BriefingDateFormatting.historyTimestamp(publicationDate))
                            .briefingText(.sf(12, 650))
                            .foregroundStyle(BriefingHistoryPalette.muted)
                            .padding(.top, 4)
                    }
                }
                .padding(.vertical, 12)
                .frame(maxWidth: .infinity, alignment: .leading)
                Text("›")
                    .briefingText(.sf(22, 400))
                    .foregroundStyle(BriefingHistoryPalette.muted)
                    .frame(width: 22)
                    .accessibilityHidden(true)
            }
            .frame(minHeight: 78)
            .overlay(alignment: .bottom) { Rectangle().fill(BriefingHistoryPalette.line).frame(height: 1) }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(briefing.displayCadenceLabel), \(briefing.label)\(briefing.publicationDate.map { ", \(BriefingDateFormatting.historyTimestamp($0))" } ?? "")")
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("briefingHistory.row.\(briefing.artifactId)")
    }
}

#if DEBUG
/// Screenshot-only review seam (absent from Release): forces a Briefing
/// Detail or History load state without touching the API.
/// `-physiqueos.briefing-review.detail-state loading|failed|notReady|unavailable`
/// `-physiqueos.briefing-review.history-state loading|failed|empty`
enum BriefingReviewLaunchConfiguration {
    private static func value(_ flag: String) -> String? {
        let arguments = ProcessInfo.processInfo.arguments
        guard let index = arguments.firstIndex(of: flag), arguments.indices.contains(index + 1) else { return nil }
        return arguments[index + 1]
    }

    static var detailState: BriefingDetailView.LoadState? {
        switch value("-physiqueos.briefing-review.detail-state") {
        case "loading": .loading
        case "failed": .failed
        case "notReady": .notReady
        case "unavailable": .loaded(nil)
        default: nil
        }
    }

    /// `-physiqueos.briefing-review.fixture-file <path>`: renders one
    /// Briefing from a local JSON file on the simulator host — either a
    /// `BriefingReadModel` or a production `briefing` read payload (decoded
    /// by the shipping `ProductionBriefingMapper`). Review captures only;
    /// the file never ships and nothing is fetched or written.
    static var fixtureFileBriefing: BriefingReadModel? {
        guard let path = value("-physiqueos.briefing-review.fixture-file"),
              let data = FileManager.default.contents(atPath: path) else { return nil }
        if let model = try? JSONDecoder().decode(BriefingReadModel.self, from: data) { return model }
        guard let payload = try? JSONDecoder().decode(ProductionBriefingPayload.self, from: data) else { return nil }
        if let detail = try? ProductionBriefingMapper.detail(payload.value) { return detail }
        return try? ProductionBriefingMapper.photoEvent(payload.value)
    }

    static var historyState: BriefingHistoryView.LoadState? {
        switch value("-physiqueos.briefing-review.history-state") {
        case "loading": .loading
        case "failed": .failed("Briefing History could not be loaded.")
        case "empty": .loaded([])
        default: nil
        }
    }
}
#endif
