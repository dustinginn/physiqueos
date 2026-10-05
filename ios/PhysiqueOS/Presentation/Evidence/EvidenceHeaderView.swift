import SwiftUI

/// Mirrors `ProgressHubScreen.jsx`'s header: title + subtitle, no back
/// link (Evidence is a peer root tab here, not a pushed page — the same
/// sanctioned native-convention difference already recorded for Log).
struct EvidenceHeaderView: View {
    let title: String
    let subtitle: String

    var body: some View {
        HStack(alignment: .top, spacing: 13) {
            EvidenceGlyph(symbol: "diamond", color: EvidenceRedesignPalette.lime, size: 46)
            VStack(alignment: .leading, spacing: 3) {
                Text("YOUR RECORD")
                    .font(.system(size: 13, weight: .black, design: .rounded))
                    .tracking(2.1)
                    .foregroundStyle(EvidenceRedesignPalette.lime)
                Text(title)
                    .font(.system(size: 33, weight: .black, design: .rounded))
                    .tracking(-1.25)
                    .foregroundStyle(PhysiqueOSTheme.redesignInk)
                Text(subtitle)
                    .font(.system(size: 17, weight: .medium, design: .rounded))
                    .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

enum EvidenceRedesignPalette {
    static let lime = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.718, green: 0.933, blue: 0.333, alpha: 1)
            : UIColor(red: 0.310, green: 0.443, blue: 0, alpha: 1)
    })
    static let blue = PhysiqueOSTheme.chartEvidence
    static let purple = PhysiqueOSTheme.redesignPurple
    static let green = PhysiqueOSTheme.redesignGreen
    static let amber = PhysiqueOSTheme.redesignAmber
    static let red = PhysiqueOSTheme.destructive
    static let rail = PhysiqueOSTheme.redesignRule
}

struct EvidenceGlyph: View {
    let symbol: String
    var color: Color = EvidenceRedesignPalette.lime
    var size: CGFloat = 38

    var body: some View {
        Image(systemName: symbol)
            .font(.system(size: size * 0.36, weight: .bold))
            .foregroundStyle(color)
            .frame(width: size, height: size)
            .background(color.opacity(0.13))
            .clipShape(RoundedRectangle(cornerRadius: size * 0.28, style: .continuous))
            .accessibilityHidden(true)
    }
}

struct EvidenceSectionTitle: View {
    let title: String

    var body: some View {
        Text(title)
            .font(.system(size: 20, weight: .black, design: .rounded))
            .foregroundStyle(PhysiqueOSTheme.redesignInk)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.bottom, 10)
            .overlay(alignment: .bottom) {
                Rectangle().fill(PhysiqueOSTheme.redesignRule).frame(height: 1)
            }
    }
}

struct EvidenceStateView: View {
    let symbol: String
    let title: String
    let message: String
    var showsProgress = false

    var body: some View {
        VStack(spacing: 12) {
            if showsProgress {
                ProgressView().tint(EvidenceRedesignPalette.lime)
            } else {
                EvidenceGlyph(symbol: symbol, size: 44)
            }
            Text(title)
                .font(.system(size: 18, weight: .bold, design: .rounded))
                .foregroundStyle(PhysiqueOSTheme.redesignInk)
            Text(message)
                .font(.system(size: 14, weight: .medium, design: .rounded))
                .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, minHeight: 240)
        .padding(20)
    }
}
