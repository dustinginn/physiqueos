import AppKit
import Foundation
import SwiftUI
import WorkoutLiveActivityPrototype

@main
@MainActor
struct WorkoutLiveActivityRenderCommand {
    struct RenderSpec {
        let filename: String
        let size: CGSize
        let scale: CGFloat
        let view: AnyView
    }

    static func main() throws {
        let outputPath = CommandLine.arguments.dropFirst().first
            ?? "screenshots"
        let outputURL = URL(fileURLWithPath: outputPath, isDirectory: true)
        try FileManager.default.createDirectory(at: outputURL, withIntermediateDirectories: true)

        for spec in renderSpecs() {
            let renderer = ImageRenderer(
                content: spec.view
                    .environment(\.colorScheme, .dark)
                    .frame(width: spec.size.width, height: spec.size.height)
            )
            renderer.scale = spec.scale
            guard let image = renderer.nsImage,
                  let tiff = image.tiffRepresentation,
                  let bitmap = NSBitmapImageRep(data: tiff),
                  let png = bitmap.representation(using: .png, properties: [:]) else {
                throw RenderError.couldNotEncode(spec.filename)
            }
            let destination = outputURL.appendingPathComponent(spec.filename)
            try FileManager.default.createDirectory(
                at: destination.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            try png.write(to: destination, options: .atomic)
            print("rendered \(spec.filename) \(Int(spec.size.width))×\(Int(spec.size.height)) @\(Int(spec.scale))x")
        }
    }

    private static func renderSpecs() -> [RenderSpec] {
        let lockFixtures: [(String, WorkoutActivityFixture)] = [
            ("01-lock-normal-stopwatch.png", WorkoutActivityFixtureCatalog.normalStopwatch),
            ("02-lock-countdown.png", WorkoutActivityFixtureCatalog.normalCountdown),
            ("03-lock-rest-off.png", WorkoutActivityFixtureCatalog.restOff),
            ("04-lock-final-set-up-next.png", WorkoutActivityFixtureCatalog.finalSet),
            ("05-lock-post-final-completed-up-next.png", WorkoutActivityFixtureCatalog.postFinalSet),
            ("06-lock-superset.png", WorkoutActivityFixtureCatalog.superset),
            ("07-lock-timed-set.png", WorkoutActivityFixtureCatalog.timedSet),
            ("08-lock-bodyweight-set.png", WorkoutActivityFixtureCatalog.bodyweightSet),
            ("09-lock-all-sets-complete.png", WorkoutActivityFixtureCatalog.allSetsComplete),
            ("10-lock-saving.png", WorkoutActivityFixtureCatalog.saving),
            ("11-lock-completed.png", WorkoutActivityFixtureCatalog.completed),
            ("12-lock-privacy-redacted.png", WorkoutActivityFixtureCatalog.privacyRedacted),
            ("13-lock-stale-safe.png", WorkoutActivityFixtureCatalog.stale),
            ("14-lock-long-content-pressure.png", WorkoutActivityFixtureCatalog.longContent),
        ]
        let lock: [RenderSpec] = lockFixtures.map { filename, fixture in
            RenderSpec(
                filename: filename,
                size: CGSize(width: 393, height: 852),
                scale: 2,
                view: AnyView(LockScreenScene(fixture: fixture))
            )
        }

        let islands: [RenderSpec] = [
            RenderSpec(
                filename: "15-island-compact-workout.png",
                size: CGSize(width: 393, height: 300),
                scale: 2,
                view: AnyView(DynamicIslandScene(
                    presentation: .compactWorkout,
                    fixture: WorkoutActivityFixtureCatalog.restOff
                ))
            ),
            RenderSpec(
                filename: "16-island-compact-rest.png",
                size: CGSize(width: 393, height: 300),
                scale: 2,
                view: AnyView(DynamicIslandScene(
                    presentation: .compactRest,
                    fixture: WorkoutActivityFixtureCatalog.normalStopwatch
                ))
            ),
            RenderSpec(
                filename: "17-island-minimal.png",
                size: CGSize(width: 393, height: 300),
                scale: 2,
                view: AnyView(DynamicIslandScene(
                    presentation: .minimal,
                    fixture: WorkoutActivityFixtureCatalog.normalStopwatch
                ))
            ),
            RenderSpec(
                filename: "18-island-expanded-normal.png",
                size: CGSize(width: 393, height: 300),
                scale: 2,
                view: AnyView(DynamicIslandScene(
                    presentation: .expandedNormal,
                    fixture: WorkoutActivityFixtureCatalog.normalStopwatch
                ))
            ),
            RenderSpec(
                filename: "19-island-expanded-rest-final.png",
                size: CGSize(width: 393, height: 300),
                scale: 2,
                view: AnyView(DynamicIslandScene(
                    presentation: .expandedFinalRest,
                    fixture: WorkoutActivityFixtureCatalog.finalSet
                ))
            ),
            RenderSpec(
                filename: "20-lock-density-alternatives.png",
                size: CGSize(width: 425, height: 740),
                scale: 2,
                view: AnyView(DensityAlternativesScene())
            ),
            RenderSpec(
                filename: "21-complete-set-placement-alternatives.png",
                size: CGSize(width: 425, height: 520),
                scale: 2,
                view: AnyView(CompleteSetPlacementScene())
            ),
        ]

        let revisionOne: [RenderSpec] = [
            revisionLock("revision-1/A-lock-normal-previous-current-stopwatch.png", WorkoutActivityFixtureCatalog.normalStopwatch),
            revisionLock("revision-1/B-lock-normal-previous-current-countdown.png", WorkoutActivityFixtureCatalog.normalCountdown),
            revisionLock("revision-1/C-lock-final-current-up-next-stopwatch.png", WorkoutActivityFixtureCatalog.finalSet),
            revisionLock("revision-1/D-lock-post-final-completed-up-next-stopwatch.png", WorkoutActivityFixtureCatalog.postFinalSet),
            revisionLock("revision-1/E-lock-rest-off-two-row.png", WorkoutActivityFixtureCatalog.restOff),
            revisionLock("revision-1/F-lock-superset-two-row.png", WorkoutActivityFixtureCatalog.superset),
            revisionIsland(
                "revision-1/G-island-expanded-normal-previous-current.png",
                .expandedNormal,
                WorkoutActivityFixtureCatalog.normalStopwatch
            ),
            revisionIsland(
                "revision-1/H-island-expanded-final-current-up-next.png",
                .expandedFinalRest,
                WorkoutActivityFixtureCatalog.finalSet
            ),
            revisionIsland(
                "revision-1/I-island-expanded-active-rest-countdown.png",
                .expandedActiveRest,
                WorkoutActivityFixtureCatalog.normalCountdown
            ),
            revisionIsland(
                "revision-1/J1-island-compact-workout.png",
                .compactWorkout,
                WorkoutActivityFixtureCatalog.restOff
            ),
            revisionIsland(
                "revision-1/J2-island-compact-rest.png",
                .compactRest,
                WorkoutActivityFixtureCatalog.normalStopwatch
            ),
            revisionIsland(
                "revision-1/J3-island-minimal-rest.png",
                .minimal,
                WorkoutActivityFixtureCatalog.normalStopwatch
            ),
            revisionIsland(
                "revision-1/K-island-expanded-post-final-completed-up-next.png",
                .expandedPostFinal,
                WorkoutActivityFixtureCatalog.postFinalSet
            ),
        ]

        return lock + islands + revisionOne
    }

    private static func revisionLock(
        _ filename: String,
        _ fixture: WorkoutActivityFixture
    ) -> RenderSpec {
        RenderSpec(
            filename: filename,
            size: CGSize(width: 393, height: 852),
            scale: 2,
            view: AnyView(LockScreenScene(fixture: fixture, placement: .trailing))
        )
    }

    private static func revisionIsland(
        _ filename: String,
        _ presentation: DynamicIslandPresentation,
        _ fixture: WorkoutActivityFixture
    ) -> RenderSpec {
        RenderSpec(
            filename: filename,
            size: CGSize(width: 393, height: 300),
            scale: 2,
            view: AnyView(DynamicIslandScene(presentation: presentation, fixture: fixture))
        )
    }

    enum RenderError: Error {
        case couldNotEncode(String)
    }
}
