import SwiftUI

/// Mirrors `TodaysFocusCard.jsx`, including the full-width grouped session
/// card used by Morning Check-In.
struct TodaysFocusCardView: View {
    let items: [PriorityOccurrence]
    var completingIDs: Set<String> = []
    var skippingIDs: Set<String> = []
    var onTap: (AppDestination) -> Void
    var onComplete: (PriorityOccurrence) -> Void
    var onSkip: (PriorityOccurrence) -> Void = { _ in }
    var onSkipSessionItem: (String, PrioritySessionItem) -> Void = { _, _ in }

    private var useSingleColumn: Bool {
        items.count == 1 || items.contains { $0.actionLabel != nil || $0.sessionItems != nil }
    }

    private var density: FocusTileView.Density {
        if useSingleColumn { return .expanded }
        return items.count == 2 ? .balanced : .compact
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("TODAY'S PRIORITIES")
                    .font(.system(size: 11, weight: .bold)).tracking(0.9)
                    .foregroundStyle(PhysiqueOSTheme.redesignPurple)
                Spacer()
                Text("\(items.count) OPEN")
                    .font(.system(size: 11, weight: .bold)).tracking(0.4)
                    .foregroundStyle(PhysiqueOSTheme.redesignPurple)
            }
            VStack(alignment: .leading, spacing: 10) {
                if useSingleColumn {
                    VStack(spacing: 8) {
                        ForEach(items) { item in
                            if let sessionItems = item.sessionItems {
                                SessionPriorityCardView(
                                    item: item, sessionItems: sessionItems,
                                    skippingIDs: skippingIDs, onTap: onTap,
                                    onSkip: { child in onSkipSessionItem(item.id, child) }
                                )
                                    .transition(.opacity.combined(with: .scale(scale: 0.92)))
                            } else {
                                FocusTileView(
                                    item: item, density: density, onTap: onTap,
                                    onComplete: onComplete, onSkip: onSkip,
                                    isCompleting: completingIDs.contains(item.id),
                                    isSkipping: skippingIDs.contains(item.id)
                                )
                                    .transition(.opacity.combined(with: .scale(scale: 0.92)))
                            }
                        }
                    }
                } else {
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible())], spacing: 8) {
                        ForEach(items) {
                            FocusTileView(
                                item: $0, density: density, onTap: onTap,
                                onComplete: onComplete, onSkip: onSkip,
                                isCompleting: completingIDs.contains($0.id),
                                isSkipping: skippingIDs.contains($0.id)
                            )
                                .transition(.opacity.combined(with: .scale(scale: 0.92)))
                        }
                    }
                }
            }
        }
        .padding(14)
        .background(PhysiqueOSTheme.redesignPaper)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(PhysiqueOSTheme.redesignRule))
    }
}

private struct SessionPriorityCardView: View {
    let item: PriorityOccurrence
    let sessionItems: [PrioritySessionItem]
    let skippingIDs: Set<String>
    let onTap: (AppDestination) -> Void
    let onSkip: (PrioritySessionItem) -> Void

    private var completedCount: Int { sessionItems.filter(\.completed).count }
    private var visibleItems: ArraySlice<PrioritySessionItem> { sessionItems.prefix(5) }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Button { onTap(item.destination) } label: {
                HStack(alignment: .top, spacing: 12) {
                    IconBadge(systemImage: "target", color: item.color, size: .sm, isCircular: true)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(item.title)
                            .physiqueOSFont(.init(size: 14, weight: .heavy))
                            .foregroundStyle(PhysiqueOSTheme.redesignInk)
                        if let subtitle = item.subtitle {
                            Text(subtitle)
                                .physiqueOSFont(.init(size: 11, weight: .medium))
                                .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    Spacer(minLength: 8)
                    StatusChip(text: item.completed ? "Completed" : "Continue", color: .primary)
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(item.title), \(completedCount) of \(sessionItems.count) complete")

            ForEach(visibleItems) { child in
                HStack(spacing: 9) {
                    Image(systemName: child.completed ? "checkmark.circle.fill" : "circle")
                        .foregroundStyle(child.completed ? PhysiqueOSTheme.redesignGreen : PhysiqueOSTheme.redesignInkSecondary)
                    Text(child.label)
                        .physiqueOSFont(.init(size: 12, weight: .semibold))
                        .foregroundStyle(PhysiqueOSTheme.redesignInk)
                    Spacer(minLength: 8)
                    if child.canonicalSkipCommand != nil, !child.completed,
                       !skippingIDs.contains(child.id) {
                        HomePrioritySkipButton(
                            title: child.label,
                            identifier: "home.priority.\(child.id).skip"
                        ) { onSkip(child) }
                    } else if skippingIDs.contains(child.id) {
                        ProgressView()
                            .controlSize(.small)
                            .tint(PhysiqueOSTheme.redesignRed)
                            .frame(width: 44, height: 44)
                            .accessibilityLabel("Skipping \(child.label)")
                    }
                }
                .padding(.leading, 48)
            }
            if sessionItems.count > visibleItems.count {
                Text("+\(sessionItems.count - visibleItems.count) more")
                    .physiqueOSFont(.init(size: 11, weight: .semibold))
                    .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
                    .padding(.leading, 48)
            }

            HStack(spacing: 12) {
                GeometryReader { proxy in
                    ZStack(alignment: .leading) {
                        Capsule().fill(PhysiqueOSTheme.redesignRule)
                        Capsule().fill(PhysiqueOSTheme.redesignPurple)
                            .frame(width: proxy.size.width * (sessionItems.isEmpty ? 0 : CGFloat(completedCount) / CGFloat(sessionItems.count)))
                    }
                }
                .frame(height: 8)
                Text("\(completedCount)/\(sessionItems.count) complete")
                    .physiqueOSFont(.init(size: 11, weight: .bold))
                    .foregroundStyle(PhysiqueOSTheme.redesignInk)
                    .fixedSize()
            }
            .padding(.leading, 48)
        }
        .padding(12)
        .background(PhysiqueOSTheme.redesignSoft)
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(item.color.foreground.opacity(0.32), lineWidth: 1))
        .accessibilityElement(children: .contain)
    }
}
