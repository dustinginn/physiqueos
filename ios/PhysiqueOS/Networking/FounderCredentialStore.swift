import Foundation
import Security

struct FounderCredentialEnvelope: Codable, Sendable, Equatable {
    static let currentVersion = 2
    static let senderConstrainedProtocol = "sender-constrained-refresh-v1"
    static let legacyProtocol = "legacy-refresh-v1"

    struct PendingRotation: Codable, Sendable, Equatable {
        let predecessorRefreshCredential: String
        let rotationIntentId: String
        let proposedSuccessorRefreshCredential: String
        let createdAt: Date
    }

    let version: Int
    var authProtocol: String
    var currentRefreshCredential: String
    var pendingRotation: PendingRotation?

    static func legacy(_ credential: String) -> FounderCredentialEnvelope {
        FounderCredentialEnvelope(
            version: currentVersion,
            authProtocol: legacyProtocol,
            currentRefreshCredential: credential,
            pendingRotation: nil
        )
    }

    func validated() throws -> FounderCredentialEnvelope {
        guard version == Self.currentVersion,
              [Self.legacyProtocol, Self.senderConstrainedProtocol].contains(authProtocol),
              Self.isCredential(currentRefreshCredential)
        else { throw FounderCredentialStoreError.malformedValue }
        if let pendingRotation {
            guard authProtocol == Self.senderConstrainedProtocol,
                  pendingRotation.predecessorRefreshCredential == currentRefreshCredential,
                  Self.isCredential(pendingRotation.predecessorRefreshCredential),
                  Self.isCredential(pendingRotation.rotationIntentId),
                  Self.isCredential(pendingRotation.proposedSuccessorRefreshCredential)
            else { throw FounderCredentialStoreError.malformedValue }
        }
        return self
    }

    private static func isCredential(_ value: String) -> Bool {
        value.range(of: #"^[A-Za-z0-9_-]{43,128}$"#, options: .regularExpression) != nil
    }
}

protocol FounderRefreshCredentialStore: Sendable {
    func loadRefreshCredential() throws -> String?
    func saveRefreshCredential(_ credential: String) throws
    func deleteRefreshCredential() throws
}

protocol FounderSessionEnvelopeStore: FounderRefreshCredentialStore {
    func loadSessionEnvelope() throws -> FounderCredentialEnvelope?
    func saveSessionEnvelope(_ envelope: FounderCredentialEnvelope) throws
}

enum FounderCredentialNamespace: String, Sendable, CaseIterable, Hashable {
    case sandbox
    case founderProduction

    var keychainService: String {
        switch self {
        case .sandbox:
            // Preserve the accepted Sandbox item so an existing Sandbox
            // device session is not silently orphaned by this patch.
            "com.physiqueos.native.dev.founder-auth"
        case .founderProduction:
            "com.physiqueos.native.founder-production-auth"
        }
    }
}

enum FounderCredentialStoreError: Error, Equatable {
    case keychain(OSStatus)
    case malformedValue
    case secureEnclaveUnavailable
    case signatureFailed
}

/// Long-lived Founder device material is stored only in the iOS Keychain.
/// `WhenUnlockedThisDeviceOnly` prevents backup migration and keeps the
/// credential unavailable while the device is locked. Access credentials
/// remain in `FounderServerAPI` memory and are never persisted here.
final class KeychainFounderCredentialStore: FounderSessionEnvelopeStore, @unchecked Sendable {
    let namespace: FounderCredentialNamespace
    private let service: String
    private let account: String

    var serviceIdentifier: String { service }
    var accountIdentifier: String { account }

    init(
        namespace: FounderCredentialNamespace = .sandbox,
        service: String? = nil,
        account: String = "rotating-refresh-credential"
    ) {
        self.namespace = namespace
        self.service = service ?? namespace.keychainService
        self.account = account
    }

    func loadRefreshCredential() throws -> String? {
        try loadSessionEnvelope()?.currentRefreshCredential
    }

    func loadSessionEnvelope() throws -> FounderCredentialEnvelope? {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess else { throw FounderCredentialStoreError.keychain(status) }
        guard let data = result as? Data else {
            throw FounderCredentialStoreError.malformedValue
        }
        if let envelope = try? JSONDecoder().decode(FounderCredentialEnvelope.self, from: data) {
            return try envelope.validated()
        }
        // One-time, read-compatible migration from the accepted Build 69
        // single-string item. The next successful save writes v2 JSON.
        guard let value = String(data: data, encoding: .utf8), !value.isEmpty else {
            throw FounderCredentialStoreError.malformedValue
        }
        return try FounderCredentialEnvelope.legacy(value).validated()
    }

    func saveRefreshCredential(_ credential: String) throws {
        try saveSessionEnvelope(.legacy(credential))
    }

    func saveSessionEnvelope(_ envelope: FounderCredentialEnvelope) throws {
        let data = try JSONEncoder().encode(envelope.validated())
        let update: [String: Any] = [kSecValueData as String: data]
        let updateStatus = SecItemUpdate(baseQuery as CFDictionary, update as CFDictionary)
        if updateStatus == errSecSuccess { return }
        guard updateStatus == errSecItemNotFound else { throw FounderCredentialStoreError.keychain(updateStatus) }

        var insert = baseQuery
        insert[kSecValueData as String] = data
        insert[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        let addStatus = SecItemAdd(insert as CFDictionary, nil)
        guard addStatus == errSecSuccess else { throw FounderCredentialStoreError.keychain(addStatus) }
    }

    func deleteRefreshCredential() throws {
        let status = SecItemDelete(baseQuery as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw FounderCredentialStoreError.keychain(status)
        }
    }

    private var baseQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }
}

protocol FounderInstallationSigningKey: Sendable {
    func publicKeySPKIBase64URL() throws -> String
    func sign(message: Data) throws -> String
}

/// One unattended, non-exportable P-256 key per installation/authority.
/// There is deliberately no LocalAuthentication access-control flag: proof
/// generation must work during refresh without a Face ID or passcode prompt.
final class SecureEnclaveFounderInstallationSigningKey: FounderInstallationSigningKey, @unchecked Sendable {
    private let applicationTag: Data
    private let lock = NSLock()
    private var cachedPrivateKey: SecKey?

    init(namespace: FounderCredentialNamespace = .founderProduction) {
        applicationTag = Data("\(namespace.keychainService).sender-constrained-refresh.v1".utf8)
    }

    func publicKeySPKIBase64URL() throws -> String {
        let privateKey = try loadOrCreatePrivateKey()
        guard let publicKey = SecKeyCopyPublicKey(privateKey),
              let external = SecKeyCopyExternalRepresentation(publicKey, nil) as Data?,
              external.count == 65,
              external.first == 0x04
        else { throw FounderCredentialStoreError.secureEnclaveUnavailable }
        // DER SubjectPublicKeyInfo prefix for id-ecPublicKey + prime256v1,
        // followed by the uncompressed ANSI X9.63 public point.
        let prefix = Data([
            0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48,
            0xce, 0x3d, 0x02, 0x01, 0x06, 0x08, 0x2a, 0x86, 0x48,
            0xce, 0x3d, 0x03, 0x01, 0x07, 0x03, 0x42, 0x00,
        ])
        return (prefix + external).base64URLEncodedString()
    }

    func sign(message: Data) throws -> String {
        let privateKey = try loadOrCreatePrivateKey()
        var error: Unmanaged<CFError>?
        guard let signature = SecKeyCreateSignature(
            privateKey,
            .ecdsaSignatureMessageX962SHA256,
            message as CFData,
            &error
        ) as Data? else {
            _ = error?.takeRetainedValue()
            throw FounderCredentialStoreError.signatureFailed
        }
        return signature.base64URLEncodedString()
    }

    private func loadOrCreatePrivateKey() throws -> SecKey {
        try lock.withLock {
            if let cachedPrivateKey { return cachedPrivateKey }
            let query: [String: Any] = [
                kSecClass as String: kSecClassKey,
                kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
                kSecAttrApplicationTag as String: applicationTag,
                kSecReturnRef as String: true,
                kSecMatchLimit as String: kSecMatchLimitOne,
            ]
            var result: CFTypeRef?
            let lookup = SecItemCopyMatching(query as CFDictionary, &result)
            if lookup == errSecSuccess, let result {
                let key = result as! SecKey
                cachedPrivateKey = key
                return key
            }
            guard lookup == errSecItemNotFound else { throw FounderCredentialStoreError.keychain(lookup) }

            let attributes: [String: Any] = [
                kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
                kSecAttrKeySizeInBits as String: 256,
                kSecAttrTokenID as String: kSecAttrTokenIDSecureEnclave,
                kSecPrivateKeyAttrs as String: [
                    kSecAttrIsPermanent as String: true,
                    kSecAttrApplicationTag as String: applicationTag,
                    kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
                ],
            ]
            var error: Unmanaged<CFError>?
            guard let key = SecKeyCreateRandomKey(attributes as CFDictionary, &error) else {
                _ = error?.takeRetainedValue()
                throw FounderCredentialStoreError.secureEnclaveUnavailable
            }
            cachedPrivateKey = key
            return key
        }
    }
}

extension Data {
    func base64URLEncodedString() -> String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
