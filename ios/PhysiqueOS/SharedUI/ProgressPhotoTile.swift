import SwiftUI

/// Where one progress-photo view's actual pixels come from. `.placeholder`
/// is the only case with real behavior in this pass — no Founder progress
/// photos are authorized yet (Photo Event Briefing and Progress Photos
/// Evidence both remain PENDING REAL PHOTOS visual acceptance). `.assetName`/
/// `.remoteURL` are modeled now, unused today, so a later controlled
/// visual-acceptance pass can substitute real, authorized media into the
/// ONE rendering component below (`ProgressPhotoTile`) without touching
/// any call site, layout, identity, or comparison logic anywhere else in
/// the app.
enum PhotoMediaSource: Equatable, Hashable {
    case placeholder
    case assetName(String)
    case remoteURL(URL)
}

/// The single shared progress-photo rendering seam — used by BOTH Progress
/// Photos Evidence (`PhotoSetDetailView`) and the Photo Event Briefing
/// (`PhotoBriefingSections`), so a later real-photo pass changes exactly
/// one file rather than two independently-built image renderers. Renders a
/// labeled, non-blank placeholder today at the real product's own 3:4
/// portrait aspect ratio, so the layout/cropping geometry a later real
/// image drops into is already correct.
struct ProgressPhotoTile: View {
    var roleLabel: String
    var source: PhotoMediaSource = .placeholder
    var caption: String? = nil

    var body: some View {
        VStack(spacing: 4) {
            Text(roleLabel)
                .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                .foregroundStyle(PhysiqueOSTheme.textMuted)
            ZStack {
                RoundedRectangle(cornerRadius: 10).fill(PhysiqueOSTheme.surfaceElevated)
                switch source {
                case .placeholder:
                    Image(systemName: "figure.stand")
                        .font(.system(size: 32, weight: .light))
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                case .assetName, .remoteURL:
                    // Not yet exercised — no authorized media in this pass.
                    // A later pass renders the real asset/remote image here.
                    Image(systemName: "photo")
                        .font(.system(size: 32, weight: .light))
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
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
}
