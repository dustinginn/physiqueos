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

/// Visual primitives shared by the locked Add Evidence and generic Evidence
/// Review designs. These own presentation only; all workflow state and
/// mutations remain in their existing production views.
enum EvidenceWorkflowPalette {
    static let intakeField = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.047, green: 0.133, blue: 0.176, alpha: 1)
            : UIColor(red: 0.855, green: 0.925, blue: 0.914, alpha: 1)
    })

    static let actionStart = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.086, green: 0.620, blue: 0.584, alpha: 1)
            : UIColor(red: 0.055, green: 0.525, blue: 0.482, alpha: 1)
    })

    static let actionEnd = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.102, green: 0.310, blue: 0.515, alpha: 1)
            : UIColor(red: 0.075, green: 0.365, blue: 0.505, alpha: 1)
    })
}

struct EvidenceWorkflowHero: View {
    let eyebrow: String
    let title: String
    let metadata: [String]

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            LinearGradient(
                colors: [PhysiqueOSTheme.redesignFieldStart, PhysiqueOSTheme.redesignFieldEnd],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            Circle()
                .stroke(PhysiqueOSTheme.redesignGreen.opacity(0.24), lineWidth: 28)
                .frame(width: 178, height: 178)
                .offset(x: 52, y: 82)

            VStack(alignment: .leading, spacing: 7) {
                Text(eyebrow.uppercased())
                    .font(.system(size: 12, weight: .black, design: .rounded))
                    .tracking(1.7)
                    .foregroundStyle(PhysiqueOSTheme.redesignPurple)
                Text(title)
                    .font(.system(size: 31, weight: .black, design: .rounded))
                    .tracking(-0.9)
                    .foregroundStyle(PhysiqueOSTheme.redesignInk)
                if !metadata.isEmpty {
                    HStack(spacing: 16) {
                        ForEach(metadata, id: \.self) { value in
                            Text(value)
                                .font(.system(size: 13, weight: .bold, design: .rounded))
                                .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(18)
        }
        .frame(maxWidth: .infinity, minHeight: 132, alignment: .leading)
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }
}

struct EvidenceWorkflowPrimaryButton: View {
    let title: String
    var isEnabled = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 16, weight: .bold, design: .rounded))
                .foregroundStyle(isEnabled ? Color.white : PhysiqueOSTheme.redesignInkSecondary)
                .frame(maxWidth: .infinity, minHeight: 52)
                .background {
                    if isEnabled {
                        LinearGradient(
                            colors: [EvidenceWorkflowPalette.actionStart, EvidenceWorkflowPalette.actionEnd],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    } else {
                        PhysiqueOSTheme.redesignSoft
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled)
        .accessibilityLabel(title)
    }
}
