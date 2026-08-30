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
}
