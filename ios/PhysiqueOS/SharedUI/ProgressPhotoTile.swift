import SwiftUI

/// Where one progress-photo view's pixels come from. The authenticated
/// Sandbox case is the narrowly allowlisted Founder-photo acceptance bridge;
/// it reuses the existing bearer/refresh session and never exposes a Spaces
/// URL or object key. Placeholder and local-source cases remain available for
/// fixtures without silently substituting pixels for a failed remote pose.
enum PhotoMediaSource: Equatable, Hashable {
    case placeholder
    case assetName(String)
    case remoteURL(URL)
    case authenticatedSandbox(viewIdentity: String, mediaId: String)
    /// Founder Production — the opaque `mediaId` comes embedded directly on
    /// the `photos` resource's own response (no separate manifest fetch),
    /// delivered through `ProductionNativeAPI.readMedia(mediaId:)`.
    case authenticatedProduction(mediaId: String)
}

/// The single shared progress-photo rendering seam — used by BOTH Progress
/// Photos Evidence (`PhotoSetDetailView`) and the Photo Event Briefing
/// (`PhotoBriefingSections`), so a later real-photo pass changes exactly
/// one file rather than two independently-built image renderers. Renders a
/// a 3:4 portrait viewport. Authenticated full-size/detail presentation uses
/// the same server-owned view identity rather than an array position.
struct ProgressPhotoTile: View {
    /// `.standard` is the shared 3:4 tile (Photo Briefing). `.record` is the
    /// locked Evidence record treatment: it fills the caller's frame, draws
    /// the neutral record art when no pixels exist, and shows the locked
    /// loading / retry / unavailable media states.
    enum Style { case standard, record }

    @Environment(AppEnvironment.self) private var environment
    var roleLabel: String
    var source: PhotoMediaSource = .placeholder
    var caption: String? = nil
    var showsRoleLabel: Bool = true
    var style: Style = .standard
    var cornerRadius: CGFloat = 10

    var body: some View {
        if style == .record {
            recordBody
        } else {
            standardBody
        }
    }

    private var standardBody: some View {
        VStack(spacing: 4) {
            if showsRoleLabel {
                Text(roleLabel)
                    .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
            }
            ZStack {
                RoundedRectangle(cornerRadius: 10).fill(PhysiqueOSTheme.surfaceElevated)
                switch source {
                case .placeholder:
                    Image(systemName: "figure.stand")
                        .font(.system(size: 32, weight: .light))
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                case .assetName:
                    if let image = source.localImage {
                        Image(uiImage: image).resizable().scaledToFill()
                    } else {
                        Image(systemName: "photo")
                            .font(.system(size: 32, weight: .light))
                            .foregroundStyle(PhysiqueOSTheme.textMuted)
                    }
                case .remoteURL:
                    Image(systemName: "photo")
                        .font(.system(size: 32, weight: .light))
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                case .authenticatedSandbox(let viewIdentity, let mediaId):
                    authenticatedImage(viewIdentity: viewIdentity, mediaId: mediaId)
                case .authenticatedProduction(let mediaId):
                    authenticatedProductionImage(mediaId: mediaId)
                }
            }
            .aspectRatio(3.0 / 4.0, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            if let caption {
                Text(caption)
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
            }
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(roleLabel) photo\(caption.map { ", \($0)" } ?? "")")
    }

    @ViewBuilder
    private func authenticatedImage(viewIdentity: String, mediaId: String) -> some View {
        switch environment.founderPhotoMediaStore.imageStates[viewIdentity] ?? .idle {
        case .loaded(let image):
            Image(uiImage: image)
                .resizable()
                .scaledToFill()
        case .loading:
            ProgressView().tint(PhysiqueOSTheme.accent)
        case .idle:
            ProgressView()
                .tint(PhysiqueOSTheme.accent)
                .onAppear {
                    // Loading changes the observed state to `.loading`, which removes
                    // this `.idle` branch. An attached SwiftUI `.task` is cancelled at
                    // that point, so keep the transport request independent of the
                    // branch's rendering lifetime.
                    Task {
                        await environment.founderPhotoMediaStore.loadImage(
                            viewIdentity: viewIdentity,
                            mediaId: mediaId
                        )
                    }
                }
        case .failed:
            Button {
                Task {
                    await environment.founderPhotoMediaStore.retryImage(
                        viewIdentity: viewIdentity,
                        mediaId: mediaId
                    )
                }
            } label: {
                VStack(spacing: 6) {
                    Image(systemName: "arrow.clockwise.circle")
                    Text("Retry photo")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                }
                .foregroundStyle(PhysiqueOSTheme.textMuted)
            }
            .buttonStyle(.plain)
        }
    }

    @ViewBuilder
    private func authenticatedProductionImage(mediaId: String) -> some View {
        switch environment.founderProductionPhotoMediaStore.imageStates[mediaId] ?? .idle {
        case .loaded(let image):
            Image(uiImage: image)
                .resizable()
                .scaledToFill()
        case .loading:
            ProgressView().tint(PhysiqueOSTheme.accent)
        case .idle:
            ProgressView()
                .tint(PhysiqueOSTheme.accent)
                .onAppear {
                    // The state transition to `.loading` replaces this branch. Keep
                    // the authenticated request alive across that expected redraw.
                    Task {
                        await environment.founderProductionPhotoMediaStore.loadImage(mediaId: mediaId)
                    }
                }
        case .failed:
            Button {
                Task { await environment.founderProductionPhotoMediaStore.retryImage(mediaId: mediaId) }
            } label: {
                VStack(spacing: 6) {
                    Image(systemName: "arrow.clockwise.circle")
                    Text("Retry photo")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                }
                .foregroundStyle(PhysiqueOSTheme.textMuted)
            }
            .buttonStyle(.plain)
        case .unavailable:
            VStack(spacing: 6) {
                Image(systemName: "photo.badge.exclamationmark")
                Text("Photo unavailable")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
            }
            .foregroundStyle(PhysiqueOSTheme.textMuted)
        }
    }

    // MARK: - Record (locked Evidence) treatment

    private enum RecordMedia { case image(UIImage), art, loading, failed, unavailable }

    private var recordMedia: RecordMedia {
        #if DEBUG
        if let forced = Self.reviewForcedState { return forced }
        #endif
        switch source {
        case .placeholder, .remoteURL:
            return .art
        case .assetName:
            return source.localImage.map(RecordMedia.image) ?? .art
        case .authenticatedSandbox(let viewIdentity, _):
            switch environment.founderPhotoMediaStore.imageStates[viewIdentity] ?? .idle {
            case .loaded(let image): return .image(image)
            case .failed: return .failed
            case .idle, .loading: return .loading
            }
        case .authenticatedProduction(let mediaId):
            switch environment.founderProductionPhotoMediaStore.imageStates[mediaId] ?? .idle {
            case .loaded(let image): return .image(image)
            case .failed: return .failed
            case .unavailable: return .unavailable
            case .idle, .loading: return .loading
            }
        }
    }

    private var recordBody: some View {
        let m = EvidenceMetrics(family: .record)
        return ZStack {
            switch recordMedia {
            case .image(let image):
                // Fill without letting the image's own size widen the layout.
                m.c.surface2.overlay {
                    Image(uiImage: image).resizable().scaledToFill()
                }
                .clipped()
            case .art:
                RecordSilhouetteArt()
            case .loading:
                stateSurface(m)
                recordState(compactTitle: nil) {
                    VStack(spacing: m.pt(8)) {
                        RecordSpinner()
                        Text("Loading photo…").evidenceText(RecordText.stateCopy).foregroundStyle(m.c.quiet)
                    }
                }
                .onAppear(perform: startLoad)
            case .failed:
                stateSurface(m)
                recordState(compactTitle: "Retry") {
                    VStack(spacing: m.pt(8)) {
                        Text("The photo couldn't be loaded.").evidenceText(RecordText.stateTitle).foregroundStyle(m.c.ink)
                        Button(action: retry) { RecordRetryLabel() }.buttonStyle(.plain)
                    }
                }
            case .unavailable:
                stateSurface(m)
                recordState(compactTitle: "Unavailable") {
                    VStack(spacing: m.pt(4)) {
                        Text("Photo unavailable").evidenceText(RecordText.stateTitle).foregroundStyle(m.c.ink)
                        Text("This item cannot be retrieved.").evidenceText(RecordText.stateCopy).foregroundStyle(m.c.quiet)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius))
        .contentShape(RoundedRectangle(cornerRadius: cornerRadius))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(roleLabel) photo\(caption.map { ", \($0)" } ?? "")")
    }

    /// `.media-state`: `surface` with a 1-px `--line` border.
    private func stateSurface(_ m: EvidenceMetrics) -> some View {
        RoundedRectangle(cornerRadius: cornerRadius)
            .fill(m.c.surface)
            .overlay(RoundedRectangle(cornerRadius: cornerRadius).strokeBorder(m.c.line, lineWidth: m.pt(1)))
    }

    /// The full state when it fits the tile; thumbnails fall back to a
    /// compact label (Retry stays a control).
    @ViewBuilder
    private func recordState<Full: View>(compactTitle: String?, @ViewBuilder full: () -> Full) -> some View {
        let m = EvidenceMetrics(family: .record)
        ViewThatFits(in: .vertical) {
            full().multilineTextAlignment(.center).padding(m.pt(12))
            if let compactTitle {
                if compactTitle == "Retry" {
                    Button(action: retry) { RecordRetryLabel(title: "Retry") }.buttonStyle(.plain)
                } else {
                    Text(compactTitle).evidenceText(RecordText.stateCopy).foregroundStyle(m.c.quiet)
                }
            } else {
                RecordSpinner()
            }
        }
    }

    private func startLoad() {
        Task {
            switch source {
            case .authenticatedSandbox(let viewIdentity, let mediaId):
                await environment.founderPhotoMediaStore.loadImage(viewIdentity: viewIdentity, mediaId: mediaId)
            case .authenticatedProduction(let mediaId):
                await environment.founderProductionPhotoMediaStore.loadImage(mediaId: mediaId)
            default:
                break
            }
        }
    }

    private func retry() {
        Task {
            switch source {
            case .authenticatedSandbox(let viewIdentity, let mediaId):
                await environment.founderPhotoMediaStore.retryImage(viewIdentity: viewIdentity, mediaId: mediaId)
            case .authenticatedProduction(let mediaId):
                await environment.founderProductionPhotoMediaStore.retryImage(mediaId: mediaId)
            default:
                break
            }
        }
    }

    #if DEBUG
    /// `-physiqueos.evidence-review.photo-state loading|failed|unavailable`
    /// pins every record tile to one media state for the locked P6 review.
    private static var reviewForcedState: RecordMedia? {
        let arguments = ProcessInfo.processInfo.arguments
        guard let flag = arguments.firstIndex(of: "-physiqueos.evidence-review.photo-state"),
              arguments.indices.contains(flag + 1) else { return nil }
        switch arguments[flag + 1] {
        case "loading": return .loading
        case "failed": return .failed
        case "unavailable": return .unavailable
        default: return nil
        }
    }
    #endif
}
