import SwiftUI
import UIKit

/// A controlled transport-proof surface. It never mixes its live Weight
/// result into fixture-backed Home/Log screens and does not expose any
/// product write. Pairing requires a one-time Founder-controlled credential.
struct FounderServerConnectionView: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var pairingCredential = ""
    @State private var isConnected = false
    @State private var isWorking = false
    @State private var result: FounderWeightReadResult?
    @State private var message: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                OperatingPlanScreenHeader(
                    eyebrow: "SERVER SANDBOX",
                    title: "Sandbox server connection",
                    subtitle: "Securely connect this iPhone to the isolated acceptance environment, then verify one read-only Weight summary."
                )

                StatusChip(text: isConnected ? "Device session available" : "Not connected", color: isConnected ? .success : .warning)

                if !isConnected {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("One-time pairing credential")
                            .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        SecureField("Enter the Founder pairing credential", text: $pairingCredential)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .textContentType(.oneTimeCode)
                            .padding(12)
                            .background(PhysiqueOSTheme.surfaceMuted)
                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                        PrimaryActionButton(title: "Connect this iPhone", isEnabled: pairingCredential.count == 43 && !isWorking) {
                            connect()
                        }
                    }
                }

                if isConnected {
                    PrimaryActionButton(title: "Load current Weight", isEnabled: !isWorking) {
                        loadWeight()
                    }
                }

                if let result {
                    CardContainer(padding: .md) {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Sandbox Weight summary")
                                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                            if let weight = result.summary.currentWeight {
                                Text("\(weight.value.formatted(.number.precision(.fractionLength(1)))) \(weight.unit)")
                                    .physiqueOSFont(PhysiqueOSTypography.screenTitle)
                                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                                Text("Measured \(weight.measurementDate)")
                                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                            } else {
                                Text("No Weight measurement is available.")
                                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                            }
                            Text("Ready in \(result.requestDurationMilliseconds) ms")
                                .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                                .foregroundStyle(PhysiqueOSTheme.textMuted)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }

                if let message {
                    Text(message)
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 14)
        }
        .physiqueOSScrollBottomClearance()
        .background(PhysiqueOSTheme.background)
        .navigationTitle("Sandbox connection")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            isConnected = (try? await environment.founderServerAPI.hasStoredSession()) == true
        }
    }

    private func connect() {
        let credential = pairingCredential
        isWorking = true
        message = nil
        Task {
            do {
                _ = try await environment.founderServerAPI.pair(
                    pairingCredential: credential,
                    displayName: UIDevice.current.name
                )
                await MainActor.run {
                    pairingCredential = ""
                    isConnected = true
                    isWorking = false
                }
                loadWeight()
            } catch {
                await MainActor.run {
                    message = (error as? LocalizedError)?.errorDescription ?? "This iPhone could not be connected."
                    isWorking = false
                }
            }
        }
    }

    private func loadWeight() {
        isWorking = true
        message = nil
        Task {
            do {
                let liveResult = try await environment.founderServerAPI.readCurrentWeight()
                await MainActor.run {
                    result = liveResult
                    isWorking = false
                }
            } catch {
                await MainActor.run {
                    message = (error as? LocalizedError)?.errorDescription ?? "Weight could not be loaded."
                    if error as? FounderServerError == .notPaired || error as? FounderServerError == .deviceOrSessionRevoked {
                        isConnected = false
                    }
                    isWorking = false
                }
            }
        }
    }
}
