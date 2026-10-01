// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "WorkoutLiveActivityPrototype",
    platforms: [.macOS(.v14)],
    products: [
        .library(
            name: "WorkoutLiveActivityPrototype",
            targets: ["WorkoutLiveActivityPrototype"]
        ),
        .executable(
            name: "workout-live-activity-render",
            targets: ["WorkoutLiveActivityRender"]
        ),
    ],
    targets: [
        .target(name: "WorkoutLiveActivityPrototype"),
        .executableTarget(
            name: "WorkoutLiveActivityRender",
            dependencies: ["WorkoutLiveActivityPrototype"]
        ),
        .testTarget(
            name: "WorkoutLiveActivityPrototypeTests",
            dependencies: ["WorkoutLiveActivityPrototype"]
        ),
    ]
)
