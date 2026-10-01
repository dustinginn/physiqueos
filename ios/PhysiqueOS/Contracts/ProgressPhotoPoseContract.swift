import Foundation

// MARK: - Contract spelling of Native's pose choices

extension ProgressPhotoOrientation {
    /// The Server contract's spelling, or nil while the Founder has not chosen.
    /// Native's generic "Side" is the contract's `side_unspecified`.
    var contractValue: String? {
        switch self {
        case .unconfirmed: nil
        case .side: "side_unspecified"
        default: rawValue
        }
    }

    init?(contractValue: String) {
        if contractValue == "side_unspecified" { self = .side; return }
        guard let value = Self(rawValue: contractValue), value != .unconfirmed else { return nil }
        self = value
    }
}

extension ProgressPhotoContraction {
    var contractValue: String? { self == .unconfirmed ? nil : rawValue }

    init?(contractValue: String) {
        guard let value = Self(rawValue: contractValue), value != .unconfirmed else { return nil }
        self = value
    }
}

extension ProgressPhotoPoseVariant {
    var contractValue: String { rawValue }
}

// MARK: - The compatibility model

/// Orientation, contraction, and pose variant are not independent: only the
/// combinations in the Server's canonical pose contract exist (Double Biceps is
/// a Rear, Flexed pose; there is no Flexed side pose). Every choice Native
/// offers, every adjustment it makes, and the gate on "Confirm pose" derive
/// from that one table, which is generated from
/// `contracts/progress-photo-pose-contract.v1.json` (the Server vocabulary's
/// published form). A photo identity Native lets the Founder confirm is
/// therefore always one the Server will accept and can later confirm; there is
/// no second, hand-maintained rule set to drift.
enum ProgressPhotoPoseContract {
    struct Pose: Equatable, Sendable {
        let id: String
        let label: String
        let orientation: ProgressPhotoOrientation
        let contraction: ProgressPhotoContraction
        let variant: ProgressPhotoPoseVariant
    }

    static let version = ProgressPhotoPoseContractData.version

    static let combinations: [Pose] = ProgressPhotoPoseContractData.combinations.compactMap { item in
        guard let orientation = ProgressPhotoOrientation(contractValue: item.orientation),
              let contraction = ProgressPhotoContraction(contractValue: item.contractionState),
              let variant = ProgressPhotoPoseVariant(rawValue: item.poseVariant) else { return nil }
        return Pose(id: item.id, label: item.label, orientation: orientation, contraction: contraction, variant: variant)
    }

    /// The exact canonical combination, or nil when the combination does not exist.
    static func pose(
        orientation: ProgressPhotoOrientation, contraction: ProgressPhotoContraction, variant: ProgressPhotoPoseVariant
    ) -> Pose? {
        combinations.first { $0.orientation == orientation && $0.contraction == contraction && $0.variant == variant }
    }

    static func isCanonical(
        orientation: ProgressPhotoOrientation, contraction: ProgressPhotoContraction, variant: ProgressPhotoPoseVariant
    ) -> Bool {
        pose(orientation: orientation, contraction: contraction, variant: variant) != nil
    }

    /// Canonical poses consistent with what is chosen so far; nil is "not chosen yet" and matches anything.
    static func matching(
        orientation: ProgressPhotoOrientation?, contraction: ProgressPhotoContraction?, variant: ProgressPhotoPoseVariant?
    ) -> [Pose] {
        combinations.filter {
            (orientation == nil || $0.orientation == orientation) &&
                (contraction == nil || $0.contraction == contraction) &&
                (variant == nil || $0.variant == variant)
        }
    }

    // MARK: Options the Founder can pick

    /// Every orientation the contract knows, after the "choose" placeholder.
    static var selectableOrientations: [ProgressPhotoOrientation] {
        [.unconfirmed] + ProgressPhotoOrientation.allCases.filter { orientation in
            orientation != .unconfirmed && combinations.contains { $0.orientation == orientation }
        }
    }

    /// Contractions that exist for the chosen orientation (all of them until one is chosen).
    static func selectableContractions(for orientation: ProgressPhotoOrientation) -> [ProgressPhotoContraction] {
        let known = orientation == .unconfirmed ? nil : orientation
        let available = Set(matching(orientation: known, contraction: nil, variant: nil).map(\.contraction))
        return [.unconfirmed] + ProgressPhotoContraction.allCases.filter { available.contains($0) }
    }

    /// Pose variants that exist for the chosen orientation. Variants the contract does not contain (Lat Spread, Side Chest, Other) are never offered.
    static func selectableVariants(for orientation: ProgressPhotoOrientation) -> [ProgressPhotoPoseVariant] {
        let known = orientation == .unconfirmed ? nil : orientation
        let available = Set(matching(orientation: known, contraction: nil, variant: nil).map(\.variant))
        return ProgressPhotoPoseVariant.allCases.filter { available.contains($0) }
    }

    // MARK: Keeping a draft canonical

    enum Change: Equatable {
        case orientation(ProgressPhotoOrientation)
        case contraction(ProgressPhotoContraction)
        case variant(ProgressPhotoPoseVariant)
    }

    struct Adjustment: Equatable {
        var draft: ProgressPhotoIdentityDraft
        /// A short, plain explanation shown when a dependent choice moved. Nil when nothing else changed.
        var notice: String?
    }

    /// Applies one change the Founder made and, when it would leave a
    /// contradictory combination, moves the *dependent* choice (never the one
    /// the Founder just chose) to the value the contract requires, saying why:
    ///
    /// - choosing Double Biceps sets Contraction to Flexed ("Double Biceps uses Flexed.");
    /// - choosing Relaxed while Double Biceps is set resets Pose to Standard, since
    ///   the change is only possible by dropping the pose that needs Flexed;
    /// - choosing Flexed on a Rear photo makes the pose Double Biceps;
    /// - choosing an orientation that lacks the current contraction or pose moves them.
    ///
    /// A change the contract cannot satisfy at all (for example Double Biceps on
    /// a Front photo) is refused and explained rather than applied. The result is
    /// never a contradictory combination, and the draft always leaves
    /// confirmation to the Founder (`confirmed` is cleared).
    static func applying(_ change: Change, to draft: ProgressPhotoIdentityDraft) -> Adjustment {
        var next = draft
        switch change {
        case .orientation(let value): next.orientation = value
        case .contraction(let value): next.contraction = value
        case .variant(let value): next.poseVariant = value
        }
        next.confirmed = false

        func known<T: Equatable>(_ value: T, placeholder: T) -> T? { value == placeholder ? nil : value }
        let orientation = known(next.orientation, placeholder: .unconfirmed)
        let contraction = known(next.contraction, placeholder: .unconfirmed)
        let variant = next.poseVariant

        // A non-standard pose determines the rest: Double Biceps is a Rear,
        // Flexed pose, so choosing it sets Flexed (and Rear, when no orientation
        // has been chosen yet) even before the Founder has picked anything else.
        if case .variant(let chosen) = change, chosen != .standard {
            let candidates = matching(orientation: orientation, contraction: nil, variant: chosen)
            let contractions = Set(candidates.map(\.contraction))
            let orientations = Set(candidates.map(\.orientation))
            var setOrientation: ProgressPhotoOrientation?
            var setContraction: ProgressPhotoContraction?
            if orientation == nil, orientations.count == 1, let only = orientations.first { setOrientation = only }
            if contractions.count == 1, let only = contractions.first, contraction != only { setContraction = only }
            if setOrientation != nil || setContraction != nil {
                if let setOrientation { next.orientation = setOrientation }
                if let setContraction { next.contraction = setContraction }
                let notice = setOrientation.map { "\(chosen.label) uses \($0.label) and \(next.contraction.label)." }
                    ?? "\(chosen.label) uses \(next.contraction.label)."
                return Adjustment(draft: next, notice: notice)
            }
        }

        if !matching(orientation: orientation, contraction: contraction, variant: variant).isEmpty {
            return Adjustment(draft: next, notice: nil)
        }

        switch change {
        case .variant(let chosen):
            let candidates = matching(orientation: orientation, contraction: nil, variant: chosen)
            guard !candidates.isEmpty else {
                return refused(draft, "\(chosen.label) isn't available for \(orientationPhrase(draft.orientation)).")
            }
            let contractions = Set(candidates.map(\.contraction))
            if contractions.count == 1, let only = contractions.first {
                next.contraction = only
            }
            let orientations = Set(candidates.map(\.orientation))
            if orientation == nil, orientations.count == 1, let only = orientations.first {
                next.orientation = only
                return Adjustment(draft: next, notice: "\(chosen.label) uses \(only.label) and \(next.contraction.label).")
            }
            return Adjustment(draft: next, notice: "\(chosen.label) uses \(next.contraction.label).")

        case .contraction(let chosen):
            let candidates = matching(orientation: orientation, contraction: chosen, variant: nil)
            let variants = Set(candidates.map(\.variant))
            guard variants.count == 1, let only = variants.first else {
                return refused(draft, "\(orientationPhrase(draft.orientation).capitalizedFirst) use \(availableContractionsPhrase(for: draft.orientation)).")
            }
            let previous = draft.poseVariant
            next.poseVariant = only
            if only == .standard {
                let required = matching(orientation: orientation, contraction: nil, variant: previous).first?.contraction
                let because = required.map { "\(previous.label) uses \($0.label), so " } ?? ""
                return Adjustment(draft: next, notice: "\(because)Pose was reset to \(only.label).")
            }
            return Adjustment(draft: next, notice: "\(orientation?.label ?? "This") \(chosen.label) uses \(only.label).")

        case .orientation(let chosen):
            let bycontraction = matching(orientation: chosen, contraction: contraction, variant: nil)
            let variants = Set(bycontraction.map(\.variant))
            if variants.count == 1, let only = variants.first {
                let previous = draft.poseVariant
                next.poseVariant = only
                let because = previous == only ? "" : "\(previous.label) is a \(draft.orientation.label) pose, so "
                return Adjustment(draft: next, notice: "\(because)Pose was reset to \(only.label).")
            }
            let byvariant = matching(orientation: chosen, contraction: nil, variant: variant)
            let contractions = Set(byvariant.map(\.contraction))
            if contractions.count == 1, let only = contractions.first {
                next.contraction = only
                return Adjustment(draft: next, notice: "\(orientationPhrase(chosen).capitalizedFirst) use \(only.label).")
            }
            guard let fallback = matching(orientation: chosen, contraction: nil, variant: nil).first else {
                return refused(draft, "That orientation isn't available.")
            }
            next.contraction = fallback.contraction
            next.poseVariant = fallback.variant
            return Adjustment(draft: next, notice: "\(orientationPhrase(chosen).capitalizedFirst) use \(fallback.contraction.label).")
        }
    }

    private static func refused(_ draft: ProgressPhotoIdentityDraft, _ notice: String) -> Adjustment {
        var unchanged = draft
        unchanged.confirmed = false
        return Adjustment(draft: unchanged, notice: notice)
    }

    private static func orientationPhrase(_ orientation: ProgressPhotoOrientation) -> String {
        orientation == .unconfirmed ? "this photo" : "\(orientation.label) photos"
    }

    private static func availableContractionsPhrase(for orientation: ProgressPhotoOrientation) -> String {
        let available = selectableContractions(for: orientation).filter { $0 != .unconfirmed }.map(\.label)
        return available.isEmpty ? "a supported contraction" : available.joined(separator: " or ")
    }
}

private extension String {
    var capitalizedFirst: String { prefix(1).uppercased() + dropFirst() }
}

// MARK: - The draft

extension ProgressPhotoIdentityDraft {
    /// The canonical Server pose this draft names, or nil while it is incomplete or contradictory.
    var canonicalPose: ProgressPhotoPoseContract.Pose? {
        guard orientation != .unconfirmed, contraction != .unconfirmed else { return nil }
        return ProgressPhotoPoseContract.pose(orientation: orientation, contraction: contraction, variant: poseVariant)
    }

    /// True only for a combination the Server accepts and can later confirm. "Confirm pose" and submission both require it.
    var isCanonicalPose: Bool { canonicalPose != nil }
}

/// The one way a photo identity can fail to serialize: it is not a pose the Server can confirm.
/// The controls make this unreachable; it exists so a non-canonical identity can never be sent.
enum ProgressPhotoIdentityError: Error, Equatable, LocalizedError {
    case nonCanonicalPose(photo: Int)

    var errorDescription: String? {
        switch self {
        case .nonCanonicalPose(let photo): "Photo \(photo)'s pose isn't a supported combination. Choose one of the supported poses."
        }
    }
}
