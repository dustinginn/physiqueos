import Foundation
import UserNotifications

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
/// independently of Progress Photo writes. Build 42 enables the bounded
/// Progress Photos intake/review path through the same Server-owned
/// PhotoSession lifecycle as Web; it does not authorize any other Photos
/// mutation or move photo analysis into Native.
enum NativeProductWriteDomain: String, CaseIterable, Sendable, Hashable {
    case morningCheckInAndWeight
    case priorityCompletion
    case workoutLogger
    case nutrition
    case activityEvidence
    case evidenceReview
    // Disposition only; does not authorize generic confirmation or photo writes.
    case evidenceReviewDismissal
    case goalAndPhaseTransitions
    case operatingPlan
    case dexa
    case progressPhotos

    /// The bounded set of domains accepted for the Daily Driver Write
    /// Build. Every other domain (HealthKit sync has no case yet; Evidence
    /// Review's generic accept/reject queue; Goal/Phase transitions;
    /// Progress Photo writes) remains denied under Founder Production
    /// regardless of authority — this is a scope decision from the task
    /// spec, not a placeholder for "not implemented yet." Nutrition/
    /// Activity/DEXA's own screenshot-evidence confirm commands are gated
    /// by their own domain case (`.nutrition`, `.activityEvidence`,
    /// `.dexa`), not by `.evidenceReview` — that case stays reserved for a
    /// future general Evidence Review accept/reject UI, which this build
    /// does not add.
    ///
    /// A prior pass (server authority `67267032`'s predecessor) found
    /// EVERY domain blocked by a genuine server-side gap and shipped none
    /// of them. Server commit `67267032` ("Add canonical Native production
    /// writes") fixed the original write architecture; the bounded
    /// allowlist, correct canonical collections, the same persistence
    /// services the web app uses, and a working async evidence-intake
    /// pipeline. `.priorityCompletion` is enabled only because the
    /// canonical Home/Priority projections now expose the Reminder version
    /// required by `priority.complete.v1`'s If-Match contract.
    ///
    /// `.operatingPlan` was enabled in Build 33 for the "recurring support"
    /// shape specifically (Recovery's Foam Rolling, Tracking's Morning
    /// Weigh-In — both route through the same server-owned
    /// `operating-plan.recurring-support.save.v1` command Web's own
    /// `saveFoamRollingSupport`/`saveMorningWeighInSupport` actions already
    /// call). Build 33 now exposes canonical, domain-specific writes for
    /// Nutrition, Training, Peptides, Supplements, and the atomic Coaching
    /// Updates composite. Energy remains canonical and read-only. The flag
    /// does not authorize fixture-backed or unrelated writes; production
    /// screens use their typed APIs and fail closed.
    static let enabledUnderFounderProduction: Set<NativeProductWriteDomain> = [
        .morningCheckInAndWeight,
        .priorityCompletion,
        .workoutLogger,
        .nutrition,
        .activityEvidence,
        .evidenceReviewDismissal,
        .operatingPlan,
        .dexa,
        .progressPhotos,
    ]
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
    /// Retains exact notification destinations until the root navigation
    /// scene is ready. The coordinator owns main-thread delivery and
    /// request-id idempotency for cold launch, resume, and already-running
    /// notification responses.
    let notificationDeepLinkCoordinator = NotificationDeepLinkCoordinator()
    /// The Evidence Review id currently on screen, if any — set/cleared by
    /// `EvidenceReviewDetailView` itself. `EvidenceReviewReadyNotifier`
    /// checks this before posting a fallback "ready to review" notification
    /// so a review that becomes ready while the Founder is already looking
    /// at it never produces a redundant notification.
    var currentlyViewingReviewId: String?
    /// Set after every `PriorityNotificationScheduler.sync` call — lets
    /// Home show a visible notice when the Founder denied notification
    /// permission, rather than silently scheduling nothing while priorities
    /// still display as if reminders were active. `.notDetermined` means
    /// sync hasn't run yet this launch (nothing to report either way).
    var notificationAuthorizationStatus: UNAuthorizationStatus = .notDetermined
    /// Advances only after a post-action canonical Home read succeeds.
    /// Home observes this generation so a completion performed from an iOS
    /// notification updates the visible row after durable acknowledgement.
    var canonicalPriorityRefreshGeneration = 0
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
    private let sandboxTrainingLoggerDraftStore: TrainingLoggerDraftStore
    private let founderProductionTrainingLoggerDraftStore: TrainingLoggerDraftStore
    let trainingLoggerAttachmentStore: TrainingLoggerAttachmentStore
    private let trainingEvidenceBindingStore: TrainingEvidenceBindingStore

    var trainingLoggerDraftStore: TrainingLoggerDraftStore {
        nativeAuthority == .founderProduction ? founderProductionTrainingLoggerDraftStore : sandboxTrainingLoggerDraftStore
    }
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
    /// Shared across every Production write domain — see
    /// `ProductionIdempotencyKeyStore`'s doc comment.
    let productionIdempotencyKeyStore: ProductionIdempotencyKeyStore
    /// N0 capability shell. The default gate enables no operation, and the
    /// app lifecycle never invokes the coordinator automatically.
    let healthKitFeatureGate: HealthKitFeatureGate
    let healthKitAuthorizationCoordinator: HealthKitAuthorizationCoordinator
    let healthKitSynchronizationEngine: HealthKitSynchronizationEngine
    /// Temporary Founder-only foreground canary. Its capability shell can
    /// query and upload only after the coordinator's runtime switch is
    /// explicitly enabled; background delivery and HealthKit writes are not
    /// present in this gate.
    let healthKitFounderCanaryCoordinator: HealthKitFounderCanaryCoordinator

    var weightEvidenceAPI: WeightEvidenceAPI {
        switch nativeAuthority {
        case .sandbox: sandboxWeightEvidenceAPI
        case .founderProduction: productionWeightEvidenceAPI
        }
    }

    /// `.morningCheckInAndWeight` is enabled — see
    /// `NativeProductWriteDomain.enabledUnderFounderProduction`. Sandbox
    /// never calls this seam (Weight/Morning Check-In views write straight
    /// into `loggingSandboxStore` under Sandbox, matching every other
    /// domain's established pattern) — `NotAvailableWeightWriteAPI` exists
    /// only so the property is total.
    var weightWriteAPI: WeightWriteAPI {
        switch nativeAuthority {
        case .sandbox: NotAvailableWeightWriteAPI()
        case .founderProduction: ProductionWeightWriteAPI(api: productionNativeAPI, idempotencyStore: productionIdempotencyKeyStore)
        }
    }

    /// `.operatingPlan` is enabled for the recurring-support shape and the
    /// Nutrition strategy — see
    /// `NativeProductWriteDomain.enabledUnderFounderProduction`.
    /// Sandbox never calls this seam (Recovery/Tracking screens read/write
    /// `operatingPlanStore` directly under Sandbox) —
    /// `NotAvailableRecurringSupportAPI` exists only so the property is
    /// total.
    var recurringSupportAPI: RecurringSupportAPI {
        switch nativeAuthority {
        case .sandbox: NotAvailableRecurringSupportAPI()
        case .founderProduction: ProductionRecurringSupportAPI(api: productionNativeAPI, idempotencyStore: productionIdempotencyKeyStore)
        }
    }

    /// `.operatingPlan` is enabled for Nutrition — see
    /// `NativeProductWriteDomain.enabledUnderFounderProduction`. Sandbox
    /// never calls this seam (the Nutrition strategy detail/editor reads
    /// and writes `operatingPlanStore` directly under Sandbox) —
    /// `NotAvailableNutritionStrategyAPI` exists only so the property is
    /// total.
    var nutritionStrategyAPI: NutritionStrategyAPI {
        switch nativeAuthority {
        case .sandbox: NotAvailableNutritionStrategyAPI()
        case .founderProduction: ProductionNutritionStrategyAPI(api: productionNativeAPI, idempotencyStore: productionIdempotencyKeyStore)
        }
    }

    /// `.operatingPlan` is enabled for Training — see
    /// `NativeProductWriteDomain.enabledUnderFounderProduction`. Sandbox
    /// never calls this seam (the Training strategy detail/editor reads
    /// and writes `operatingPlanStore` directly under Sandbox) —
    /// `NotAvailableTrainingStrategyAPI` exists only so the property is
    /// total.
    var trainingStrategyAPI: TrainingStrategyAPI {
        switch nativeAuthority {
        case .sandbox: NotAvailableTrainingStrategyAPI()
        case .founderProduction: ProductionTrainingStrategyAPI(api: productionNativeAPI, idempotencyStore: productionIdempotencyKeyStore)
        }
    }

    /// Peptide Support preserves its own executionRevision concurrency and
    /// specialized server-owned reminder/dosing semantics. Sandbox continues
    /// to use OperatingPlanSandboxStore; production never falls back to it.
    var peptideSupportAPI: PeptideSupportAPI {
        switch nativeAuthority {
        case .sandbox: NotAvailablePeptideSupportAPI()
        case .founderProduction: ProductionPeptideSupportAPI(api: productionNativeAPI, idempotencyStore: productionIdempotencyKeyStore)
        }
    }

    var operatingPlanProtocolDomainAPI: OperatingPlanProtocolDomainAPI {
        switch nativeAuthority {
        case .sandbox: NotAvailableOperatingPlanProtocolDomainAPI()
        case .founderProduction: ProductionOperatingPlanProtocolDomainAPI(api: productionNativeAPI)
        }
    }

    var supplementSupportAPI: SupplementSupportAPI {
        switch nativeAuthority {
        case .sandbox: NotAvailableSupplementSupportAPI()
        case .founderProduction: ProductionSupplementSupportAPI(
            api: productionNativeAPI,
            idempotencyStore: productionIdempotencyKeyStore
        )
        }
    }

    var supplementStrategyAPI: SupplementStrategyAPI {
        switch nativeAuthority {
        case .sandbox: NotAvailableSupplementStrategyAPI()
        case .founderProduction: ProductionSupplementStrategyAPI(
            api: productionNativeAPI,
            idempotencyStore: productionIdempotencyKeyStore
        )
        }
    }

    var energyStrategyAPI: EnergyStrategyAPI {
        switch nativeAuthority {
        case .sandbox: NotAvailableEnergyStrategyAPI()
        case .founderProduction: ProductionEnergyStrategyAPI(api: productionNativeAPI)
        }
    }

    var coachingUpdatesAPI: CoachingUpdatesAPI {
        switch nativeAuthority {
        case .sandbox: NotAvailableCoachingUpdatesAPI()
        case .founderProduction: ProductionCoachingUpdatesAPI(
            api: productionNativeAPI, idempotencyStore: productionIdempotencyKeyStore
        )
        }
    }

    var morningCheckInAPI: MorningCheckInAPI {
        switch nativeAuthority {
        case .sandbox: NotAvailableMorningCheckInAPI()
        case .founderProduction: ProductionMorningCheckInAPI(api: productionNativeAPI)
        }
    }

    var dexaWriteAPI: DEXAWriteAPI {
        switch nativeAuthority {
        case .sandbox: NotAvailableDEXAWriteAPI()
        case .founderProduction: ProductionDEXAWriteAPI(api: productionNativeAPI, idempotencyStore: productionIdempotencyKeyStore)
        }
    }

    var trainingWriteAPI: TrainingWriteAPI {
        switch nativeAuthority {
        case .sandbox: NotAvailableTrainingWriteAPI()
        case .founderProduction:
            ProductionTrainingWriteAPI(
                api: productionNativeAPI,
                reviewAPI: ProductionEvidenceReviewAPI(api: productionNativeAPI),
                idempotencyStore: productionIdempotencyKeyStore,
                attachmentStore: trainingLoggerAttachmentStore,
                bindingStore: trainingEvidenceBindingStore
            )
        }
    }

    var trainingExerciseCatalogWriteAPI: TrainingExerciseCatalogWriteAPI {
        switch nativeAuthority {
        case .sandbox: NotAvailableTrainingExerciseCatalogWriteAPI()
        case .founderProduction: ProductionTrainingExerciseCatalogWriteAPI(api: productionNativeAPI, idempotencyStore: productionIdempotencyKeyStore)
        }
    }

    var dailyEvidenceWriteAPI: DailyEvidenceWriteAPI {
        switch nativeAuthority {
        case .sandbox: NotAvailableDailyEvidenceWriteAPI()
        case .founderProduction:
            ProductionDailyEvidenceWriteAPI(
                api: productionNativeAPI,
                idempotencyStore: productionIdempotencyKeyStore,
                revisionStore: ProductionDailyEvidenceRevisionStore()
            )
        }
    }

    var evidenceIntakePipeline: ProductionEvidenceIntakePipeline {
        ProductionEvidenceIntakePipeline(api: productionNativeAPI, idempotencyStore: productionIdempotencyKeyStore)
    }

    var homeAPI: HomeAPI {
        nativeAuthority == .founderProduction ? ProductionHomeAPI(api: productionNativeAPI) : sandboxHomeAPI
    }

    var priorityCompletionWriteAPI: PriorityCompletionWriteAPI {
        switch nativeAuthority {
        case .sandbox: NotAvailablePriorityCompletionWriteAPI()
        case .founderProduction:
            ProductionPriorityCompletionWriteAPI(api: productionNativeAPI, idempotencyStore: productionIdempotencyKeyStore)
        }
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
        founderProductionTrainingLoggerDraftStore: TrainingLoggerDraftStore = UserDefaultsTrainingLoggerDraftStore(key: "physiqueos.founder-production.trainingLogger.localDraft.v1"),
        trainingLoggerAttachmentStore: TrainingLoggerAttachmentStore = FileTrainingLoggerAttachmentStore(),
        trainingEvidenceBindingStore: TrainingEvidenceBindingStore = TrainingEvidenceBindingStore(),
        loggingSandboxStore: LoggingSandboxStore = LoggingSandboxStore(),
        operatingPlanStore: OperatingPlanSandboxStore = OperatingPlanSandboxStore(),
        goalsSandboxStore: GoalsSandboxStore = GoalsSandboxStore(),
        briefingSandboxStore: BriefingSandboxStore = BriefingSandboxStore(),
        founderServerAPI: FounderServerAPI = FounderServerAPI(),
        productionNativeAPI: ProductionNativeAPI = ProductionNativeAPI(),
        founderPhotoMediaStore: FounderPhotoMediaStore? = nil,
        healthKitFeatureGate: HealthKitFeatureGate = .n0Disabled,
        healthKitService: any HealthKitService = SystemHealthKitService(),
        healthKitQueryClient: any HealthKitAnchoredQueryClient = SystemHealthKitQueryClient(),
        healthKitObserverClient: any HealthKitObserverClient = SystemHealthKitObserverClient(),
        healthKitSynchronizationStore: any HealthKitSynchronizationStore = FileHealthKitSynchronizationStore(),
        healthKitObservationUploader: (any HealthKitObservationUploader)? = nil
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
        self.sandboxTrainingLoggerDraftStore = trainingLoggerDraftStore
        self.founderProductionTrainingLoggerDraftStore = founderProductionTrainingLoggerDraftStore
        self.trainingLoggerAttachmentStore = trainingLoggerAttachmentStore
        self.trainingEvidenceBindingStore = trainingEvidenceBindingStore
        self.loggingSandboxStore = loggingSandboxStore
        self.operatingPlanStore = operatingPlanStore
        self.goalsSandboxStore = goalsSandboxStore
        self.briefingSandboxStore = briefingSandboxStore
        self.founderServerAPI = founderServerAPI
        self.productionNativeAPI = productionNativeAPI
        self.founderPhotoMediaStore = founderPhotoMediaStore ?? FounderPhotoMediaStore(api: founderServerAPI)
        self.founderProductionPhotoMediaStore = FounderProductionPhotoMediaStore(api: productionNativeAPI)
        self.productionIdempotencyKeyStore = ProductionIdempotencyKeyStore()
        self.healthKitFeatureGate = healthKitFeatureGate
        self.healthKitAuthorizationCoordinator = HealthKitAuthorizationCoordinator(
            service: healthKitService,
            featureGate: healthKitFeatureGate
        )
        let uploader = healthKitObservationUploader
            ?? ProductionHealthKitObservationUploader(api: productionNativeAPI)
        self.healthKitSynchronizationEngine = HealthKitSynchronizationEngine(
            queryClient: healthKitQueryClient,
            observerClient: healthKitObserverClient,
            store: healthKitSynchronizationStore,
            uploader: uploader,
            featureGate: healthKitFeatureGate
        )
        let canaryGate = HealthKitFeatureGate.founderActivityValidation
        let canaryAuthorization = HealthKitAuthorizationCoordinator(
            service: healthKitService,
            featureGate: canaryGate
        )
        let canarySynchronizer = HealthKitSynchronizationEngine(
            queryClient: healthKitQueryClient,
            observerClient: healthKitObserverClient,
            store: healthKitSynchronizationStore,
            uploader: uploader,
            featureGate: canaryGate
        )
        self.healthKitFounderCanaryCoordinator = HealthKitFounderCanaryCoordinator(
            authorization: canaryAuthorization,
            synchronizer: canarySynchronizer,
            server: productionNativeAPI
        )
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

extension AppEnvironment {
    /// Refreshes the server-owned bounded occurrence horizon after a
    /// canonical schedule/reminder edit. This deliberately performs no
    /// recurrence math in Swift: the server projects exact occurrence dates
    /// and times, while Native only reconciles those identities with iOS.
    @MainActor
    func reconcileCanonicalPriorityNotifications() async {
        guard nativeAuthority == .founderProduction else { return }
        await productionNativeAPI.invalidateReadResources(["home"])
        do {
            let home = try await ProductionHomeAPI(api: productionNativeAPI).fetchHome()
            notificationAuthorizationStatus = await PriorityNotificationScheduler.sync(
                items: home.notificationScheduleItems,
                calendar: home.notificationCalendar,
                center: .current()
            )
            canonicalPriorityRefreshGeneration += 1
        } catch {
            NotificationDiagnostics.record(.init(
                capturedAt: Date(),
                identifier: "canonical-horizon.refresh",
                operation: "future notification reconciliation deferred",
                reason: "The canonical occurrence horizon could not be refreshed; the next launch or foreground read will retry.",
                fireDate: nil,
                timeZoneIdentifier: TimeZone.current.identifier
            ))
        }
    }
}
