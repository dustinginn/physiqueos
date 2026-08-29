#!/usr/bin/env python3
"""Regenerates ios/PhysiqueOS.xcodeproj/project.pbxproj by hand (no xcodegen
available). Deterministic 24-hex-char IDs are derived from a counter so the
file is reproducible and every reference is internally consistent.

This script is the source-controlled project-generation workflow for
PhysiqueOS Native V1 — signing/team/bundle-id/font-resource configuration
are named inputs here (see the constants below), not one-off manual Xcode
edits, so regenerating the project (adding a file, re-running this script)
never silently drops them. Run from anywhere: `python3 ios/Scripts/generate_project.py`.
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

_counter = [0x1000]
def oid():
    _counter[0] += 1
    return "%024X" % _counter[0]

ids = {}
def I(name):
    if name not in ids:
        ids[name] = oid()
    return ids[name]

# ---- App target source files (group path -> filename) ----
app_files = [
    ("App", "PhysiqueOSApp.swift"),
    ("App", "AppEnvironment.swift"),
    ("Contracts", "AppTab.swift"),
    ("Contracts", "AppDestination.swift"),
    ("Contracts", "AppDestinationCoding.swift"),
    ("Contracts", "HomeReadModel.swift"),
    ("Contracts", "LogReadModel.swift"),
    ("Contracts", "DirectWeighInValidation.swift"),
    ("Contracts", "EvidenceDateParsing.swift"),
    ("Contracts", "EvidenceReadModel.swift"),
    ("Contracts", "EvidenceHubUsage.swift"),
    ("Contracts", "TrainingReadModel.swift"),
    ("Contracts", "TrainingSessionRenderItems.swift"),
    ("Contracts", "TrainingSessionCorrectionValidation.swift"),
    ("Contracts", "TrainingExerciseHistoryCalculator.swift"),
    ("Networking", "HomeAPI.swift"),
    ("Networking", "LogAPI.swift"),
    ("Networking", "EvidenceAPI.swift"),
    ("Networking", "TrainingAPI.swift"),
    ("SharedUI", "PhysiqueOSTheme.swift"),
    ("SharedUI", "IconBadge.swift"),
    ("SharedUI", "CardContainer.swift"),
    ("SharedUI", "SectionHeading.swift"),
    ("SharedUI", "StatusChip.swift"),
    ("SharedUI", "ConfidenceRing.swift"),
    ("SharedUI", "AnimatedProgressBar.swift"),
    ("SharedUI", "MetricRow.swift"),
    ("SharedUI", "Typography.swift"),
    ("SharedUI", "PlusJakartaSans.swift"),
    ("SharedUI", "PrimaryActionButton.swift"),
    ("SharedUI", "ScrollScreenLayout.swift"),
    ("SharedUI", "DateField.swift"),
    ("SharedUI", "TabPlaceholderView.swift"),
    ("SharedUI", "EvidenceAttachment.swift"),
    ("SharedUI", "EvidenceSourcePicker.swift"),
    ("SharedUI", "EvidenceStreamPresentation.swift"),
    ("Presentation/Root", "RootTabView.swift"),
    ("Presentation/Root", "DestinationPlaceholderView.swift"),
    ("Presentation/Root", "AppDestinationRouterView.swift"),
    ("Presentation/Home", "HomeView.swift"),
    ("Presentation/Home", "HomeViewModel.swift"),
    ("Presentation/Home", "HomeHeaderView.swift"),
    ("Presentation/Home", "HomeHeroCardView.swift"),
    ("Presentation/Home", "ConfidenceDetailSheet.swift"),
    ("Presentation/Home", "NextBestActionView.swift"),
    ("Presentation/Home", "BriefingCardView.swift"),
    ("Presentation/Home", "GoalRowView.swift"),
    ("Presentation/Home", "FocusTileView.swift"),
    ("Presentation/Home", "TodaysFocusCardView.swift"),
    ("Presentation/Log", "LogView.swift"),
    ("Presentation/Log", "LogViewModel.swift"),
    ("Presentation/Log", "LogHeaderView.swift"),
    ("Presentation/Log", "LoggedTodayCardView.swift"),
    ("Presentation/Log", "TrainingLoggerCardView.swift"),
    ("Presentation/Log", "PendingEvidenceReviewsCardView.swift"),
    ("Presentation/Log", "UploadCardView.swift"),
    ("Presentation/Goals", "GoalsPlaceholderView.swift"),
    ("Presentation/You", "YouPlaceholderView.swift"),
    ("Presentation/Evidence", "EvidenceView.swift"),
    ("Presentation/Evidence", "EvidenceViewModel.swift"),
    ("Presentation/Evidence", "EvidenceHeaderView.swift"),
    ("Presentation/Evidence", "EvidenceStreamRowView.swift"),
    ("Presentation/Training", "TrainingHistoryView.swift"),
    ("Presentation/Training", "TrainingHistoryViewModel.swift"),
    ("Presentation/Training", "TrainingDayView.swift"),
    ("Presentation/Training", "TrainingDayViewModel.swift"),
    ("Presentation/Training", "TrainingSessionDetailView.swift"),
    ("Presentation/Training", "TrainingSessionDetailViewModel.swift"),
    ("Presentation/Training", "TrainingAreaView.swift"),
    ("Presentation/Training", "TrainingAreaViewModel.swift"),
    ("Presentation/Training", "TrainingLibraryHeaderView.swift"),
    ("Presentation/Training", "TrainingExerciseDetailViewModel.swift"),
    ("Presentation/Training", "TrainingExerciseDetailView.swift"),
]

# Non-Swift app-target resources (group path -> filename) — copied into the
# built app bundle via the Resources build phase.
resource_files = [
    ("Resources", "HomeFixture.json"),
    ("Resources", "LogFixture.json"),
    ("Resources", "EvidenceFixture.json"),
    ("Resources", "TrainingFixture.json"),
    ("Resources/Fonts", "PlusJakartaSans[wght].ttf"),
    ("Resources/Fonts", "OFL.txt"),
]

# Files that must be visible/navigable in Xcode and resolvable by path (an
# Info.plist referenced via the INFOPLIST_FILE build setting) but are NOT
# copied via a Sources/Resources build phase themselves.
reference_only_files = [
    ("Supporting", "Info.plist"),
]

test_files = [
    ("PhysiqueOSTests", "AppTabTests.swift"),
    ("PhysiqueOSTests", "HomeReadModelTests.swift"),
    ("PhysiqueOSTests", "LogReadModelTests.swift"),
    ("PhysiqueOSTests", "SharedUITests.swift"),
    ("PhysiqueOSTests", "EvidenceReadModelTests.swift"),
    ("PhysiqueOSTests", "EvidenceHubUsageTests.swift"),
    ("PhysiqueOSTests", "TrainingReadModelTests.swift"),
]

BUNDLE_ID_APP = "com.physiqueos.native.dev"
BUNDLE_ID_TEST = "com.physiqueos.native.dev.Tests"
DEPLOYMENT_TARGET = "18.0"

# The Founder's existing, paid Apple Developer Program team ("DUSTIN JOSEPH
# GINN" in Xcode's Signing & Capabilities UI). Recovered from a real Xcode
# session that selected this team before hitting the CODE_SIGNING_ALLOWED=NO
# block below — captured here as a durable input so it is never lost to a
# future regeneration. A Team ID is not a secret (it appears in every
# provisioning profile and App Store Connect URL); safe to commit.
DEVELOPMENT_TEAM = "33GMTRM6G9"

def file_type_for(fname):
    if fname.endswith(".json"):
        return "text.json"
    if fname.endswith(".plist"):
        return "text.plist.xml"
    if fname.endswith(".ttf"):
        return "file"
    if fname.endswith(".txt"):
        return "text"
    return "sourcecode.swift"

# Assign file refs + build files for sources
for group, fname in app_files:
    I(f"fileref:{group}/{fname}")
    I(f"buildfile:{group}/{fname}")
for group, fname in resource_files:
    I(f"fileref:{group}/{fname}")
    I(f"buildfile:{group}/{fname}")
for group, fname in reference_only_files:
    I(f"fileref:{group}/{fname}")
for group, fname in test_files:
    I(f"fileref:{group}/{fname}")
    I(f"buildfile:{group}/{fname}")

# Groups (every distinct directory that needs a PBXGroup)
group_names = sorted(set(
    ["App", "Contracts", "Networking", "SharedUI", "Resources", "Presentation", "Supporting"]
    + [g for g, _ in app_files]
    + [g for g, _ in resource_files]
    + [g for g, _ in reference_only_files]
), key=lambda g: (g.count("/"), g))
I("group:main")
I("group:products")
I("group:PhysiqueOS")
I("group:PhysiqueOSTests")
for g in group_names:
    I(f"group:{g}")

# Products
I("fileref:PhysiqueOS.app")
I("fileref:PhysiqueOSTests.xctest")

# Project-level
I("project")
I("projConfigList")
I("projDebug")
I("projRelease")

# App target
I("appTarget")
I("appConfigList")
I("appDebug")
I("appRelease")
I("appSourcesPhase")
I("appFrameworksPhase")
I("appResourcesPhase")

# Test target
I("testTarget")
I("testConfigList")
I("testDebug")
I("testRelease")
I("testSourcesPhase")
I("testFrameworksPhase")
I("testResourcesPhase")
I("testDependency")
I("testContainerProxy")

# ---------------- PBXBuildFile ----------------
buildfile_lines = []
for group, fname in app_files:
    bf, fr = I(f"buildfile:{group}/{fname}"), I(f"fileref:{group}/{fname}")
    buildfile_lines.append(f"\t\t{bf} /* {fname} in Sources */ = {{isa = PBXBuildFile; fileRef = {fr} /* {fname} */; }};")
for group, fname in resource_files:
    bf, fr = I(f"buildfile:{group}/{fname}"), I(f"fileref:{group}/{fname}")
    buildfile_lines.append(f"\t\t{bf} /* {fname} in Resources */ = {{isa = PBXBuildFile; fileRef = {fr} /* {fname} */; }};")
for group, fname in test_files:
    bf, fr = I(f"buildfile:{group}/{fname}"), I(f"fileref:{group}/{fname}")
    buildfile_lines.append(f"\t\t{bf} /* {fname} in Sources */ = {{isa = PBXBuildFile; fileRef = {fr} /* {fname} */; }};")

# ---------------- PBXContainerItemProxy ----------------
container_proxy = f"""\t\t{I('testContainerProxy')} /* PBXContainerItemProxy */ = {{
\t\t\tisa = PBXContainerItemProxy;
\t\t\tcontainerPortal = {I('project')} /* Project object */;
\t\t\tproxyType = 1;
\t\t\tremoteGlobalIDString = {I('appTarget')};
\t\t\tremoteInfo = PhysiqueOS;
\t\t}};"""

# ---------------- PBXFileReference ----------------
fileref_lines = []
for group, fname in app_files + resource_files + reference_only_files + test_files:
    fr = I(f"fileref:{group}/{fname}")
    fileref_lines.append(f"\t\t{fr} /* {fname} */ = {{isa = PBXFileReference; lastKnownFileType = {file_type_for(fname)}; path = \"{fname}\"; sourceTree = \"<group>\"; }};")
fileref_lines.append(f"\t\t{I('fileref:PhysiqueOS.app')} /* PhysiqueOS.app */ = {{isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = PhysiqueOS.app; sourceTree = BUILT_PRODUCTS_DIR; }};")
fileref_lines.append(f"\t\t{I('fileref:PhysiqueOSTests.xctest')} /* PhysiqueOSTests.xctest */ = {{isa = PBXFileReference; explicitFileType = wrapper.cfbundle; includeInIndex = 0; path = PhysiqueOSTests.xctest; sourceTree = BUILT_PRODUCTS_DIR; }};")

# ---------------- PBXFrameworksBuildPhase ----------------
frameworks_phases = f"""\t\t{I('appFrameworksPhase')} /* Frameworks */ = {{
\t\t\tisa = PBXFrameworksBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t}};
\t\t{I('testFrameworksPhase')} /* Frameworks */ = {{
\t\t\tisa = PBXFrameworksBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t}};"""

# ---------------- PBXGroup ----------------
all_members = (
    [(g, f) for g, f in app_files]
    + [(g, f) for g, f in resource_files]
    + [(g, f) for g, f in reference_only_files]
)

def group_children_for(path):
    children = []
    for g in group_names:
        if "/" in g:
            parent, leaf = g.rsplit("/", 1)
        else:
            parent, leaf = "", g
        if parent == path and g != path:
            children.append(("group", g))
    for g, fname in all_members:
        if g == path:
            children.append(("file", (g, fname)))
    return children

group_lines = []

top_children = ["App", "Contracts", "Networking", "SharedUI", "Presentation", "Resources", "Supporting"]
refs = "\n".join(f"\t\t\t\t{I(f'group:{c}')} /* {c} */," for c in top_children)
group_lines.append(f"""\t\t{I('group:PhysiqueOS')} /* PhysiqueOS */ = {{
\t\t\tisa = PBXGroup;
\t\t\tchildren = (
{refs}
\t\t\t);
\t\t\tpath = PhysiqueOS;
\t\t\tsourceTree = "<group>";
\t\t}};""")

for g in group_names:
    kids = group_children_for(g)
    lines = []
    for kind, val in kids:
        if kind == "group":
            leafname = val.split("/")[-1]
            lines.append(f"\t\t\t\t{I(f'group:{val}')} /* {leafname} */,")
        else:
            grp, fname = val
            lines.append(f"\t\t\t\t{I(f'fileref:{grp}/{fname}')} /* {fname} */,")
    leaf = g.split("/")[-1]
    body = "\n".join(lines)
    group_lines.append(f"""\t\t{I(f'group:{g}')} /* {leaf} */ = {{
\t\t\tisa = PBXGroup;
\t\t\tchildren = (
{body}
\t\t\t);
\t\t\tpath = {leaf};
\t\t\tsourceTree = "<group>";
\t\t}};""")

test_refs = "\n".join(f"\t\t\t\t{I(f'fileref:{grp}/{fname}')} /* {fname} */," for grp, fname in test_files)
group_lines.append(f"""\t\t{I('group:PhysiqueOSTests')} /* PhysiqueOSTests */ = {{
\t\t\tisa = PBXGroup;
\t\t\tchildren = (
{test_refs}
\t\t\t);
\t\t\tpath = PhysiqueOSTests;
\t\t\tsourceTree = "<group>";
\t\t}};""")

group_lines.append(f"""\t\t{I('group:products')} /* Products */ = {{
\t\t\tisa = PBXGroup;
\t\t\tchildren = (
\t\t\t\t{I('fileref:PhysiqueOS.app')} /* PhysiqueOS.app */,
\t\t\t\t{I('fileref:PhysiqueOSTests.xctest')} /* PhysiqueOSTests.xctest */,
\t\t\t);
\t\t\tname = Products;
\t\t\tsourceTree = "<group>";
\t\t}};""")

group_lines.append(f"""\t\t{I('group:main')} /* Main */ = {{
\t\t\tisa = PBXGroup;
\t\t\tchildren = (
\t\t\t\t{I('group:PhysiqueOS')} /* PhysiqueOS */,
\t\t\t\t{I('group:PhysiqueOSTests')} /* PhysiqueOSTests */,
\t\t\t\t{I('group:products')} /* Products */,
\t\t\t);
\t\t\tsourceTree = "<group>";
\t\t}};""")

# ---------------- PBXNativeTarget ----------------
app_source_build_ids = "\n".join(f"\t\t\t\t{I(f'buildfile:{g}/{f}')} /* {f} in Sources */," for g, f in app_files)
app_resource_build_ids = "\n".join(f"\t\t\t\t{I(f'buildfile:{g}/{f}')} /* {f} in Resources */," for g, f in resource_files)
test_source_build_ids = "\n".join(f"\t\t\t\t{I(f'buildfile:{g}/{f}')} /* {f} in Sources */," for g, f in test_files)

sources_phases = f"""\t\t{I('appSourcesPhase')} /* Sources */ = {{
\t\t\tisa = PBXSourcesBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
{app_source_build_ids}
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t}};
\t\t{I('testSourcesPhase')} /* Sources */ = {{
\t\t\tisa = PBXSourcesBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
{test_source_build_ids}
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t}};"""

resources_phases = f"""\t\t{I('appResourcesPhase')} /* Resources */ = {{
\t\t\tisa = PBXResourcesBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
{app_resource_build_ids}
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t}};
\t\t{I('testResourcesPhase')} /* Resources */ = {{
\t\t\tisa = PBXResourcesBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t}};"""

native_targets = f"""\t\t{I('appTarget')} /* PhysiqueOS */ = {{
\t\t\tisa = PBXNativeTarget;
\t\t\tbuildConfigurationList = {I('appConfigList')} /* Build configuration list for PBXNativeTarget "PhysiqueOS" */;
\t\t\tbuildPhases = (
\t\t\t\t{I('appSourcesPhase')} /* Sources */,
\t\t\t\t{I('appFrameworksPhase')} /* Frameworks */,
\t\t\t\t{I('appResourcesPhase')} /* Resources */,
\t\t\t);
\t\t\tbuildRules = (
\t\t\t);
\t\t\tdependencies = (
\t\t\t);
\t\t\tname = PhysiqueOS;
\t\t\tproductName = PhysiqueOS;
\t\t\tproductReference = {I('fileref:PhysiqueOS.app')} /* PhysiqueOS.app */;
\t\t\tproductType = "com.apple.product-type.application";
\t\t}};
\t\t{I('testTarget')} /* PhysiqueOSTests */ = {{
\t\t\tisa = PBXNativeTarget;
\t\t\tbuildConfigurationList = {I('testConfigList')} /* Build configuration list for PBXNativeTarget "PhysiqueOSTests" */;
\t\t\tbuildPhases = (
\t\t\t\t{I('testSourcesPhase')} /* Sources */,
\t\t\t\t{I('testFrameworksPhase')} /* Frameworks */,
\t\t\t\t{I('testResourcesPhase')} /* Resources */,
\t\t\t);
\t\t\tbuildRules = (
\t\t\t);
\t\t\tdependencies = (
\t\t\t\t{I('testDependency')} /* PBXTargetDependency */,
\t\t\t);
\t\t\tname = PhysiqueOSTests;
\t\t\tproductName = PhysiqueOSTests;
\t\t\tproductReference = {I('fileref:PhysiqueOSTests.xctest')} /* PhysiqueOSTests.xctest */;
\t\t\tproductType = "com.apple.product-type.bundle.unit-test";
\t\t}};"""

target_dependency = f"""\t\t{I('testDependency')} /* PBXTargetDependency */ = {{
\t\t\tisa = PBXTargetDependency;
\t\t\ttarget = {I('appTarget')} /* PhysiqueOS */;
\t\t\ttargetProxy = {I('testContainerProxy')} /* PBXContainerItemProxy */;
\t\t}};"""

# ---------------- PBXProject ----------------
project_obj = f"""\t\t{I('project')} /* Project object */ = {{
\t\t\tisa = PBXProject;
\t\t\tattributes = {{
\t\t\t\tBuildIndependentTargetsInParallel = 1;
\t\t\t\tLastSwiftUpdateCheck = 1620;
\t\t\t\tLastUpgradeCheck = 1620;
\t\t\t\tTargetAttributes = {{
\t\t\t\t\t{I('appTarget')} = {{
\t\t\t\t\t\tCreatedOnToolsVersion = 26.0;
\t\t\t\t\t}};
\t\t\t\t\t{I('testTarget')} = {{
\t\t\t\t\t\tCreatedOnToolsVersion = 26.0;
\t\t\t\t\t\tTestTargetID = {I('appTarget')};
\t\t\t\t\t}};
\t\t\t\t}};
\t\t\t}};
\t\t\tbuildConfigurationList = {I('projConfigList')} /* Build configuration list for PBXProject "PhysiqueOS" */;
\t\t\tcompatibilityVersion = "Xcode 14.0";
\t\t\tdevelopmentRegion = en;
\t\t\thasScannedForEncodings = 0;
\t\t\tknownRegions = (
\t\t\t\ten,
\t\t\t\tBase,
\t\t\t);
\t\t\tmainGroup = {I('group:main')};
\t\t\tproductRefGroup = {I('group:products')} /* Products */;
\t\t\tprojectDirPath = "";
\t\t\tprojectRoot = "";
\t\t\ttargets = (
\t\t\t\t{I('appTarget')} /* PhysiqueOS */,
\t\t\t\t{I('testTarget')} /* PhysiqueOSTests */,
\t\t\t);
\t\t}};"""

# ---------------- XCBuildConfiguration ----------------
common_project_settings = """
\t\t\t\tALWAYS_SEARCH_USER_PATHS = NO;
\t\t\t\tCLANG_ANALYZER_NONNULL = YES;
\t\t\t\tCLANG_ANALYZER_NUMBER_OBJECT_CONVERSION = YES_AGGRESSIVE;
\t\t\t\tCLANG_CXX_LANGUAGE_STANDARD = "gnu++20";
\t\t\t\tCLANG_ENABLE_MODULES = YES;
\t\t\t\tCLANG_ENABLE_OBJC_ARC = YES;
\t\t\t\tCLANG_ENABLE_OBJC_WEAK = YES;
\t\t\t\tCLANG_WARN_BLOCK_CAPTURE_AUTORELEASING = YES;
\t\t\t\tCLANG_WARN_BOOL_CONVERSION = YES;
\t\t\t\tCLANG_WARN_COMMA = YES;
\t\t\t\tCLANG_WARN_CONSTANT_CONVERSION = YES;
\t\t\t\tCLANG_WARN_DEPRECATED_OBJC_IMPLEMENTATIONS = YES;
\t\t\t\tCLANG_WARN_DIRECT_OBJC_ISA_USAGE = YES_ERROR;
\t\t\t\tCLANG_WARN_DOCUMENTATION_COMMENTS = YES;
\t\t\t\tCLANG_WARN_EMPTY_BODY = YES;
\t\t\t\tCLANG_WARN_ENUM_CONVERSION = YES;
\t\t\t\tCLANG_WARN_INFINITE_RECURSION = YES;
\t\t\t\tCLANG_WARN_INT_CONVERSION = YES;
\t\t\t\tCLANG_WARN_NON_LITERAL_NULL_CONVERSION = YES;
\t\t\t\tCLANG_WARN_OBJC_IMPLICIT_RETAIN_SELF = YES;
\t\t\t\tCLANG_WARN_OBJC_LITERAL_CONVERSION = YES;
\t\t\t\tCLANG_WARN_OBJC_ROOT_CLASS = YES_ERROR;
\t\t\t\tCLANG_WARN_QUOTED_INCLUDE_IN_FRAMEWORK_HEADER = YES;
\t\t\t\tCLANG_WARN_RANGE_LOOP_ANALYSIS = YES;
\t\t\t\tCLANG_WARN_STRICT_PROTOTYPES = YES;
\t\t\t\tCLANG_WARN_SUSPICIOUS_MOVE = YES;
\t\t\t\tCLANG_WARN_UNGUARDED_AVAILABILITY = YES_AGGRESSIVE;
\t\t\t\tCLANG_WARN_UNREACHABLE_CODE = YES;
\t\t\t\tCLANG_WARN__DUPLICATE_METHOD_MATCH = YES;
\t\t\t\tCOPY_PHASE_STRIP = NO;
\t\t\t\tENABLE_STRICT_OBJC_MSGSEND = YES;
\t\t\t\tGCC_C_LANGUAGE_STANDARD = gnu17;
\t\t\t\tGCC_NO_COMMON_BLOCKS = YES;
\t\t\t\tGCC_WARN_64_TO_32_BIT_CONVERSION = YES;
\t\t\t\tGCC_WARN_ABOUT_RETURN_TYPE = YES_ERROR;
\t\t\t\tGCC_WARN_UNDECLARED_SELECTOR = YES;
\t\t\t\tGCC_WARN_UNINITIALIZED_AUTOS = YES_AGGRESSIVE;
\t\t\t\tGCC_WARN_UNUSED_FUNCTION = YES;
\t\t\t\tGCC_WARN_UNUSED_VARIABLE = YES;
\t\t\t\tIPHONEOS_DEPLOYMENT_TARGET = %s;
\t\t\t\tMTL_ENABLE_DEBUG_INFO = INCLUDE_SOURCE;
\t\t\t\tMTL_FAST_MATH = YES;
\t\t\t\tSDKROOT = iphoneos;
\t\t\t\tSWIFT_VERSION = 6.0;""" % DEPLOYMENT_TARGET

debug_only = """
\t\t\t\tDEBUG_INFORMATION_FORMAT = dwarf;
\t\t\t\tENABLE_TESTABILITY = YES;
\t\t\t\tGCC_DYNAMIC_NO_PIC = NO;
\t\t\t\tGCC_OPTIMIZATION_LEVEL = 0;
\t\t\t\tGCC_PREPROCESSOR_DEFINITIONS = (
\t\t\t\t\t"DEBUG=1",
\t\t\t\t\t"$(inherited)",
\t\t\t\t);
\t\t\t\tONLY_ACTIVE_ARCH = YES;
\t\t\t\tSWIFT_ACTIVE_COMPILATION_CONDITIONS = "DEBUG $(inherited)";
\t\t\t\tSWIFT_OPTIMIZATION_LEVEL = "-Onone";"""

release_only = """
\t\t\t\tDEBUG_INFORMATION_FORMAT = "dwarf-with-dsym";
\t\t\t\tENABLE_NS_ASSERTIONS = NO;
\t\t\t\tMTL_ENABLE_DEBUG_INFO = NO;
\t\t\t\tSWIFT_COMPILATION_MODE = wholemodule;
\t\t\t\tVALIDATE_PRODUCT = YES;"""

proj_debug = f"""\t\t{I('projDebug')} /* Debug */ = {{
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {{{common_project_settings}{debug_only}
\t\t\t}};
\t\t\tname = Debug;
\t\t}};"""

proj_release = f"""\t\t{I('projRelease')} /* Release */ = {{
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {{{common_project_settings}{release_only}
\t\t\t}};
\t\t\tname = Release;
\t\t}};"""

app_common = f"""
\t\t\t\tASSETCATALOG_COMPILER_GENERATE_SWIFT_ASSET_SYMBOL_EXTENSIONS = YES;
\t\t\t\tCODE_SIGN_STYLE = Automatic;
\t\t\t\tCURRENT_PROJECT_VERSION = 1;
\t\t\t\tDEVELOPMENT_TEAM = {DEVELOPMENT_TEAM};
\t\t\t\tGENERATE_INFOPLIST_FILE = YES;
\t\t\t\tINFOPLIST_FILE = "PhysiqueOS/Supporting/Info.plist";
\t\t\t\tINFOPLIST_KEY_UIApplicationSceneManifest_Generation = YES;
\t\t\t\tINFOPLIST_KEY_UIApplicationSupportsIndirectInputEvents = YES;
\t\t\t\tINFOPLIST_KEY_UILaunchScreen_Generation = YES;
\t\t\t\tINFOPLIST_KEY_UISupportedInterfaceOrientations_iPhone = "UIInterfaceOrientationPortrait UIInterfaceOrientationLandscapeLeft UIInterfaceOrientationLandscapeRight";
\t\t\t\tINFOPLIST_KEY_UISupportedInterfaceOrientations_iPad = "UIInterfaceOrientationPortrait UIInterfaceOrientationPortraitUpsideDown UIInterfaceOrientationLandscapeLeft UIInterfaceOrientationLandscapeRight";
\t\t\t\tLD_RUNPATH_SEARCH_PATHS = (
\t\t\t\t\t"$(inherited)",
\t\t\t\t\t"@executable_path/Frameworks",
\t\t\t\t);
\t\t\t\tMARKETING_VERSION = 1.0;
\t\t\t\tPRODUCT_BUNDLE_IDENTIFIER = {BUNDLE_ID_APP};
\t\t\t\tPRODUCT_NAME = "$(TARGET_NAME)";
\t\t\t\tSWIFT_EMIT_LOC_STRINGS = YES;
\t\t\t\tTARGETED_DEVICE_FAMILY = "1,2";"""

app_debug = f"""\t\t{I('appDebug')} /* Debug */ = {{
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {{{app_common}
\t\t\t}};
\t\t\tname = Debug;
\t\t}};"""

app_release = f"""\t\t{I('appRelease')} /* Release */ = {{
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {{{app_common}
\t\t\t}};
\t\t\tname = Release;
\t\t}};"""

test_common = f"""
\t\t\t\tBUNDLE_LOADER = "$(TEST_HOST)";
\t\t\t\tCODE_SIGN_STYLE = Automatic;
\t\t\t\tCURRENT_PROJECT_VERSION = 1;
\t\t\t\tDEVELOPMENT_TEAM = {DEVELOPMENT_TEAM};
\t\t\t\tGENERATE_INFOPLIST_FILE = YES;
\t\t\t\tMARKETING_VERSION = 1.0;
\t\t\t\tPRODUCT_BUNDLE_IDENTIFIER = {BUNDLE_ID_TEST};
\t\t\t\tPRODUCT_NAME = "$(TARGET_NAME)";
\t\t\t\tSWIFT_EMIT_LOC_STRINGS = NO;
\t\t\t\tTARGETED_DEVICE_FAMILY = "1,2";
\t\t\t\tTEST_HOST = "$(BUILT_PRODUCTS_DIR)/PhysiqueOS.app/PhysiqueOS";"""

test_debug = f"""\t\t{I('testDebug')} /* Debug */ = {{
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {{{test_common}
\t\t\t}};
\t\t\tname = Debug;
\t\t}};"""

test_release = f"""\t\t{I('testRelease')} /* Release */ = {{
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {{{test_common}
\t\t\t}};
\t\t\tname = Release;
\t\t}};"""

config_lists = f"""\t\t{I('projConfigList')} /* Build configuration list for PBXProject "PhysiqueOS" */ = {{
\t\t\tisa = XCConfigurationList;
\t\t\tbuildConfigurations = (
\t\t\t\t{I('projDebug')} /* Debug */,
\t\t\t\t{I('projRelease')} /* Release */,
\t\t\t);
\t\t\tdefaultConfigurationIsVisible = 0;
\t\t\tdefaultConfigurationName = Release;
\t\t}};
\t\t{I('appConfigList')} /* Build configuration list for PBXNativeTarget "PhysiqueOS" */ = {{
\t\t\tisa = XCConfigurationList;
\t\t\tbuildConfigurations = (
\t\t\t\t{I('appDebug')} /* Debug */,
\t\t\t\t{I('appRelease')} /* Release */,
\t\t\t);
\t\t\tdefaultConfigurationIsVisible = 0;
\t\t\tdefaultConfigurationName = Release;
\t\t}};
\t\t{I('testConfigList')} /* Build configuration list for PBXNativeTarget "PhysiqueOSTests" */ = {{
\t\t\tisa = XCConfigurationList;
\t\t\tbuildConfigurations = (
\t\t\t\t{I('testDebug')} /* Debug */,
\t\t\t\t{I('testRelease')} /* Release */,
\t\t\t);
\t\t\tdefaultConfigurationIsVisible = 0;
\t\t\tdefaultConfigurationName = Release;
\t\t}};"""

pbxproj = f"""// !$*UTF8*$!
{{
\tarchiveVersion = 1;
\tclasses = {{
\t}};
\tobjectVersion = 56;
\tobjects = {{

/* Begin PBXBuildFile section */
{chr(10).join(buildfile_lines)}
/* End PBXBuildFile section */

/* Begin PBXContainerItemProxy section */
{container_proxy}
/* End PBXContainerItemProxy section */

/* Begin PBXFileReference section */
{chr(10).join(fileref_lines)}
/* End PBXFileReference section */

/* Begin PBXFrameworksBuildPhase section */
{frameworks_phases}
/* End PBXFrameworksBuildPhase section */

/* Begin PBXGroup section */
{chr(10).join(group_lines)}
/* End PBXGroup section */

/* Begin PBXNativeTarget section */
{native_targets}
/* End PBXNativeTarget section */

/* Begin PBXProject section */
{project_obj}
/* End PBXProject section */

/* Begin PBXResourcesBuildPhase section */
{resources_phases}
/* End PBXResourcesBuildPhase section */

/* Begin PBXSourcesBuildPhase section */
{sources_phases}
/* End PBXSourcesBuildPhase section */

/* Begin PBXTargetDependency section */
{target_dependency}
/* End PBXTargetDependency section */

/* Begin XCBuildConfiguration section */
{proj_debug}
{proj_release}
{app_debug}
{app_release}
{test_debug}
{test_release}
/* End XCBuildConfiguration section */

/* Begin XCConfigurationList section */
{config_lists}
/* End XCConfigurationList section */
\t}};
\trootObject = {I('project')} /* Project object */;
}}
"""

os.makedirs(f"{ROOT}/PhysiqueOS.xcodeproj", exist_ok=True)
with open(f"{ROOT}/PhysiqueOS.xcodeproj/project.pbxproj", "w") as f:
    f.write(pbxproj)

print("wrote project.pbxproj,", len(pbxproj), "bytes")
print("appTarget id:", I('appTarget'))
print("testTarget id:", I('testTarget'))
print("app files:", len(app_files), "resources:", len(resource_files),
      "reference-only:", len(reference_only_files), "test files:", len(test_files))
print("development team:", DEVELOPMENT_TEAM)
