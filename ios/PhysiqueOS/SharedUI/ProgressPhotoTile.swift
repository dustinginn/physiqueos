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
}

/// The single shared progress-photo rendering seam — used by BOTH Progress
/// Photos Evidence (`PhotoSetDetailView`) and the Photo Event Briefing
/// (`PhotoBriefingSections`), so a later real-photo pass changes exactly
/// one file rather than two independently-built image renderers. Renders a
/// a 3:4 portrait viewport. Authenticated full-size/detail presentation uses
/// the same server-owned view identity rather than an array position.
struct ProgressPhotoTile: View {
    @Environment(AppEnvironment.self) private var environment
    var roleLabel: String
    var source: PhotoMediaSource = .placeholder
    var caption: String? = nil
    var showsRoleLabel: Bool = true

    var body: some View {
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
                case .assetName, .remoteURL:
                    Image(systemName: "photo")
                        .font(.system(size: 32, weight: .light))
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                case .authenticatedSandbox(let viewIdentity, let mediaId):
                    authenticatedImage(viewIdentity: viewIdentity, mediaId: mediaId)
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
                .task { await environment.founderPhotoMediaStore.loadImage(viewIdentity: viewIdentity, mediaId: mediaId) }
        case .failed:
            VStack(spacing: 6) {
                Image(systemName: "photo.badge.exclamationmark")
                Text("Photo unavailable")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
            }
            .foregroundStyle(PhysiqueOSTheme.textMuted)
        }
    }
}
