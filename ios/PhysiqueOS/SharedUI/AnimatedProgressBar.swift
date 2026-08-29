import SwiftUI

/// Mirrors `ProgressBar.jsx`: a track with an animated fill. Like
/// `ConfidenceRing`, the percentage is always supplied by the caller —
/// this view never derives progress itself.
struct AnimatedProgressBar: View {
    let value: Int
    var color: Color = PhysiqueOSTheme.chartSuccess
    var accessibilityLabel: String = "Progress"

    @State private var animatedFraction: Double = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var fraction: Double { Double(min(max(value, 0), 100)) / 100 }

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(PhysiqueOSTheme.surfaceMuted)
                Capsule()
                    .fill(color)
                    .frame(width: proxy.size.width * animatedFraction)
            }
        }
        .frame(height: 8)
        .onAppear {
            if reduceMotion {
                animatedFraction = fraction
            } else {
                withAnimation(.easeOut(duration: 0.4)) { animatedFraction = fraction }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityLabel)
        .accessibilityValue("\(value) percent")
    }
}
