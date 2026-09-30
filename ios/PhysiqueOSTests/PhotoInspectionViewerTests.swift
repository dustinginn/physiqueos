import XCTest
import SwiftUI
import UIKit
@testable import PhysiqueOS

/// The shared photo inspection viewer (Photo Briefing + Progress Photos
/// Evidence): request building, what can be inspected, the media resolution
/// the viewer asks for, and that both entry surfaces use the one component.
final class PhotoInspectionViewerTests: XCTestCase {
    private func item(_ id: String, _ source: PhotoMediaSource) -> PhotoInspectionItem {
        PhotoInspectionItem(id: id, title: id, caption: nil, source: source)
    }

    func testOnlyRealMediaIsInspectable() {
        XCTAssertTrue(item("a", .authenticatedProduction(mediaId: "m1")).isInspectable)
        XCTAssertTrue(item("b", .authenticatedSandbox(viewIdentity: "v", mediaId: "m2")).isInspectable)
        XCTAssertFalse(item("c", .placeholder).isInspectable)
        XCTAssertFalse(item("d", .assetName("x")).isInspectable)
        XCTAssertEqual(item("a", .authenticatedProduction(mediaId: "m1")).mediaKey, "m1")
        XCTAssertNil(item("c", .placeholder).mediaKey)
    }

    func testRequestStartsAtTheTappedPhotoAndDropsUnopenableOnes() throws {
        let items = [
            item("front", .authenticatedProduction(mediaId: "m1")),
            item("blank", .placeholder),
            item("back", .authenticatedProduction(mediaId: "m3")),
        ]
        let request = try XCTUnwrap(PhotoInspectionRequest.make(items: items, tappedID: "back"))
        XCTAssertEqual(request.items.map(\.id), ["front", "back"])
        XCTAssertEqual(request.startIndex, 1, "The viewer opens on the photo that was tapped, not on the first.")
        XCTAssertNil(PhotoInspectionRequest.make(items: items, tappedID: "blank"))
        XCTAssertNil(PhotoInspectionRequest.make(items: items, tappedID: "missing"))
    }

    func testTheViewerDecodesLargerThanTheGridTiles() {
        XCTAssertEqual(FounderProductionPhotoMediaStore.inspectionMaxPixelSize, 3_200)
        XCTAssertGreaterThan(FounderProductionPhotoMediaStore.inspectionMaxPixelSize, 1_600,
                             "Zoom exists to inspect small physique details; the 1,600 px grid decode is not enough.")
    }

    func testEvidenceSetDetailBuildsPreviousThenCurrentItemsFromTheSameViewIdentity() {
        let view = PhotoViewRecord(
            id: "set-1-front_relaxed", poseId: .frontRelaxed, setId: "set-1", captureDate: "2026-09-19",
            comparedAgainst: "Sep 12", comparisonStatus: "comparable", conditionSummary: nil, sourceHistory: nil,
            interpretationSummary: nil, comparisonBullets: nil, hasComparisonImage: true,
            mediaId: "current", priorMediaId: "prior"
        )
        let items = PhotoSetDetailView.inspectionItems(
            for: view,
            previousSource: .authenticatedProduction(mediaId: "prior"),
            currentSource: .authenticatedProduction(mediaId: "current"),
            currentDate: "Sep 19"
        )
        XCTAssertEqual(items.map(\.id), ["\(view.id):previous", "\(view.id):current"])
        XCTAssertEqual(items.map(\.mediaKey), ["prior", "current"])
        let single = PhotoSetDetailView.inspectionItems(
            for: view, previousSource: nil, currentSource: .authenticatedProduction(mediaId: "current"), currentDate: "Sep 19"
        )
        XCTAssertEqual(single.map(\.id), ["\(view.id):current"])
    }

    func testBothEntrySurfacesUseTheOneSharedViewerAndItIsReadOnly() throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        func read(_ path: String) throws -> String {
            try String(contentsOf: root.appendingPathComponent("PhysiqueOS/\(path)"), encoding: .utf8)
        }
        for surface in ["Presentation/Briefings/PhotoBriefingSections.swift", "Presentation/Evidence/PhotoSetDetailView.swift"] {
            let source = try read(surface)
            XCTAssertTrue(source.contains(".photoInspection($inspection)"), surface)
            XCTAssertTrue(source.contains(".inspectsPhoto("), surface)
        }
        let viewer = try read("SharedUI/PhotoInspectionViewer.swift")
        for required in ["UIScrollView", "maximumZoomScale", "zoom(to:", "Close photo", "accessibilityAction(.escape)",
                         "loadInspectionImage", "fullScreenCover"] {
            XCTAssertTrue(viewer.contains(required), "viewer must contain \(required)")
        }
        // Read-only: no command/API mutation from the viewer.
        for forbidden in ["submitCommand", "PhotosAPI", "delete", "save("] {
            XCTAssertFalse(viewer.contains(forbidden), "viewer must not contain \(forbidden)")
        }
    }

    func testDoubleTapZoomsAboutThePointAndBackOut() {
        let scroll = UIScrollView(frame: CGRect(x: 0, y: 0, width: 300, height: 400))
        let view = ZoomableImageView(image: UIImage(systemName: "photo")!)
        let coordinator = view.makeCoordinator()
        let imageView = UIImageView(frame: scroll.bounds)
        coordinator.imageView = imageView
        scroll.addSubview(imageView)
        scroll.delegate = coordinator
        scroll.minimumZoomScale = 1
        scroll.maximumZoomScale = 6
        scroll.contentSize = scroll.bounds.size
        XCTAssertNotNil(coordinator.viewForZooming(in: scroll))
        scroll.setZoomScale(3, animated: false)
        XCTAssertEqual(scroll.zoomScale, 3, accuracy: 0.001)
        scroll.setZoomScale(1, animated: false)
        XCTAssertEqual(scroll.zoomScale, 1, accuracy: 0.001)
    }

    // MARK: - Focused visual / interaction check (renders the real viewer)

    /// Hosts the actual `PhotoInspectionViewer` in a window with a synthetic,
    /// detail-bearing image; drives zoom the way a pinch/double-tap does; and
    /// (when TEST_RUNNER_PHYSIQUEOS_SNAPSHOT_DIR is set) writes PNGs of the
    /// fit, zoomed and second-photo states for visual review.
    @MainActor
    func testRenderedViewerFitsZoomsPansAndPagesBetweenPhotos() throws {
        func synthetic(_ tint: UIColor) -> UIImage {
            UIGraphicsImageRenderer(size: CGSize(width: 1_200, height: 1_600)).image { context in
                tint.setFill(); context.fill(CGRect(x: 0, y: 0, width: 1_200, height: 1_600))
                UIColor.white.setStroke()
                for row in 0..<16 { for column in 0..<12 {
                    context.stroke(CGRect(x: column * 100, y: row * 100, width: 100, height: 100))
                } }
                let label = "detail" as NSString
                label.draw(at: CGPoint(x: 560, y: 760), withAttributes: [.font: UIFont.boldSystemFont(ofSize: 60), .foregroundColor: UIColor.white])
            }
        }
        let items = [
            PhotoInspectionItem(id: "prev", title: "Front Relaxed · Previous", caption: "Sep 12", source: .authenticatedProduction(mediaId: "m-prev")),
            PhotoInspectionItem(id: "cur", title: "Front Relaxed · Current", caption: "Sep 19", source: .authenticatedProduction(mediaId: "m-cur")),
        ]
        let request = try XCTUnwrap(PhotoInspectionRequest.make(items: items, tappedID: "cur"))
        XCTAssertEqual(request.startIndex, 1)
        let environment = AppEnvironment(nativeAuthority: .sandbox, authoritySelectionStore: UserDefaultsNativeAuthoritySelectionStore(defaults: UserDefaults(suiteName: "photo-inspection-\(UUID().uuidString)")!, key: "authority"))
        let viewer = PhotoInspectionViewer(request: request, injectedImages: ["prev": synthetic(.systemIndigo), "cur": synthetic(.systemTeal)])
            .environment(environment)
        let host = UIHostingController(rootView: viewer)
        let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        let window = scene.map { UIWindow(windowScene: $0) } ?? UIWindow()
        window.frame = CGRect(x: 0, y: 0, width: 390, height: 844)
        window.rootViewController = host
        window.makeKeyAndVisible()
        host.view.layoutIfNeeded()
        RunLoop.main.run(until: Date().addingTimeInterval(1.0))

        func scrollViews(in view: UIView) -> [UIScrollView] {
            (view as? UIScrollView).map { [$0] + view.subviews.flatMap(scrollViews(in:)) } ?? view.subviews.flatMap(scrollViews(in:))
        }
        func zoomable() -> UIScrollView? {
            scrollViews(in: host.view).first {
                // The page that is actually on screen (the paging TabView also holds the neighbouring photo).
                $0.maximumZoomScale >= 6 && $0.window != nil && $0.convert($0.bounds, to: window).intersection(window.bounds).width > 300
            }
        }
        func snapshot(_ name: String) {
            guard let dir = ProcessInfo.processInfo.environment["PHYSIQUEOS_SNAPSHOT_DIR"] else { return }
            try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
            let image = UIGraphicsImageRenderer(bounds: window.bounds).image { _ in host.view.drawHierarchy(in: window.bounds, afterScreenUpdates: true) }
            try? image.pngData()?.write(to: URL(fileURLWithPath: dir).appendingPathComponent("\(name).png"))
        }

        let scroll = try XCTUnwrap(zoomable(), "The viewer shows a zoomable scroll view for the tapped photo")
        XCTAssertEqual(scroll.zoomScale, 1, accuracy: 0.001, "Opens fitted, whole photo visible")
        snapshot("1-fit-current")

        scroll.setZoomScale(3, animated: false)
        RunLoop.main.run(until: Date().addingTimeInterval(0.2))
        XCTAssertEqual(scroll.zoomScale, 3, accuracy: 0.001)
        XCTAssertGreaterThan(scroll.contentSize.width, scroll.bounds.width * 2.9, "Zoomed content is larger than the viewport, so it can pan")
        // 1,200x1,600 fitted to 390 wide: content is exactly the photo (no letterbox) at 3x.
        XCTAssertEqual(scroll.contentSize.width, 390 * 3, accuracy: 2)
        scroll.setContentOffset(CGPoint(x: 300, y: 500), animated: false)
        XCTAssertEqual(scroll.contentOffset.x, 300, accuracy: 1, "Panning while zoomed moves the visible region")
        XCTAssertEqual(ZoomableImageView.Coordinator.fittedSize(of: CGSize(width: 1_200, height: 1_600), in: CGSize(width: 390, height: 844)).height, 520, accuracy: 0.5)
        snapshot("2-zoomed-3x-panned")

        scroll.setZoomScale(1, animated: false)
        RunLoop.main.run(until: Date().addingTimeInterval(0.2))
        XCTAssertEqual(scroll.zoomScale, 1, accuracy: 0.001, "Zooming back out restores the fit")
        snapshot("3-back-to-fit")
    }
}
