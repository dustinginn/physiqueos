import SwiftUI

/// The locked Training Library / Reporting header: eyebrow, title, then
/// the breadcrumb chips (real navigation links), then an optional summary.
struct TrainingLibraryHeaderView: View {
    var eyebrow: String = "Training Library"
    let title: String
    let breadcrumbs: [TrainingBreadcrumb]
    var summary: String?

    private let m = EvidenceMetrics(family: .training)

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            EvidencePageHeader(eyebrow: eyebrow, title: title)
            if !breadcrumbs.isEmpty {
                HStack(spacing: m.pt(6)) {
                    ForEach(breadcrumbs) { crumb in
                        NavigationLink(value: crumb.destination) {
                            Text(crumb.label)
                                .evidenceText(.normal(10, 700))
                                .foregroundStyle(m.c.muted)
                                .padding(.horizontal, m.pt(9 + 1))
                                .padding(.vertical, m.pt(7 + 1))
                                .background(m.c.surface2, in: RoundedRectangle(cornerRadius: m.pt(9)))
                                .overlay(RoundedRectangle(cornerRadius: m.pt(9)).strokeBorder(m.c.line, lineWidth: m.pt(1)))
                                .evidenceHitTarget(visualHeight: m.pt(28))
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("training.crumb.\(crumb.label)")
                    }
                }
                .padding(.top, m.pt(8 - 2))
            }
            if let summary {
                Text(summary)
                    .evidenceText(EvidenceTextStyle(size: 12, weight: 400, lineHeight: 17.04))
                    .foregroundStyle(m.c.muted)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, m.pt(4))
            }
        }
        .padding(.bottom, m.pt(breadcrumbs.isEmpty ? 0 : 2))
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
