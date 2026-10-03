import contextlib
import datetime as dt
import importlib.util
import io
import json
import os
import pathlib
import shutil
import stat
import tempfile
import unittest
from unittest import mock


MODULE_PATH = pathlib.Path(__file__).parents[1] / "physiqueos_recovery.py"
SPEC = importlib.util.spec_from_file_location("physiqueos_recovery", MODULE_PATH)
recovery = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(recovery)


class TempCase(unittest.TestCase):
    def setUp(self):
        self.temp = pathlib.Path(tempfile.mkdtemp(prefix="recovery-tests-"))

    def tearDown(self):
        shutil.rmtree(self.temp, ignore_errors=True)

    def git(self, args, cwd):
        return recovery.git(args, cwd=cwd).stdout.decode().strip()

    def repo(self, name="repo"):
        path = self.temp / name
        path.mkdir()
        self.git(["init"], path)
        self.git(["config", "user.name", "Test"], path)
        self.git(["config", "user.email", "test@example.invalid"], path)
        (path / "README.md").write_text("safe\n")
        self.git(["add", "README.md"], path)
        self.git(["commit", "-m", "initial"], path)
        return path


class CanonicalTests(TempCase):
    def test_manifest_schema_and_canonicalization(self):
        value = {"z": 1, "schema_version": 1, "a": [2]}
        self.assertEqual(recovery.canonical_bytes(value), b'{"a":[2],"schema_version":1,"z":1}\n')

    def test_secret_filename_and_content_and_no_value_in_finding(self):
        scanner = recovery.SecretScanner()
        secret = "github_pat_THIS_VALUE_MUST_NOT_APPEAR_123456789"
        scanner.scan_data("safe.txt", f"token={secret}".encode())
        scanner.scan_data(".env.local", b"SAFE=no")
        self.assertEqual(scanner.outcome(), "FAIL_SECRET")
        serialized = json.dumps(scanner.findings)
        self.assertNotIn(secret, serialized)

    def test_code_expression_and_synthetic_local_database_are_not_secrets(self):
        scanner = recovery.SecretScanner()
        scanner.scan_data("code.js", b"const secret = resolveCredentialFromKeychain();")
        scanner.scan_data("safe.test.js", b"postgresql://testuser:testpassword@localhost/test")
        scanner.scan_data("container.test.js", b"postgresql://fixtureuser:secret@db/test")
        self.assertEqual(scanner.outcome(), "PASS")
        scanner.scan_data("unsafe.js", b"postgresql://realuser:realpassword@db.example.com/prod")
        self.assertEqual(scanner.outcome(), "FAIL_SECRET")

    def test_unknown_binary_and_approved_binary(self):
        scanner = recovery.SecretScanner(); scanner.scan_data("mystery.bin", b"\x00abc")
        self.assertEqual(scanner.outcome(), "FAIL_UNKNOWN_FILE")
        scanner = recovery.SecretScanner(); scanner.scan_data("image.png", b"\x00abc", approved_binary=True)
        self.assertEqual(scanner.outcome(), "PASS")

    def test_oversize(self):
        path = self.temp / "large.txt"
        with path.open("wb") as handle:
            handle.truncate(recovery.SMALL_GENERATION_CEILING + 1)
        scanner = recovery.SecretScanner(); scanner.scan_file(path, "large.txt")
        self.assertEqual(scanner.outcome(), "FAIL_UNKNOWN_FILE")

    def test_symlink_escape_and_special_file(self):
        root = self.temp / "root"; root.mkdir()
        link = root / "escape"; link.symlink_to("../outside")
        with self.assertRaises(recovery.GateFailure): recovery.ensure_regular_no_escape(link, root)
        fifo = root / "fifo"; os.mkfifo(fifo)
        with self.assertRaises(recovery.GateFailure): recovery.ensure_regular_no_escape(fifo, root)


class GitTests(TempCase):
    def test_local_ref_reachability_and_bundle_verify(self):
        origin_work = self.repo("origin-work")
        bare = self.temp / "origin.git"; self.git(["clone", "--bare", str(origin_work), str(bare)], self.temp)
        local = self.temp / "local"; self.git(["clone", str(bare), str(local)], self.temp)
        self.git(["config", "user.name", "Test"], local); self.git(["config", "user.email", "test@example.invalid"], local)
        self.git(["checkout", "-b", "local-only"], local)
        (local / "local.txt").write_text("local state\n"); self.git(["add", "local.txt"], local); self.git(["commit", "-m", "local"], local)
        config = {"origin_url": str(bare), "git_common_dirs": [str(local / ".git")], "untracked_allowlist": [],
                  "archive_builds": [], "retention": {"daily": 14, "weekly": 8, "monthly": 12, "release_checkpoint": 12}}
        temp = self.temp / "agg"; temp.mkdir(); bundle = self.temp / "local.bundle"
        inventory = recovery.build_aggregator(config, temp, make_bundle=bundle)
        self.assertEqual(inventory["local_ref_count"], 1)
        restored = self.temp / "restored"; self.git(["clone", str(bare), str(restored)], self.temp)
        self.git(["bundle", "verify", str(bundle)], restored)
        self.git(["fetch", str(bundle), "+refs/recovery/*:refs/recovery/*"], restored)

    def test_binary_dirty_staged_unstaged_and_untracked_allowlist(self):
        repo = self.repo()
        binary = repo / "image.png"; binary.write_bytes(b"\x89PNG\r\n\x00old")
        self.git(["add", "image.png"], repo); self.git(["commit", "-m", "binary"], repo)
        binary.write_bytes(b"\x89PNG\r\n\x00staged"); self.git(["add", "image.png"], repo)
        binary.write_bytes(b"\x89PNG\r\n\x00working")
        note = repo / "note.md"; note.write_text("approved local note\n")
        common = pathlib.Path(self.git(["rev-parse", "--git-common-dir"], repo))
        if not common.is_absolute(): common = repo / common
        config = {"untracked_allowlist": [{"path": str(note), "extensions": [".md"], "max_bytes": 1024}]}
        inv = {"databases": [{"state": "PRESENT", "worktrees": recovery.parse_worktrees(common)}]}
        result = recovery.capture_dirty_worktrees(inv, config, self.temp / "capture")
        dirty = next(item for item in result["worktrees"] if item["state"] == "DIRTY")
        self.assertEqual(len(dirty["tracked"]), 1); self.assertEqual(len(dirty["index"]), 1); self.assertEqual(len(dirty["untracked"]), 1)
        self.assertNotEqual(dirty["tracked"][0]["sha256"], dirty["index"][0]["sha256"])

    def test_unknown_untracked_blocks(self):
        repo = self.repo(); (repo / "unknown.txt").write_text("x")
        common = repo / ".git"
        inv = {"databases": [{"state": "PRESENT", "worktrees": recovery.parse_worktrees(common)}]}
        with self.assertRaises(recovery.GateFailure) as caught:
            recovery.capture_dirty_worktrees(inv, {"untracked_allowlist": []}, self.temp / "capture")
        self.assertEqual(caught.exception.outcome, "FAIL_UNKNOWN_FILE")

    def test_restore_exact_status(self):
        repo = self.repo()
        tracked = repo / "README.md"; tracked.write_text("staged\n"); self.git(["add", "README.md"], repo); tracked.write_text("working\n")
        note = repo / "note.md"; note.write_text("approved\n")
        config = {"untracked_allowlist": [{"path": str(note), "extensions": [".md"], "max_bytes": 1024}]}
        inv = {"databases": [{"state": "PRESENT", "worktrees": recovery.parse_worktrees(repo / ".git")}]}
        generation = self.temp / "generation"; local_state = generation / "local-state"
        captured = recovery.capture_dirty_worktrees(inv, config, local_state)
        entry = next(item for item in captured["worktrees"] if item["state"] == "DIRTY")
        restored = self.temp / "restored"; self.git(["clone", str(repo), str(restored)], self.temp)
        self.git(["checkout", "--detach", entry["head"]], restored)
        staged_patch = generation / entry["staged_patch"]; unstaged_patch = generation / entry["unstaged_patch"]
        self.git(["apply", "--index", "--binary", str(staged_patch)], restored)
        self.git(["apply", "--binary", str(unstaged_patch)], restored)
        for item in entry["tracked"] + entry["untracked"]:
            recovery.restore_object(generation, item, restored / item["path"])
        self.assertEqual(recovery.sha256_bytes(recovery.normalized_status(restored)), entry["status_sha256"])


class VerificationTests(TempCase):
    def minimal_generation(self):
        root = self.temp / "PhysiqueOS-Recovery-20260101-000000Z"; root.mkdir()
        (root / "README-RESTORE.md").write_text("restore\n")
        (root / "local-state").mkdir(); recovery.write_json(root / "local-state" / "inventory.json", {"worktrees": []})
        manifest = {"schema_version": 1, "generation_id": root.name, "git": {"origin": "none", "databases": [], "local_ref_count": 0}}
        recovery.write_json(root / "MANIFEST.json", manifest)
        sums = recovery.write_checksums(root)
        recovery.write_json(root / "COMPLETE", {"schema_version": 1, "generation_id": root.name,
            "manifest_sha256": recovery.sha256_file(root / "MANIFEST.json"),
            "checksums_sha256": recovery.sha256_file(root / "checksums" / "SHA256SUMS.json"), "file_count": len(sums["files"])})
        return root

    def test_checksum_mismatch_and_incomplete_ignored(self):
        root = self.minimal_generation(); (root / "README-RESTORE.md").write_text("tampered\n")
        with self.assertRaises(recovery.GateFailure): recovery.verify_generation(root)
        (root / "COMPLETE").unlink()
        with self.assertRaises(recovery.GateFailure): recovery.verify_generation(root)

    def test_icloud_state_machine_and_upload_unknown(self):
        self.assertEqual(recovery.classify_icloud_metadata(2, 2, 0, 0, 0), "ICLOUD_UPLOAD_REPORTED_COMPLETE")
        self.assertEqual(recovery.classify_icloud_metadata(2, 1, 0, 0, 1), "REMOTE_ICLOUD_SYNC_UNKNOWN")
        self.assertEqual(recovery.classify_icloud_metadata(2, 1, 0, 1, 0), "ICLOUD_UPLOAD_ERROR")

    def test_content_object_scanned_under_every_logical_path(self):
        root = self.temp / "generation"; (root / "local-state" / "objects" / "aa").mkdir(parents=True)
        data = b"safe text\n"; digest = recovery.sha256_bytes(data)
        object_path = root / "local-state" / "objects" / digest[:2] / digest
        object_path.parent.mkdir(parents=True, exist_ok=True); object_path.write_bytes(data)
        inventory = {"worktrees": [{"tracked": [{"path": "safe.txt", "object": object_path.relative_to(root).as_posix()}],
                                     "index": [], "untracked": []}]}
        recovery.write_json(root / "local-state" / "inventory.json", inventory)
        self.assertEqual(recovery.scan_generation(root)["outcome"], "PASS")


class PolicyTests(TempCase):
    def config(self):
        return {"retention": {"daily": 14, "weekly": 8, "monthly": 12, "release_checkpoint": 12}}

    def make_generations(self, count):
        root = self.temp / "generations"; root.mkdir()
        for index in range(count):
            path = root / f"PhysiqueOS-Recovery-202601{index + 1:02d}-000000Z"; path.mkdir(); (path / "COMPLETE").write_text("x")
            recovery.write_json(path / "MANIFEST.json", {"source_time": f"2026-01-{index + 1:02d}T00:00:00Z", "reason": "daily"})
        return root

    def test_retention_first_unknown_and_minimum_three(self):
        root = self.make_generations(5)
        self.assertFalse(recovery.retention_plan(root, self.config(), first_run=True, upload_state="ICLOUD_UPLOAD_REPORTED_COMPLETE")["enabled"])
        self.assertFalse(recovery.retention_plan(root, self.config(), first_run=False, upload_state="REMOTE_ICLOUD_SYNC_UNKNOWN")["enabled"])
        root2 = self.temp / "three"; root2.mkdir()
        for item in list(root.iterdir())[:3]: shutil.copytree(item, root2 / item.name)
        self.assertFalse(recovery.retention_plan(root2, self.config(), first_run=False, upload_state="ICLOUD_UPLOAD_REPORTED_COMPLETE")["enabled"])

    def test_lock_catchup_and_recursion(self):
        lock = self.temp / "lock"
        with recovery.InstanceLock(lock):
            with self.assertRaises(recovery.GateFailure):
                with recovery.InstanceLock(lock): pass
        now = dt.datetime.now(dt.timezone.utc)
        self.assertTrue(recovery.should_catch_up(now, now - dt.timedelta(hours=25)))
        self.assertFalse(recovery.should_catch_up(now, now - dt.timedelta(hours=1)))
        self.assertFalse(recovery.recursion_allowed("recovery-report", None))
        self.assertFalse(recovery.recursion_allowed("checkpoint", "reports/mac-icloud-backup-result.md"))
        self.assertTrue(recovery.recursion_allowed("checkpoint", "reports/release.md"))

    def test_archive_selection(self):
        archives = []
        for build in (84, 83):
            path = self.temp / f"Build{build}.xcarchive"; path.mkdir()
            info = {"ApplicationProperties": {"CFBundleVersion": str(build), "CFBundleShortVersionString": "1.0"}}
            (path / "Info.plist").write_bytes(__import__("plistlib").dumps(info))
            archives.append({"build": str(build), "version": "1.0", "role": "current-valid" if build == 84 else "previous-rollback", "path": str(path)})
        selected = recovery.archive_inventory({"archive_builds": archives})
        self.assertEqual([item["build"] for item in selected], ["84", "83"])

    def test_failure_notification_path(self):
        with mock.patch.object(recovery, "run") as command, mock.patch.dict(os.environ, {}, clear=True):
            recovery.notify_failure("FAIL_SECRET")
            if pathlib.Path("/usr/bin/osascript").exists(): self.assertTrue(command.called)

    def test_scheduler_install_gate_and_plist(self):
        recovery_home = self.temp / "home"; launch_agents = self.temp / "LaunchAgents"
        env = {"PHYSIQUEOS_RECOVERY_HOME": str(recovery_home), "PHYSIQUEOS_LAUNCH_AGENTS": str(launch_agents)}
        with mock.patch.dict(os.environ, env, clear=False):
            recovery.update_state({"local_validation": "PASS", "icloud_local_copy": "LOCAL_ICLOUD_CONTAINER_COMPLETE",
                                   "icloud_upload_reported": "ICLOUD_UPLOAD_REPORTED_COMPLETE"})
            with mock.patch.object(recovery, "run") as command:
                command.return_value.returncode = 0; command.return_value.stderr = b""
                result = recovery.install_scheduler()
            self.assertEqual(result["scheduler"], "INSTALLED")
            plist = __import__("plistlib").loads((launch_agents / "com.physiqueos.recovery.plist").read_bytes())
            self.assertEqual(plist["StartCalendarInterval"], {"Hour": 3, "Minute": 30})
            self.assertTrue(plist["RunAtLoad"])


if __name__ == "__main__":
    unittest.main()
