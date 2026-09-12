import Foundation

/// The deliberately narrow transport contracts for the first authenticated
/// Native/server bridge. These mirror `/api/v1/native/**`; they are not
/// projections of the app's fixture models and do not become local authority.
struct FounderServerSession: Decodable, Sendable, Equatable {
    let sessionId: String
    let accessToken: String
    let accessExpiresAt: String
    let refreshCredential: String
    let refreshIdleExpiresAt: String
    let refreshAbsoluteExpiresAt: String?
}

/// Backs the isolated Sandbox acceptance proof's own `/weight/summary`
/// endpoint (`readCurrentWeight()`) — genuinely distinct from, and
/// unaffected by, the Founder Production `weight` native resource's
/// contract below despite the similar name.
struct FounderWeightSummary: Decodable, Sendable, Equatable {
    let schemaVersion: String
    let currentWeight: CurrentWeight?

    struct CurrentWeight: Decodable, Sendable, Equatable {
        let id: String
        let value: Double
        let unit: String
        /// A server-owned calendar date (`YYYY-MM-DD`), intentionally kept as
        /// a string so Pacific time can never shift it to an adjacent day.
        let measurementDate: String
    }
}

/// Minimal decode of the completed `weight` native resource
/// (`projectNativeWeightRead`) — this type backs only the "You → Founder
/// device connection" pairing-verification smoke test
/// (`FounderServerConnectionView`'s "Canonical Weight" card), which needs
/// nothing beyond the current reading. The full Weight Evidence vertical
/// decodes the complete contract itself in `WeightEvidenceAPI.swift`
/// (history, rolling averages, extrema, DEXA context) — this struct is
/// deliberately not extended to duplicate that.
struct FounderProductionWeightSummary: Decodable, Sendable, Equatable {
    let schemaVersion: String
    let currentWeight: CurrentWeight?

    private enum CodingKeys: String, CodingKey {
        case schemaVersion
        case currentWeight = "current"
    }

    struct CurrentWeight: Decodable, Sendable, Equatable {
        let id: String
        let value: Double
        let unit: String
        /// A server-owned calendar date (`YYYY-MM-DD`), intentionally kept as
        /// a string so Pacific time can never shift it to an adjacent day.
        let measurementDate: String

        private enum CodingKeys: String, CodingKey {
            case id, value, unit
            case measurementDate = "date"
        }
    }
}

struct FounderWeightReadResult: Sendable, Equatable {
    let summary: FounderWeightSummary
    let requestDurationMilliseconds: Int
}

/// A Founder-entered Weight scalar written directly to the canonical
/// sandbox record — no media, OCR, Spaces, or Evidence Review involved.
/// `submissionIdentity` + `idempotencyKey` together identify one submission
/// attempt: retrying with the same pair is a safe no-duplicate retry, while
/// a genuinely new value/date pairing gets a fresh pair so the server
/// treats it as a deliberate correction rather than a replay.
struct NativeSandboxWeightManualRequest: Encodable, Sendable, Equatable {
    let submissionIdentity: String
    let idempotencyKey: String
    let measurementDate: String
    let value: Double
    let unit: String
}

struct NativeSandboxWeightManualResult: Decodable, Sendable, Equatable {
    let schemaVersion: String
    let id: String
    let status: String
    let measurementDate: String
    let value: Double
    let unit: String
}

/// Pure decision of whether a manual Weight submit attempt is a safe retry
/// of the last attempt or a deliberate new correction — factored out of
/// `FounderServerConnectionView` so the identity/idempotency rule is unit
/// testable without driving SwiftUI.
enum NativeSandboxWeightManualSubmission {
    struct Identity: Equatable {
        let submissionIdentity: String
        let idempotencyKey: String
    }

    static func signature(value: Double, unit: String, measurementDate: String) -> String {
        "\(value)|\(unit)|\(measurementDate)"
    }

    /// Same value/unit/date as the immediately prior attempt: reuse its
    /// identity pair so a retry after a dropped response is a safe no-op on
    /// the server. Any other signature — including the very first
    /// attempt — is a new correction and must not collide with a prior
    /// attempt's idempotency identity, so `freshIdentity` is used instead.
    static func resolvedIdentity(
        signature: String,
        previousSignature: String?,
        previousIdentity: Identity?,
        freshIdentity: Identity
    ) -> Identity {
        if signature == previousSignature, let previousIdentity {
            return previousIdentity
        }
        return freshIdentity
    }
}

/// Candidate-only transport for the server sandbox. Native's Vision/OCR
/// result remains noncanonical until the server validates the original asset
/// and stages a server-owned Evidence Review.
struct NativeSandboxWeightCandidate: Encodable, Sendable, Equatable {
    let submissionIdentity: String
    let idempotencyKey: String
    let candidateType: String
    let measurementDate: String
    let value: Double
    let unit: String
    let confidence: Double
    let localParserVersion: String
    let assetSha256: String
    let founderContext: String?
    let fieldProvenance: FieldProvenance

    struct FieldProvenance: Encodable, Sendable, Equatable {
        let value: ValueProvenance
    }

    struct ValueProvenance: Encodable, Sendable, Equatable {
        let source: String
        let regions: [Region]
    }

    struct Region: Encodable, Sendable, Equatable {
        let page: Int
        let text: String
    }
}

struct NativeSandboxWeightReview: Decodable, Sendable, Equatable {
    let id: String
    let status: String
    let version: Int
    let occurrenceDate: String
    let candidate: Candidate

    struct Candidate: Decodable, Sendable, Equatable {
        let value: Double
        let unit: String
        let confidence: Double
        let disposition: String
    }
}

struct FounderServerProblem: Decodable, Sendable, Equatable {
    let status: Int
    let code: String
    let title: String
    let detail: String?
}

enum FounderServerError: Error, Sendable, Equatable, LocalizedError {
    case notPaired
    case accessTokenExpired
    case refreshFailed
    case deviceOrSessionRevoked
    case unauthorizedScope
    case serverUnavailable
    case networkFailure
    case invalidResponse
    case serverProblem(code: String, message: String)

    var errorDescription: String? {
        switch self {
        case .notPaired: "Connect this iPhone before loading live data."
        case .accessTokenExpired: "The secure session expired. Reconnect this iPhone."
        case .refreshFailed: "The secure session could not be refreshed. Reconnect this iPhone."
        case .deviceOrSessionRevoked: "Access for this iPhone has been revoked."
        case .unauthorizedScope: "This device is not authorized to read Weight."
        case .serverUnavailable: "PhysiqueOS is temporarily unavailable."
        case .networkFailure: "The server could not be reached. Check the connection and try again."
        case .invalidResponse: "PhysiqueOS returned an unreadable response."
        case .serverProblem(_, let message): message
        }
    }
}

// MARK: - Founder production Native contracts

struct ProductionResponseEnvelope<Payload: Decodable & Sendable>: Decodable, Sendable {
    let contractVersion: String
    let resource: String
    let authority: String
    let generatedAt: String
    let data: Payload
}

struct ProductionProfileData: Decodable, Sendable, Equatable {
    struct Profile: Decodable, Sendable, Equatable {
        struct User: Decodable, Sendable, Equatable {
            let id: String
            let displayName: String?
            let firstName: String?
            let lastName: String?
            let timezone: String?
            let timeZone: String?
        }

        // The deployed profile payload is the client-safe You profile and
        // nests canonical identity under `user`.
        let user: User?
        // Tolerate the narrow profile shape used by contract-boundary
        // fixtures without weakening authority validation.
        let id: String?
        let displayName: String?
        let timeZone: String?

        var identity: User? {
            if let user { return user }
            guard let id else { return nil }
            return User(id: id, displayName: displayName, firstName: nil, lastName: nil, timezone: nil, timeZone: timeZone)
        }
    }

    struct Authority: Decodable, Sendable, Equatable {
        let type: String
        let sandbox: Bool
    }

    struct Capabilities: Decodable, Sendable, Equatable {
        let read: Bool
        let write: Bool
        let media: Bool
    }

    let profile: Profile
    let authority: Authority
    let capabilities: Capabilities
}

struct ProductionContractManifest: Decodable, Sendable, Equatable {
    struct Bootstrap: Decodable, Sendable, Equatable {
        let issuerEndpoint: String
        let issuerAuthentication: String
        let pairEndpoint: String
        let credentialLifetimeSeconds: Int
        let credentialUse: String
        let authority: String
    }

    struct Media: Decodable, Sendable, Equatable {
        let endpoint: String
        let identity: String
        let authorization: String
        let cache: String
    }

    struct Read: Decodable, Sendable, Equatable {
        let resource: String
        let endpoint: String
        let service: String
        let auth: String
        let authority: String
        let goalPhase: String
        let media: String
        let pagination: String
    }

    struct Command: Decodable, Sendable, Equatable {
        let commandType: String
        let endpoint: String
        let auth: String
        let authority: String
        let idempotency: String
        let revision: String
    }

    let contractVersion: String
    let apiVersion: String
    let authority: String
    let authentication: String
    let bootstrap: Bootstrap
    let sandboxAuthority: String
    let errorFormat: String
    let dateSemantics: String
    let media: Media
    let reads: [Read]
    let writes: [Command]
}

indirect enum ProductionJSONValue: Codable, Sendable, Equatable {
    case object([String: ProductionJSONValue])
    case array([ProductionJSONValue])
    case string(String)
    case number(Double)
    case bool(Bool)
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() { self = .null }
        else if let value = try? container.decode(Bool.self) { self = .bool(value) }
        else if let value = try? container.decode(Double.self) { self = .number(value) }
        else if let value = try? container.decode(String.self) { self = .string(value) }
        else if let value = try? container.decode([String: ProductionJSONValue].self) { self = .object(value) }
        else if let value = try? container.decode([ProductionJSONValue].self) { self = .array(value) }
        else { throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported JSON value") }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .object(let value): try container.encode(value)
        case .array(let value): try container.encode(value)
        case .string(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        case .bool(let value): try container.encode(value)
        case .null: try container.encodeNil()
        }
    }
}

struct ProductionProblemDetails: Decodable, Sendable, Equatable {
    struct FieldError: Decodable, Sendable, Equatable {
        let field: String
        let code: String
        let detail: String?
    }

    let problemVersion: String?
    let type: String?
    let title: String
    let status: Int
    let code: String
    let detail: String?
    let instance: String?
    let requestId: String?
    let fieldErrors: [FieldError]
    let recovery: ProductionJSONValue?
}

struct ProductionMediaPayload: Sendable, Equatable {
    let data: Data
    let contentType: String
}

enum ProductionNativeError: Error, Sendable, Equatable, LocalizedError {
    case notPaired
    case unauthenticated(ProductionProblemDetails?)
    case notFound(ProductionProblemDetails?)
    case validation(ProductionProblemDetails)
    case failedPrecondition(ProductionProblemDetails)
    /// HTTP 428 — a correction-style command omitted `If-Match` entirely
    /// (`PRECONDITION_REQUIRED`), distinct from `.failedPrecondition`'s 412
    /// (an `If-Match` was sent but no longer matches canonical state). A
    /// correctly-behaving Native client should never trigger this — every
    /// call site that can correct an existing value must always populate
    /// `expectedVersion` — but it's mapped explicitly rather than falling
    /// through to `.server` so a real bug here is diagnosable.
    case preconditionRequired(ProductionProblemDetails)
    case conflict(ProductionProblemDetails)
    case temporaryServer(ProductionProblemDetails?)
    case server(ProductionProblemDetails?)
    case networkFailure
    case invalidResponse
    case incompatibleContractVersion(expected: String, actual: String)
    case resourceMismatch(expected: String, actual: String)
    case authorityMismatch(expected: String, actual: String)
    case unsupportedMediaType(String?)

    var errorDescription: String? {
        switch self {
        case .notPaired: "Connect this iPhone to Founder Production before loading data."
        case .unauthenticated: "The Founder Production session is no longer authenticated."
        case .notFound: "The requested Founder Production resource is unavailable."
        case .validation(let problem), .failedPrecondition(let problem), .preconditionRequired(let problem), .conflict(let problem): problem.title
        case .temporaryServer: "PhysiqueOS is temporarily unavailable."
        case .server(let problem): problem?.title ?? "The Founder Production request failed."
        case .networkFailure: "PhysiqueOS could not be reached. Check the connection and try again."
        case .invalidResponse: "PhysiqueOS returned an unreadable response."
        case .incompatibleContractVersion: "The Native production contract version is incompatible."
        case .resourceMismatch: "The Native production resource identity did not match the request."
        case .authorityMismatch: "The response did not come from Founder Production authority."
        case .unsupportedMediaType: "The authenticated media type is not supported."
        }
    }
}

// MARK: - Founder photo visual-acceptance transport

/// The deliberately narrow, Sandbox-only media manifest. The server owns
/// the allowlist and returns opaque media identities plus authenticated
/// proxy paths; Native never receives provider object keys or signed URLs.
struct FounderPhotoAcceptanceManifest: Decodable, Sendable, Equatable {
    let schemaVersion: String
    let authority: FounderPhotoAcceptanceAuthority
    let sessions: [FounderPhotoAcceptanceSession]
}

struct FounderPhotoAcceptanceAuthority: Decodable, Sendable, Equatable {
    let kind: String
    let sandboxAuthorityId: String
}

struct FounderPhotoAcceptanceSession: Decodable, Sendable, Equatable, Identifiable {
    let photoSessionId: String
    let captureDate: String
    let photos: [FounderPhotoAcceptanceItem]
    var id: String { photoSessionId }
}

struct FounderPhotoAcceptanceItem: Decodable, Sendable, Equatable, Identifiable {
    struct Delivery: Decodable, Sendable, Equatable {
        let kind: String
        let path: String
    }

    let viewIdentity: String
    let photoSessionId: String
    let photoId: String
    let mediaId: String
    let poseId: PhotoPoseID
    let captureDate: String
    let contentType: String
    let pixelWidth: Int?
    let pixelHeight: Int?
    let delivery: Delivery
    var id: String { viewIdentity }
}
