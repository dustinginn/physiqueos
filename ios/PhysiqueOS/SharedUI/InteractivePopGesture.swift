import SwiftUI
import UIKit

enum InteractivePopGesturePolicy {
    static func shouldEnable(viewControllerCount: Int) -> Bool {
        viewControllerCount > 1
    }
}

/// Restores UIKit's standard edge-pop gesture for a pushed SwiftUI screen
/// that intentionally hides the system back button in favor of a faithful
/// custom back control. Standard NavigationStack destinations do not need
/// this modifier; tab roots remain disabled because their stack depth is 1.
private struct InteractivePopGestureEnabler: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> ProbeViewController {
        ProbeViewController()
    }

    func updateUIViewController(_ uiViewController: ProbeViewController, context: Context) {
        uiViewController.updateGestureState()
    }

    final class ProbeViewController: UIViewController {
        override func viewDidAppear(_ animated: Bool) {
            super.viewDidAppear(animated)
            updateGestureState()
        }

        func updateGestureState() {
            guard let navigationController else { return }
            let shouldEnable = InteractivePopGesturePolicy.shouldEnable(
                viewControllerCount: navigationController.viewControllers.count
            )
            navigationController.interactivePopGestureRecognizer?.isEnabled = shouldEnable
            if shouldEnable {
                navigationController.interactivePopGestureRecognizer?.delegate = nil
            }
        }
    }
}

extension View {
    func restoresInteractivePopGesture() -> some View {
        background(InteractivePopGestureEnabler().frame(width: 0, height: 0))
    }

    /// Keeps a report/card page horizontally stable. iOS 26 added a second,
    /// full-width back recognizer (`interactiveContentPopGestureRecognizer`)
    /// that starts an interactive pop from ANY rightward drag in the content
    /// area, sliding the whole page under the finger. On pages made of
    /// draggable-looking cards and charts that reads as the content being
    /// pulled sideways. This turns off ONLY that content-area recognizer
    /// while the page is visible; the leading-edge swipe-back
    /// (`interactivePopGestureRecognizer`) and the back button are untouched,
    /// and the system behavior is restored as soon as the page leaves.
    func suppressesContentAreaPopGesture() -> some View {
        background(ContentAreaPopSuppressor().frame(width: 0, height: 0))
    }
}

/// Ref-counts pages that want the content-area pop recognizer off, per
/// navigation controller, so pushing from one stable page to another never
/// flickers the OS gesture back on in between.
@MainActor
enum ContentAreaPopRegistry {
    private static var owners: [ObjectIdentifier: Set<ObjectIdentifier>] = [:]

    static func activate(owner: ObjectIdentifier, in navigationController: UINavigationController) {
        owners[ObjectIdentifier(navigationController), default: []].insert(owner)
        apply(navigationController)
    }

    static func release(owner: ObjectIdentifier, in navigationController: UINavigationController?) {
        for key in Array(owners.keys) {
            owners[key]?.remove(owner)
            if owners[key]?.isEmpty == true { owners[key] = nil }
        }
        if let navigationController { apply(navigationController) }
    }

    static func isSuppressed(_ navigationController: UINavigationController) -> Bool {
        !(owners[ObjectIdentifier(navigationController)]?.isEmpty ?? true)
    }

    private static func apply(_ navigationController: UINavigationController) {
        guard #available(iOS 26.0, *) else { return }
        navigationController.interactiveContentPopGestureRecognizer?.isEnabled = !isSuppressed(navigationController)
    }
}

private struct ContentAreaPopSuppressor: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> SuppressorViewController { SuppressorViewController() }
    func updateUIViewController(_ uiViewController: SuppressorViewController, context: Context) {}

    final class SuppressorViewController: UIViewController {
        private weak var attachedNavigationController: UINavigationController?

        override func viewWillAppear(_ animated: Bool) {
            super.viewWillAppear(animated)
            attach()
        }

        override func viewDidAppear(_ animated: Bool) {
            super.viewDidAppear(animated)
            attach()
        }

        override func viewDidDisappear(_ animated: Bool) {
            super.viewDidDisappear(animated)
            ContentAreaPopRegistry.release(owner: ObjectIdentifier(self), in: attachedNavigationController)
        }

        private func attach() {
            guard let navigationController else { return }
            attachedNavigationController = navigationController
            ContentAreaPopRegistry.activate(owner: ObjectIdentifier(self), in: navigationController)
        }
    }
}

enum ForegroundRefreshPolicy {
    /// Only the on-screen view refreshes on foreground. A tab root or a
    /// screen underneath a pushed child is not visible; it refreshes through
    /// its own `.task` when it next appears, instead of joining a resume burst
    /// that queues the visible screen's reads behind invisible ones.
    static func shouldRefresh(phase: ScenePhase, isVisible: Bool) -> Bool {
        phase == .active && isVisible
    }
}

private struct VisibleForegroundRefresh: ViewModifier {
    @Environment(\.scenePhase) private var scenePhase
    @State private var isVisible = false
    let action: () async -> Void

    func body(content: Content) -> some View {
        content
            .onAppear { isVisible = true }
            .onDisappear { isVisible = false }
            .onChange(of: scenePhase) { _, phase in
                guard ForegroundRefreshPolicy.shouldRefresh(phase: phase, isVisible: isVisible) else { return }
                Task { await action() }
            }
    }
}

/// Reloads the on-screen view when the daily-driver day changes. A screen that
/// is not visible (a background tab root, or under a pushed child) does not
/// join the rollover burst: its read cache was already invalidated, and its
/// own `.task` re-reads when it next appears.
private struct VisibleDailyDriverDayReload: ViewModifier {
    @State private var isVisible = false
    let day: DailyDriverLocalDay
    let action: () async -> Void

    func body(content: Content) -> some View {
        content
            .onAppear { isVisible = true }
            .onDisappear { isVisible = false }
            .onChange(of: day) { _, _ in
                guard isVisible else { return }
                Task { await action() }
            }
    }
}

extension View {
    func reloadsOnDailyDriverDayChangeWhenVisible(_ day: DailyDriverLocalDay, _ action: @escaping () async -> Void) -> some View {
        modifier(VisibleDailyDriverDayReload(day: day, action: action))
    }
}

extension View {
    /// Replaces a bare `.onChange(of: scenePhase)` reload for screens whose
    /// `.task` already reloads on appearance.
    func refreshesOnForegroundWhenVisible(_ action: @escaping () async -> Void) -> some View {
        modifier(VisibleForegroundRefresh(action: action))
    }
}
