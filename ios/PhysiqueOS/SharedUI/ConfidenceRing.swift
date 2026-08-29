import SwiftUI

/// Mirrors `ProgressRing.jsx`/`ConfidenceRing.jsx`: an annular fill showing
/// a percentage, with the value's meaning owned entirely by whoever passes
/// it in. This view never computes or adjusts the value — it only animates
/// and renders one supplied by the read model (see docs/PHYSIQUEOS_NATIVE_V1.md:
/// "native only animates presentation" — Confidence is briefing-driven and
/// server-owned; native must not recompute it).
struct ConfidenceRing: View {
    let value: Int
    var label: String = "Goal"
    var size: CGFloat = 82
    var lineWidth: CGFloat = 6

    @State private var animatedFraction: Double = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var fraction: Double { Double(min(max(value, 0), 100)) / 100 }
    private var labelFontSize: CGFloat { PhysiqueOSTypography.confidenceLabelFontSize(ringDiameter: size) }

    var body: some View {
        ZStack {
            Circle()
                .stroke(PhysiqueOSTheme.confidenceTrack, lineWidth: lineWidth)
            Circle()
                .trim(from: 0, to: animatedFraction)
                .stroke(PhysiqueOSTheme.confidence, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(-90))
            VStack(spacing: 2) {
                // Intentionally not Dynamic-Type-scaled: sized purely from
                // the ring's own diameter, matching both the web source
                // and common native fixed-badge convention. See
                // `PhysiqueOSTypography.confidenceValueFontSize`.
                Text("\(value)%")
                    .font(.system(size: PhysiqueOSTypography.confidenceValueFontSize(ringDiameter: size), weight: .bold))
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(label.uppercased())
                    .font(.system(size: labelFontSize, weight: .bold))
                    .tracking(labelFontSize * 0.035)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
                    .multilineTextAlignment(.center)
            }
            .frame(width: size * 0.82)
        }
        .frame(width: size, height: size)
        .onAppear {
            if reduceMotion {
                animatedFraction = fraction
            } else {
                withAnimation(.easeOut(duration: 0.7)) { animatedFraction = fraction }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label) confidence")
        .accessibilityValue("\(value) percent")
    }
}
