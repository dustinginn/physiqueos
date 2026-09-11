import Foundation
import Security

protocol FounderRefreshCredentialStore: Sendable {
    func loadRefreshCredential() throws -> String?
    func saveRefreshCredential(_ credential: String) throws
    func deleteRefreshCredential() throws
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
}

/// Long-lived Founder device material is stored only in the iOS Keychain.
/// `WhenUnlockedThisDeviceOnly` prevents backup migration and keeps the
/// credential unavailable while the device is locked. Access credentials
/// remain in `FounderServerAPI` memory and are never persisted here.
final class KeychainFounderCredentialStore: FounderRefreshCredentialStore, @unchecked Sendable {
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
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess else { throw FounderCredentialStoreError.keychain(status) }
        guard let data = result as? Data, let value = String(data: data, encoding: .utf8), !value.isEmpty else {
            throw FounderCredentialStoreError.malformedValue
        }
        return value
    }

    func saveRefreshCredential(_ credential: String) throws {
        guard let data = credential.data(using: .utf8), !credential.isEmpty else {
            throw FounderCredentialStoreError.malformedValue
        }
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
