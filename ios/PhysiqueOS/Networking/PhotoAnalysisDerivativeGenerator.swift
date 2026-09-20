import Foundation
import ImageIO
import UniformTypeIdentifiers

/// Bounded JPEG rendition of an HEIC/HEIF original for the Server's browser
/// display and vision interpreter, which cannot decode HEVC. The original is
/// never touched: it is uploaded verbatim and remains the canonical photo.
///
/// The rendition is produced through ImageIO's thumbnail path, which
/// decodes straight to the target size (2048 px longest edge) instead of
/// materializing the full-resolution bitmap, so a 24-48 MP original never
/// costs a 100+ MB decode on the device. Orientation is baked in so the
/// derivative displays upright without EXIF.
enum PhotoAnalysisDerivativeGenerator {
    static func jpegDerivative(
        from data: Data,
        maximumPixelSize: Int = StagedPhotoIntakePlan.derivativeMaximumPixelSize,
        quality: Double = StagedPhotoIntakePlan.derivativeJPEGQuality
    ) -> Data? {
        guard maximumPixelSize > 0,
              let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maximumPixelSize,
            kCGImageSourceShouldCacheImmediately: false,
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
        let output = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(output, UTType.jpeg.identifier as CFString, 1, nil) else { return nil }
        CGImageDestinationAddImage(destination, image, [kCGImageDestinationLossyCompressionQuality: quality] as CFDictionary)
        guard CGImageDestinationFinalize(destination), output.length > 0 else { return nil }
        return output as Data
    }
}
