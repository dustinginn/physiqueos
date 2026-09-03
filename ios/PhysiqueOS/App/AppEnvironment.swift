import Foundation

/// The app's composition root.
///
/// Screens depend on this type by injection rather than reaching for
/// globals. Product screens remain fixture-backed while the isolated
/// Founder server proof uses its own live, authenticated sandbox client;
/// neither authority is silently substituted for the other.
@Observable
final class AppEnvironment {
    let homeAPI: HomeAPI
    let goalsAPI: GoalsAPI
    let logAPI: LogAPI
    let evidenceAPI: EvidenceAPI
    let trainingAPI: TrainingAPI
    let activityAPI: ActivityAPI
    let trainingLoggerAPI: TrainingLoggerAPI
    let trainingLoggerDraftStore: TrainingLoggerDraftStore
    let loggingSandboxStore: LoggingSandboxStore
    let operatingPlanStore: OperatingPlanSandboxStore
    /// Deliberately isolated live transport proof. Existing product screens
    /// remain fixture-backed and cannot silently mix this sandbox read.
    let founderServerAPI: FounderServerAPI

    init(
        homeAPI: HomeAPI = FixtureHomeAPI(),
        goalsAPI: GoalsAPI = FixtureGoalsAPI(),
        logAPI: LogAPI = FixtureLogAPI(),
        evidenceAPI: EvidenceAPI = FixtureEvidenceAPI(),
        trainingAPI: TrainingAPI = FixtureTrainingAPI(),
        activityAPI: ActivityAPI = FixtureActivityAPI(),
        trainingLoggerAPI: TrainingLoggerAPI = FixtureTrainingLoggerAPI(),
        trainingLoggerDraftStore: TrainingLoggerDraftStore = UserDefaultsTrainingLoggerDraftStore(),
        loggingSandboxStore: LoggingSandboxStore = LoggingSandboxStore(),
        operatingPlanStore: OperatingPlanSandboxStore = OperatingPlanSandboxStore(),
        founderServerAPI: FounderServerAPI = FounderServerAPI()
    ) {
        self.homeAPI = homeAPI
        self.goalsAPI = goalsAPI
        self.logAPI = logAPI
        self.evidenceAPI = evidenceAPI
        self.trainingAPI = trainingAPI
        self.activityAPI = activityAPI
        self.trainingLoggerAPI = trainingLoggerAPI
        self.trainingLoggerDraftStore = trainingLoggerDraftStore
        self.loggingSandboxStore = loggingSandboxStore
        self.operatingPlanStore = operatingPlanStore
        self.founderServerAPI = founderServerAPI
    }
}
