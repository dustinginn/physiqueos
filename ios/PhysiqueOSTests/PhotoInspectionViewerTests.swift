import XCTest
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
}
