import Foundation

/// The app's composition root.
///
/// Screens depend on this type by injection rather than reaching for
/// globals. Each API seam is fixture-backed today, replaced with a live,
/// authenticated implementation once one exists, with no change required
/// to the screens or view models that consume it.
@Observable
final class AppEnvironment {
    let homeAPI: HomeAPI
    let logAPI: LogAPI
    let evidenceAPI: EvidenceAPI
    let trainingAPI: TrainingAPI

    init(
        homeAPI: HomeAPI = FixtureHomeAPI(),
        logAPI: LogAPI = FixtureLogAPI(),
        evidenceAPI: EvidenceAPI = FixtureEvidenceAPI(),
        trainingAPI: TrainingAPI = FixtureTrainingAPI()
    ) {
        self.homeAPI = homeAPI
        self.logAPI = logAPI
        self.evidenceAPI = evidenceAPI
        self.trainingAPI = trainingAPI
    }
}
