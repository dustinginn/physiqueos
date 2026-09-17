import SwiftUI

/// Founder Production's Evidence Review detail. Confirm is wired against
/// the real, deployed `evidence-review.commit.v1` command (plus, for a
/// DEXA scan specifically, `dexa-review.measurements.v1` full-replace
/// correction beforehand) — both already exist and are production-
/// authorized (`ProductionEvidenceIntakePipeline`/`DEXAWriteAPI`).
///
/// Dismiss uses the bounded, version-protected production dispose command;
/// it never deletes evidence locally or creates canonical history.
struct EvidenceReviewDetailView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    let reviewId: String
    var onReturnToLog: () -> Void = {}
    @State private var state: LoadState = .loading
    @State private var actionState: ActionState = .idle
    @State private var editedMeasurements: DEXAScanMeasurements?
    @State private var measurementTexts: [String: String] = [:]
    @State private var showingDismissConfirmation = false

    enum LoadState: Equatable {
        case loading
        case loaded(EvidenceReviewDetailReadModel?)
        case failed(String)
    }

    enum ActionState: Equatable {
        case idle
        case editingMeasurements
        case savingMeasurements
        case confirming(String)
        case dismissing
        case dismissed
        case accepted
        case confirmed
        case stillProcessing
        case refreshRequired(String)
        case failed(String)
    }

    var body: some View {
        ScrollView {
            content
                .padding(.horizontal, 16)
                .padding(.top, 12)
        }
        .physiqueOSScrollBottomClearance()
        .background(PhysiqueOSTheme.background)
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .restoresInteractivePopGesture()
        .toolbarBackground(PhysiqueOSTheme.background, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button { dismiss() } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "arrow.left")
                            .font(.system(size: 13, weight: .semibold))
                        Text("Back")
                            .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                    }
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
        }
        .task(id: environment.nativeAuthority) { await load() }
        .onAppear { environment.currentlyViewingReviewId = reviewId }
        .onDisappear {
            if environment.currentlyViewingReviewId == reviewId { environment.currentlyViewingReviewId = nil }
        }
        .alert(
            "Dismiss this Evidence Review?",
            isPresented: $showingDismissConfirmation
        ) {
            Button("Dismiss Review", role: .destructive) {
                guard case .loaded(.some(let review)) = state else { return }
                Task { await dismissReview(review: review) }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("The pending review will be discarded without changing canonical history.")
        }
    }

    private func load() async {
        state = .loading
        do {
            let review = try await environment.evidenceReviewAPI.fetchReview(reviewId: reviewId)
            state = .loaded(review)
            if let review, review.status == "committing" {
                actionState = .accepted
            }
        } catch {
            state = .failed("This Evidence Review could not be loaded.")
        }
    }

    @ViewBuilder
    private var content: some View {
        switch state {
        case .loading:
            ProgressView()
                .tint(PhysiqueOSTheme.accent)
                .frame(maxWidth: .infinity, minHeight: 300)
        case .failed(let message):
            Text(message)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                .frame(maxWidth: .infinity, minHeight: 300)
        case .loaded(.none):
            Text("This Evidence Review could not be found.")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                .frame(maxWidth: .infinity, minHeight: 300)
        case .loaded(.some(let review)):
            VStack(alignment: .leading, spacing: 18) {
                header(for: review)
                itemsCard(review)
                if let dexaItem = review.items.first(where: { $0.dexaMeasurements != nil }), actionState == .editingMeasurements {
                    dexaMeasurementCard(review: review, item: dexaItem)
                }
                actionSection(for: review)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func header(for review: EvidenceReviewDetailReadModel) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Evidence Review")
                .physiqueOSFont(PhysiqueOSTypography.screenEyebrow)
                .foregroundStyle(PhysiqueOSTheme.accent)
            Text(Self.statusLabel(review.status))
                .physiqueOSFont(PhysiqueOSTypography.screenTitle)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
            HStack(spacing: 8) {
                if let occurrence = Self.occurrenceDateLabel(for: review) {
                    Text(occurrence)
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                        .accessibilityIdentifier("evidenceReviewDetail.occurrenceDate")
                }
                if let version = review.version {
                    Text("Version \(version)")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// The date the evidence actually occurred, read from the review's own
    /// items — deliberately never `review.createdAt`.
    ///
    /// The header used to hand `createdAt` to `TrainingDateFormatting.short`,
    /// which is a *date-key* formatter: it keeps the first ten characters and
    /// renders them in UTC. `createdAt` is an instant, so a review the Founder
    /// created at 7:11 PM on Sep 12 is `2026-09-13T02:11Z`, and the header read
    /// "Sep 13" for a DEXA scan that the Captured Evidence card on the same
    /// screen correctly listed as Sep 12, 2026. A review's creation instant is
    /// not the evidence's date under any time zone, so it is not shown at all.
    static func occurrenceDateLabel(for review: EvidenceReviewDetailReadModel) -> String? {
        let included = review.items.filter(\.included)
        let sourceItems = included.isEmpty ? review.items : included
        var unique: [String] = []
        for label in sourceItems.compactMap(\.date).map(evidenceDateLabel) where !unique.contains(label) {
            unique.append(label)
        }
        switch unique.count {
        case 0: return nil
        case 1: return unique[0]
        default: return "\(unique.count) dates"
        }
    }

    /// Item dates arrive either as a `"YYYY-MM-DD"` key or already formatted by
    /// the server. Both are calendar dates, never instants — which is what
    /// makes the UTC date-key formatter the right one here.
    static func evidenceDateLabel(_ value: String) -> String {
        value.contains(",") ? value : TrainingDateFormatting.short(value)
    }

    private func itemsCard(_ review: EvidenceReviewDetailReadModel) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 10) {
                TrainingSectionHeaderView(title: "Captured Evidence")
                if let summary = review.summary {
                    Text(summary)
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
                if let excluded = review.excludedSummary {
                    Label(excluded, systemImage: "minus.circle")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
                if review.items.isEmpty {
                    Text("No evidence items are attached to this review.")
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                } else {
                    VStack(spacing: 6) {
                        ForEach(review.items) { item in
                            VStack(alignment: .leading, spacing: 9) {
                            HStack(alignment: .top) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(item.title ?? Self.typeLabel(item.type))
                                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                                    if let source = item.sourceLabel {
                                        Text(source)
                                            .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                                            .foregroundStyle(PhysiqueOSTheme.textMuted)
                                    }
                                }
                                Spacer(minLength: 8)
                                VStack(alignment: .trailing, spacing: 3) {
                                    Label(item.included ? "Included" : "Excluded", systemImage: item.included ? "checkmark.circle.fill" : "minus.circle.fill")
                                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                        .foregroundStyle(item.included ? PhysiqueOSTheme.chartSuccess : PhysiqueOSTheme.textMuted)
                                    if let date = item.date {
                                        Text(Self.evidenceDateLabel(date))
                                            .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                                            .foregroundStyle(PhysiqueOSTheme.textMuted)
                                    }
                                }
                            }
                            if !item.metrics.isEmpty {
                                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                                    ForEach(item.metrics) { metric in
                                        VStack(alignment: .leading, spacing: 3) {
                                            Text(metric.label.uppercased())
                                                .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                                                .foregroundStyle(item.type == "nutrition" ? Self.nutritionMetricColor(metric.label) : PhysiqueOSTheme.accent)
                                            Text(metric.value)
                                                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                                        }
                                        .padding(10)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                        .background(PhysiqueOSTheme.surfaceMuted)
                                        .clipShape(RoundedRectangle(cornerRadius: 12))
                                    }
                                }
                            }
                            ForEach(item.exercises) { exercise in
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(exercise.name)
                                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                                    if let occurrence = exercise.occurrenceLabel { detailText(occurrence) }
                                    if let variant = exercise.variantLabel { detailText(variant) }
                                    if !exercise.sets.isEmpty { detailText(exercise.sets.joined(separator: " · ")) }
                                    if exercise.proposedNewExercise {
                                        Label("New exercise definition", systemImage: "plus.circle.fill")
                                            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                            .foregroundStyle(PhysiqueOSTheme.chartSuccess)
                                    }
                                    if !exercise.supersetWith.isEmpty { detailText("Superset with \(exercise.supersetWith.joined(separator: ", "))") }
                                }
                            }
                            ForEach(item.meals) { meal in
                                VStack(alignment: .leading, spacing: 5) {
                                    Text(meal.name)
                                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                                    if !meal.summary.isEmpty { detailText(meal.summary) }
                                    ForEach(meal.foods) { food in
                                        let details = [food.brand, food.serving, food.calories].compactMap { $0 }.joined(separator: " · ")
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(food.name).physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                            if !details.isEmpty { detailText(details) }
                                        }
                                        .padding(.leading, 8)
                                    }
                                }
                                .padding(.top, 2)
                            }
                            if let reconciliation = item.reconciliation { detailText(reconciliation) }
                            if let typedEvidence = item.typedEvidence, !typedEvidence.isEmpty {
                                VStack(alignment: .leading, spacing: 3) {
                                    Text("SUBMITTED TEXT")
                                        .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                                        .foregroundStyle(PhysiqueOSTheme.accent)
                                    detailText(typedEvidence)
                                }
                            }
                            if let measurements = item.dexaMeasurements, actionState != .editingMeasurements {
                                dexaMeasurementSummary(measurements)
                            }
                            }
                            .padding(.vertical, 8)
                        }
                    }
                }
            }
        }
    }

    private func detailText(_ value: String) -> some View {
        Text(value)
            .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
            .foregroundStyle(PhysiqueOSTheme.textSecondary)
    }

    private func dexaMeasurementSummary(_ measurements: DEXAScanMeasurements) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            if let totalMass = measurements.totalMassLb { Text("Total mass: \(Self.formatNumber(totalMass)) lb") }
            if let bodyFat = measurements.bodyFatPercentage { Text("Body fat: \(Self.formatNumber(bodyFat))%") }
            if let leanMass = measurements.leanMassLb { Text("Lean mass: \(Self.formatNumber(leanMass)) lb") }
            if let fatMass = measurements.fatMassLb { Text("Fat mass: \(Self.formatNumber(fatMass)) lb") }
        }
        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
        .foregroundStyle(PhysiqueOSTheme.textSecondary)
        .padding(.leading, 4)
    }

    @ViewBuilder
    private func actionSection(for review: EvidenceReviewDetailReadModel) -> some View {
        switch actionState {
        case .idle:
            if review.status == "confirmed" {
                completionActions(label: "Confirmed")
            } else if Self.isActionable(review.status) {
                VStack(spacing: 10) {
                    if review.items.contains(where: { $0.dexaMeasurements != nil }) {
                        Button("Correct Measurements") { beginEditingMeasurements(review: review) }
                            .buttonStyle(.bordered)
                            .accessibilityIdentifier("evidenceReview.correctMeasurements")
                    }
                    PrimaryActionButton(title: "Confirm", tone: .accent) {
                        Task { await confirm(review: review) }
                    }.accessibilityIdentifier("evidenceReview.confirm")
                    if ["pending", "commit_failed"].contains(review.status) {
                        Button("Dismiss", role: .destructive) { showingDismissConfirmation = true }
                            .buttonStyle(.bordered)
                            .accessibilityIdentifier("evidenceReview.dismiss")
                    }
                }
            }
        case .editingMeasurements:
            EmptyView() // the measurement card itself carries its own Save action
        case .savingMeasurements:
            CardContainer { VStack(alignment: .leading, spacing: 8) {
                ProgressView().tint(PhysiqueOSTheme.accent)
                Text("Saving corrections…")
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
            }.frame(maxWidth: .infinity, alignment: .leading) }
        case .confirming(let message):
            CardContainer { VStack(alignment: .leading, spacing: 8) {
                ProgressView().tint(PhysiqueOSTheme.accent)
                Text(message)
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
            }.frame(maxWidth: .infinity, alignment: .leading) }
        case .dismissing:
            CardContainer { VStack(alignment: .leading, spacing: 8) {
                ProgressView().tint(PhysiqueOSTheme.accent)
                Text("Dismissing review…")
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
            }.frame(maxWidth: .infinity, alignment: .leading) }
        case .dismissed:
            Label("Dismissed", systemImage: "xmark.circle.fill").foregroundStyle(PhysiqueOSTheme.textSecondary)
        case .accepted:
            completionActions(label: "Confirmation accepted")
        case .confirmed:
            completionActions(label: "Confirmed")
        case .stillProcessing:
            CardContainer { VStack(alignment: .leading, spacing: 6) {
                Text("Still confirming").physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                Text("This is taking longer than usual. Reopen this review in a moment to check its status — confirmation continues on the server regardless of this screen.")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
                Button("Check Now") { Task { await load(); actionState = .idle } }
            }.frame(maxWidth: .infinity, alignment: .leading) }
        case .refreshRequired(let message):
            CardContainer { VStack(alignment: .leading, spacing: 8) {
                Text("Refresh required").physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                Text(message)
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                Button("Refresh Review") { Task { actionState = .idle; await load() } }
            }.frame(maxWidth: .infinity, alignment: .leading) }
        case .failed(let message):
            VStack(alignment: .leading, spacing: 10) {
                Text(message).physiqueOSFont(PhysiqueOSTypography.calloutStrong).foregroundStyle(PhysiqueOSTheme.destructive)
                PrimaryActionButton(title: "Try Again", tone: .accent) { actionState = .idle }
            }
        }
    }

    private func completionActions(label: String) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Label(label, systemImage: "checkmark.circle.fill")
                .foregroundStyle(PhysiqueOSTheme.chartSuccess)
            Text("PhysiqueOS owns this confirmation. Remaining analysis and briefing updates continue in the background.")
                .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
            PrimaryActionButton(title: "Back to Log", tone: .accent) {
                onReturnToLog()
                dismiss()
            }
            .accessibilityIdentifier("evidenceReview.backToLog")
        }
    }

    // MARK: - DEXA correction

    private func beginEditingMeasurements(review: EvidenceReviewDetailReadModel) {
        guard let item = review.items.first(where: { $0.dexaMeasurements != nil }), let measurements = item.dexaMeasurements else { return }
        editedMeasurements = measurements
        measurementTexts = [
            "measuredAt": measurements.measuredAt ?? "",
            "totalMass": measurements.totalMassLb.map(Self.formatNumber) ?? "",
            "bodyFat": measurements.bodyFatPercentage.map(Self.formatNumber) ?? "",
            "fatMass": measurements.fatMassLb.map(Self.formatNumber) ?? "",
            "leanMass": measurements.leanMassLb.map(Self.formatNumber) ?? "",
            "boneMineral": measurements.boneMineralContentLb.map(Self.formatNumber) ?? "",
            "rmr": measurements.restingMetabolicRateKcal.map(Self.formatNumber) ?? "",
            "vatMass": measurements.visceralAdiposeTissueMassLb.map(Self.formatNumber) ?? "",
            "vatVolume": measurements.visceralAdiposeTissueVolumeIn3.map(Self.formatNumber) ?? "",
        ]
        actionState = .editingMeasurements
    }

    private func dexaMeasurementCard(review: EvidenceReviewDetailReadModel, item: EvidenceReviewDetailItem) -> some View {
        CardContainer { VStack(alignment: .leading, spacing: 12) {
            Text("Correct the interpreted scan").physiqueOSFont(PhysiqueOSTypography.cardHeading16)
            Text("Every field is resent together — the server replaces the full measurement set, it does not merge.")
                .physiqueOSFont(PhysiqueOSTypography.caption12Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
            measurementField("Measured date (YYYY-MM-DD)", key: "measuredAt")
            measurementField("Total mass (lb)", key: "totalMass")
            measurementField("Body fat (%)", key: "bodyFat")
            measurementField("Fat mass (lb)", key: "fatMass")
            measurementField("Lean mass (lb)", key: "leanMass")
            measurementField("Bone mineral content (lb)", key: "boneMineral")
            measurementField("Resting metabolic rate (kcal/day)", key: "rmr")
            measurementField("Visceral fat mass (lb)", key: "vatMass")
            measurementField("Visceral fat volume (in³)", key: "vatVolume")
            HStack(spacing: 10) {
                Button("Cancel") { actionState = .idle }.buttonStyle(.bordered)
                PrimaryActionButton(title: "Save Corrections", tone: .accent) {
                    Task { await saveMeasurements(review: review, item: item) }
                }.accessibilityIdentifier("evidenceReview.saveMeasurements")
            }
        } }
    }

    private func measurementField(_ label: String, key: String) -> some View {
        HStack {
            Text(label).physiqueOSFont(PhysiqueOSTypography.caption12Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
            Spacer()
            NumericEditField(text: Binding(get: { measurementTexts[key] ?? "" }, set: { measurementTexts[key] = $0 }), accessibilityLabel: label)
                .frame(width: 110, height: 36)
        }
    }

    private func saveMeasurements(review: EvidenceReviewDetailReadModel, item: EvidenceReviewDetailItem) async {
        guard let version = review.version else { return }
        actionState = .savingMeasurements
        let measurements = DEXAScanMeasurements(
            measuredAt: (measurementTexts["measuredAt"] ?? "").isEmpty ? nil : measurementTexts["measuredAt"],
            totalMassLb: Double(measurementTexts["totalMass"] ?? ""),
            bodyFatPercentage: Double(measurementTexts["bodyFat"] ?? ""),
            fatMassLb: Double(measurementTexts["fatMass"] ?? ""),
            leanMassLb: Double(measurementTexts["leanMass"] ?? ""),
            boneMineralContentLb: Double(measurementTexts["boneMineral"] ?? ""),
            restingMetabolicRateKcal: Double(measurementTexts["rmr"] ?? ""),
            visceralAdiposeTissueMassLb: Double(measurementTexts["vatMass"] ?? ""),
            visceralAdiposeTissueVolumeIn3: Double(measurementTexts["vatVolume"] ?? "")
        )
        do {
            _ = try await environment.dexaWriteAPI.editMeasurements(
                reviewId: reviewId, evidenceObjectId: item.id, expectedVersion: String(version), measurements: measurements
            )
            actionState = .idle
            await load()
        } catch {
            if ProductionEvidenceIntakePipeline.acceptanceIsUncertain(after: error) {
                do {
                    let refreshed = try await environment.evidenceReviewAPI.fetchReview(reviewId: reviewId)
                    if let refreshed, refreshed.version != review.version {
                        state = .loaded(refreshed)
                        actionState = .idle
                    } else {
                        actionState = .refreshRequired("The correction may have been accepted, but its final state could not be verified. Refresh before making another change.")
                    }
                } catch {
                    actionState = .refreshRequired("The correction may have been accepted, but its final state could not be verified. Refresh before making another change.")
                }
            } else {
                actionState = .failed(Self.errorMessage(for: error))
            }
        }
    }

    // MARK: - Confirm

    private func confirm(review: EvidenceReviewDetailReadModel) async {
        guard let version = review.version else { return }
        let domain = Self.domain(for: review)
        let confirmationStartedAt = ContinuousClock.now
        actionState = .confirming("Confirming…")
        do {
            let confirmation = try await environment.evidenceIntakePipeline.commitReview(
                domain: domain, reviewId: reviewId, expectedVersion: String(version)
            )
            if confirmation?.canonicalStateDurable == true {
                // The server has crossed the canonical durability boundary,
                // but Log may still hold a pre-confirm cache. Detach it and
                // prove this review's own date is immediately readable before
                // showing any accepted/success state.
                guard await verifyImmediateCanonicalReadback(review: review, domain: domain) else {
                    actionState = .stillProcessing
                    await invalidateAcceptedProcessingReads()
                    Self.recordConfirmationTiming(from: confirmationStartedAt, outcome: "durable_readback_pending")
                    return
                }
                if confirmation?.state == "confirmed" {
                    Self.recordConfirmationTiming(from: confirmationStartedAt, outcome: "confirmed")
                    actionState = .confirmed
                } else {
                    Self.recordConfirmationTiming(from: confirmationStartedAt, outcome: "canonical_durable_readback")
                    actionState = .accepted
                }
                return
            }
            if confirmation?.state == "confirmed" {
                Self.recordConfirmationTiming(from: confirmationStartedAt, outcome: "confirmed")
                actionState = .confirmed
                return
            }
            // A successful command response represents the durable,
            // version-protected acceptance boundary — the outbox owns the
            // remaining canonical/post-confirm checkpoints regardless of
            // what happens next on this screen. But that finishes in a
            // couple of seconds in the ordinary case, so take one brief,
            // tightly-bounded look before settling for "accepted, continues
            // in the background": if it's already done, show that instead
            // of making the Founder wonder or come back later.
            do {
                try await environment.evidenceIntakePipeline.awaitConfirmation(
                    reviewAPI: environment.evidenceReviewAPI, reviewId: reviewId,
                    pollInterval: Self.fastFollowUpPollInterval, maxPolls: Self.fastFollowUpMaxPolls
                )
                actionState = .confirmed
                Self.recordConfirmationTiming(from: confirmationStartedAt, outcome: "confirmed_readback")
                return
            } catch ProductionEvidenceIntakePipeline.Error.commitFailed {
                actionState = .failed("This review needs another look — the canonical commit failed. Reopen it to try again.")
                return
            } catch {
                // Not resolved within the fast window — keeping this screen
                // blocked any longer would only turn ordinary latency into a
                // false Confirm failure. The outbox still owns finishing it.
            }
            actionState = .accepted
            await invalidateAcceptedProcessingReads()
            Self.recordConfirmationTiming(from: confirmationStartedAt, outcome: "accepted_processing")
            return
        } catch {
            if !ProductionEvidenceIntakePipeline.acceptanceIsUncertain(after: error) {
                actionState = .failed(Self.errorMessage(for: error))
                return
            }
            // The response is ambiguous after dispatch. Poll the canonical
            // review before allowing any retry; the stable idempotency key
            // remains the sole identity for this attempt.
        }
        // The response was lost after dispatch. Perform one read-only status
        // resolution, never a second mutation. Check Now remains available
        // only when that single recovery read is also inconclusive.
        do {
            guard let refreshed = try await environment.evidenceReviewAPI.fetchReview(reviewId: reviewId) else {
                actionState = .stillProcessing
                return
            }
            state = .loaded(refreshed)
            switch refreshed.status {
            case "confirmed": actionState = .confirmed
            case "committing":
                actionState = .accepted
                await invalidateAcceptedProcessingReads()
            case "partially_committed":
                actionState = .failed("This review needs another look — processing stopped after a partial commit. Reopen it to continue safely.")
            case "commit_failed": actionState = .failed("This review needs another look — the canonical commit failed. Reopen it to try again.")
            default: actionState = .stillProcessing
            }
        } catch {
            actionState = .stillProcessing
        }
    }

    @MainActor
    private func invalidateAcceptedProcessingReads() async {
        // The queue projection owns READY_FOR_REVIEW vs ACCEPTED_PROCESSING.
        // Detach the pre-confirm cache immediately so returning to Log cannot
        // continue offering a second Confirm for a server-owned operation.
        await environment.productionNativeAPI.invalidateReadResources(["evidence-review-queue"])
    }

    @MainActor
    private func verifyImmediateCanonicalReadback(
        review: EvidenceReviewDetailReadModel,
        domain: NativeProductWriteDomain
    ) async -> Bool {
        guard let date = review.items.compactMap(\.date).first else { return false }
        switch domain {
        case .activityEvidence:
            await environment.productionNativeAPI.invalidateReadResources([
                "activity", "evidence-review-queue",
            ])
            return (try? await environment.activityAPI.fetchActivityDay(date: date)) != nil
        case .nutrition:
            await environment.productionNativeAPI.invalidateReadResources([
                "nutrition", "evidence-review-queue",
            ])
            guard let landing = try? await environment.nutritionAPI.fetchNutritionLanding(scope: .all) else {
                return false
            }
            return landing.nutritionHistory.contains(where: { $0.date == date })
        case .workoutLogger:
            await environment.productionNativeAPI.invalidateReadResources([
                "training-landing", "training-day", "evidence-review-queue",
            ])
            return true
        case .dexa:
            await environment.productionNativeAPI.invalidateReadResources([
                "dexa", "evidence-review-queue",
            ])
            return true
        default:
            await environment.productionNativeAPI.invalidateReadResources(["evidence-review-queue"])
            return true
        }
    }

    private static func recordConfirmationTiming(from start: ContinuousClock.Instant, outcome: String) {
        let components = start.duration(to: .now).components
        let milliseconds = Int(components.seconds * 1_000 + components.attoseconds / 1_000_000_000_000_000)
        EvidenceLifecycleDiagnostics.recordConfirmation(milliseconds: milliseconds, outcome: outcome)
    }

    private func dismissReview(review: EvidenceReviewDetailReadModel) async {
        guard let version = review.version else { return }
        actionState = .dismissing
        do {
            try await environment.evidenceIntakePipeline.dismissReview(
                domain: Self.domain(for: review), reviewId: reviewId, expectedVersion: String(version)
            )
            actionState = .dismissed
        } catch {
            if ProductionEvidenceIntakePipeline.acceptanceIsUncertain(after: error) {
                do {
                    let refreshed = try await environment.evidenceReviewAPI.fetchReview(reviewId: reviewId)
                    if refreshed == nil || refreshed?.status == "discarded" {
                        actionState = .dismissed
                    } else {
                        if let refreshed { state = .loaded(refreshed) }
                        actionState = .refreshRequired("Dismissal may have been accepted. Refresh this review before trying again.")
                    }
                } catch {
                    actionState = .refreshRequired("Dismissal may have been accepted. Refresh this review before trying again.")
                }
            } else {
                actionState = .failed(Self.errorMessage(for: error))
            }
        }
    }

    private static func isActionable(_ status: String) -> Bool {
        ["pending", "commit_failed", "partially_committed"].contains(status)
    }

    /// A couple of seconds, matching the Founder's expectation that
    /// confirmation "normally" finishes about that fast. Anything slower
    /// falls back to the existing "accepted, continues in the background"
    /// messaging rather than holding this screen open indefinitely.
    private static let fastFollowUpPollInterval: Duration = .seconds(1)
    private static let fastFollowUpMaxPolls = 3

    /// Reuses the exact same Calories/Protein/Carbs/Fat tokens the
    /// established Nutrition presentation (`PhysiqueOSTheme.nutritionCalories`/
    /// `macroProtein`/`macroCarbohydrates`/`macroFat`) already uses, rather
    /// than inventing a second palette — matches the server's own
    /// `EvidenceReviewPresentationService` metric labels exactly.
    private static func nutritionMetricColor(_ label: String) -> Color {
        switch label {
        case "Calories": PhysiqueOSTheme.nutritionCalories
        case "Protein": PhysiqueOSTheme.macroProtein
        case "Carbs": PhysiqueOSTheme.macroCarbohydrates
        case "Fat": PhysiqueOSTheme.macroFat
        default: PhysiqueOSTheme.accent
        }
    }

    private static func domain(for review: EvidenceReviewDetailReadModel) -> NativeProductWriteDomain {
        switch review.items.first?.type {
        case "nutrition": .nutrition
        case "activity_day", "activity": .activityEvidence
        case "training": .workoutLogger
        case "dexa_scan", "dexa", "body_composition": .dexa
        default: .evidenceReview
        }
    }

    private static func formatNumber(_ value: Double) -> String {
        value.rounded() == value ? String(Int(value)) : String(format: "%.1f", value)
    }

    private static func errorMessage(for error: Error) -> String {
        if let productionError = error as? ProductionNativeError {
            let problem: ProductionProblemDetails? = switch productionError {
            case .validation(let value), .failedPrecondition(let value),
                 .preconditionRequired(let value), .conflict(let value): value
            default: nil
            }
            if problem?.code == "NUTRITION_DAILY_TOTALS_CONFLICT" {
                let fields = problem?.fieldErrors.compactMap { field -> String? in
                    guard field.code == "conflicts_with_meal_totals" else { return nil }
                    return field.field.split(separator: ".").last.map {
                        String($0).replacingOccurrences(of: "_", with: " ")
                    }
                } ?? []
                let fieldCopy = fields.isEmpty ? "one or more totals" : fields.joined(separator: ", ")
                return "The meal sum conflicts with the daily total for \(fieldCopy). Dismiss this review, correct the source totals, and upload it again."
            }
            return productionError.errorDescription ?? "This review could not be updated."
        }
        return "This review could not be updated."
    }

    private static func statusLabel(_ status: String) -> String {
        switch status {
        case "pending": "Pending Review"
        case "commit_failed": "Needs Attention"
        case "partially_committed": "Partially Confirmed"
        case "committing": "Confirming"
        case "confirmed": "Confirmed"
        default: "Review unavailable"
        }
    }

    private static func typeLabel(_ type: String) -> String {
        switch type {
        case "training": "Workout"
        case "nutrition": "Nutrition"
        case "activity": "Activity"
        case "weight": "Weight"
        case "dexa", "dexa_scan", "body_composition": "DEXA"
        case "photo_session", "progress_photo": "Progress Photos"
        case "recovery": "Recovery"
        case "labs", "lab_result": "Labs"
        default: "Evidence"
        }
    }
}
