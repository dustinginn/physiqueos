import ImageIO
import UIKit
import XCTest
@testable import PhysiqueOS

/// Build 44 staged Progress Photos transport: originals preserved byte for
/// byte (HEIC included), one bounded request per artifact, durable local
/// state, and Server progress as the only truth about what is stored.
final class StagedPhotoIntakeTests: XCTestCase {
    /// A real 64x48 HEIC (HEVC) written by macOS `sips`, so container
    /// detection and the derivative path see genuine Apple HEIC bytes.
    private static let tinyHEICBase64 = "AAAAJGZ0eXBoZWljAAAAAG1pZjFNaVBybWlhZk1pSEJoZWljAAABhm1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAHBpY3QAAAAAAAAAAAAAAAAAAAAAJGRpbmYAAAAcZHJlZgAAAAAAAAABAAAADHVybCAAAAABAAAADnBpdG0AAAAAAAEAAAAjaWluZgAAAAAAAQAAABVpbmZlAgAAAAABAABodmMxAAAAAOZpcHJwAAAAxWlwY28AAAATY29scm5jbHgAAgACAAaAAAAADGNsbGkAywBAAAAAFGlzcGUAAAAAAAAAQAAAADAAAAAJaXJvdAAAAAAQcGl4aQAAAAADCAgIAAAAcWh2Y0MBA3AAAACwAAAAAAAe8AD8/fj4AAALA6AAAQAXQAEMAf//A3AAAAMAsAAAAwAAAwAecCShAAEAI0IBAQNwAAADALAAAAMAAAMAHqAUIEHBjE4h7kWVTcCAgYAgogABAAlEAcBhcshAUyQAAAAZaXBtYQAAAAAAAAABAAEGgQIDBYaEAAAAHmlsb2MAAAAARAAAAQABAAAAAQAAAboAAABzAAAAAW1kYXQAAAAAAAAAgwAAAG8oAa+j0YAaXrzd69z//ZHnYcpdPnWH+8srMctFXgKq7u/+FsHjyQhqDlxw4wR/bt/Xq4K58NpZewqtN8NrN8ufQqwTLygL4CqpST//7Js1/yl4H9YGNCzwL0eZ7Rx///ZDhP5Qjv4sNwtFtBJkh7A="

    private var root: URL!
    private var defaults: UserDefaults!
    private var suiteName: String!

    override func setUpWithError() throws {
        root = FileManager.default.temporaryDirectory.appendingPathComponent("StagedPhotoIntakeTests-\(UUID().uuidString)", isDirectory: true)
        suiteName = "StagedPhotoIntakeTests.\(UUID().uuidString)"
        defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: root)
        defaults.removePersistentDomain(forName: suiteName)
    }

    // MARK: - Representations

    func testEveryAcceptedContainerIsStagedByteForByteAndOnlyHEIFNeedsADerivative() {
        let jpeg = jpegBytes(width: 40, height: 30)
        let png = pngBytes()
        let webp = Data([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 1, 2, 3])
        let heic = heicBytes
        for (data, type, expectedType, ext, derivative) in [
            (jpeg, "image/jpeg", "image/jpeg", "jpg", false), (jpeg, "image/jpg", "image/jpeg", "jpg", false),
            (png, "image/png", "image/png", "png", false), (webp, "image/webp", "image/webp", "webp", false),
            (heic, "image/heic", "image/heic", "heic", true), (heic, "image/heif", "image/heif", "heif", true),
        ] {
            let representation = EvidenceAttachmentLoader.stagedPhotoRepresentation(data: data, contentType: type)
            XCTAssertEqual(representation?.data, data, "\(type) must be staged verbatim")
            XCTAssertEqual(representation?.contentType, expectedType)
            XCTAssertEqual(representation?.fileExtension, ext)
            XCTAssertEqual(representation?.requiresAnalysisDerivative, derivative)
        }
        XCTAssertNil(EvidenceAttachmentLoader.stagedPhotoRepresentation(data: jpeg, contentType: "image/gif"))
        XCTAssertNil(EvidenceAttachmentLoader.stagedPhotoRepresentation(data: jpeg, contentType: "application/pdf"))
        XCTAssertNil(EvidenceAttachmentLoader.stagedPhotoRepresentation(data: jpeg, contentType: nil))
    }

    func testAnalysisDerivativeIsABoundedJPEGAndNeverReplacesTheOriginal() throws {
        let large = jpegBytes(width: 1_600, height: 800)
        let derivative = try XCTUnwrap(PhotoAnalysisDerivativeGenerator.jpegDerivative(from: large, maximumPixelSize: 512, quality: 0.9))
        XCTAssertEqual(Array(derivative.prefix(3)), [0xff, 0xd8, 0xff], "derivative is a JPEG")
        let source = try XCTUnwrap(CGImageSourceCreateWithData(derivative as CFData, nil))
        let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
        XCTAssertEqual(properties?[kCGImagePropertyPixelWidth] as? Int, 512)
        XCTAssertEqual(properties?[kCGImagePropertyPixelHeight] as? Int, 256)
        XCTAssertEqual(StagedPhotoIntakePlan.derivativeMaximumPixelSize, 2_048)
        XCTAssertNil(PhotoAnalysisDerivativeGenerator.jpegDerivative(from: Data("not an image".utf8)))

        guard let heicDerivative = PhotoAnalysisDerivativeGenerator.jpegDerivative(from: heicBytes, maximumPixelSize: 32) else {
            throw XCTSkip("This simulator cannot decode HEVC; the derivative path is covered by the JPEG source above.")
        }
        XCTAssertEqual(Array(heicDerivative.prefix(3)), [0xff, 0xd8, 0xff])
        XCTAssertEqual(EvidenceAttachmentLoader.stagedPhotoRepresentation(data: heicBytes, contentType: "image/heic")?.data, heicBytes)
    }

    // MARK: - Plan identity and durability

    func testPrepareStagesOriginalsVerbatimWithDeterministicIntakeAndArtifactIdentity() async throws {
        let store = FileStagedPhotoIntakeStore(root: root)
        let derivativeBytes = jpegBytes(width: 64, height: 48)
        let coordinator = makeCoordinator(api: try await makeAPI(transport: StagedTransport { _, _ in (500, "") }), store: store, derivative: derivativeBytes)
        let heic = heicBytes
        let jpeg = jpegBytes(width: 40, height: 30)
        let attachments = [attachment("photo-a", "image/heic", heic), attachment("photo-b", "image/jpeg", jpeg)]
        let identities = try await Self.identitiesJSON(for: attachments)

        let plan = try await coordinator.prepare(scope: "progressPhotos-intake.2026-09-19", effectiveDate: "2026-09-19", attachments: attachments, photoIdentitiesJSON: identities, session: session)
        let again = try await coordinator.prepare(scope: "progressPhotos-intake.2026-09-19", effectiveDate: "2026-09-19", attachments: attachments, photoIdentitiesJSON: identities, session: session)

        XCTAssertEqual(plan.submissionIdentity, again.submissionIdentity, "the same set on retry reuses the same intake identity")
        XCTAssertEqual(plan.artifacts.map(\.artifactId), again.artifacts.map(\.artifactId))
        XCTAssertEqual(plan.artifacts.map(\.ordinal), [1, 2, 3])
        XCTAssertEqual(plan.artifacts.map(\.role), [.original, .original, .analysisDerivative])
        let prefix = "artifact_\(plan.submissionIdentity.replacingOccurrences(of: "-", with: "").lowercased())_"
        XCTAssertEqual(plan.artifacts.map(\.artifactId), [1, 2, 3].map { "\(prefix)\($0)" })
        XCTAssertEqual(plan.artifacts[2].derivativeOf, plan.artifacts[0].artifactId)
        XCTAssertEqual(plan.artifacts.map(\.mimeType), ["image/heic", "image/jpeg", "image/jpeg"])
        XCTAssertEqual(plan.artifacts.map(\.fileName), ["progress-photo-1.heic", "progress-photo-2.jpg", "progress-photo-1-analysis.jpg"])
        XCTAssertEqual(plan.artifacts[0].byteLength, heic.count)
        XCTAssertEqual(plan.artifacts[0].sha256, StagedPhotoIntakeCoordinator.sha256(heic))
        XCTAssertEqual(plan.session, .init(originalUnedited: true, timeOfDay: "morning", fasted: true, postWorkout: nil, pump: false, photoIdentitiesJSON: identities))
        XCTAssertNil(plan.intakeId)
        XCTAssertFalse(plan.mediaComplete)

        // Durable: the exact bytes and the plan are on disk, and a fresh store reads them back.
        let reopened = FileStagedPhotoIntakeStore(root: root)
        let reloaded = try await reopened.loadPlan()
        XCTAssertEqual(reloaded, plan)
        let storedOriginal = try await reopened.readArtifact(plan.artifacts[0].artifactId)
        XCTAssertEqual(storedOriginal, heic, "HEIC original staged verbatim")
        let storedJPEG = try await reopened.readArtifact(plan.artifacts[1].artifactId)
        XCTAssertEqual(storedJPEG, jpeg)
        let storedDerivative = try await reopened.readArtifact(plan.artifacts[2].artifactId)
        XCTAssertEqual(storedDerivative, derivativeBytes)

        var changed = attachments
        changed[1] = attachment("photo-b", "image/jpeg", jpegBytes(width: 41, height: 30))
        let different = try await coordinator.prepare(scope: "progressPhotos-intake.2026-09-19", effectiveDate: "2026-09-19", attachments: changed, photoIdentitiesJSON: identities, session: session)
        XCTAssertNotEqual(different.submissionIdentity, plan.submissionIdentity, "different content is a different intake")
    }

    func testPrepareRefusesUnreadableUnsupportedOversizeOrTooManyPhotosBeforeAnyNetwork() async throws {
        let transport = StagedTransport { _, _ in (500, "") }
        let coordinator = makeCoordinator(api: try await makeAPI(transport: transport), store: FileStagedPhotoIntakeStore(root: root), derivative: jpegBytes(width: 8, height: 8))
        let jpeg = jpegBytes(width: 20, height: 20)
        let prepare: ([SandboxAttachment]) async throws -> StagedPhotoIntakePlan = { attachments in
            try await coordinator.prepare(scope: "s", effectiveDate: "2026-09-19", attachments: attachments, photoIdentitiesJSON: try await Self.identitiesJSON(for: attachments), session: self.session)
        }
        await assertThrows(try await prepare([SandboxAttachment(id: "photo-x", displayName: "Photo 1", source: .photos, contentType: "image/jpeg", data: nil, loadError: "gone")]),
                           StagedPhotoIntakeError.photoUnavailable(attachmentId: "photo-x"))
        await assertThrows(try await prepare([attachment("photo-x", "image/gif", jpeg)]), StagedPhotoIntakeError.unsupportedPhoto(attachmentId: "photo-x", contentType: "image/gif"))
        let oversize = Data(count: StagedPhotoIntakePlan.originalMaximumBytes + 1)
        await assertThrows(try await prepare([attachment("photo-x", "image/jpeg", oversize)]), StagedPhotoIntakeError.photoTooLarge(attachmentId: "photo-x", bytes: oversize.count))
        let many = (0..<(StagedPhotoIntakePlan.maximumOriginals + 1)).map { attachment("photo-\($0)", "image/jpeg", jpeg) }
        await assertThrows(try await prepare(many), StagedPhotoIntakeError.tooManyPhotos(count: many.count))
        let calls = await transport.calls
        XCTAssertTrue(calls.isEmpty, "local refusals never reach the Server")
        let noPlan = try await FileStagedPhotoIntakeStore(root: root).loadPlan()
        XCTAssertNil(noPlan)
    }

    // MARK: - Transfer lifecycle

    func testSubmitDeclaresOnceThenTransfersEachArtifactInOrderAndDiscardsLocalStateOnCompletion() async throws {
        let server = FakeStagedServer()
        let transport = StagedTransport(server.handler)
        let store = FileStagedPhotoIntakeStore(root: root)
        let coordinator = makeCoordinator(api: try await makeAPI(transport: transport), store: store, derivative: jpegBytes(width: 64, height: 48))
        let attachments = [attachment("photo-a", "image/heic", heicBytes), attachment("photo-b", "image/jpeg", jpegBytes(width: 40, height: 30)), attachment("photo-c", "image/png", pngBytes())]
        let plan = try await coordinator.prepare(scope: "s", effectiveDate: "2026-09-19", attachments: attachments, photoIdentitiesJSON: try await Self.identitiesJSON(for: attachments), session: session)

        var observed: [StagedPhotoIntakeProgress] = []
        let progress = ProgressSink()
        let status = try await coordinator.submit(plan: plan) { value in progress.append(value) }
        observed = progress.values

        XCTAssertEqual(status.intakeId, "evidence_intake_\(plan.submissionIdentity)")
        XCTAssertEqual(status.mediaComplete, true)
        XCTAssertEqual(status.status, "processing", "media completion is not a review; interpretation follows")
        let calls = await transport.calls
        XCTAssertEqual(calls.map(\.method), ["POST", "PUT", "PUT", "PUT", "PUT"])
        XCTAssertEqual(calls[0].path, "/api/v1/native/evidence/intakes/staged")
        XCTAssertEqual(calls[0].idempotencyKey, plan.submissionIdentity)
        XCTAssertEqual(calls[0].contentType, "application/json")
        let declaration = try XCTUnwrap(calls[0].body.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] })
        XCTAssertEqual(declaration["expectedEvidenceType"] as? String, "photo_session")
        XCTAssertEqual((declaration["artifacts"] as? [[String: Any]])?.count, 4)
        let photoSession = try XCTUnwrap(declaration["photoSession"] as? [String: Any])
        XCTAssertEqual(photoSession["timeOfDay"] as? String, "morning")
        XCTAssertEqual(photoSession["originalUnedited"] as? Bool, true)
        XCTAssertTrue(photoSession["postWorkout"] is NSNull, "unknown conditions are explicit nulls")
        XCTAssertEqual((photoSession["photoIdentities"] as? [[String: Any]])?.count, 3)
        for (index, artifact) in plan.artifacts.sorted(by: { $0.ordinal < $1.ordinal }).enumerated() {
            let call = calls[index + 1]
            XCTAssertEqual(call.path, "/api/v1/native/evidence/intakes/\(status.intakeId)/artifacts/\(artifact.artifactId)")
            XCTAssertEqual(call.contentType, artifact.mimeType)
            let stagedBytes = await store.readArtifactIfPresent(artifact.artifactId)
            XCTAssertEqual(call.body, stagedBytes ?? call.body)
            XCTAssertEqual(call.body?.count, artifact.byteLength)
        }
        XCTAssertEqual(calls[1].body, heicBytes, "HEIC original transferred verbatim")
        XCTAssertTrue(calls.allSatisfy { $0.path.contains("/evidence/intakes") }, "no command, priority, or canonical write is issued by transport")
        XCTAssertEqual(observed.first?.transferredArtifacts, 0)
        XCTAssertEqual(observed.last?.mediaComplete, true)
        XCTAssertEqual(observed.last?.fraction, 1)
        XCTAssertTrue(observed.map(\.fraction).elementsEqual(observed.map(\.fraction).sorted()), "progress is monotonic")
        let remaining = await coordinator.pendingPlan()
        XCTAssertNil(remaining, "completed staged state is discarded")
        XCTAssertFalse(FileManager.default.fileExists(atPath: root.path))
        XCTAssertEqual(server.stored.count, 4)
    }

    func testTransientFailureLeavesEverythingResumableAndRetransfersOnlyWhatIsMissing() async throws {
        let server = FakeStagedServer()
        let store = FileStagedPhotoIntakeStore(root: root)
        let attachments = [attachment("photo-a", "image/jpeg", jpegBytes(width: 40, height: 30)), attachment("photo-b", "image/jpeg", jpegBytes(width: 41, height: 30)), attachment("photo-c", "image/png", pngBytes())]
        let first = StagedTransport(server.handler)
        let coordinator = makeCoordinator(api: try await makeAPI(transport: first), store: store, derivative: nil)
        let plan = try await coordinator.prepare(scope: "s", effectiveDate: "2026-09-19", attachments: attachments, photoIdentitiesJSON: try await Self.identitiesJSON(for: attachments), session: session)
        server.faults[plan.artifacts[1].artifactId] = .networkFailure

        await assertThrows(try await coordinator.submit(plan: plan), ProductionNativeError.networkFailure)
        let pendingPlan = await coordinator.pendingPlan()
        let pending = try XCTUnwrap(pendingPlan)
        XCTAssertEqual(pending.intakeId, "evidence_intake_\(plan.submissionIdentity)")
        XCTAssertTrue(pending.artifacts[0].state.isStored)
        XCTAssertFalse(pending.artifacts[1].state.isStored)
        XCTAssertFalse(pending.artifacts[2].state.isStored)
        XCTAssertEqual(pending.artifacts[1].attemptCount, 1)
        XCTAssertFalse(pending.mediaComplete)

        // "App relaunch between artifacts": a fresh process, fresh store handle, fresh transport.
        let second = StagedTransport(server.handler)
        let relaunched = makeCoordinator(api: try await makeAPI(transport: second), store: FileStagedPhotoIntakeStore(root: root), derivative: nil)
        let status = try await relaunched.resume()
        XCTAssertEqual(status.mediaComplete, true)
        let calls = await second.calls
        XCTAssertEqual(calls.map(\.method), ["POST", "PUT", "PUT"], "the declaration replays; only the two missing artifacts move")
        XCTAssertEqual(calls[0].idempotencyKey, plan.submissionIdentity)
        XCTAssertEqual(calls[1].path.hasSuffix(plan.artifacts[1].artifactId), true)
        XCTAssertEqual(calls[2].path.hasSuffix(plan.artifacts[2].artifactId), true)
        XCTAssertEqual(server.putCounts[plan.artifacts[0].artifactId], 1, "the stored artifact is never re-sent")
        let remaining = await relaunched.pendingPlan()
        XCTAssertNil(remaining)
    }

    func testLostAcknowledgementIsResolvedByServerProgressWithoutADuplicateTransfer() async throws {
        let server = FakeStagedServer()
        let store = FileStagedPhotoIntakeStore(root: root)
        let attachments = [attachment("photo-a", "image/jpeg", jpegBytes(width: 40, height: 30)), attachment("photo-b", "image/png", pngBytes())]
        let transport = StagedTransport(server.handler)
        let coordinator = makeCoordinator(api: try await makeAPI(transport: transport), store: store, derivative: nil)
        let plan = try await coordinator.prepare(scope: "s", effectiveDate: "2026-09-19", attachments: attachments, photoIdentitiesJSON: try await Self.identitiesJSON(for: attachments), session: session)
        // The Server stores artifact 1 but the response never arrives.
        server.faults[plan.artifacts[0].artifactId] = .storedButResponseLost

        await assertThrows(try await coordinator.submit(plan: plan), ProductionNativeError.networkFailure)
        let pendingPlan = await coordinator.pendingPlan()
        let pending = try XCTUnwrap(pendingPlan)
        XCTAssertFalse(pending.artifacts[0].state.isStored, "this device does not know yet")

        let status = try await coordinator.resume()
        XCTAssertEqual(status.mediaComplete, true)
        XCTAssertEqual(server.putCounts[plan.artifacts[0].artifactId], 1, "the declaration replay reported it stored; no second transfer")
        XCTAssertEqual(server.putCounts[plan.artifacts[1].artifactId], 1)
        let calls = await transport.calls
        XCTAssertEqual(calls.map(\.method), ["POST", "PUT", "POST", "PUT"])
    }

    func testAlreadyStoredAcknowledgementAndFailureBeforeServerReceiptAreBothSafe() async throws {
        let server = FakeStagedServer()
        let store = FileStagedPhotoIntakeStore(root: root)
        let attachments = [attachment("photo-a", "image/jpeg", jpegBytes(width: 40, height: 30)), attachment("photo-b", "image/png", pngBytes())]
        let transport = StagedTransport(server.handler)
        let coordinator = makeCoordinator(api: try await makeAPI(transport: transport), store: store, derivative: nil)
        let plan = try await coordinator.prepare(scope: "s", effectiveDate: "2026-09-19", attachments: attachments, photoIdentitiesJSON: try await Self.identitiesJSON(for: attachments), session: session)

        // Failure before Server receipt: the declaration itself never lands.
        server.declarationFaults = 1
        await assertThrows(try await coordinator.submit(plan: plan), ProductionNativeError.networkFailure)
        let pendingPlan = await coordinator.pendingPlan()
        let pending = try XCTUnwrap(pendingPlan)
        XCTAssertNil(pending.intakeId)
        XCTAssertEqual(server.stored.count, 0)

        // The Server already holds artifact 1 (an earlier transfer whose reply
        // was lost) but this declaration reply omits progress, so the client
        // sends it again: the Server answers already_stored without a second
        // object, and the client treats that as stored.
        server.stored.insert(plan.artifacts[0].artifactId)
        server.hideProgressOnDeclaration = true
        let status = try await coordinator.resume()
        XCTAssertEqual(status.mediaComplete, true)
        XCTAssertEqual(server.putCounts[plan.artifacts[0].artifactId], 1)
        XCTAssertEqual(server.putCounts[plan.artifacts[1].artifactId], 1)
        XCTAssertEqual(server.stored.count, 2, "no duplicate object")
        let calls = await transport.calls
        XCTAssertEqual(calls.map(\.method), ["POST", "POST", "PUT", "PUT"])
        let remaining = await coordinator.pendingPlan()
        XCTAssertNil(remaining)
    }

    func testRejectedArtifactStopsTheSetAndNeverRetriesSilently() async throws {
        let server = FakeStagedServer()
        let store = FileStagedPhotoIntakeStore(root: root)
        let attachments = [attachment("photo-a", "image/jpeg", jpegBytes(width: 40, height: 30)), attachment("photo-b", "image/png", pngBytes()), attachment("photo-c", "image/png", pngBytes())]
        let transport = StagedTransport(server.handler)
        let coordinator = makeCoordinator(api: try await makeAPI(transport: transport), store: store, derivative: nil)
        let plan = try await coordinator.prepare(scope: "s", effectiveDate: "2026-09-19", attachments: attachments, photoIdentitiesJSON: try await Self.identitiesJSON(for: attachments), session: session)
        server.faults[plan.artifacts[1].artifactId] = .rejected(status: 400, code: "EVIDENCE_INTAKE_ARTIFACT_CONTAINER_INVALID")

        await assertThrows(try await coordinator.submit(plan: plan), StagedPhotoIntakeError.rejected(code: "EVIDENCE_INTAKE_ARTIFACT_CONTAINER_INVALID"))
        let pendingPlan = await coordinator.pendingPlan()
        let pending = try XCTUnwrap(pendingPlan)
        XCTAssertEqual(pending.rejectedArtifacts.map(\.artifactId), [plan.artifacts[1].artifactId])
        XCTAssertEqual(pending.lastErrorCode, "EVIDENCE_INTAKE_ARTIFACT_CONTAINER_INVALID")
        XCTAssertFalse(pending.mediaComplete)
        let callsBefore = await transport.calls.count
        XCTAssertEqual(callsBefore, 3, "the third artifact was not attempted after the rejection")
        await assertThrows(try await coordinator.resume(), StagedPhotoIntakeError.rejected(code: "EVIDENCE_INTAKE_ARTIFACT_CONTAINER_INVALID"))
        let callsAfter = await transport.calls.count
        XCTAssertEqual(callsAfter, callsBefore, "a rejected set is not blindly resubmitted")
        await coordinator.discardPending()
        let cleared = await coordinator.pendingPlan()
        XCTAssertNil(cleared)
    }

    func testIncompleteMediaNeverLooksCompleteAndKeepsTheSetPending() async throws {
        let server = FakeStagedServer()
        server.neverCompletes = true
        let store = FileStagedPhotoIntakeStore(root: root)
        let attachments = [attachment("photo-a", "image/jpeg", jpegBytes(width: 40, height: 30)), attachment("photo-b", "image/png", pngBytes())]
        let transport = StagedTransport(server.handler)
        let coordinator = makeCoordinator(api: try await makeAPI(transport: transport), store: store, derivative: nil)
        let plan = try await coordinator.prepare(scope: "s", effectiveDate: "2026-09-19", attachments: attachments, photoIdentitiesJSON: try await Self.identitiesJSON(for: attachments), session: session)

        await assertThrows(try await coordinator.submit(plan: plan), StagedPhotoIntakeError.incompleteAfterTransfer)
        let pendingPlan = await coordinator.pendingPlan()
        let pending = try XCTUnwrap(pendingPlan)
        XCTAssertFalse(pending.mediaComplete)
        XCTAssertTrue(pending.artifacts.allSatisfy(\.state.isStored))
        let calls = await transport.calls
        XCTAssertEqual(calls.map(\.method), ["POST", "PUT", "PUT", "GET"], "the coordinator asked the Server once more before giving up")
        XCTAssertTrue(FileManager.default.fileExists(atPath: root.path), "local state is kept until the Server confirms complete media")
    }

    func testDismissedPredecessorRotatesTheIdentityOnceAndKeepsEveryStagedByte() async throws {
        let server = FakeStagedServer()
        server.replacementRequiredOnce = true
        let store = FileStagedPhotoIntakeStore(root: root)
        let attachments = [attachment("photo-a", "image/heic", heicBytes)]
        let transport = StagedTransport(server.handler)
        let derivativeBytes = jpegBytes(width: 64, height: 48)
        let coordinator = makeCoordinator(api: try await makeAPI(transport: transport), store: store, derivative: derivativeBytes)
        let plan = try await coordinator.prepare(scope: "s", effectiveDate: "2026-09-19", attachments: attachments, photoIdentitiesJSON: try await Self.identitiesJSON(for: attachments), session: session)

        let status = try await coordinator.submit(plan: plan)
        XCTAssertEqual(status.mediaComplete, true)
        let calls = await transport.calls
        XCTAssertEqual(calls.map(\.method), ["POST", "POST", "PUT", "PUT"])
        let first = try XCTUnwrap(calls[0].body.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] })
        let second = try XCTUnwrap(calls[1].body.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] })
        XCTAssertEqual(first["submissionIdentity"] as? String, plan.submissionIdentity)
        let rotated = try XCTUnwrap(second["submissionIdentity"] as? String)
        XCTAssertNotEqual(rotated, plan.submissionIdentity)
        XCTAssertEqual(second["replacementForSubmissionIdentity"] as? String, plan.submissionIdentity)
        XCTAssertEqual(calls[1].idempotencyKey, rotated)
        let prefix = "artifact_\(rotated.replacingOccurrences(of: "-", with: "").lowercased())_"
        XCTAssertTrue(calls[2].path.hasSuffix("\(prefix)1"))
        XCTAssertEqual(calls[2].body, heicBytes, "the same staged bytes travel under the rotated identity")
        XCTAssertEqual(calls[3].body, derivativeBytes)
        XCTAssertEqual(server.stored.count, 2)
    }

    // MARK: - Status decoding and follow-up

    func testStatusDecodesStagedProgressAndAggregateResponsesUnchanged() throws {
        let decoder = JSONDecoder()
        let staged = try decoder.decode(ProductionEvidenceIntakeStatus.self, from: Data("""
        {"intakeId":"evidence_intake_x","status":"processing","reviewId":null,"reviewUrl":null,"processingUrl":"/log","acceptedAt":"2026-09-19T23:00:00.000Z","mediaState":"receiving","mediaComplete":false,"expectedArtifactCount":2,"storedArtifactCount":1,"artifacts":[{"artifactId":"artifact_a_1","ordinal":1,"role":"original","derivativeOf":null,"state":"stored"},{"artifactId":"artifact_a_2","ordinal":2,"role":"analysis_derivative","derivativeOf":"artifact_a_1","state":"expected"}],"artifactId":"artifact_a_1","artifactOutcome":"stored"}
        """.utf8))
        XCTAssertEqual(staged.mediaComplete, false)
        XCTAssertEqual(staged.artifacts?.map(\.state), ["stored", "expected"])
        XCTAssertEqual(staged.artifacts?[1].derivativeOf, "artifact_a_1")
        XCTAssertEqual(staged.artifactOutcome, "stored")
        XCTAssertFalse(staged.isReady)
        let aggregate = try decoder.decode(ProductionEvidenceIntakeStatus.self, from: Data("""
        {"intakeId":"evidence_intake_y","status":"ready","reviewId":"evidence_review_y","reviewUrl":"/evidence/review/evidence_review_y","processingUrl":"/log"}
        """.utf8))
        XCTAssertNil(aggregate.artifacts)
        XCTAssertTrue(aggregate.isReady)
        var plan = StagedPhotoIntakePlan(submissionIdentity: "0199-x", scope: "s", signature: "sig", effectiveDate: "2026-09-19", session: .init(originalUnedited: true, timeOfDay: "morning", photoIdentitiesJSON: "[]"), artifacts: [
            .init(artifactId: "artifact_a_1", ordinal: 1, role: .original, fileName: "p.heic", mimeType: "image/heic", byteLength: 1, sha256: "a", sourceAttachmentId: "x"),
            .init(artifactId: "artifact_a_2", ordinal: 2, role: .analysisDerivative, derivativeOf: "artifact_a_1", fileName: "p.jpg", mimeType: "image/jpeg", byteLength: 1, sha256: "b", sourceAttachmentId: "x"),
        ], createdAt: Date(timeIntervalSince1970: 0))
        plan.apply(staged, at: Date(timeIntervalSince1970: 1))
        XCTAssertTrue(plan.artifacts[0].state.isStored)
        XCTAssertFalse(plan.artifacts[1].state.isStored)
        XCTAssertEqual(plan.intakeId, "evidence_intake_x")
        XCTAssertFalse(plan.mediaComplete)
    }

    func testAcceptedStagedIntakeFollowsTheSameServerDrivenEvidenceReviewTransition() async throws {
        let transport = StagedTransport { call, _ in
            guard call.method == "GET" else { return (500, "") }
            return (200, #"{"intakeId":"evidence_intake_x","status":"ready","reviewId":"evidence_review_x","reviewUrl":"/evidence/review/evidence_review_x","processingUrl":"/log","mediaState":"stored","mediaComplete":true}"#)
        }
        let api = try await makeAPI(transport: transport)
        let pipeline = ProductionEvidenceIntakePipeline(api: api, idempotencyStore: ProductionIdempotencyKeyStore(defaults: defaults))
        let accepted = ProductionEvidenceIntakeStatus(intakeId: "evidence_intake_x", status: "processing", reviewId: nil, reviewUrl: nil, processingUrl: "/log", mediaState: "stored", mediaComplete: true)
        let reviewId = try await pipeline.readyReview(for: accepted, pollInterval: .milliseconds(1), maxPolls: 2)
        XCTAssertEqual(reviewId, "evidence_review_x", "the review identity comes from the Server, never from media completion")
        let calls = await transport.calls
        XCTAssertEqual(calls.map(\.method), ["GET"])
        XCTAssertTrue(calls.allSatisfy { !$0.path.contains("/commands") }, "no priority completion is issued by the transport")
    }

    // MARK: - Fixtures

    private var heicBytes: Data { Data(base64Encoded: Self.tinyHEICBase64)! }

    private var session: ProgressPhotoSessionDraft {
        ProgressPhotoSessionDraft(timeOfDay: .morning, fasted: true, postWorkout: nil, pump: false, originalUnedited: true)
    }

    private func attachment(_ id: String, _ contentType: String, _ data: Data) -> SandboxAttachment {
        SandboxAttachment(id: id, displayName: id, source: .photos, contentType: contentType, data: data)
    }

    /// `photoIdentitiesJSON` lives on the main-actor view; hop there without
    /// sending the test case itself across isolation.
    private static func identitiesJSON(for attachments: [SandboxAttachment]) async throws -> String {
        let drafts = attachments.map { attachment in
            ProgressPhotoIdentityDraft(id: "pose-\(attachment.id)", attachmentId: attachment.id, orientation: .front, contraction: .relaxed, poseVariant: .standard, customLabel: "", goalRole: .supporting, tags: "", confirmed: true)
        }
        return try await MainActor.run { try ProductionEvidenceUploadView.photoIdentitiesJSON(drafts) }
    }

    private func jpegBytes(width: Int, height: Int) -> Data {
        UIGraphicsImageRenderer(size: CGSize(width: width, height: height)).image { context in
            UIColor.systemTeal.setFill()
            context.fill(CGRect(x: 0, y: 0, width: width, height: height))
            UIColor.white.setFill()
            context.fill(CGRect(x: 2, y: 2, width: max(1, width / 4), height: max(1, height / 4)))
        }.jpegData(compressionQuality: 0.8)!
    }

    private func pngBytes() -> Data {
        UIGraphicsImageRenderer(size: CGSize(width: 12, height: 9)).image { context in
            UIColor.systemOrange.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 12, height: 9))
        }.pngData()!
    }

    private func makeAPI(transport: StagedTransport) async throws -> ProductionNativeAPI {
        let api = ProductionNativeAPI(baseURL: URL(string: "https://physiqueos.test")!, credentialStore: MemoryStore(), transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Staged test")
        return api
    }

    private func makeCoordinator(api: ProductionNativeAPI, store: any StagedPhotoIntakeStore, derivative: Data?) -> StagedPhotoIntakeCoordinator {
        StagedPhotoIntakeCoordinator(
            api: api, store: store, idempotencyStore: ProductionIdempotencyKeyStore(defaults: defaults),
            now: { Date(timeIntervalSince1970: 1_790_000_000) },
            derivative: { _ in derivative }
        )
    }

    private func assertThrows<T, E: Error & Equatable>(_ expression: @autoclosure () async throws -> T, _ expected: E, file: StaticString = #filePath, line: UInt = #line) async {
        do {
            _ = try await expression()
            XCTFail("Expected \(expected)", file: file, line: line)
        } catch let error as E {
            XCTAssertEqual(error, expected, file: file, line: line)
        } catch {
            XCTFail("Expected \(expected), got \(error)", file: file, line: line)
        }
    }
}

/// The Server's staged-media behavior as the client observes it: durable
/// per-artifact truth, idempotent declaration replay, and completion only
/// when every declared artifact is stored. Fault injection models the
/// exact retry cases the transport must survive.
private final class FakeStagedServer: @unchecked Sendable {
    enum Fault { case networkFailure, storedButResponseLost, rejected(status: Int, code: String) }
    private let lock = NSLock()
    var expected: [String] = []
    var stored = Set<String>()
    var putCounts: [String: Int] = [:]
    var faults: [String: Fault] = [:]
    var declarationFaults = 0
    var replacementRequiredOnce = false
    var hideProgressOnDeclaration = false
    var neverCompletes = false
    private var intakeId = ""

    var handler: StagedTransport.Handler {
        { [self] call, _ in try respond(to: call) }
    }

    private func respond(to call: StagedTransport.Call) throws -> (Int, String) {
        lock.lock(); defer { lock.unlock() }
        if call.method == "POST" {
            if declarationFaults > 0 { declarationFaults -= 1; throw URLError(.networkConnectionLost) }
            if replacementRequiredOnce { replacementRequiredOnce = false; return (409, problem(409, "EVIDENCE_INTAKE_REPLACEMENT_REQUIRED")) }
            let body = try JSONSerialization.jsonObject(with: call.body ?? Data()) as? [String: Any] ?? [:]
            intakeId = "evidence_intake_\(body["submissionIdentity"] as? String ?? "")"
            expected = ((body["artifacts"] as? [[String: Any]]) ?? []).compactMap { $0["artifactId"] as? String }
            return (202, status(hideProgress: hideProgressOnDeclaration))
        }
        if call.method == "GET" { return (200, status()) }
        let artifactId = String(call.path.split(separator: "/").last ?? "")
        putCounts[artifactId, default: 0] += 1
        if let fault = faults.removeValue(forKey: artifactId) {
            switch fault {
            case .networkFailure: throw URLError(.networkConnectionLost)
            case .storedButResponseLost: stored.insert(artifactId); throw URLError(.networkConnectionLost)
            case .rejected(let code, let problemCode): return (code, problem(code, problemCode))
            }
        }
        let outcome = stored.contains(artifactId) ? "already_stored" : "stored"
        stored.insert(artifactId)
        return (200, status(artifactId: artifactId, outcome: outcome))
    }

    private func status(artifactId: String? = nil, outcome: String? = nil, hideProgress: Bool = false) -> String {
        let complete = !neverCompletes && !expected.isEmpty && expected.allSatisfy { stored.contains($0) }
        var object: [String: Any] = [
            "intakeId": intakeId, "status": "processing", "reviewId": NSNull(), "reviewUrl": NSNull(), "processingUrl": "/log",
            "mediaState": complete ? "stored" : "receiving", "mediaComplete": complete,
            "expectedArtifactCount": expected.count, "storedArtifactCount": expected.filter { stored.contains($0) }.count,
        ]
        if !hideProgress {
            object["artifacts"] = expected.enumerated().map { index, id in
                ["artifactId": id, "ordinal": index + 1, "role": "original", "derivativeOf": NSNull(), "state": stored.contains(id) ? "stored" : "expected"] as [String: Any]
            }
        }
        if let artifactId { object["artifactId"] = artifactId; object["artifactOutcome"] = outcome ?? "stored" }
        return String(decoding: try! JSONSerialization.data(withJSONObject: object), as: UTF8.self)
    }

    private func problem(_ status: Int, _ code: String) -> String {
        #"{"status":\#(status),"code":"\#(code)","title":"Request failed","detail":null,"fieldErrors":[]}"#
    }
}

private actor StagedTransport: FounderHTTPTransport {
    struct Call: Sendable {
        var method: String
        var path: String
        var contentType: String?
        var idempotencyKey: String?
        var body: Data?
    }
    typealias Handler = @Sendable (Call, Int) throws -> (Int, String)

    private(set) var calls: [Call] = []
    private let handler: Handler

    init(_ handler: @escaping Handler) { self.handler = handler }

    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        try respond(request, body: request.httpBody)
    }

    func upload(for request: URLRequest, from body: Data, onProgress: @escaping @Sendable (Double) -> Void) async throws -> (Data, HTTPURLResponse) {
        onProgress(0.5)
        let result = try respond(request, body: body)
        onProgress(1)
        return result
    }

    private func respond(_ request: URLRequest, body: Data?) throws -> (Data, HTTPURLResponse) {
        let path = request.url?.path ?? ""
        if path.hasSuffix("/auth/pair") || path.hasSuffix("/auth/refresh") {
            let session = #"{"sessionId":"session-1","accessToken":"\#(String(repeating: "a", count: 43))","accessExpiresAt":"2026-09-01T12:10:00.000Z","refreshCredential":"\#(String(repeating: "r", count: 43))","refreshIdleExpiresAt":"2026-10-01T12:00:00.000Z","refreshAbsoluteExpiresAt":"2026-11-30T12:00:00.000Z"}"#
            return (Data(session.utf8), response(200, request))
        }
        let call = Call(method: request.httpMethod ?? "", path: path, contentType: request.value(forHTTPHeaderField: "Content-Type"), idempotencyKey: request.value(forHTTPHeaderField: "Idempotency-Key"), body: body)
        calls.append(call)
        let (status, json) = try handler(call, calls.count)
        return (Data(json.utf8), response(status, request))
    }

    private func response(_ status: Int, _ request: URLRequest) -> HTTPURLResponse {
        HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!
    }
}

private final class ProgressSink: @unchecked Sendable {
    private let lock = NSLock()
    private var storage: [StagedPhotoIntakeProgress] = []
    var values: [StagedPhotoIntakeProgress] { lock.lock(); defer { lock.unlock() }; return storage }
    func append(_ value: StagedPhotoIntakeProgress) { lock.lock(); storage.append(value); lock.unlock() }
}

private final class MemoryStore: FounderRefreshCredentialStore, @unchecked Sendable {
    private var credential: String?
    func loadRefreshCredential() throws -> String? { credential }
    func saveRefreshCredential(_ credential: String) throws { self.credential = credential }
    func deleteRefreshCredential() throws { credential = nil }
}

private extension FileStagedPhotoIntakeStore {
    func readArtifactIfPresent(_ artifactId: String) -> Data? {
        try? readArtifact(artifactId)
    }
}
