#!/usr/bin/env python3
"""Read-only regression check for source-controlled release metadata."""

import pathlib
import plistlib
import re

IOS_ROOT = pathlib.Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = IOS_ROOT.parent
GENERATOR = IOS_ROOT / "Scripts" / "generate_project.py"
PROJECT = IOS_ROOT / "PhysiqueOS.xcodeproj" / "project.pbxproj"
INFO = IOS_ROOT / "PhysiqueOS" / "Supporting" / "Info.plist"
EXTENSION_INFO = IOS_ROOT / "PhysiqueOSLiveActivity" / "Info.plist"
EXTENSION_BUNDLE_ID = "com.physiqueos.native.dev.WorkoutActivity"
ENTITLEMENTS = IOS_ROOT / "PhysiqueOS" / "Supporting" / "PhysiqueOS.entitlements"


def main() -> None:
    generator = GENERATOR.read_text()
    project = PROJECT.read_text()
    match = re.search(r"^APP_BUILD_NUMBER = (\d+)$", generator, re.MULTILINE)
    if not match:
        raise SystemExit("APP_BUILD_NUMBER is missing from generate_project.py")
    build_number = match.group(1)
    expected_project_line = f"CURRENT_PROJECT_VERSION = {build_number};"
    # App + Workout Live Activity extension, Debug + Release each. The App Store
    # export requires the embedded extension's version to equal the app's.
    if project.count(expected_project_line) != 4:
        raise SystemExit("Generated Debug/Release app and extension build numbers do not match APP_BUILD_NUMBER")
    if project.count("MARKETING_VERSION = 1.0;") < 4:
        raise SystemExit("Marketing version 1.0 is not preserved")
    if project.count("PRODUCT_BUNDLE_IDENTIFIER = com.physiqueos.native.dev;") != 2:
        raise SystemExit("App bundle identifier changed or is not present in both app configurations")
    if project.count(f"PRODUCT_BUNDLE_IDENTIFIER = {EXTENSION_BUNDLE_ID};") != 2:
        raise SystemExit("Workout Live Activity extension bundle identifier is missing or changed")
    if "Embed Foundation Extensions" not in project or "PhysiqueOSLiveActivity.appex in Embed Foundation Extensions" not in project:
        raise SystemExit("The app does not embed the Workout Live Activity extension")
    if project.count("APPLICATION_EXTENSION_API_ONLY = YES;") != 2:
        raise SystemExit("The extension must be built extension-API-only in both configurations")
    if "com.physiqueos.native.dev.WorkoutActivity" not in project or project.count("SKIP_INSTALL = YES;") != 2:
        raise SystemExit("The extension must set SKIP_INSTALL in both configurations")
    if project.count("ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;") != 2:
        raise SystemExit("AppIcon is not wired in both app configurations")
    if project.count('CODE_SIGN_ENTITLEMENTS = "PhysiqueOS/Supporting/PhysiqueOS.entitlements";') != 2:
        raise SystemExit("HealthKit entitlements are not wired in both app configurations")
    if "HealthKit.framework in Frameworks" not in project:
        raise SystemExit("HealthKit.framework is not linked by the app target")
    with INFO.open("rb") as handle:
        info = plistlib.load(handle)
    if info.get("ITSAppUsesNonExemptEncryption") is not False:
        raise SystemExit("ITSAppUsesNonExemptEncryption must be false for the approved declaration")
    if info.get("NSSupportsLiveActivities") is not True:
        raise SystemExit("NSSupportsLiveActivities must be true for the Workout Live Activity")
    if info.get("NSSupportsLiveActivitiesFrequentUpdates"):
        raise SystemExit("Frequent (push) Live Activity updates are not part of Phase 1")
    schemes = [scheme for entry in info.get("CFBundleURLTypes", []) for scheme in entry.get("CFBundleURLSchemes", [])]
    if schemes != ["physiqueos-workout"]:
        raise SystemExit("Only the physiqueos-workout deep-link scheme may be registered")
    with EXTENSION_INFO.open("rb") as handle:
        extension_info = plistlib.load(handle)
    if extension_info.get("NSExtension", {}).get("NSExtensionPointIdentifier") != "com.apple.widgetkit-extension":
        raise SystemExit("The Live Activity extension point identifier is wrong")
    if not info.get("NSHealthShareUsageDescription") or not info.get("NSHealthUpdateUsageDescription"):
        raise SystemExit("HealthKit privacy-purpose strings are missing")
    with ENTITLEMENTS.open("rb") as handle:
        entitlements = plistlib.load(handle)
    if entitlements.get("com.apple.developer.healthkit") is not True:
        raise SystemExit("HealthKit entitlement is missing")
    if entitlements.get("com.apple.developer.healthkit.background-delivery") is not True:
        raise SystemExit("Future HealthKit background-delivery entitlement is missing")
    print(
        f"release configuration verified: version 1.0 ({build_number}), AppIcon, "
        "HealthKit capability declarations, exempt encryption, Workout Live Activity extension"
    )


if __name__ == "__main__":
    main()
