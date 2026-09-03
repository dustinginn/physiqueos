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

    @State private var manualWeightText = ""
    @State private var manualUnit: WeightUnit = .lb
    @State private var manualDate = Date()
    @State private var manualSubmissionIdentity: String?
    @State private var manualIdempotencyKey: String?
    @State private var manualSubmittedSignature: String?
    @State private var manualIsSubmitting = false
    @State private var manualIsError = false
    @State private var manualMessage: String?
    @State private var manualResult: NativeSandboxWeightManualResult?
    @State private var manualElapsedMilliseconds: Int?

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

                if isConnected {
                    Divider().overlay(PhysiqueOSTheme.divider)
                    manualWeightTestSection
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

    /// A clearly-labeled, temporary Founder-only integration surface for the
    /// first real manually entered sandbox Weight write. It shares this
    /// screen's session/connection state but keeps its own submit status so
    /// a write failure never reads as a read failure (or vice versa). This
    /// intentionally does not touch Morning Check-In or ordinary manual
    /// Weight — both remain fixture-backed and fully separate from the
    /// sandbox authority proved here.
    private var manualWeightTestSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("SANDBOX WEIGHT TEST")
                .physiqueOSFont(PhysiqueOSTypography.screenEyebrow)
                .foregroundStyle(PhysiqueOSTheme.accent)
            Text("Writes only to the isolated sandbox. This does not affect Founder production Weight history.")
                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)

            CardContainer(padding: .md) {
                VStack(alignment: .leading, spacing: 12) {
                    DateField(date: $manualDate, maximumDate: Date(), label: "Measurement date")
                    HStack {
                        NumericEditField(text: $manualWeightText, accessibilityLabel: "Sandbox test weight", placeholder: "150.5")
                            .frame(height: 48)
                        Picker("Unit", selection: $manualUnit) {
                            ForEach(WeightUnit.allCases) { Text($0.rawValue).tag($0) }
                        }
                        .pickerStyle(.segmented)
                        .frame(width: 110)
                    }
                }
            }

            PrimaryActionButton(
                title: "Submit sandbox Weight",
                isEnabled: !manualIsSubmitting && !manualWeightText.trimmingCharacters(in: .whitespaces).isEmpty
            ) {
                submitManualWeight()
            }
            .accessibilityIdentifier("sandboxWeightTest.submit")

            if let manualResult {
                CardContainer(padding: .md) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Confirmed by server")
                            .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        Text("\(manualResult.value.formatted(.number.precision(.fractionLength(1)))) \(manualResult.unit)")
                            .physiqueOSFont(PhysiqueOSTypography.screenTitle)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        Text("Measured \(manualResult.measurementDate) · status \(manualResult.status)")
                            .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        if let manualElapsedMilliseconds {
                            Text("Confirmed and summary refreshed in \(manualElapsedMilliseconds) ms")
                                .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                                .foregroundStyle(PhysiqueOSTheme.textMuted)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }

            if let manualMessage {
                Text(manualMessage)
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(manualIsError ? PhysiqueOSTheme.destructive : PhysiqueOSTheme.textSecondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    private func submitManualWeight() {
        guard isConnected else {
            manualIsError = true
            manualMessage = "Connect this iPhone before submitting a sandbox Weight test."
            return
        }
        if let validationError = DirectWeighInValidation.validationError(forWeightText: manualWeightText) {
            manualIsError = true
            manualMessage = validationError
            return
        }
        guard let value = Double(manualWeightText.trimmingCharacters(in: .whitespaces)) else {
            manualIsError = true
            manualMessage = "Enter a valid weight."
            return
        }

        let dateKey = Self.manualDateKeyFormatter.string(from: manualDate)
        let signature = NativeSandboxWeightManualSubmission.signature(value: value, unit: manualUnit.rawValue, measurementDate: dateKey)
        let previousIdentity = manualSubmissionIdentity.flatMap { identity in
            manualIdempotencyKey.map { NativeSandboxWeightManualSubmission.Identity(submissionIdentity: identity, idempotencyKey: $0) }
        }
        let identity = NativeSandboxWeightManualSubmission.resolvedIdentity(
            signature: signature,
            previousSignature: manualSubmittedSignature,
            previousIdentity: previousIdentity,
            freshIdentity: .init(submissionIdentity: UUID().uuidString, idempotencyKey: UUID().uuidString)
        )
        let submissionIdentity = identity.submissionIdentity
        let idempotencyKey = identity.idempotencyKey

        let request = NativeSandboxWeightManualRequest(
            submissionIdentity: submissionIdentity,
            idempotencyKey: idempotencyKey,
            measurementDate: dateKey,
            value: value,
            unit: manualUnit.rawValue
        )

        manualIsSubmitting = true
        manualIsError = false
        manualMessage = nil
        let startedAt = ContinuousClock.now
        Task {
            do {
                let confirmed = try await environment.founderServerAPI.submitManualWeight(request)
                await MainActor.run {
                    manualResult = confirmed
                    manualSubmissionIdentity = submissionIdentity
                    manualIdempotencyKey = idempotencyKey
                    manualSubmittedSignature = signature
                }
                do {
                    let refreshed = try await environment.founderServerAPI.readCurrentWeight()
                    await MainActor.run {
                        result = refreshed
                        manualElapsedMilliseconds = Self.elapsedMilliseconds(since: startedAt)
                        manualIsSubmitting = false
                    }
                } catch {
                    await MainActor.run {
                        manualIsError = true
                        manualMessage = "Saved, but the sandbox summary could not be refreshed. Pull to reload."
                        manualIsSubmitting = false
                    }
                }
            } catch {
                await MainActor.run {
                    manualIsError = true
                    manualMessage = (error as? LocalizedError)?.errorDescription ?? "The sandbox Weight test could not be saved."
                    if error as? FounderServerError == .notPaired || error as? FounderServerError == .deviceOrSessionRevoked {
                        isConnected = false
                    }
                    manualIsSubmitting = false
                }
            }
        }
    }

    /// Converts the picked `Date` to a plain `YYYY-MM-DD` day string in the
    /// Founder's own timezone (mirrors `LoggingSandboxStore.dateKey`) so the
    /// selected calendar day never silently shifts across a UTC boundary.
    private static let manualDateKeyFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = ManualWeighInValidation.calendar.timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    private static func elapsedMilliseconds(since instant: ContinuousClock.Instant) -> Int {
        let components = instant.duration(to: .now).components
        return max(0, Int(components.seconds * 1_000 + components.attoseconds / 1_000_000_000_000_000))
    }
}
