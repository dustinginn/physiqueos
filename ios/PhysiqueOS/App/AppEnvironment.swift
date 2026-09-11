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
    let homeAPI: HomeAPI
    let goalsAPI: GoalsAPI
    let logAPI: LogAPI
    let evidenceAPI: EvidenceAPI
    let trainingAPI: TrainingAPI
    let activityAPI: ActivityAPI
    let nutritionAPI: NutritionAPI
    /// Fixture/read-model-backed Weight Evidence product surface — never
    /// mixed with `founderServerAPI`'s isolated live Sandbox Weight write
    /// proof (see `WeightEvidenceAPI.swift`'s doc comment).
    private let sandboxWeightEvidenceAPI: WeightEvidenceAPI
    private let productionWeightEvidenceAPI: ProductionWeightEvidenceAPI
    let dexaAPI: DEXAAPI
    let photosAPI: PhotosAPI
    let energyAPI: EnergyAPI
    /// The read seam for the canonical Operating Plan execution-item
    /// catalog. `loggingSandboxStore` loads the same catalog synchronously
    /// at init (`PriorityCatalogLoader`, mirroring
    /// `TrainingExerciseCatalogLoader`'s own established rationale) since
    /// Home/Priority Detail/Morning Check-In need it before any `await`
    /// can run — this property exists so a future live implementation has
    /// the same seam every other vertical already does, not because
    /// today's fixture-only screens call it directly.
    let priorityAPI: PriorityAPI
    let trainingLoggerAPI: TrainingLoggerAPI
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
        self.homeAPI = homeAPI
        self.goalsAPI = goalsAPI
        self.logAPI = logAPI
        self.evidenceAPI = evidenceAPI
        self.trainingAPI = trainingAPI
        self.activityAPI = activityAPI
        self.nutritionAPI = nutritionAPI
        self.sandboxWeightEvidenceAPI = weightEvidenceAPI
        self.productionWeightEvidenceAPI = ProductionWeightEvidenceAPI(api: productionNativeAPI)
        self.dexaAPI = dexaAPI
        self.photosAPI = photosAPI
        self.energyAPI = energyAPI
        self.priorityAPI = priorityAPI
        self.trainingLoggerAPI = trainingLoggerAPI
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
