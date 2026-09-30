import SwiftUI
import UIKit

/// One photo the inspection viewer can show. `source` is the same
/// `PhotoMediaSource` the grid tile renders, so a photo is inspected from the
/// exact media identity it was displayed from.
struct PhotoInspectionItem: Identifiable, Equatable {
    var id: String
    var title: String
    var caption: String?
    var source: PhotoMediaSource

    /// Only a source with real pixels behind it can be inspected; a placeholder
    /// or a bundled asset name never advertises (or opens) a viewer.
    var isInspectable: Bool {
        switch source {
        case .authenticatedProduction, .authenticatedSandbox: true
        case .placeholder, .assetName, .remoteURL: false
        }
    }

    var mediaKey: String? {
        switch source {
        case .authenticatedProduction(let mediaId): mediaId
        case .authenticatedSandbox(_, let mediaId): mediaId
        default: nil
        }
    }
}

/// A request to open the viewer on `items[startIndex]`.
struct PhotoInspectionRequest: Identifiable, Equatable {
    let id = UUID()
    var items: [PhotoInspectionItem]
    var startIndex: Int

    /// Keeps only inspectable items and re-points `startIndex` at the same
    /// photo. `nil` when the tapped photo itself cannot be inspected.
    static func make(items: [PhotoInspectionItem], tappedID: String) -> PhotoInspectionRequest? {
        let inspectable = items.filter(\.isInspectable)
        guard let index = inspectable.firstIndex(where: { $0.id == tappedID }) else { return nil }
        return PhotoInspectionRequest(items: inspectable, startIndex: index)
    }
}

extension View {
    /// Presents the shared full-screen viewer for `request`.
    func photoInspection(_ request: Binding<PhotoInspectionRequest?>) -> some View {
        fullScreenCover(item: request) { request in
            PhotoInspectionViewer(request: request)
        }
    }

    /// Makes a photo tile the tap target for the viewer: the photo itself is
    /// the control (no repeated "tap to expand" button), with one subtle corner
    /// glyph for discoverability. A tile whose source has no pixels stays inert.
    @ViewBuilder
    func inspectsPhoto(
        _ items: [PhotoInspectionItem],
        tapped id: String,
        presenting request: Binding<PhotoInspectionRequest?>
    ) -> some View {
        if let target = items.first(where: { $0.id == id }), target.isInspectable {
            self
                .overlay(alignment: .topTrailing) {
                    Image(systemName: "arrow.up.left.and.arrow.down.right")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(.white.opacity(0.9))
                        .padding(5)
                        .background(.black.opacity(0.45), in: Circle())
                        .padding(6)
                        .accessibilityHidden(true)
                        .allowsHitTesting(false)
                }
                .contentShape(Rectangle())
                // Not a Button: a tile's own Retry is a Button, and a Button nested
                // in another Button's label never receives its tap.
                .onTapGesture { request.wrappedValue = PhotoInspectionRequest.make(items: items, tappedID: id) }
                .accessibilityAddTraits(.isButton)
                .accessibilityHint("Opens the photo full screen to zoom")
        } else {
            self
        }
    }
}

/// Full-screen, native-feeling photo inspection: pinch to zoom, pan while
/// zoomed, double-tap to zoom in/out, swipe between the photos of one group,
/// swipe down (when not zoomed) or Close to dismiss. Read-only: it can never
/// mutate evidence.
struct PhotoInspectionViewer: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    let request: PhotoInspectionRequest
    @State private var selection: Int
    @State private var dragOffset: CGFloat = 0
    @State private var isZoomed = false

    init(request: PhotoInspectionRequest) {
        self.request = request
        _selection = State(initialValue: min(max(request.startIndex, 0), max(request.items.count - 1, 0)))
    }

    private var current: PhotoInspectionItem? {
        request.items.indices.contains(selection) ? request.items[selection] : nil
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            TabView(selection: $selection) {
                ForEach(Array(request.items.enumerated()), id: \.element.id) { index, item in
                    PhotoInspectionPage(item: item, onZoomChange: { zoomed in
                        if index == selection { isZoomed = zoomed }
                    })
                    .tag(index)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .ignoresSafeArea()
            .offset(y: dragOffset)
            // Dismiss-by-drag only while the image is at rest, so panning a zoomed
            // photo never fights the dismiss gesture.
            .simultaneousGesture(
                DragGesture(minimumDistance: 24)
                    .onChanged { value in
                        guard !isZoomed, value.translation.height > 0,
                              abs(value.translation.height) > abs(value.translation.width) else { return }
                        dragOffset = value.translation.height
                    }
                    .onEnded { value in
                        if !isZoomed, value.translation.height > 140 { dismiss() }
                        withAnimation(.easeOut(duration: 0.2)) { dragOffset = 0 }
                    }
            )
            .opacity(1 - min(Double(dragOffset) / 600, 0.4))

            VStack {
                HStack(alignment: .top) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 15, weight: .bold))
                            .foregroundStyle(.white)
                            .frame(width: 44, height: 44)
                            .background(.black.opacity(0.5), in: Circle())
                    }
                    .accessibilityLabel("Close photo")
                    .accessibilityIdentifier("photoInspection.close")
                    Spacer(minLength: 12)
                    if let current {
                        VStack(alignment: .trailing, spacing: 2) {
                            Text(current.title)
                                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                .foregroundStyle(.white)
                            if let caption = current.caption {
                                Text(caption)
                                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                                    .foregroundStyle(.white.opacity(0.75))
                            }
                            if request.items.count > 1 {
                                Text("\(selection + 1) of \(request.items.count)")
                                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                                    .foregroundStyle(.white.opacity(0.6))
                            }
                        }
                        .padding(.horizontal, 12).padding(.vertical, 8)
                        .background(.black.opacity(0.5), in: RoundedRectangle(cornerRadius: 12))
                        .accessibilityElement(children: .combine)
                    }
                }
                .padding(.horizontal, 16).padding(.top, 8)
                Spacer()
            }
        }
        .statusBarHidden()
        .accessibilityAction(.escape) { dismiss() }
        .onChange(of: selection) { _, _ in isZoomed = false }
        .onDisappear {
            let ids = request.items.compactMap(\.mediaKey)
            environment.founderProductionPhotoMediaStore.releaseInspectionImages(mediaIds: ids)
        }
    }
}

/// One zoomable photo: the grid's already-decoded image appears instantly,
/// then the larger decode replaces it.
private struct PhotoInspectionPage: View {
    @Environment(AppEnvironment.self) private var environment
    let item: PhotoInspectionItem
    let onZoomChange: (Bool) -> Void

    var body: some View {
        ZStack {
            switch resolvedState {
            case .image(let image):
                ZoomableImageView(image: image, onZoomChange: onZoomChange)
                    .ignoresSafeArea()
                    .accessibilityElement()
                    .accessibilityLabel("\(item.title) photo\(item.caption.map { ", \($0)" } ?? "")")
                    .accessibilityHint("Pinch to zoom. Double tap to zoom in or out.")
                    .accessibilityAddTraits(.isImage)
            case .loading:
                ProgressView().tint(.white)
            case .failed:
                unavailable(message: "The photo couldn't be loaded.", showsRetry: true)
            case .unavailable:
                unavailable(message: "Photo unavailable", showsRetry: false)
            }
        }
        .task(id: item.id) { await load() }
    }

    private enum PageState {
        case image(UIImage), loading, failed, unavailable
    }

    private var resolvedState: PageState {
        switch item.source {
        case .authenticatedProduction(let mediaId):
            let store = environment.founderProductionPhotoMediaStore
            if case .loaded(let full) = store.inspectionImageStates[mediaId] { return .image(full) }
            // Show the tile's decode immediately while the larger one loads.
            if case .loaded(let thumb) = store.imageStates[mediaId] { return .image(thumb) }
            switch store.inspectionImageStates[mediaId] ?? .idle {
            case .failed: return .failed
            case .unavailable: return .unavailable
            default: return .loading
            }
        case .authenticatedSandbox(let viewIdentity, _):
            switch environment.founderPhotoMediaStore.imageStates[viewIdentity] ?? .idle {
            case .loaded(let image): return .image(image)
            case .failed: return .failed
            default: return .loading
            }
        case .placeholder, .assetName, .remoteURL:
            return .unavailable
        }
    }

    private func load() async {
        switch item.source {
        case .authenticatedProduction(let mediaId):
            await environment.founderProductionPhotoMediaStore.loadInspectionImage(mediaId: mediaId)
        case .authenticatedSandbox(let viewIdentity, let mediaId):
            await environment.founderPhotoMediaStore.loadImage(viewIdentity: viewIdentity, mediaId: mediaId)
        default:
            break
        }
    }

    private func retry() async {
        if case .authenticatedProduction(let mediaId) = item.source {
            await environment.founderProductionPhotoMediaStore.retryInspectionImage(mediaId: mediaId)
        } else if case .authenticatedSandbox(let viewIdentity, let mediaId) = item.source {
            await environment.founderPhotoMediaStore.retryImage(viewIdentity: viewIdentity, mediaId: mediaId)
        }
    }

    private func unavailable(message: String, showsRetry: Bool) -> some View {
        VStack(spacing: 12) {
            Image(systemName: "photo.badge.exclamationmark")
                .font(.system(size: 34, weight: .light))
            Text(message).physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
            if showsRetry {
                Button("Try again") { Task { await retry() } }
                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                    .foregroundStyle(PhysiqueOSTheme.accent)
                    .frame(minHeight: 44)
            }
        }
        .foregroundStyle(.white.opacity(0.8))
    }
}

/// UIScrollView-backed zoom: native pinch, momentum pan, double-tap to zoom
/// about the tapped point, aspect ratio preserved (the image is fit to the
/// screen at 1x and never cropped).
struct ZoomableImageView: UIViewRepresentable {
    let image: UIImage
    var maximumZoom: CGFloat = 6
    var onZoomChange: (Bool) -> Void = { _ in }

    func makeCoordinator() -> Coordinator { Coordinator(onZoomChange: onZoomChange) }

    func makeUIView(context: Context) -> UIScrollView {
        let scroll = UIScrollView()
        scroll.delegate = context.coordinator
        scroll.minimumZoomScale = 1
        scroll.maximumZoomScale = maximumZoom
        scroll.showsHorizontalScrollIndicator = false
        scroll.showsVerticalScrollIndicator = false
        scroll.bouncesZoom = true
        scroll.contentInsetAdjustmentBehavior = .never
        scroll.backgroundColor = .clear
        let imageView = UIImageView(image: image)
        imageView.contentMode = .scaleAspectFit
        imageView.isUserInteractionEnabled = true
        scroll.addSubview(imageView)
        context.coordinator.imageView = imageView
        let doubleTap = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.doubleTapped(_:)))
        doubleTap.numberOfTapsRequired = 2
        scroll.addGestureRecognizer(doubleTap)
        return scroll
    }

    func updateUIView(_ scroll: UIScrollView, context: Context) {
        context.coordinator.onZoomChange = onZoomChange
        if context.coordinator.imageView?.image !== image {
            context.coordinator.imageView?.image = image
        }
        context.coordinator.layoutImage(in: scroll)
    }

    final class Coordinator: NSObject, UIScrollViewDelegate {
        var imageView: UIImageView?
        var onZoomChange: (Bool) -> Void
        private var lastBounds: CGSize = .zero

        init(onZoomChange: @escaping (Bool) -> Void) { self.onZoomChange = onZoomChange }

        func viewForZooming(in scrollView: UIScrollView) -> UIView? { imageView }

        func layoutImage(in scroll: UIScrollView) {
            guard let imageView, scroll.bounds.size != .zero else { return }
            if scroll.zoomScale == 1 || lastBounds != scroll.bounds.size {
                imageView.frame = CGRect(origin: .zero, size: scroll.bounds.size)
                scroll.contentSize = scroll.bounds.size
            }
            lastBounds = scroll.bounds.size
        }

        func scrollViewDidZoom(_ scrollView: UIScrollView) {
            guard let imageView else { return }
            // Keep the (fit) image centred while it is smaller than the viewport.
            let offsetX = max((scrollView.bounds.width - scrollView.contentSize.width) / 2, 0)
            let offsetY = max((scrollView.bounds.height - scrollView.contentSize.height) / 2, 0)
            imageView.center = CGPoint(
                x: scrollView.contentSize.width / 2 + offsetX,
                y: scrollView.contentSize.height / 2 + offsetY
            )
            onZoomChange(scrollView.zoomScale > 1.01)
        }

        @objc func doubleTapped(_ recognizer: UITapGestureRecognizer) {
            guard let scroll = recognizer.view as? UIScrollView else { return }
            if scroll.zoomScale > 1.01 {
                scroll.setZoomScale(1, animated: true)
                return
            }
            let target = min(3, scroll.maximumZoomScale)
            let point = recognizer.location(in: imageView)
            let size = CGSize(width: scroll.bounds.width / target, height: scroll.bounds.height / target)
            let rect = CGRect(x: point.x - size.width / 2, y: point.y - size.height / 2, width: size.width, height: size.height)
            scroll.zoom(to: rect, animated: true)
        }
    }
}
