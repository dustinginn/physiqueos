"""Regression tests for release_pointer_guard (stdlib unittest).

Run from the repository root:
  python3 -m unittest discover -s agent-handoffs/tools -p 'test_*.py' -v
"""
import copy
import json
import os
import subprocess
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import release_pointer_guard as guard  # noqa: E402


def fixture(name):
    with open(os.path.join(HERE, "fixtures", name), encoding="utf-8") as fh:
        return json.load(fh)


BUILD89 = fixture("release-build89-83552509.json")
BUILD90 = fixture("release-build90-57877afc.json")
AUDIT = fixture("audit-design-training-variant-63bf054e.json")
CANDIDATE = fixture("implementation-candidate-build92-server-786432ca.json")
INCIDENT = fixture("incident-report-only-evidence-f93c7718.json")
SERVER_DEPLOY = fixture("server-deploy-closeout-2a069479.json")


def design_report():
    doc = copy.deepcopy(BUILD90)
    doc["task"]["id"] = "build91-evidence-visual-system-options-20261007"
    doc["task"]["title"] = "Build 91 Evidence visual system design options"
    doc["result"]["testflight_uploaded"] = False
    doc["full_report_path"] = "agent-handoffs/reports/20261007T120000Z-build91-evidence-visual-system.md"
    return doc


def assert_refused_as_non_release(case, old, new):
    errs = guard.transition_errors(old, new, guard.render_pointer(new))
    case.assertTrue(errs, "non-release pointer change must be refused")
    case.assertTrue(any("testflight_uploaded" in e for e in errs), errs)


class NonReleaseTasksCannotMoveLatest(unittest.TestCase):
    def test_audit_is_rejected(self):
        assert_refused_as_non_release(self, BUILD90, AUDIT)

    def test_design_report_is_rejected(self):
        assert_refused_as_non_release(self, BUILD90, design_report())

    def test_implementation_candidate_is_rejected(self):
        assert_refused_as_non_release(self, BUILD90, CANDIDATE)

    def test_report_only_incident_is_rejected(self):
        assert_refused_as_non_release(self, BUILD90, INCIDENT)

    def test_server_only_deploy_is_rejected(self):
        self.assertTrue(SERVER_DEPLOY["result"]["deployed"])
        assert_refused_as_non_release(self, BUILD90, SERVER_DEPLOY)

    def test_rejection_does_not_depend_on_prior_pointer(self):
        assert_refused_as_non_release(self, None, AUDIT)


class AcceptedNativeReleaseMayMoveLatest(unittest.TestCase):
    def test_build90_testflight_release_is_allowed(self):
        self.assertEqual(guard.transition_errors(BUILD89, BUILD90, guard.render_pointer(BUILD90)), [])

    def test_restoring_build90_over_misplaced_pointer_is_allowed(self):
        self.assertEqual(guard.transition_errors(CANDIDATE, BUILD90, guard.render_pointer(BUILD90)), [])

    def test_build_cannot_go_backwards(self):
        errs = guard.transition_errors(BUILD90, BUILD89, guard.render_pointer(BUILD89))
        self.assertTrue(any("backwards" in e for e in errs), errs)

    def test_same_build_cannot_change_native_sha(self):
        forged = copy.deepcopy(BUILD90)
        forged["authority"]["native_sha"] = "0" * 40
        errs = guard.transition_errors(BUILD90, forged, guard.render_pointer(forged))
        self.assertTrue(any("same build" in e for e in errs), errs)

    def test_incomplete_or_failed_release_is_rejected(self):
        doc = copy.deepcopy(BUILD90)
        doc["result"]["success"] = False
        self.assertTrue(guard.transition_errors(BUILD89, doc))
        doc = copy.deepcopy(BUILD90)
        doc["task"]["status"] = "partial"
        self.assertTrue(guard.transition_errors(BUILD89, doc))

    def test_latest_md_must_match_latest_json(self):
        stale_md = guard.render_pointer(AUDIT)
        errs = guard.transition_errors(BUILD89, BUILD90, stale_md)
        self.assertTrue(any("latest.md" in e for e in errs), errs)


def _has_commit(sha):
    return subprocess.run(["git", "cat-file", "-e", sha + "^{commit}"], capture_output=True).returncode == 0


@unittest.skipUnless(all(_has_commit(s) for s in ("63bf054e", "786432ca", "57877afc", "83552509")),
                     "historical handoff commits not available in this clone")
class HistoricalMainCommits(unittest.TestCase):
    """The real 2026-10-07 incident and the real Build 89/90 releases, replayed through --base/--head."""

    def test_63bf054e_audit_pointer_move_is_refused(self):
        errs, _ = guard.check_git_range("63bf054e^", "63bf054e")
        self.assertTrue(errs)

    def test_786432ca_candidate_pointer_move_is_refused(self):
        errs, _ = guard.check_git_range("786432ca^", "786432ca")
        self.assertTrue(errs)

    def test_57877afc_build90_release_is_allowed(self):
        errs, _ = guard.check_git_range("57877afc^", "57877afc")
        self.assertEqual(errs, [])

    def test_83552509_build89_release_is_allowed(self):
        errs, _ = guard.check_git_range("83552509^", "83552509")
        self.assertEqual(errs, [])

    def test_report_only_commit_leaves_pointer_unchanged(self):
        errs, msg = guard.check_git_range("57877afc", "57877afc")
        self.assertEqual(errs, [])
        self.assertIn("unchanged", msg)


if __name__ == "__main__":
    unittest.main()
