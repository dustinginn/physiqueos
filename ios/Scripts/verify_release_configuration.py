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


def main() -> None:
    generator = GENERATOR.read_text()
    project = PROJECT.read_text()
    match = re.search(r"^APP_BUILD_NUMBER = (\d+)$", generator, re.MULTILINE)
    if not match:
        raise SystemExit("APP_BUILD_NUMBER is missing from generate_project.py")
    build_number = match.group(1)
    expected_project_line = f"CURRENT_PROJECT_VERSION = {build_number};"
    if project.count(expected_project_line) != 2:
        raise SystemExit("Generated Debug/Release app build numbers do not match APP_BUILD_NUMBER")
    if project.count("MARKETING_VERSION = 1.0;") < 2:
        raise SystemExit("Marketing version 1.0 is not preserved")
    if project.count("PRODUCT_BUNDLE_IDENTIFIER = com.physiqueos.native.dev;") != 2:
        raise SystemExit("App bundle identifier changed or is not present in both app configurations")
    if project.count("ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;") != 2:
        raise SystemExit("AppIcon is not wired in both app configurations")
    with INFO.open("rb") as handle:
        info = plistlib.load(handle)
    if info.get("ITSAppUsesNonExemptEncryption") is not False:
        raise SystemExit("ITSAppUsesNonExemptEncryption must be false for the approved declaration")
    print(f"release configuration verified: version 1.0 ({build_number}), AppIcon, exempt encryption")


if __name__ == "__main__":
    main()
