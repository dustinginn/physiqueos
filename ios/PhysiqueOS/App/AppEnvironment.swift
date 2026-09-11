import Foundation

enum NativeAPIEnvironment: String, CaseIterable, Identifiable, Sendable, Hashable {
    case sandbox
    case founderProduction

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .sandbox: "Sandbox"
        case .founderProduction: "Founder Production"
        }
    }

    var baseURL: URL {
        switch self {
        case .sandbox:
            URL(string: "https://physiqueos-foundation-staging-a9or4.ondigitalocean.app")!
        case .founderProduction:
            URL(string: "https://physiqueos.dustinginn.com")!
        }
    }

    var routeFamily: String {
        switch self {
        case .sandbox: "/api/v1/native/sandbox"
        case .founderProduction: "/api/v1/native"
        }
    }

    var expectedAuthority: String {
        switch self {
        case .sandbox: "founder-sandbox"
        case .founderProduction: "founder-production"
        }
    }

    var credentialNamespace: FounderCredentialNamespace {
        switch self {
        case .sandbox: .sandbox
        case .founderProduction: .founderProduction
        }
    }

    /// Superseded by `NativeProductWriteGuard`'s per-domain enablement (Daily
    /// Driver Write Build) — Sandbox always permits every domain; Founder
    /// Production permits only `NativeProductWriteDomain.enabledUnderFounderProduction`.
    /// Kept only as the Sandbox-side shortcut `authorize` still uses.
    var permitsProductWrites: Bool { self == .sandbox }
}

/// `.activityEvidence` covers only the existing screenshot/manual evidence
/// workflow (`CREATE_EVIDENCE_INTAKE`/confirm) — HealthKit sync is a
/// separate, not-yet-implemented capability with no Swift representation
/// today and will get its own domain case when that work begins; it must
/// never be folded into this one. `.dexa` and `.progressPhotos` were split
/// out of a single prior `dexaAndPhotos` case (never referenced by any real
/// call site) so DEXA's screenshot/PDF evidence workflow can be enabled
/// independently of Progress Photo writes, which remain out of scope this
/// pass — there is no Photo capture/upload UI in Native yet, so this split
/// is precautionary against a future Photos write feature silently
/// inheriting DEXA's enablement.
enum NativeProductWriteDomain: String, CaseIterable, Sendable, Hashable {
    case morningCheckInAndWeight
    case priorityCompletion
    case workoutLogger
    case nutrition
    case activityEvidence
    case evidenceReview
    case goalAndPhaseTransitions
    case operatingPlan
    case dexa
    case progressPhotos

    /// The bounded set of domains accepted for the Daily Driver Write
    /// Build. Every other domain (HealthKit sync has no case yet; Evidence
    /// Review's generic accept/reject queue; Goal/Phase transitions;
    /// Operating Plan edits; Progress Photo writes) remains denied under
    /// Founder Production regardless of authority — this is a scope
    /// decision from the task spec, not a placeholder for "not implemented
    /// yet." Nutrition/Activity/DEXA's own screenshot-evidence confirm
    /// commands are gated by their own domain case (`.nutrition`,
    /// `.activityEvidence`, `.dexa`), not by `.evidenceReview` — that case
    /// stays reserved for a future general Evidence Review accept/reject
    /// UI, which this build does not add.
    ///
    /// EVERY domain in this task's requested scope was found blocked by a
    /// genuine, confirmed server-side gap during the Daily Driver Write
    /// Build investigation — none are enabled. Per this task's own "STOP
    /// on that domain and report the smallest server correction required"
    /// rule, this is left empty rather than shipping any write path known
    /// to silently fail, corrupt read/write identity, or bypass the real
    /// canonical-commit pipeline. See the task's final report for the
    /// full per-domain findings and the specific server fix each needs:
    /// - `.morningCheckInAndWeight`: `submitWeight` writes a different
    ///   weight-entry id scheme than the web's own weigh-in, with no
    ///   correction path.
    /// - `.priorityCompletion`: `completePriority` writes to the wrong
    ///   canonical collection (`executionItems` instead of `reminders`,
    ///   which is all the read side ever consults) — 500s or silently
    ///   no-ops, never shows as completed.
    /// - `.workoutLogger`: `createTrainingSession`/`correctTrainingSession`/
    ///   `completeTrainingLogger` write to `trainingPerformanceEvents`, a
    ///   collection completely disconnected from every Training read view.
    /// - `.nutrition` / `.activityEvidence`: the screenshot/manual evidence
    ///   intake pipeline (`CREATE_EVIDENCE_INTAKE` → interpretation →
    ///   confirm) is a disconnected stub with no media upload endpoint and
    ///   no interpretation trigger; `CONFIRM_NUTRITION`/`CONFIRM_PHOTO`/
    ///   `CONFIRM_DEXA`/`CONFIRM_EVIDENCE_REVIEW` are all the same one-line
    ///   status-flip stub that never performs the real canonical commit.
    ///   The direct `UPSERT_NUTRITION_DAY`/`SYNC_ACTIVITY_DAY` commands ARE
    ///   real for a first-time day, but corrections 500 (a required
    ///   `expectedSemanticFingerprint` isn't exposed on any read model),
    ///   and neither matches the task's required "existing Native logging
    ///   workflow."
    /// - `.dexa`: no direct-write command exists at all; `CONFIRM_DEXA` is
    ///   the same inert stub — not ready for tomorrow's scan.
    static let enabledUnderFounderProduction: Set<NativeProductWriteDomain> = []
}

enum NativeWriteGuardError: Error, Equatable {
    case productionReadOnly(NativeProductWriteDomain)
}

enum NativeProductWriteGuard {
    static func authorize(_ domain: NativeProductWriteDomain, in environment: NativeAPIEnvironment) throws {
        switch environment {
        case .sandbox:
            return
        case .founderProduction:
            guard NativeProductWriteDomain.enabledUnderFounderProduction.contains(domain) else {
                throw NativeWriteGuardError.productionReadOnly(domain)
            }
        }
    }
}

protocol NativeAuthoritySelectionStore: AnyObject {
    func load() -> NativeAPIEnvironment?
    func save(_ environment: NativeAPIEnvironment)
}

final class UserDefaultsNativeAuthoritySelectionStore: NativeAuthoritySelectionStore {
    private let defaults: UserDefaults
    private let key: String

    init(defaults: UserDefaults = .standard, key: String = "physiqueos.native.authority-selection.v1") {
        self.defaults = defaults
        self.key = key
    }

    func load() -> NativeAPIEnvironment? {
        defaults.string(forKey: key).flatMap(NativeAPIEnvironment.init(rawValue:))
    }

    func save(_ environment: NativeAPIEnvironment) {
        defaults.set(environment.rawValue, forKey: key)
    }
}

/// The app's composition root.
///
/// Screens depend on this type by injection rather than reaching for
/// globals. Product screens remain fixture-backed while the isolated
/// Founder server proof uses its own live, authenticated sandbox client;
/// neither authority is silently substituted for the other.
@Observable
final class AppEnvironment {
    private(set) var nativeAuthority: NativeAPIEnvironment
    private let authoritySelectionStore: NativeAuthoritySelectionStore
    private let sandboxHomeAPI: HomeAPI
    private let sandboxGoalsAPI: GoalsAPI
    private let sandboxLogAPI: LogAPI
    private let sandboxEvidenceAPI: EvidenceAPI
    private let sandboxTrainingAPI: TrainingAPI
    private let sandboxActivityAPI: ActivityAPI
    private let sandboxNutritionAPI: NutritionAPI
    /// Fixture/read-model-backed Weight Evidence product surface — never
    /// mixed with `founderServerAPI`'s isolated live Sandbox Weight write
    /// proof (see `WeightEvidenceAPI.swift`'s doc comment).
    private let sandboxWeightEvidenceAPI: WeightEvidenceAPI
    private let productionWeightEvidenceAPI: ProductionWeightEvidenceAPI
    private let sandboxDEXAAPI: DEXAAPI
    private let sandboxPhotosAPI: PhotosAPI
    private let sandboxEnergyAPI: EnergyAPI
    /// The read seam for the canonical Operating Plan execution-item
    /// catalog. `loggingSandboxStore` loads the same catalog synchronously
    /// at init (`PriorityCatalogLoader`, mirroring
    /// `TrainingExerciseCatalogLoader`'s own established rationale) since
    /// Home/Priority Detail/Morning Check-In need it before any `await`
    /// can run — this property exists so a future live implementation has
    /// the same seam every other vertical already does, not because
    /// today's fixture-only screens call it directly.
    private let sandboxPriorityAPI: PriorityAPI
    private let sandboxTrainingLoggerAPI: TrainingLoggerAPI
    let trainingLoggerDraftStore: TrainingLoggerDraftStore
    let loggingSandboxStore: LoggingSandboxStore
    let operatingPlanStore: OperatingPlanSandboxStore
    let goalsSandboxStore: GoalsSandboxStore
    /// The single fixture provider for the recurring-Briefing vertical —
    /// Home's latest-Briefing projection, Briefing History, and Briefing
    /// Detail all read through this one store (see
    /// `BriefingSandboxStore.swift`'s doc comment).
    let briefingSandboxStore: BriefingSandboxStore
    /// Deliberately isolated live transport proof. Existing product screens
    /// remain fixture-backed and cannot silently mix this sandbox read.
    let founderServerAPI: FounderServerAPI
    let productionNativeAPI: ProductionNativeAPI
    let founderPhotoMediaStore: FounderPhotoMediaStore
    let founderProductionPhotoMediaStore: FounderProductionPhotoMediaStore

    var weightEvidenceAPI: WeightEvidenceAPI {
        switch nativeAuthority {
        case .sandbox: sandboxWeightEvidenceAPI
        case .founderProduction: productionWeightEvidenceAPI
        }
    }

    var homeAPI: HomeAPI {
        nativeAuthority == .founderProduction ? ProductionHomeAPI(api: productionNativeAPI) : sandboxHomeAPI
    }

    var goalsAPI: GoalsAPI {
        nativeAuthority == .founderProduction ? ProductionGoalsAPI(api: productionNativeAPI) : sandboxGoalsAPI
    }

    /// The Evidence Hub's summary projection — composed from the same
    /// production reads each individual Evidence surface already uses
    /// (see `ProductionEvidenceAPI`'s doc comment) rather than a single
    /// fixture-only constant that never switched with authority.
    var evidenceAPI: EvidenceAPI {
        nativeAuthority == .founderProduction ? ProductionEvidenceAPI(api: productionNativeAPI) : sandboxEvidenceAPI
    }

    /// Log → Logged Today / pending Evidence Review queue — see
    /// `ProductionLogAPI`'s doc comment for why this was still showing
    /// fixture Training/Nutrition/Activity summaries under Founder
    /// Production.
    var logAPI: LogAPI {
        nativeAuthority == .founderProduction ? ProductionLogAPI(api: productionNativeAPI) : sandboxLogAPI
    }

    var trainingAPI: TrainingAPI {
        nativeAuthority == .founderProduction ? ProductionTrainingAPI(api: productionNativeAPI) : sandboxTrainingAPI
    }

    var activityAPI: ActivityAPI {
        nativeAuthority == .founderProduction ? ProductionActivityAPI(api: productionNativeAPI) : sandboxActivityAPI
    }

    var nutritionAPI: NutritionAPI {
        nativeAuthority == .founderProduction ? ProductionNutritionAPI(api: productionNativeAPI) : sandboxNutritionAPI
    }

    var energyAPI: EnergyAPI {
        nativeAuthority == .founderProduction ? ProductionEnergyAPI(api: productionNativeAPI) : sandboxEnergyAPI
    }

    var priorityAPI: PriorityAPI {
        nativeAuthority == .founderProduction ? ProductionPriorityAPI(api: productionNativeAPI) : sandboxPriorityAPI
    }

    var trainingLoggerAPI: TrainingLoggerAPI {
        nativeAuthority == .founderProduction ? ProductionTrainingLoggerAPI(api: productionNativeAPI) : sandboxTrainingLoggerAPI
    }

    var operatingPlanAPI: OperatingPlanAPI? {
        nativeAuthority == .founderProduction ? ProductionOperatingPlanAPI(api: productionNativeAPI) : nil
    }

    var dexaAPI: DEXAAPI {
        nativeAuthority == .founderProduction ? ProductionDEXAAPI(api: productionNativeAPI) : sandboxDEXAAPI
    }

    /// Progress Photos' prior server-side gap (`poseId`/`comparisonStatus`
    /// stripped before the wire) is closed as of the Patch 3 continuation
    /// contract (`getNativePhotosTimeline`) — see `ProductionPhotosAPI`'s
    /// doc comment. A still-earlier revision left this a stored,
    /// never-authority-aware constant, so tapping into Photos under
    /// Founder Production silently rendered the bundled Sandbox fixture as
    /// if it were live — the same fixture-leak defect class already fixed
    /// for Evidence Hub/Log/Goal chronology.
    var photosAPI: PhotosAPI {
        nativeAuthority == .founderProduction ? ProductionPhotosAPI(api: productionNativeAPI) : sandboxPhotosAPI
    }

    /// Timeline is a genuinely new Founder Production feature (Patch 3
    /// continuation) with no Sandbox precedent to mirror — Sandbox shows
    /// an honest "not available" state.
    var timelineAPI: TimelineAPI {
        nativeAuthority == .founderProduction ? ProductionTimelineAPI(api: productionNativeAPI) : NotAvailableTimelineAPI()
    }

    /// Evidence Review detail is only ever reached via the `.evidenceReview`
    /// destination, which only Founder Production's `ProductionLogAPI`
    /// constructs — Sandbox's pending reviews always route through
    /// `.localEvidenceReview` to `LocalEvidenceReviewView` instead, so the
    /// Sandbox arm here should never actually be hit in practice.
    var evidenceReviewAPI: EvidenceReviewAPI {
        nativeAuthority == .founderProduction ? ProductionEvidenceReviewAPI(api: productionNativeAPI) : NotAvailableEvidenceReviewAPI()
    }

    /// Briefing History/Detail previously read `briefingSandboxStore`
    /// directly with no authority switch at all — a fixture-leak-class gap
    /// matching what Photos/Weight/Timeline had before this pass.
    var briefingAPI: BriefingAPI {
        nativeAuthority == .founderProduction ? ProductionBriefingAPI(api: productionNativeAPI) : FixtureBriefingAPI(store: briefingSandboxStore)
    }

    init(
        nativeAuthority: NativeAPIEnvironment? = nil,
        authoritySelectionStore: NativeAuthoritySelectionStore = UserDefaultsNativeAuthoritySelectionStore(),
        homeAPI: HomeAPI = FixtureHomeAPI(),
        goalsAPI: GoalsAPI = FixtureGoalsAPI(),
        logAPI: LogAPI = FixtureLogAPI(),
        evidenceAPI: EvidenceAPI = FixtureEvidenceAPI(),
        trainingAPI: TrainingAPI = FixtureTrainingAPI(),
        activityAPI: ActivityAPI = FixtureActivityAPI(),
        nutritionAPI: NutritionAPI = FixtureNutritionAPI(),
        weightEvidenceAPI: WeightEvidenceAPI = FixtureWeightEvidenceAPI(),
        dexaAPI: DEXAAPI = FixtureDEXAAPI(),
        photosAPI: PhotosAPI = FixturePhotosAPI(),
        energyAPI: EnergyAPI = FixtureEnergyAPI(),
        priorityAPI: PriorityAPI = FixturePriorityAPI(),
        trainingLoggerAPI: TrainingLoggerAPI = FixtureTrainingLoggerAPI(),
        trainingLoggerDraftStore: TrainingLoggerDraftStore = UserDefaultsTrainingLoggerDraftStore(),
        loggingSandboxStore: LoggingSandboxStore = LoggingSandboxStore(),
        operatingPlanStore: OperatingPlanSandboxStore = OperatingPlanSandboxStore(),
        goalsSandboxStore: GoalsSandboxStore = GoalsSandboxStore(),
        briefingSandboxStore: BriefingSandboxStore = BriefingSandboxStore(),
        founderServerAPI: FounderServerAPI = FounderServerAPI(),
        productionNativeAPI: ProductionNativeAPI = ProductionNativeAPI(),
        founderPhotoMediaStore: FounderPhotoMediaStore? = nil
    ) {
        self.authoritySelectionStore = authoritySelectionStore
        self.nativeAuthority = nativeAuthority ?? authoritySelectionStore.load() ?? .sandbox
        self.sandboxHomeAPI = homeAPI
        self.sandboxGoalsAPI = goalsAPI
        self.sandboxLogAPI = logAPI
        self.sandboxEvidenceAPI = evidenceAPI
        self.sandboxTrainingAPI = trainingAPI
        self.sandboxActivityAPI = activityAPI
        self.sandboxNutritionAPI = nutritionAPI
        self.sandboxWeightEvidenceAPI = weightEvidenceAPI
        self.productionWeightEvidenceAPI = ProductionWeightEvidenceAPI(api: productionNativeAPI)
        self.sandboxDEXAAPI = dexaAPI
        self.sandboxPhotosAPI = photosAPI
        self.sandboxEnergyAPI = energyAPI
        self.sandboxPriorityAPI = priorityAPI
        self.sandboxTrainingLoggerAPI = trainingLoggerAPI
        self.trainingLoggerDraftStore = trainingLoggerDraftStore
        self.loggingSandboxStore = loggingSandboxStore
        self.operatingPlanStore = operatingPlanStore
        self.goalsSandboxStore = goalsSandboxStore
        self.briefingSandboxStore = briefingSandboxStore
        self.founderServerAPI = founderServerAPI
        self.productionNativeAPI = productionNativeAPI
        self.founderPhotoMediaStore = founderPhotoMediaStore ?? FounderPhotoMediaStore(api: founderServerAPI)
        self.founderProductionPhotoMediaStore = FounderProductionPhotoMediaStore(api: productionNativeAPI)
    }

    func selectNativeAuthority(_ authority: NativeAPIEnvironment) {
        nativeAuthority = authority
        authoritySelectionStore.save(authority)
    }

    /// The one place a `PhotoViewRecord` becomes a renderable
    /// `PhotoMediaSource` — Production records carry their own opaque
    /// `mediaId` directly (no separate manifest lookup needed), while
    /// Sandbox records resolve through the isolated photo-acceptance
    /// bridge's view-identity manifest. Never mixed: a Production record
    /// never has a Sandbox `viewIdentity` entry, and vice versa.
    @MainActor
    func photoMediaSource(for view: PhotoViewRecord) -> PhotoMediaSource {
        if let mediaId = view.mediaId { return .authenticatedProduction(mediaId: mediaId) }
        return founderPhotoMediaStore.source(viewIdentity: view.id)
    }
}
