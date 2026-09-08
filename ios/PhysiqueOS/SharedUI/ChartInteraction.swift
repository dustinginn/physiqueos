import Charts
import SwiftUI

/// Shared touch-interaction plumbing for every point-based Evidence chart
/// (Weight Trend, DEXA Body Fat %, Nutrition Reporting's weekly trend
/// charts, and Energy's own trend chart). Standardizes the touch equivalent
/// of the web's pointer hover/scrub across all of them, per this task's
/// "Evidence Graph Interaction Standardization" pass. A zero-distance
/// gesture recognizes taps, but only horizontal intent scrubs continuously;
/// vertical and ambiguous diagonal intent remain available to the enclosing
/// page scroll instead of making data-heavy Evidence pages feel stuck.
///
/// This intentionally stops at gesture/geometry plumbing. Resolving
/// "nearest observation" from a touch location is genuinely different per
/// chart: Weight's x-axis is a continuous `Date` domain requiring true
/// nearest-neighbor distance math (`WeightEvidenceCalculator.nearestPoint`),
/// while DEXA/Nutrition/Energy plot a categorical `String` domain (one
/// scan/week per discrete band) where `ChartProxy.value(atX:)` already
/// snaps to the nearest category and an exact-match lookup is correct
/// (`ChartCategoricalSelection.nearestPoint`). Merging those two resolution
/// strategies into one generic function would be exactly the
/// over-generalization this task's brief warns against — only the
/// touch/geometry boilerplate is shared here.
struct ChartScrubOverlay: ViewModifier {
    let onScrub: (CGPoint, ChartProxy, GeometryProxy) -> Void
    @State private var intent: ChartGestureIntent = .pending

    func body(content: Content) -> some View {
        content.chartOverlay { proxy in
            GeometryReader { geometry in
                Rectangle().fill(.clear).contentShape(Rectangle())
                    .simultaneousGesture(
                        DragGesture(minimumDistance: 0)
                            .onChanged { drag in
                                intent = ChartGestureArbitration.intent(
                                    horizontal: drag.translation.width,
                                    vertical: drag.translation.height
                                )
                                if intent == .horizontal { onScrub(drag.location, proxy, geometry) }
                            }
                            .onEnded { drag in
                                let finalIntent = ChartGestureArbitration.intent(
                                    horizontal: drag.translation.width,
                                    vertical: drag.translation.height
                                )
                                if finalIntent == .tap || finalIntent == .horizontal {
                                    onScrub(drag.location, proxy, geometry)
                                }
                                intent = .pending
                            }
                    )
            }
        }
    }
}

enum ChartGestureIntent: Equatable { case pending, tap, horizontal, vertical, diagonal }

/// Pure gesture arbitration shared by every Evidence chart. Vertical and
/// ambiguous diagonal intent stays with the surrounding ScrollView;
/// horizontal motion and taps inspect the chart.
enum ChartGestureArbitration {
    static let activationDistance: CGFloat = 8
    static let directionalBias: CGFloat = 1.35

    static func intent(horizontal: CGFloat, vertical: CGFloat) -> ChartGestureIntent {
        let x = abs(horizontal), y = abs(vertical)
        guard max(x, y) >= activationDistance else {
            return x == 0 && y == 0 ? .tap : .pending
        }
        if x >= y * directionalBias { return .horizontal }
        if y >= x * directionalBias { return .vertical }
        return .diagonal
    }

    static func clampedPlotX(_ x: CGFloat, width: CGFloat) -> CGFloat {
        min(max(0, x), max(0, width))
    }
}

extension View {
    /// Attaches the shared tap-and-drag chart-selection gesture. `onScrub`
    /// receives the raw touch location plus the chart's `ChartProxy`/
    /// `GeometryProxy` so the caller can resolve its own domain value via
    /// `relativeX(in:at:)` below and `proxy.value(atX:)`.
    func chartScrub(onScrub: @escaping (CGPoint, ChartProxy, GeometryProxy) -> Void) -> some View {
        modifier(ChartScrubOverlay(onScrub: onScrub))
    }
}

extension GeometryProxy {
    /// The touch location's x-offset relative to the chart's plot area
    /// origin — the shared first step every chart's `proxy.value(atX:)`
    /// lookup needs, factored out to avoid re-deriving
    /// `geometry[proxy.plotAreaFrame]` in every chart file.
    func relativeX(in proxy: ChartProxy, at location: CGPoint) -> CGFloat {
        guard let plotFrame = proxy.plotFrame else { return location.x }
        return location.x - self[plotFrame].origin.x
    }
}

/// Pure nearest-observation resolution for charts plotted on a categorical
/// (discrete, one-band-per-observation) x-axis — DEXA's scan-date charts,
/// Nutrition Reporting's weekly trend charts, and Energy's own trend chart.
/// `ChartProxy.value(atX:)` already returns the nearest category's key for
/// this axis type, so resolution is an exact match with a defined fallback
/// — not a distance scan (see `WeightEvidenceCalculator.nearestPoint` for
/// the continuous-domain equivalent this deliberately does not share code
/// with).
enum ChartCategoricalSelection {
    /// `key == nil` (nothing touched yet) resolves to the latest point,
    /// matching every Reporting chart's own "defaults to latest until
    /// touched" convention. An unrecognized key (e.g. a touch just past the
    /// last plotted band) also falls back to the latest point rather than
    /// clearing the selection.
    static func nearestPoint<Point, Key: Equatable>(
        matching key: Key?, in points: [Point], keyPath: KeyPath<Point, Key>
    ) -> Point? {
        guard let key else { return points.last }
        return points.first(where: { $0[keyPath: keyPath] == key }) ?? points.last
    }
}
