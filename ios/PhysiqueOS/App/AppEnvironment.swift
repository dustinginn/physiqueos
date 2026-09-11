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

    var permitsProductWrites: Bool { self == .sandbox }
}

enum NativeProductWriteDomain: String, CaseIterable, Sendable, Hashable {
    case morningCheckInAndWeight
    case priorityCompletion
    case workoutLogger
    case nutrition
    case activityAndHealthKit
    case evidenceReview
    case goalAndPhaseTransitions
    case operatingPlan
    case dexaAndPhotos
}

enum NativeWriteGuardError: Error, Equatable {
    case productionReadOnly(NativeProductWriteDomain)
}

enum NativeProductWriteGuard {
    static func authorize(_ domain: NativeProductWriteDomain, in environment: NativeAPIEnvironment) throws {
        guard environment.permitsProductWrites else {
            throw NativeWriteGuardError.productionReadOnly(domain)
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
    let dexaAPI: DEXAAPI
    let photosAPI: PhotosAPI
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
        self.dexaAPI = dexaAPI
        self.photosAPI = photosAPI
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
    }

    func selectNativeAuthority(_ authority: NativeAPIEnvironment) {
        nativeAuthority = authority
        authoritySelectionStore.save(authority)
    }
}
