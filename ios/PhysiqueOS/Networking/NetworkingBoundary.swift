import Foundation

/// Reserves the location for the future networking/client abstraction.
///
/// No conforming type exists yet because Stage 1 makes no network calls
/// (see docs/PHYSIQUEOS_NATIVE_V1.md, section 2.5 and section 12: the
/// server owns canonical calculation and no production endpoint is
/// reachable during provider stabilization). A later slice introduces a
/// client protocol here with a fixture-backed conformance first, then a
/// live conformance, so presentation code never has to change when the
/// transport does.
enum NetworkingBoundary {}
