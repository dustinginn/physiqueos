import XCTest
import UniformTypeIdentifiers
@testable import PhysiqueOS

/// Regression suite for the real Build 26 production DEXA failure
/// (`PROVIDER_UPLOAD_CONTENT_TYPE_INVALID`, request
/// `01a09829-e94c-703b-a33d-cbbcd79d8c20`, 2026-09-13T00:27:58Z).
///
/// Build 25 sent the raw UTI `com.adobe.pdf` as the multipart Content-Type.
/// Build 26 routed that value through `preferredMIMEType(for:)` — but that
/// function ended in `?? identifier`, so it still returned the raw platform
/// identifier for any UTType with no MIME mapping. These tests pin the real
/// framework behaviour that makes that reachable, and assert the invariant
/// that closes it.
final class EvidenceAttachmentContentTypeProbeTests: XCTestCase {
    /// The exact server-side shape check that rejected the real upload
    /// (`ProviderCanonicalUploadService.validateUpload`).
    private func serverAcceptsAsMIME(_ value: String?) -> Bool {
        guard let value else { return false }
        return value.range(of: #"^[-\w.+]+\/[-\w.+]+$"#, options: .regularExpression) != nil
    }

    private func writeTemporaryFile(named name: String, bytes: Data) throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(name)
        try bytes.write(to: url)
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        return url
    }

    private var pdfBytes: Data { Data("%PDF-1.7\ntrailer".utf8) }

    // MARK: - The framework behaviour that made the production failure reachable

    /// Documents, against the real UniformTypeIdentifiers framework, that
    /// ordinary UTTypes routinely have NO preferred MIME type. Any fallback
    /// to the raw identifier therefore emits a non-MIME token.
    func testOrdinaryUTTypesHaveNoPreferredMIMETypeSoRawIdentifierFallbackIsUnsafe() {
        for identifier in ["public.data", "public.content", "public.item", "dyn.ah62d4rv4ge80k3pu"] {
            XCTAssertNotNil(UTType(identifier), "\(identifier) should resolve to a UTType")
            XCTAssertNil(
                UTType(identifier)?.preferredMIMEType,
                "\(identifier) has no MIME mapping — falling back to the raw identifier would emit a non-MIME token"
            )
            XCTAssertFalse(serverAcceptsAsMIME(identifier), "\(identifier) is not a MIME type and the server rejects it")
        }
        // The one the previous investigation assumed was the whole problem.
        XCTAssertEqual(UTType("com.adobe.pdf")?.preferredMIMEType, "application/pdf")
    }

    // MARK: - The invariant

    /// A file the Native UI accepts must reach the wire with a real MIME
    /// type — never a platform identifier — no matter how its UTType
    /// resolves.
    func testLoaderNeverEmitsANonMIMEContentType() throws {
        let cases = ["probe-plain.pdf", "probe-no-extension", "probe-unknown-ext.bodyspec", "probe-uppercase.PDF"]
        for name in cases {
            let url = try writeTemporaryFile(named: name, bytes: pdfBytes)
            let attachment = try XCTUnwrap(EvidenceAttachmentLoader.files([url]).first)
            if let contentType = attachment.contentType {
                XCTAssertTrue(
                    serverAcceptsAsMIME(contentType),
                    "\(name) produced \(contentType), which the server rejects as a non-MIME declared type"
                )
            }
        }
    }

    /// The real Founder case: a `.pdf` file whose provider-supplied UTType
    /// carries no MIME mapping must still reach the server as
    /// `application/pdf`, resolved from the filename extension.
    func testPdfExtensionResolvesToApplicationPdfEvenWhenUTTypeHasNoMIMEMapping() {
        XCTAssertEqual(EvidenceAttachmentLoader.preferredMIMEType(for: "com.adobe.pdf"), "application/pdf")
        XCTAssertEqual(
            EvidenceAttachmentLoader.preferredMIMEType(for: "public.data", filenameExtension: "pdf"),
            "application/pdf",
            "A provider-supplied generic UTType must fall back to the extension's MIME type, not the raw identifier"
        )
        XCTAssertEqual(
            EvidenceAttachmentLoader.preferredMIMEType(for: "dyn.ah62d4rv4ge80e55etf31a3pd", filenameExtension: "pdf"),
            "application/pdf",
            "A dynamic UTType must not leak onto the wire"
        )
    }

    /// When nothing can be resolved the loader must report `nil` (honest
    /// "unknown", which callers default safely) rather than a platform
    /// identifier masquerading as a MIME type.
    func testUnresolvableTypeYieldsNilRatherThanARawIdentifier() {
        for identifier in ["public.data", "public.content", "dyn.ah62d4rv4ge80k3pu"] {
            XCTAssertNil(
                EvidenceAttachmentLoader.preferredMIMEType(for: identifier, filenameExtension: "bodyspec"),
                "\(identifier) must never be emitted as a declared content type"
            )
        }
        XCTAssertNil(EvidenceAttachmentLoader.preferredMIMEType(for: nil))
    }

    /// Both pickers share one conversion, so the Photos path carries the
    /// same guarantee as the Files path.
    func testPhotosPickerIdentifiersAlsoConvertToMIME() {
        XCTAssertEqual(EvidenceAttachmentLoader.preferredMIMEType(for: "public.jpeg"), "image/jpeg")
        XCTAssertEqual(EvidenceAttachmentLoader.preferredMIMEType(for: "public.png"), "image/png")
    }

    // MARK: - The value that actually reaches the wire

    /// The declared type only matters as the bytes that land in the
    /// multipart header, so assert the real builder's output rather than an
    /// intermediate Swift value.
    func testRealMultipartBuilderEmitsApplicationPdfHeaderForAPickedPdf() throws {
        let url = try writeTemporaryFile(named: "BodySpec.pdf", bytes: pdfBytes)
        let attachment = try XCTUnwrap(EvidenceAttachmentLoader.files([url]).first)
        let declared = attachment.contentType ?? "application/pdf"

        var body = Data()
        body.appendMultipartFile(
            name: "evidenceFiles",
            filename: attachment.displayName,
            contentType: declared,
            data: try XCTUnwrap(attachment.data),
            boundary: "TestBoundary"
        )
        let header = try XCTUnwrap(String(data: body, encoding: .isoLatin1))

        XCTAssertTrue(header.contains("Content-Type: application/pdf\r\n\r\n"), "The multipart part must declare a real media type")
        XCTAssertTrue(header.contains("filename=\"BodySpec.pdf\""))
        XCTAssertFalse(header.contains("com.adobe.pdf"), "A platform type identifier must never reach the wire")
        XCTAssertFalse(header.contains("Content-Type: public."), "A platform type identifier must never reach the wire")
        XCTAssertFalse(header.contains("Content-Type: dyn."), "A dynamic UTType must never reach the wire")
    }
}
