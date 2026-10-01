import SwiftUI

/// Mirrors `TodaysFocusCard.jsx`, including the full-width grouped session
/// card used by Morning Check-In.
struct TodaysFocusCardView: View {
    let items: [PriorityOccurrence]
    var completingIDs: Set<String> = []
    var onTap: (AppDestination) -> Void
    var onComplete: (PriorityOccurrence) -> Void

    private var useSingleColumn: Bool {
        items.count == 1 || items.contains { $0.actionLabel != nil || $0.sessionItems != nil }
    }

    private var density: FocusTileView.Density {
        if useSingleColumn { return .expanded }
        return items.count == 2 ? .balanced : .compact
    }

    var body: some View {
        CardContainer(padding: .sm) {
            VStack(alignment: .leading, spacing: 10) {
                SectionHeading("Today's Priorities")
                if useSingleColumn {
                    VStack(spacing: 8) {
                        ForEach(items) { item in
                            if let sessionItems = item.sessionItems {
                                SessionPriorityCardView(item: item, sessionItems: sessionItems, onTap: onTap)
                                    .transition(.opacity.combined(with: .scale(scale: 0.92)))
                            } else {
                                FocusTileView(item: item, density: density, onTap: onTap, onComplete: onComplete, isCompleting: completingIDs.contains(item.id))
                                    .transition(.opacity.combined(with: .scale(scale: 0.92)))
                            }
                        }
                    }
                } else {
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible())], spacing: 8) {
                        ForEach(items) {
                            FocusTileView(item: $0, density: density, onTap: onTap, onComplete: onComplete, isCompleting: completingIDs.contains($0.id))
                                .transition(.opacity.combined(with: .scale(scale: 0.92)))
                        }
                    }
                }
            }
        }
    }
}

private struct SessionPriorityCardView: View {
    let item: PriorityOccurrence
    let sessionItems: [PrioritySessionItem]
    let onTap: (AppDestination) -> Void

    private var completedCount: Int { sessionItems.filter(\.completed).count }
    private var visibleItems: ArraySlice<PrioritySessionItem> { sessionItems.prefix(5) }

    var body: some View {
        Button { onTap(item.destination) } label: {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top, spacing: 12) {
                    IconBadge(systemImage: "target", color: item.color, size: .sm, isCircular: true)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(item.title)
                            .physiqueOSFont(.init(size: 14, weight: .heavy))
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        if let subtitle = item.subtitle {
                            Text(subtitle)
                                .physiqueOSFont(.init(size: 11, weight: .medium))
                                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    Spacer(minLength: 8)
                    StatusChip(text: item.completed ? "Completed" : "Continue", color: .primary)
                }

                ForEach(visibleItems) { child in
                    HStack(spacing: 9) {
                        Image(systemName: child.completed ? "checkmark.circle.fill" : "circle")
                            .foregroundStyle(child.completed ? PhysiqueOSTheme.chartSuccess : PhysiqueOSTheme.textMuted)
                        Text(child.label)
                            .physiqueOSFont(.init(size: 12, weight: .semibold))
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    }
                    .padding(.leading, 48)
                }
                if sessionItems.count > visibleItems.count {
                    Text("+\(sessionItems.count - visibleItems.count) more")
                        .physiqueOSFont(.init(size: 11, weight: .semibold))
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                        .padding(.leading, 48)
                }

                HStack(spacing: 12) {
                    GeometryReader { proxy in
                        ZStack(alignment: .leading) {
                            Capsule().fill(PhysiqueOSTheme.divider)
                            Capsule().fill(PhysiqueOSTheme.accent)
                                .frame(width: proxy.size.width * (sessionItems.isEmpty ? 0 : CGFloat(completedCount) / CGFloat(sessionItems.count)))
                        }
                    }
                    .frame(height: 8)
                    Text("\(completedCount)/\(sessionItems.count) complete")
                        .physiqueOSFont(.init(size: 11, weight: .bold))
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        .fixedSize()
                }
                .padding(.leading, 48)
            }
            .padding(12)
            .background(PhysiqueOSTheme.surfaceElevated)
            .clipShape(RoundedRectangle(cornerRadius: 18))
            .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(item.color.foreground.opacity(0.35), lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(item.title), \(completedCount) of \(sessionItems.count) complete")
    }
}
