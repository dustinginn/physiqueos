#!/usr/bin/python3
"""PhysiqueOS recovery V1: fail-closed local capture, verification, and iCloud promotion.

The tool deliberately never reads credential stores, never mutates a source worktree,
and never treats a successful local iCloud-container copy as independent remote proof.
"""

from __future__ import annotations

import argparse
import base64
import datetime as dt
import errno
import fcntl
import fnmatch
import hashlib
import json
import math
import os
import pathlib
import plistlib
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import time
import uuid
from typing import Any, Iterable, Optional


SCHEMA_VERSION = 1
TOOL_VERSION = "1.0.0"
SMALL_GENERATION_CEILING = 100 * 1024 * 1024
DEFAULT_HOME = pathlib.Path.home() / "Library" / "Application Support" / "PhysiqueOS Recovery"
DEFAULT_ICLOUD = pathlib.Path.home() / "Library" / "Mobile Documents" / "com~apple~CloudDocs" / "PhysiqueOS Backups"
SCRIPT_DIR = pathlib.Path(__file__).resolve().parent
CONFIG_PATH = SCRIPT_DIR / "physiqueos-recovery-config.json"
OUTCOMES = {"PASS", "FAIL_SECRET", "FAIL_UNKNOWN_FILE", "FAIL_SCANNER_ERROR"}


class GateFailure(RuntimeError):
    def __init__(self, outcome: str, message: str, findings: Optional[list[dict[str, Any]]] = None):
        if outcome not in OUTCOMES:
            outcome = "FAIL_SCANNER_ERROR"
        super().__init__(message)
        self.outcome = outcome
        self.findings = findings or []


def utc_now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def iso_utc(value: Optional[dt.datetime] = None) -> str:
    return (value or utc_now()).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def canonical_bytes(value: Any) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n").encode("utf-8")


def write_json(path: pathlib.Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(canonical_bytes(value))


def read_json(path: pathlib.Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def safe_rel(path: pathlib.Path, root: pathlib.Path) -> str:
    return path.relative_to(root).as_posix()


def display_path(path: pathlib.Path) -> str:
    try:
        return "~/" + path.resolve().relative_to(pathlib.Path.home().resolve()).as_posix()
    except (ValueError, OSError):
        return str(path)


def expand(value: str) -> pathlib.Path:
    return pathlib.Path(os.path.expandvars(os.path.expanduser(value))).resolve(strict=False)


def run(args: list[str], *, cwd: Optional[pathlib.Path] = None, data: Optional[bytes] = None,
        timeout: int = 60, check: bool = True) -> subprocess.CompletedProcess[bytes]:
    try:
        result = subprocess.run(args, cwd=str(cwd) if cwd else None, input=data,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                timeout=timeout, check=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise RuntimeError(f"command failed safely: {pathlib.Path(args[0]).name}: {type(exc).__name__}") from exc
    if check and result.returncode != 0:
        raise RuntimeError(f"command failed safely: {pathlib.Path(args[0]).name} exit {result.returncode}")
    return result


def load_config(path: pathlib.Path = CONFIG_PATH) -> dict[str, Any]:
    config = read_json(path)
    required = {"origin_url", "git_common_dirs", "untracked_allowlist", "archive_builds", "retention"}
    if not required.issubset(config) or not isinstance(config["git_common_dirs"], list):
        raise GateFailure("FAIL_SCANNER_ERROR", "configuration schema invalid")
    return config


def runtime_home() -> pathlib.Path:
    return expand(os.environ.get("PHYSIQUEOS_RECOVERY_HOME", str(DEFAULT_HOME)))


def icloud_root() -> pathlib.Path:
    return expand(os.environ.get("PHYSIQUEOS_ICLOUD_ROOT", str(DEFAULT_ICLOUD)))


def cache_home() -> pathlib.Path:
    return expand(os.environ.get("PHYSIQUEOS_RECOVERY_CACHE_HOME", str(DEFAULT_HOME)))


def generation_id(now: Optional[dt.datetime] = None) -> str:
    stamp = (now or utc_now()).strftime("%Y%m%d-%H%M%SZ")
    return f"PhysiqueOS-Recovery-{stamp}"


def file_mode(path: pathlib.Path) -> str:
    return format(stat.S_IMODE(path.lstat().st_mode), "04o")


def entropy(value: str) -> float:
    if not value:
        return 0.0
    counts = {ch: value.count(ch) for ch in set(value)}
    return -sum((count / len(value)) * math.log2(count / len(value)) for count in counts.values())


class SecretScanner:
    """Fail-closed filename and content scanner. Findings never include matched values."""

    BINARY_SUFFIXES = {".png", ".jpg", ".jpeg", ".gif", ".pdf", ".zip", ".xcarchive", ".bundle"}
    DENIED_EXACT = {".netrc", ".npmrc", ".pypirc", "id_rsa", "id_dsa", "id_ecdsa", "id_ed25519"}
    DENIED_SUFFIXES = {".pem", ".key", ".p8", ".p12", ".mobileprovision", ".keychain", ".keychain-db"}
    CONTENT_RULES = [
        ("private-key-header", re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----")),
        ("github-token", re.compile(rb"\b(?:gh[opusr]_[A-Za-z0-9_]{24,}|github_pat_[A-Za-z0-9_]{20,})\b")),
        ("digitalocean-token", re.compile(rb"\bdop_v1_[A-Fa-f0-9]{32,}\b")),
        ("aws-access-key", re.compile(rb"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b")),
        ("authorization-header", re.compile(rb"(?im)^\s*authorization\s*:\s*(?:bearer|basic)\s+\S+")),
        ("jwt", re.compile(rb"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b")),
        ("secret-literal-assignment", re.compile(rb"(?im)\b(?:password|passwd|secret|api[_-]?key|access[_-]?token|client[_-]?secret)\b\s*[:=]\s*(['\"])[^'\"\r\n]{8,}\1")),
        ("secret-env-assignment", re.compile(rb"(?im)^\s*(?:PASSWORD|PASSWD|SECRET|API_KEY|ACCESS_TOKEN|CLIENT_SECRET)\s*=\s*[^\s#]{8,}")),
        ("service-account", re.compile(rb"(?i)\"type\"\s*:\s*\"service_account\"|\"private_key_id\"\s*:")),
    ]

    def __init__(self) -> None:
        self.findings: list[dict[str, Any]] = []

    def _finding(self, path: str, category: str, rule: str, count: int = 1) -> None:
        self.findings.append({"path": path, "category": category, "rule": rule, "count": count})

    def filename_denied(self, relative: str) -> Optional[str]:
        name = pathlib.PurePosixPath(relative).name.lower()
        parts = [part.lower() for part in pathlib.PurePosixPath(relative).parts]
        if name.startswith(".env"):
            return "dotenv"
        if name in self.DENIED_EXACT or any(name.endswith(suffix) for suffix in self.DENIED_SUFFIXES):
            return "credential-filename"
        joined = "/".join(parts)
        if any(term in name for term in ("credential", "cookie")):
            return "credential-filename"
        if ("auth" in name or "session" in name) and any(name.endswith(s) for s in (".db", ".sqlite", ".sqlite3")):
            return "auth-session-database"
        if "doctl" in joined and name in {"config.yaml", "config.yml"}:
            return "doctl-config"
        if "appstoreconnect" in joined or ("release" in joined and name.endswith(".conf")):
            return "release-credential-config"
        return None

    def scan_data(self, relative: str, data: bytes, *, approved_binary: bool = False) -> None:
        denied = self.filename_denied(relative)
        if denied:
            self._finding(relative, "secret", denied)
            return
        if b"\x00" in data[:8192]:
            if approved_binary or pathlib.PurePosixPath(relative).suffix.lower() in self.BINARY_SUFFIXES:
                return
            self._finding(relative, "unknown", "unapproved-binary")
            return
        for rule, pattern in self.CONTENT_RULES:
            count = len(pattern.findall(data))
            if count:
                self._finding(relative, "secret", rule, count)
        database_url = re.compile(rb"(?i)\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?)://([^\s/:]+):([^\s/@]+)@([^\s/:]+)")
        placeholders = {b"user", b"password", b"pass", b"test", b"testuser", b"testpassword", b"postgres",
                        b"local", b"sandbox", b"example", b"placeholder", b"not-a-secret"}
        unsafe_urls = 0
        for match in database_url.finditer(data):
            user, password, host = (item.lower() for item in match.groups())
            local_host = host in {b"localhost", b"127.0.0.1", b"::1", b"db", b"postgres"} or host.endswith(b".invalid")
            explicit_placeholders = user in placeholders and password in placeholders
            local_test_fixture = (".test." in relative.lower() and local_host and len(user) <= 32 and len(password) <= 32
                                  and entropy(user.decode("ascii", "ignore")) < 3.8
                                  and entropy(password.decode("ascii", "ignore")) < 3.8)
            if not (local_host and explicit_placeholders) and not local_test_fixture:
                unsafe_urls += 1
        if unsafe_urls:
            self._finding(relative, "secret", "credential-db-url", unsafe_urls)
        text = data.decode("utf-8", errors="ignore")
        candidate_pattern = re.compile(r"(?i)(?:token|secret|password|api[_-]?key)\s*[:=]\s*['\"]?([A-Za-z0-9_+/.=-]{24,})")
        for match in candidate_pattern.finditer(text):
            candidate = match.group(1)
            if re.fullmatch(r"[0-9a-f]{40}|[0-9a-f]{64}", candidate, re.I):
                continue
            if entropy(candidate) >= 4.2:
                self._finding(relative, "secret", "high-entropy-assignment")

    def scan_file(self, path: pathlib.Path, relative: str, *, approved_binary: bool = False) -> None:
        try:
            mode = path.lstat().st_mode
            if not stat.S_ISREG(mode):
                self._finding(relative, "unknown", "non-regular-file")
                return
            if path.stat().st_size > SMALL_GENERATION_CEILING:
                self._finding(relative, "unknown", "oversize-file")
                return
            self.scan_data(relative, path.read_bytes(), approved_binary=approved_binary)
        except OSError:
            self._finding(relative, "scanner-error", "read-error")

    def outcome(self) -> str:
        if any(item["category"] == "scanner-error" for item in self.findings):
            return "FAIL_SCANNER_ERROR"
        if any(item["category"] == "secret" for item in self.findings):
            return "FAIL_SECRET"
        if self.findings:
            return "FAIL_UNKNOWN_FILE"
        return "PASS"

    def require_pass(self) -> None:
        result = self.outcome()
        if result != "PASS":
            raise GateFailure(result, "secret scanner blocked promotion", self.findings)


def approved_untracked(path: pathlib.Path, config: dict[str, Any]) -> tuple[bool, str]:
    target = str(path.resolve(strict=False))
    for rule in config.get("untracked_allowlist", []):
        exact = str(expand(rule["path"])) if "path" in rule else None
        pattern = str(expand(rule["path_glob"])) if "path_glob" in rule else None
        if (exact and target == exact) or (pattern and fnmatch.fnmatch(target, pattern)):
            suffixes = {item.lower() for item in rule.get("extensions", [])}
            if suffixes and path.suffix.lower() not in suffixes:
                return False, "extension-not-allowed"
            try:
                if path.lstat().st_size > int(rule["max_bytes"]):
                    return False, "size-not-allowed"
            except OSError:
                return False, "unreadable"
            return True, "explicit-allowlist"
    return False, "path-not-allowed"


def ensure_regular_no_escape(path: pathlib.Path, root: pathlib.Path) -> None:
    mode = path.lstat().st_mode
    if stat.S_ISLNK(mode):
        destination = (path.parent / os.readlink(path)).resolve(strict=False)
        try:
            destination.relative_to(root.resolve())
        except ValueError as exc:
            raise GateFailure("FAIL_UNKNOWN_FILE", "symlink escape blocked",
                              [{"path": display_path(path), "category": "unknown", "rule": "symlink-escape", "count": 1}]) from exc
    elif not stat.S_ISREG(mode):
        raise GateFailure("FAIL_UNKNOWN_FILE", "special file blocked",
                          [{"path": display_path(path), "category": "unknown", "rule": "special-file", "count": 1}])


def git(args: list[str], *, git_dir: Optional[pathlib.Path] = None, cwd: Optional[pathlib.Path] = None,
        data: Optional[bytes] = None, timeout: int = 60, check: bool = True) -> subprocess.CompletedProcess[bytes]:
    command = ["/usr/bin/git"]
    if git_dir:
        command.extend(["--git-dir", str(git_dir)])
    command.extend(args)
    return run(command, cwd=cwd, data=data, timeout=timeout, check=check)


def ref_lines(git_dir: pathlib.Path, prefix: str) -> list[tuple[str, str]]:
    result = git(["for-each-ref", "--format=%(refname)%00%(objectname)", prefix], git_dir=git_dir)
    answer: list[tuple[str, str]] = []
    for line in result.stdout.splitlines():
        if b"\x00" not in line:
            continue
        ref, sha = line.split(b"\x00", 1)
        answer.append((ref.decode("utf-8", "surrogateescape"), sha.decode("ascii")))
    return answer


def database_id(index: int, path: pathlib.Path) -> str:
    tail = re.sub(r"[^A-Za-z0-9._-]+", "-", path.parent.name or "repo").strip("-")
    return f"db{index:02d}-{tail[:32] or 'repo'}"


def parse_worktrees(common_dir: pathlib.Path) -> list[dict[str, Any]]:
    result = git(["worktree", "list", "--porcelain"], git_dir=common_dir, timeout=15)
    records: list[dict[str, Any]] = []
    current: dict[str, Any] = {}
    for raw in result.stdout.decode("utf-8", "surrogateescape").splitlines() + [""]:
        if not raw:
            if current:
                records.append(current)
                current = {}
            continue
        key, _, value = raw.partition(" ")
        if key == "worktree":
            current["path"] = value
        elif key == "HEAD":
            current["head"] = value
        elif key == "branch":
            current["branch"] = value.removeprefix("refs/heads/")
        elif key in {"detached", "locked", "prunable", "bare"}:
            current[key] = value or True
    return records


def is_reachable(aggregator: pathlib.Path, sha: str, authorities: list[str]) -> bool:
    del authorities  # authority namespaces are fixed below and freshly fetched.
    result = git(["for-each-ref", "--contains", sha, "--format=%(refname)",
                  "refs/remotes/origin/", "refs/tags/"], git_dir=aggregator, check=False)
    if result.returncode != 0:
        raise RuntimeError("git reachability check failed")
    return bool(result.stdout.strip())


def scan_unpushed_blobs(aggregator: pathlib.Path, recovery_refs: list[str], authorities: list[str]) -> dict[str, Any]:
    scanner = SecretScanner()
    if not recovery_refs:
        return {"outcome": "PASS", "blob_count": 0, "findings": []}
    revisions = recovery_refs + [f"^{ref}" for ref in authorities]
    result = git(["rev-list", "--objects", "--stdin"], git_dir=aggregator,
                 data=("\n".join(revisions) + "\n").encode("utf-8"), timeout=120)
    seen: set[str] = set()
    for line in result.stdout.splitlines():
        bits = line.split(b" ", 1)
        sha = bits[0].decode("ascii")
        if sha in seen:
            continue
        kind = git(["cat-file", "-t", sha], git_dir=aggregator).stdout.strip()
        if kind != b"blob":
            continue
        seen.add(sha)
        logical = bits[1].decode("utf-8", "surrogateescape") if len(bits) == 2 else f"git-blob/{sha}"
        data = git(["cat-file", "blob", sha], git_dir=aggregator, timeout=30).stdout
        scanner.scan_data(f"git-unpushed/{logical}", data,
                          approved_binary=pathlib.PurePosixPath(logical).suffix.lower() in SecretScanner.BINARY_SUFFIXES)
    scanner.require_pass()
    return {"outcome": scanner.outcome(), "blob_count": len(seen), "findings": scanner.findings}


def build_aggregator(config: dict[str, Any], temp_root: pathlib.Path,
                     *, make_bundle: Optional[pathlib.Path] = None) -> dict[str, Any]:
    aggregator = temp_root / "aggregator.git"
    git(["init", "--bare", str(aggregator)])
    origin = os.environ.get("PHYSIQUEOS_RECOVERY_ORIGIN", config["origin_url"])
    git(["fetch", "--prune", "--no-recurse-submodules", origin,
         "+refs/heads/*:refs/remotes/origin/*", "+refs/tags/*:refs/tags/*"],
        git_dir=aggregator, timeout=180)
    authorities = [ref for ref, _ in ref_lines(aggregator, "refs/remotes/origin/")]
    authorities.extend(ref for ref, _ in ref_lines(aggregator, "refs/tags/"))
    if not authorities:
        raise GateFailure("FAIL_SCANNER_ERROR", "fresh origin supplied no authoritative refs")

    databases: list[dict[str, Any]] = []
    recovery_refs: list[str] = []
    configured = os.environ.get("PHYSIQUEOS_RECOVERY_GIT_DIRS")
    common_dirs = configured.split(os.pathsep) if configured else config["git_common_dirs"]
    for index, raw_path in enumerate(common_dirs, 1):
        common = expand(raw_path)
        if not common.exists():
            databases.append({"path": display_path(common), "state": "ABSENT"})
            continue
        dbid = database_id(index, common)
        try:
            local_heads = ref_lines(common, "refs/heads/")
            candidates: list[tuple[str, str]] = []
            for source_ref, sha in local_heads:
                present = git(["cat-file", "-e", f"{sha}^{{commit}}"], git_dir=aggregator, check=False).returncode == 0
                if present and is_reachable(aggregator, sha, authorities):
                    continue
                candidates.append((source_ref, sha))
            if "/Documents/" in str(common) and candidates:
                # File Provider can deadlock upload-pack even though its object DB is
                # readable. A direct, bounded bundle of only fresh-origin-absent tips
                # avoids every live checkout. The legacy DB is independently bounded
                # by the 100 MiB generation ceiling.
                cache_key = sha256_bytes(canonical_bytes(candidates))[:24]
                cache_dir = cache_home() / "cache" / "git"
                cache_dir.mkdir(parents=True, exist_ok=True)
                source_bundle = cache_dir / f"{dbid}-{cache_key}.bundle"
                if source_bundle.exists():
                    git(["bundle", "verify", str(source_bundle)], git_dir=common, timeout=120)
                else:
                    temporary_bundle = temp_root / f"{dbid}-{cache_key}.building.bundle"
                    git(["bundle", "create", str(temporary_bundle), *[ref for ref, _ in candidates]],
                        git_dir=common, timeout=600)
                    git(["bundle", "verify", str(temporary_bundle)], git_dir=common, timeout=120)
                    os.replace(temporary_bundle, source_bundle)
                git(["fetch", "--no-tags", str(source_bundle),
                     f"+refs/heads/*:refs/source/{dbid}/heads/*"], git_dir=aggregator, timeout=120)
            else:
                # Do not fetch every local ref: fresh origin already supplies all
                # reachable objects, so import only tips absent from its authority.
                for source_ref, sha in candidates:
                    suffix = source_ref.removeprefix("refs/heads/")
                    destination_ref = f"refs/source/{dbid}/heads/{suffix}"
                    if git(["cat-file", "-e", f"{sha}^{{commit}}"], git_dir=aggregator, check=False).returncode == 0:
                        git(["update-ref", destination_ref, sha], git_dir=aggregator)
                    else:
                        git(["fetch", "--no-tags", str(common), f"+{source_ref}:{destination_ref}"],
                            git_dir=aggregator, timeout=90)
            stash_exists = git(["show-ref", "--verify", "--quiet", "refs/stash"], git_dir=common, check=False).returncode == 0
            if stash_exists:
                git(["fetch", "--no-tags", str(common), f"+refs/stash:refs/source/{dbid}/stash"],
                    git_dir=aggregator, timeout=120)
            source_refs = ref_lines(aggregator, f"refs/source/{dbid}/")
            local_refs: list[dict[str, Any]] = []
            for ref, sha in source_refs:
                if is_reachable(aggregator, sha, authorities):
                    continue
                suffix = ref.split(f"refs/source/{dbid}/", 1)[1]
                recovery = f"refs/recovery/{dbid}/{suffix}"
                git(["update-ref", recovery, sha], git_dir=aggregator)
                recovery_refs.append(recovery)
                local_refs.append({"source_ref": ref.replace(f"refs/source/{dbid}/", ""),
                                   "recovery_ref": recovery, "sha": sha})
            worktrees = parse_worktrees(common)
            databases.append({"id": dbid, "path": display_path(common), "state": "PRESENT",
                              "worktree_count": len(worktrees), "worktrees": worktrees,
                              "local_refs": local_refs, "stash_present": stash_exists})
        except RuntimeError as exc:
            raise GateFailure("FAIL_SCANNER_ERROR", f"Git database inventory failed: {display_path(common)}") from exc

    blob_scan = scan_unpushed_blobs(aggregator, recovery_refs, authorities)
    if make_bundle:
        make_bundle.parent.mkdir(parents=True, exist_ok=True)
        if recovery_refs:
            revisions = recovery_refs + [f"^{ref}" for ref in authorities]
            git(["bundle", "create", str(make_bundle), "--stdin"], git_dir=aggregator,
                data=("\n".join(revisions) + "\n").encode("utf-8"), timeout=180)
            git(["bundle", "verify", str(make_bundle)], git_dir=aggregator, timeout=120)
        else:
            write_json(make_bundle.with_suffix(".empty.json"), {"reason": "no local-only refs"})
    return {"origin": origin, "origin_ref_count": len(authorities), "databases": databases,
            "recovery_refs": recovery_refs, "local_ref_count": len(recovery_refs), "git_blob_scan": blob_scan}


def store_object(objects: pathlib.Path, data: bytes) -> dict[str, Any]:
    digest = sha256_bytes(data)
    destination = objects / digest[:2] / digest
    destination.parent.mkdir(parents=True, exist_ok=True)
    if not destination.exists():
        destination.write_bytes(data)
        destination.chmod(0o600)
    return {"sha256": digest, "bytes": len(data), "object": destination.relative_to(objects.parent.parent).as_posix()}


def capture_path(path: pathlib.Path, worktree: pathlib.Path, objects: pathlib.Path,
                 scanner: SecretScanner, logical: str) -> dict[str, Any]:
    mode = path.lstat().st_mode
    record: dict[str, Any] = {"path": logical, "mode": format(stat.S_IMODE(mode), "04o")}
    if stat.S_ISLNK(mode):
        target = os.readlink(path)
        destination = (path.parent / target).resolve(strict=False)
        try:
            destination.relative_to(worktree.resolve())
        except ValueError as exc:
            raise GateFailure("FAIL_UNKNOWN_FILE", "symlink escape blocked",
                              [{"path": logical, "category": "unknown", "rule": "symlink-escape", "count": 1}]) from exc
        data = target.encode("utf-8", "surrogateescape")
        record.update({"kind": "symlink", "target": target})
    elif stat.S_ISREG(mode):
        data = path.read_bytes()
        record["kind"] = "file"
    else:
        raise GateFailure("FAIL_UNKNOWN_FILE", "special file blocked",
                          [{"path": logical, "category": "unknown", "rule": "special-file", "count": 1}])
    scanner.scan_data(logical, data, approved_binary=path.suffix.lower() in SecretScanner.BINARY_SUFFIXES)
    record.update(store_object(objects, data))
    return record


def split_z(data: bytes) -> list[str]:
    return [item.decode("utf-8", "surrogateescape") for item in data.split(b"\x00") if item]


def capture_dirty_worktrees(git_inventory: dict[str, Any], config: dict[str, Any], destination: pathlib.Path) -> dict[str, Any]:
    objects = destination / "objects"
    destination.mkdir(parents=True, exist_ok=True)
    scanner = SecretScanner()
    records: list[dict[str, Any]] = []
    unknown: list[dict[str, Any]] = []
    seen_paths: set[str] = set()
    for database in git_inventory["databases"]:
        if database.get("state") != "PRESENT":
            continue
        for worktree_item in database.get("worktrees", []):
            raw_path = worktree_item.get("path")
            if not raw_path or raw_path in seen_paths:
                continue
            seen_paths.add(raw_path)
            worktree = pathlib.Path(raw_path)
            if not worktree.is_dir():
                continue
            try:
                status = git(["status", "--porcelain=v2", "-z"], cwd=worktree, timeout=8, check=False)
            except RuntimeError:
                unknown.append({"path": display_path(worktree), "state": "UNKNOWN_FILE_PROVIDER_OR_TIMEOUT"})
                continue
            if status.returncode != 0:
                unknown.append({"path": display_path(worktree), "state": "UNKNOWN_FILE_PROVIDER_OR_TIMEOUT"})
                continue
            if not status.stdout:
                records.append({"path": display_path(worktree), "head": worktree_item.get("head"), "state": "CLEAN"})
                continue
            tracked = split_z(git(["diff", "--name-only", "-z", "HEAD", "--"], cwd=worktree, timeout=15).stdout)
            staged = split_z(git(["diff", "--cached", "--name-only", "-z", "--"], cwd=worktree, timeout=15).stdout)
            untracked = split_z(git(["ls-files", "--others", "--exclude-standard", "-z"], cwd=worktree, timeout=15).stdout)
            entry: dict[str, Any] = {
                "path": display_path(worktree), "head": worktree_item.get("head"), "state": "DIRTY",
                "status_porcelain_v2_z_b64": base64.b64encode(status.stdout).decode("ascii"),
                "status_sha256": sha256_bytes(status.stdout), "tracked": [], "index": [], "untracked": [],
            }
            worktree_key = sha256_bytes(str(worktree).encode())[:16]
            patch_dir = destination / "patches" / worktree_key
            patch_dir.mkdir(parents=True, exist_ok=True)
            staged_patch = git(["diff", "--cached", "--binary", "--full-index", "--no-ext-diff", "--"], cwd=worktree, timeout=30).stdout
            unstaged_patch = git(["diff", "--binary", "--full-index", "--no-ext-diff", "--"], cwd=worktree, timeout=30).stdout
            (patch_dir / "staged.patch").write_bytes(staged_patch)
            (patch_dir / "unstaged.patch").write_bytes(unstaged_patch)
            entry["staged_patch"] = safe_rel(patch_dir / "staged.patch", destination.parent)
            entry["unstaged_patch"] = safe_rel(patch_dir / "unstaged.patch", destination.parent)
            for relative in tracked:
                path = worktree / relative
                if os.path.lexists(path):
                    entry["tracked"].append(capture_path(path, worktree, objects, scanner, relative))
                else:
                    entry["tracked"].append({"path": relative, "kind": "deleted"})
            for relative in staged:
                stage_line = git(["ls-files", "-s", "-z", "--", relative], cwd=worktree).stdout.split(b"\x00", 1)[0]
                if not stage_line:
                    entry["index"].append({"path": relative, "kind": "deleted"})
                    continue
                meta, _ = stage_line.split(b"\t", 1)
                mode_text, object_sha, stage_number = meta.decode("ascii").split(" ")
                blob = git(["show", f":{relative}"], cwd=worktree).stdout
                scanner.scan_data(relative, blob,
                                  approved_binary=pathlib.PurePosixPath(relative).suffix.lower() in SecretScanner.BINARY_SUFFIXES)
                object_record = store_object(objects, blob)
                entry["index"].append({"path": relative, "mode": mode_text, "git_object": object_sha,
                                       "stage": stage_number, **object_record})
            for relative in untracked:
                path = worktree / relative
                allowed, rule = approved_untracked(path, config)
                if not allowed:
                    raise GateFailure("FAIL_UNKNOWN_FILE", "untracked file not allowlisted",
                                      [{"path": display_path(path), "category": "unknown", "rule": rule, "count": 1}])
                ensure_regular_no_escape(path, worktree)
                item = capture_path(path, worktree, objects, scanner, relative)
                item["allowlist"] = rule
                entry["untracked"].append(item)
            records.append(entry)
    scanner.require_pass()
    result = {"worktrees": records, "unknown_worktrees": unknown, "scanner": {"outcome": "PASS", "findings": []}}
    write_json(destination / "inventory.json", result)
    return result


def forbidden_key_names(value: Any, prefix: str = "") -> list[str]:
    bad: list[str] = []
    if isinstance(value, dict):
        for key, child in value.items():
            logical = f"{prefix}.{key}" if prefix else str(key)
            lowered = str(key).lower()
            if any(term in lowered for term in ("password", "secret", "token", "private_key", "authorization", "database_url")):
                bad.append(logical)
            bad.extend(forbidden_key_names(child, logical))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            bad.extend(forbidden_key_names(child, f"{prefix}[{index}]"))
    return bad


def copy_safe_artifacts(config: dict[str, Any], generation: pathlib.Path) -> dict[str, Any]:
    scanner = SecretScanner()
    tool_root = generation / "tool-inventory"
    release_root = generation / "release-inventory"
    copied: list[dict[str, Any]] = []
    for raw in config.get("safe_release_sources", []):
        source = expand(raw)
        if not source.is_file():
            continue
        relative = f"safe-tools/{source.name}"
        data = source.read_bytes()
        scanner.scan_data(relative, data)
        destination = tool_root / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
        destination.chmod(stat.S_IMODE(source.stat().st_mode))
        copied.append({"source": display_path(source), "path": safe_rel(destination, generation),
                       "sha256": sha256_bytes(data), "bytes": len(data)})

    receipt_source = pathlib.Path.home() / ".physiqueos-release" / "logs"
    receipts: list[dict[str, Any]] = []
    if receipt_source.is_dir():
        for source in sorted(receipt_source.glob("receipt-b*.json")):
            try:
                value = read_json(source)
            except (OSError, ValueError):
                raise GateFailure("FAIL_SCANNER_ERROR", f"release receipt schema invalid: {source.name}")
            if not isinstance(value, dict) or forbidden_key_names(value):
                raise GateFailure("FAIL_SECRET", f"release receipt contains forbidden fields: {source.name}",
                                  [{"path": source.name, "category": "secret", "rule": "forbidden-receipt-field", "count": 1}])
            data = canonical_bytes(value)
            scanner.scan_data(f"receipts/{source.name}", data)
            destination = release_root / "receipts" / source.name
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(data)
            receipts.append({"path": safe_rel(destination, generation), "sha256": sha256_bytes(data)})
    last_build = pathlib.Path.home() / ".physiqueos-release" / "state" / "last-uploaded-build"
    if last_build.is_file():
        text = last_build.read_text(encoding="utf-8").strip()
        if not re.fullmatch(r"[0-9]{1,6}", text):
            raise GateFailure("FAIL_SCANNER_ERROR", "last-uploaded-build state invalid")
        destination = release_root / "last-uploaded-build"
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(text + "\n", encoding="utf-8")

    versions: dict[str, str] = {}
    version_commands = {
        "macos": ["/usr/bin/sw_vers", "-productVersion"],
        "xcode": ["/usr/bin/xcodebuild", "-version"],
        "swift": ["/usr/bin/swift", "--version"],
        "node": ["/usr/bin/env", "node", "--version"],
        "npm": ["/usr/bin/env", "npm", "--version"],
        "python3": ["/usr/bin/python3", "--version"],
        "doctl": ["/usr/bin/env", "doctl", "version"],
    }
    for name, command in version_commands.items():
        result = run(command, check=False, timeout=10)
        output = (result.stdout or result.stderr).decode("utf-8", "replace").strip().splitlines()
        versions[name] = output[0][:200] if result.returncode == 0 and output else "unavailable"

    contexts: list[str] = []
    doctl = shutil.which("doctl")
    if doctl:
        result = run([doctl, "auth", "list"], check=False, timeout=10)
        if result.returncode == 0:
            for line in result.stdout.decode("utf-8", "replace").splitlines()[1:]:
                bits = line.split()
                if bits:
                    contexts.append(bits[0].lstrip("*"))

    signing: dict[str, Any] = {"identities": [], "provisioning_profile_count": 0, "private_keys_exported": False}
    security = pathlib.Path("/usr/bin/security")
    if security.exists():
        result = run([str(security), "find-identity", "-v", "-p", "codesigning"], check=False, timeout=15)
        for line in result.stdout.decode("utf-8", "replace").splitlines():
            match = re.search(r"\b([0-9A-F]{40})\b\s+\"([^\"]+)\"", line)
            if match:
                signing["identities"].append({"fingerprint_sha1": match.group(1), "name": match.group(2)})
    profile_dir = pathlib.Path.home() / "Library" / "Developer" / "Xcode" / "UserData" / "Provisioning Profiles"
    if profile_dir.is_dir():
        signing["provisioning_profile_count"] = sum(1 for item in profile_dir.iterdir() if item.is_file())

    launch_names: list[str] = []
    launch_dir = pathlib.Path.home() / "Library" / "LaunchAgents"
    if launch_dir.is_dir():
        launch_names = sorted(item.name for item in launch_dir.glob("*.plist") if "physique" in item.name.lower())

    inventory = {"schema_version": SCHEMA_VERSION, "captured_at": iso_utc(), "copied_safe_tools": copied,
                 "receipt_count": len(receipts), "tool_versions": versions, "doctl_context_names": sorted(set(contexts)),
                 "signing_metadata": signing, "launch_service_names": launch_names,
                 "excluded": ["credential configs", "keychains/private keys", "auth sessions", "production-read runtime bundles"]}
    write_json(tool_root / "inventory.json", inventory)
    scanner.scan_data("tool-inventory/inventory.json", canonical_bytes(inventory))
    scanner.require_pass()
    return inventory


def archive_inventory(config: dict[str, Any]) -> list[dict[str, Any]]:
    selected: list[dict[str, Any]] = []
    expected = {(str(item["build"]), str(item["version"])) for item in config["archive_builds"]}
    if expected != {("84", "1.0"), ("83", "1.0")}:
        raise GateFailure("FAIL_UNKNOWN_FILE", "archive selection must be exactly Build 84 and Build 83")
    for item in config["archive_builds"]:
        path = expand(item["path"])
        info_path = path / "Info.plist"
        if not info_path.is_file():
            raise GateFailure("FAIL_UNKNOWN_FILE", f"selected archive missing: {display_path(path)}")
        try:
            info = plistlib.loads(info_path.read_bytes())
            properties = info["ApplicationProperties"]
            build = str(properties["CFBundleVersion"])
            version = str(properties["CFBundleShortVersionString"])
        except (KeyError, ValueError, plistlib.InvalidFileException) as exc:
            raise GateFailure("FAIL_SCANNER_ERROR", "archive identity could not be parsed") from exc
        if build != str(item["build"]) or version != str(item["version"]):
            raise GateFailure("FAIL_UNKNOWN_FILE", f"archive identity drift for Build {item['build']}")
        file_count = 0
        byte_count = 0
        embedded_profiles = 0
        private_key_files = 0
        for root, dirs, files in os.walk(path):
            dirs[:] = [name for name in dirs if name not in {"DerivedData", "DeviceSupport", "CoreSimulator", "node_modules"}]
            for name in files:
                source = pathlib.Path(root) / name
                mode = source.lstat().st_mode
                if not stat.S_ISREG(mode) and not stat.S_ISLNK(mode):
                    raise GateFailure("FAIL_UNKNOWN_FILE", "special file inside archive")
                file_count += 1
                if stat.S_ISREG(mode):
                    byte_count += source.stat().st_size
                if name.lower().endswith(".mobileprovision"):
                    embedded_profiles += 1
                if name.lower().endswith((".p8", ".p12", ".key", ".keychain", ".keychain-db")):
                    private_key_files += 1
        if private_key_files:
            raise GateFailure("FAIL_SECRET", "private-key-like file found in selected archive")
        selected.append({"build": build, "version": version, "role": item["role"], "path": display_path(path),
                         "file_count": file_count, "bytes": byte_count, "embedded_profile_count": embedded_profiles,
                         "private_key_file_count": 0})
    return selected


RESTORE_README = """# PhysiqueOS replacement-Mac recovery

This bundle contains local-only Git refs and explicitly approved working state. It contains no credentials.

1. Founder: sign in to Apple ID/iCloud with 2FA and let `iCloud Drive/PhysiqueOS Backups` download.
2. Install Xcode and its command-line tools. Clone the current GitHub `main` into a normal local developer folder (never inside iCloud Drive).
3. Verify this generation with `physiqueos-recovery verify --source <generation>` before restoring anything.
4. In the fresh clone, run `git bundle verify <generation>/git/local-only.bundle`, then fetch its `refs/recovery/*` namespace. Review and create named branches; do not force-update GitHub refs.
5. Use `local-state/inventory.json` plus the content-addressed objects and binary patches to reconstruct each dirty checkout in separate scratch worktrees. Never overlay an active checkout without review.
6. Restore only the guarded scripts under `tool-inventory/safe-tools`; recreate all configs and credentials manually.
7. Run `ios/Scripts/generate_project.py`; generated project output must match Git.
8. Founder: separately authenticate GitHub, DigitalOcean, App Store Connect/Xcode signing, and Claude Remote Control. Recreate or import a signing identity through Apple's supported process. Never restore old auth/session directories.
9. Reinstall the scheduler only after a scratch restore test passes.

`LOCAL_ICLOUD_CONTAINER_COMPLETE` and Foundation upload metadata are not independent proof that bytes are durable off-device. Confirm `REMOTE_ICLOUD_SYNC_CONFIRMED` from a distinct iCloud session/device.
"""


def files_for_checksum(root: pathlib.Path) -> list[pathlib.Path]:
    answer: list[pathlib.Path] = []
    for path in root.rglob("*"):
        if path.is_file() and safe_rel(path, root) not in {"checksums/SHA256SUMS.json", "COMPLETE"}:
            answer.append(path)
    return sorted(answer, key=lambda item: safe_rel(item, root))


def write_checksums(root: pathlib.Path) -> dict[str, Any]:
    records = [{"path": safe_rel(path, root), "sha256": sha256_file(path), "bytes": path.stat().st_size,
                "mode": file_mode(path)} for path in files_for_checksum(root)]
    document = {"schema_version": SCHEMA_VERSION, "algorithm": "sha256", "files": records}
    write_json(root / "checksums" / "SHA256SUMS.json", document)
    return document


def scan_generation(root: pathlib.Path) -> dict[str, Any]:
    scanner = SecretScanner()
    scan_map: dict[str, list[str]] = {}
    inventory_path = root / "local-state" / "inventory.json"
    if inventory_path.is_file():
        inventory = read_json(inventory_path)
        for worktree in inventory.get("worktrees", []):
            for group in ("tracked", "index", "untracked"):
                for item in worktree.get(group, []):
                    if "object" in item:
                        scan_map.setdefault(item["object"], []).append(item["path"])
    for object_path, logical_paths in scan_map.items():
        path = root / object_path
        if not path.is_file():
            scanner._finding(object_path, "scanner-error", "missing-content-object")
            continue
        data = path.read_bytes()
        for logical in sorted(set(logical_paths)):
            scanner.scan_data(logical, data,
                              approved_binary=pathlib.PurePosixPath(logical).suffix.lower() in SecretScanner.BINARY_SUFFIXES)
    for path in root.rglob("*"):
        if not path.is_file() or path.name == "COMPLETE":
            continue
        relative = safe_rel(path, root)
        if relative in scan_map:
            continue
        logical = relative
        approved_binary = pathlib.PurePosixPath(logical).suffix.lower() in SecretScanner.BINARY_SUFFIXES
        if relative.startswith("local-state/objects/"):
            scanner._finding(relative, "unknown", "unreferenced-content-object")
            continue
        scanner.scan_file(path, logical, approved_binary=approved_binary)
    scanner.require_pass()
    return {"outcome": "PASS", "findings": [], "scanned_file_count": len(files_for_checksum(root))}


def generation_size(root: pathlib.Path) -> int:
    return sum(path.stat().st_size for path in root.rglob("*") if path.is_file())


def build_generation(config: dict[str, Any], reason: str) -> pathlib.Path:
    home = runtime_home()
    (home / "staging").mkdir(parents=True, exist_ok=True)
    (home / "generations").mkdir(parents=True, exist_ok=True)
    gen_id = generation_id()
    building = home / "staging" / f".{gen_id}.building-{uuid.uuid4().hex}"
    final = home / "generations" / gen_id
    if final.exists():
        raise GateFailure("FAIL_SCANNER_ERROR", "generation id collision")
    building.mkdir(parents=True)
    temp_git = home / "staging" / f".git-{uuid.uuid4().hex}"
    temp_git.mkdir(parents=True)
    stage = "git-aggregation"
    try:
        git_inventory = build_aggregator(config, temp_git, make_bundle=building / "git" / "local-only.bundle")
        stage = "dirty-state-capture"
        dirty = capture_dirty_worktrees(git_inventory, config, building / "local-state")
        stage = "safe-artifact-inventory"
        safe_tools = copy_safe_artifacts(config, building)
        stage = "archive-inventory"
        archives = archive_inventory(config)
        write_json(building / "release-inventory" / "archive-selection.json", archives)
        (building / "README-RESTORE.md").write_text(RESTORE_README, encoding="utf-8")
        manifest = {
            "schema_version": SCHEMA_VERSION,
            "tool_version": TOOL_VERSION,
            "generation_id": gen_id,
            "source_time": iso_utc(),
            "reason": reason,
            "states": {
                "local_validation": "PENDING",
                "icloud_local_copy": "NOT_STARTED",
                "icloud_upload_reported": "UNKNOWN",
                "independent_remote_confirmation": "REMOTE_ICLOUD_SYNC_UNKNOWN",
            },
            "git": git_inventory,
            "dirty_state": {"dirty_worktree_count": sum(1 for item in dirty["worktrees"] if item["state"] == "DIRTY"),
                            "unknown_worktrees": dirty["unknown_worktrees"]},
            "safe_artifacts": {"tool_count": len(safe_tools["copied_safe_tools"]),
                               "receipt_count": safe_tools["receipt_count"]},
            "archive_selection": archives,
            "exclusions": ["active repositories/worktrees", "credentials", "keychains/private keys", "auth sessions",
                           "raw production/health exports", "DerivedData", "simulators", "node_modules", "caches"],
        }
        write_json(building / "MANIFEST.json", manifest)
        stage = "pre-promotion-secret-scan"
        initial_scan = scan_generation(building)
        size = generation_size(building)
        if size > SMALL_GENERATION_CEILING:
            raise GateFailure("FAIL_UNKNOWN_FILE", "small generation exceeds 100 MiB review ceiling",
                              [{"path": gen_id, "category": "unknown", "rule": "generation-size-ceiling", "count": 1}])
        manifest["states"]["local_validation"] = "PASS"
        manifest["secret_scan"] = initial_scan
        manifest["size_bytes_before_checksums"] = size
        write_json(building / "MANIFEST.json", manifest)
        stage = "checksums"
        checksums = write_checksums(building)
        complete = {"schema_version": SCHEMA_VERSION, "generation_id": gen_id, "completed_at": iso_utc(),
                    "manifest_sha256": sha256_file(building / "MANIFEST.json"),
                    "checksums_sha256": sha256_file(building / "checksums" / "SHA256SUMS.json"),
                    "file_count": len(checksums["files"])}
        write_json(building / "COMPLETE", complete)
        stage = "local-verification"
        verify_generation(building)
        os.rename(building, final)
        update_state({"latest_generation": gen_id, "latest_local_path": str(final), "source_time": manifest["source_time"],
                      "reason": reason, "local_validation": "PASS", "icloud_local_copy": "NOT_STARTED",
                      "icloud_upload_reported": "UNKNOWN", "remote_confirmation": "REMOTE_ICLOUD_SYNC_UNKNOWN",
                      "last_failure": None})
        return final
    except GateFailure:
        if building.exists():
            failed = home / "staging" / f"FAILED-{building.name.lstrip('.')}"
            os.rename(building, failed)
        raise
    except Exception as exc:
        if building.exists():
            failed = home / "staging" / f"FAILED-{building.name.lstrip('.')}"
            os.rename(building, failed)
        raise GateFailure("FAIL_SCANNER_ERROR", f"generation stage failed safely: {stage}") from exc
    finally:
        shutil.rmtree(temp_git, ignore_errors=True)


def verify_generation(root: pathlib.Path) -> dict[str, Any]:
    root = root.resolve()
    required = [root / "MANIFEST.json", root / "README-RESTORE.md", root / "COMPLETE",
                root / "checksums" / "SHA256SUMS.json", root / "local-state" / "inventory.json"]
    if not all(path.is_file() for path in required):
        raise GateFailure("FAIL_UNKNOWN_FILE", "incomplete generation ignored")
    manifest = read_json(root / "MANIFEST.json")
    complete = read_json(root / "COMPLETE")
    checksums = read_json(root / "checksums" / "SHA256SUMS.json")
    if manifest.get("schema_version") != SCHEMA_VERSION or complete.get("generation_id") != manifest.get("generation_id"):
        raise GateFailure("FAIL_SCANNER_ERROR", "manifest schema or COMPLETE marker invalid")
    if canonical_bytes(manifest) != (root / "MANIFEST.json").read_bytes():
        raise GateFailure("FAIL_SCANNER_ERROR", "manifest is not canonical JSON")
    if sha256_file(root / "MANIFEST.json") != complete.get("manifest_sha256"):
        raise GateFailure("FAIL_SCANNER_ERROR", "manifest checksum mismatch")
    if sha256_file(root / "checksums" / "SHA256SUMS.json") != complete.get("checksums_sha256"):
        raise GateFailure("FAIL_SCANNER_ERROR", "checksum manifest mismatch")
    listed: set[str] = set()
    for item in checksums.get("files", []):
        relative = item.get("path", "")
        if not relative or relative.startswith("/") or ".." in pathlib.PurePosixPath(relative).parts:
            raise GateFailure("FAIL_SCANNER_ERROR", "unsafe checksum path")
        path = root / relative
        if not path.is_file() or sha256_file(path) != item.get("sha256") or path.stat().st_size != item.get("bytes"):
            raise GateFailure("FAIL_SCANNER_ERROR", f"checksum mismatch: {relative}")
        listed.add(relative)
    actual = {safe_rel(path, root) for path in files_for_checksum(root)}
    if listed != actual:
        raise GateFailure("FAIL_SCANNER_ERROR", "checksum inventory mismatch")
    bundle = root / "git" / "local-only.bundle"
    if bundle.is_file():
        result = git(["bundle", "verify", str(bundle)], cwd=root, check=False, timeout=120)
        if result.returncode != 0:
            # A thin bundle can require GitHub prerequisites; verification is repeated in a fresh clone.
            if b"prerequisite" not in result.stderr.lower() and b"repository" not in result.stderr.lower():
                raise GateFailure("FAIL_SCANNER_ERROR", "Git bundle verification failed")
    final_scan = scan_generation(root)
    return {"generation_id": manifest["generation_id"], "manifest_sha256": sha256_file(root / "MANIFEST.json"),
            "size_bytes": generation_size(root), "secret_scan": final_scan, "checksum_count": len(listed)}


def restore_object(generation: pathlib.Path, item: dict[str, Any], destination: pathlib.Path) -> None:
    source = generation / item["object"]
    data = source.read_bytes()
    destination.parent.mkdir(parents=True, exist_ok=True)
    if item.get("kind") == "symlink":
        if os.path.lexists(destination):
            destination.unlink()
        os.symlink(data.decode("utf-8", "surrogateescape"), destination)
    else:
        destination.write_bytes(data)
        os.chmod(destination, int(item.get("mode", "0644"), 8))


def normalized_status(cwd: pathlib.Path) -> bytes:
    return git(["status", "--porcelain=v2", "-z"], cwd=cwd, timeout=30).stdout


def restore_smoke_test(generation: pathlib.Path, *, keep_scratch: bool = False) -> dict[str, Any]:
    stage = "generation-verification"
    verification = verify_generation(generation)
    manifest = read_json(generation / "MANIFEST.json")
    home = runtime_home()
    scratch_parent = home / "restore-tests"
    scratch_parent.mkdir(parents=True, exist_ok=True)
    scratch = pathlib.Path(tempfile.mkdtemp(prefix=f"{manifest['generation_id']}-", dir=scratch_parent))
    origin = os.environ.get("PHYSIQUEOS_RECOVERY_ORIGIN", manifest["git"]["origin"])
    restored_dirty = 0
    try:
        stage = "fresh-origin-clone"
        clone = scratch / "repo"
        git(["clone", "--no-checkout", origin, str(clone)], timeout=240)
        bundle = generation / "git" / "local-only.bundle"
        if bundle.is_file():
            stage = "bundle-verify-import"
            git(["bundle", "verify", str(bundle)], cwd=clone, timeout=120)
            git(["fetch", str(bundle), "+refs/recovery/*:refs/recovery/*"], cwd=clone, timeout=180)
            expected_refs = {item["recovery_ref"]: item["sha"] for db in manifest["git"]["databases"]
                             for item in db.get("local_refs", [])}
            for ref, sha in expected_refs.items():
                actual = git(["rev-parse", ref], cwd=clone).stdout.decode().strip()
                if actual != sha:
                    raise GateFailure("FAIL_SCANNER_ERROR", "restored local ref SHA mismatch")
            git_dir = clone / ".git"
            restored_authorities = [ref for ref, _ in ref_lines(git_dir, "refs/remotes/origin/")]
            restored_authorities.extend(ref for ref, _ in ref_lines(git_dir, "refs/tags/"))
            restored_recovery_refs = [ref for ref, _ in ref_lines(git_dir, "refs/recovery/")]
            stage = "restored-git-secret-scan"
            scan_unpushed_blobs(git_dir, restored_recovery_refs, restored_authorities)

        stage = "dirty-state-reconstruction"
        dirty_inventory = read_json(generation / "local-state" / "inventory.json")
        for index, entry in enumerate(item for item in dirty_inventory["worktrees"] if item["state"] == "DIRTY"):
            worktree = scratch / f"dirty-{index:02d}"
            git(["worktree", "add", "--detach", str(worktree), entry["head"]], cwd=clone, timeout=120)
            staged_patch = generation / entry["staged_patch"]
            unstaged_patch = generation / entry["unstaged_patch"]
            if staged_patch.stat().st_size:
                git(["apply", "--index", "--binary", str(staged_patch)], cwd=worktree, timeout=120)
            if unstaged_patch.stat().st_size:
                git(["apply", "--binary", str(unstaged_patch)], cwd=worktree, timeout=120)
            for item in entry.get("tracked", []):
                target = worktree / item["path"]
                if item["kind"] == "deleted":
                    if os.path.lexists(target):
                        target.unlink()
                else:
                    restore_object(generation, item, target)
            for item in entry.get("untracked", []):
                restore_object(generation, item, worktree / item["path"])
            for item in entry.get("index", []):
                if item.get("kind") == "deleted":
                    continue
                blob = git(["show", f":{item['path']}"], cwd=worktree).stdout
                if sha256_bytes(blob) != item["sha256"]:
                    raise GateFailure("FAIL_SCANNER_ERROR", "restored index blob mismatch")
            status = normalized_status(worktree)
            if sha256_bytes(status) != entry["status_sha256"]:
                raise GateFailure("FAIL_SCANNER_ERROR", "restored dirty status mismatch")
            for group in ("tracked", "untracked"):
                for item in entry.get(group, []):
                    if item.get("kind") == "deleted":
                        continue
                    target = worktree / item["path"]
                    data = (os.readlink(target).encode("utf-8", "surrogateescape")
                            if target.is_symlink() else target.read_bytes())
                    if sha256_bytes(data) != item["sha256"] or file_mode(target) != item["mode"]:
                        raise GateFailure("FAIL_SCANNER_ERROR", "restored file hash/mode mismatch")
            restored_dirty += 1

        stage = "safe-tool-syntax"
        tools = generation / "tool-inventory" / "safe-tools"
        for path in tools.glob("*") if tools.is_dir() else []:
            data = path.read_bytes()
            first_line = data.splitlines()[0].lower() if data.splitlines() else b""
            if path.suffix == ".py" or (data.startswith(b"#!") and b"python" in first_line):
                try:
                    compile(data, str(path), "exec")
                except SyntaxError as exc:
                    raise GateFailure("FAIL_SCANNER_ERROR", f"safe Python tool syntax failed: {path.name}") from exc
            else:
                interpreter = "/bin/bash" if b"bash" in first_line else "/bin/zsh" if b"zsh" in first_line else "/bin/sh"
                run([interpreter, "-n", str(path)], timeout=30)

        stage = "xcode-project-regeneration"
        generator = clone / "ios" / "Scripts" / "generate_project.py"
        if generator.is_file():
            git(["checkout", "--detach", "refs/remotes/origin/main"], cwd=clone, timeout=120)
            before = git(["status", "--porcelain=v2", "-z"], cwd=clone).stdout
            run(["/usr/bin/python3", str(generator)], cwd=clone, timeout=120)
            after = git(["status", "--porcelain=v2", "-z"], cwd=clone).stdout
            if before != after:
                raise GateFailure("FAIL_SCANNER_ERROR", "Xcode project generator is not deterministic against GitHub main")

        stage = "restored-package-secret-scan"
        scan_generation(generation)
        result = {**verification, "result": "PASS", "source": str(generation),
                  "restored_local_ref_count": manifest["git"]["local_ref_count"],
                  "restored_dirty_worktree_count": restored_dirty, "scratch": str(scratch) if keep_scratch else "removed"}
        return result
    except GateFailure:
        raise
    except Exception as exc:
        raise GateFailure("FAIL_SCANNER_ERROR", f"restore stage failed safely: {stage}") from exc
    finally:
        if not keep_scratch:
            shutil.rmtree(scratch, ignore_errors=True)


def state_path() -> pathlib.Path:
    return runtime_home() / "state" / "status.json"


def read_state() -> dict[str, Any]:
    path = state_path()
    if not path.is_file():
        return {"schema_version": SCHEMA_VERSION, "latest_generation": None, "last_failure": None}
    try:
        return read_json(path)
    except (OSError, ValueError):
        return {"schema_version": SCHEMA_VERSION, "latest_generation": None,
                "last_failure": {"time": iso_utc(), "category": "state-read-error"}}


def update_state(changes: dict[str, Any]) -> None:
    state = read_state()
    state.update(changes)
    state["schema_version"] = SCHEMA_VERSION
    state["updated_at"] = iso_utc()
    path = state_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    write_json(temporary, state)
    os.replace(temporary, path)


def query_icloud_upload(path: pathlib.Path) -> dict[str, Any]:
    helper = SCRIPT_DIR / "physiqueos_recovery_icloud_status.swift"
    if not helper.is_file():
        return {"state": "REMOTE_ICLOUD_SYNC_UNKNOWN", "reason": "foundation-helper-absent"}
    swift = shutil.which("swift")
    if not swift:
        return {"state": "REMOTE_ICLOUD_SYNC_UNKNOWN", "reason": "swift-unavailable"}
    result = run([swift, str(helper), str(path)], check=False, timeout=180)
    if result.returncode != 0:
        return {"state": "REMOTE_ICLOUD_SYNC_UNKNOWN", "reason": "foundation-query-error"}
    try:
        value = json.loads(result.stdout.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return {"state": "REMOTE_ICLOUD_SYNC_UNKNOWN", "reason": "foundation-query-invalid"}
    return value


def classify_icloud_metadata(file_count: int, uploaded: int, uploading: int,
                              errors: int, unavailable: int) -> str:
    if file_count > 0 and uploaded == file_count and uploading == 0 and errors == 0 and unavailable == 0:
        return "ICLOUD_UPLOAD_REPORTED_COMPLETE"
    if errors:
        return "ICLOUD_UPLOAD_ERROR"
    return "REMOTE_ICLOUD_SYNC_UNKNOWN"


def copy_tree_exact(source: pathlib.Path, destination: pathlib.Path) -> None:
    if destination.exists():
        raise GateFailure("FAIL_UNKNOWN_FILE", "copy destination already exists")
    shutil.copytree(source, destination, symlinks=True, copy_function=shutil.copy2)


def publish_icloud(source: pathlib.Path) -> dict[str, Any]:
    verification = verify_generation(source)
    root = icloud_root()
    cloud_docs = root.parent
    if not cloud_docs.is_dir():
        raise GateFailure("FAIL_UNKNOWN_FILE", "iCloud Drive root unavailable")
    root.mkdir(parents=True, exist_ok=True)
    generation_root = root / "generations"
    generation_root.mkdir(exist_ok=True)
    final = generation_root / source.name
    if final.exists():
        raise GateFailure("FAIL_UNKNOWN_FILE", "iCloud generation already exists")
    incoming = generation_root / f".incoming-{source.name}-{uuid.uuid4().hex}"
    copy_tree_exact(source, incoming)
    copied = verify_generation(incoming)
    if copied["manifest_sha256"] != verification["manifest_sha256"]:
        raise GateFailure("FAIL_SCANNER_ERROR", "iCloud incoming manifest digest mismatch")
    os.rename(incoming, final)
    upload = query_icloud_upload(final)
    upload_state = upload.get("state", "REMOTE_ICLOUD_SYNC_UNKNOWN")
    latest = {
        "schema_version": SCHEMA_VERSION, "generation_id": source.name, "path": f"generations/{source.name}",
        "manifest_sha256": verification["manifest_sha256"], "local_container_completed_at": iso_utc(),
        "local_container_state": "LOCAL_ICLOUD_CONTAINER_COMPLETE",
        "upload_reported_state": upload_state,
        "upload_metadata_checked_at": iso_utc(),
        "independent_remote_confirmation": "REMOTE_ICLOUD_SYNC_UNKNOWN",
    }
    latest_incoming = root / f".incoming-LATEST-{uuid.uuid4().hex}.json"
    write_json(latest_incoming, latest)
    os.replace(latest_incoming, root / "LATEST.json")
    update_state({"latest_generation": source.name, "latest_icloud_path": str(final),
                  "icloud_local_copy": "LOCAL_ICLOUD_CONTAINER_COMPLETE",
                  "icloud_upload_reported": upload_state,
                  "remote_confirmation": "REMOTE_ICLOUD_SYNC_UNKNOWN", "last_failure": None})
    return {"generation_id": source.name, "destination": str(final),
            "local_state": "LOCAL_ICLOUD_CONTAINER_COMPLETE", "upload": upload,
            "independent_remote_confirmation": "REMOTE_ICLOUD_SYNC_UNKNOWN", **copied}


def refresh_icloud_status() -> dict[str, Any]:
    root = icloud_root()
    latest_path = root / "LATEST.json"
    if not latest_path.is_file():
        raise GateFailure("FAIL_UNKNOWN_FILE", "iCloud LATEST.json unavailable")
    latest = read_json(latest_path)
    relative = pathlib.PurePosixPath(str(latest.get("path", "")))
    if not relative.parts or relative.is_absolute() or ".." in relative.parts:
        raise GateFailure("FAIL_SCANNER_ERROR", "unsafe iCloud LATEST path")
    generation = root.joinpath(*relative.parts).resolve()
    try:
        generation.relative_to(root.resolve())
    except ValueError as exc:
        raise GateFailure("FAIL_SCANNER_ERROR", "iCloud LATEST path escaped destination") from exc
    verification = verify_generation(generation)
    if verification["manifest_sha256"] != latest.get("manifest_sha256"):
        raise GateFailure("FAIL_SCANNER_ERROR", "iCloud LATEST manifest mismatch")
    upload = query_icloud_upload(generation)
    state = upload.get("state", "REMOTE_ICLOUD_SYNC_UNKNOWN")
    latest["upload_reported_state"] = state
    latest["upload_metadata_checked_at"] = iso_utc()
    temporary = root / f".incoming-LATEST-refresh-{uuid.uuid4().hex}.json"
    write_json(temporary, latest)
    os.replace(temporary, latest_path)
    update_state({"icloud_upload_reported": state, "icloud_upload_metadata": upload})
    return {"generation_id": latest["generation_id"], "upload": upload,
            "independent_remote_confirmation": latest.get("independent_remote_confirmation", "REMOTE_ICLOUD_SYNC_UNKNOWN")}


def tree_checksums(root: pathlib.Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for path in sorted((item for item in root.rglob("*") if item.is_file()), key=lambda item: safe_rel(item, root)):
        records.append({"path": safe_rel(path, root), "sha256": sha256_file(path), "bytes": path.stat().st_size,
                        "mode": file_mode(path)})
    return records


def copy_archive_tier(config: dict[str, Any]) -> dict[str, Any]:
    usage = shutil.disk_usage(pathlib.Path.home())
    if usage.free < 15 * 1024 * 1024 * 1024:
        raise GateFailure("FAIL_UNKNOWN_FILE", "archive copy blocked below 15 GiB disk-safety floor",
                          [{"path": "archive-tier", "category": "unknown", "rule": "disk-floor", "count": 1}])
    selected = archive_inventory(config)
    root = icloud_root()
    if not root.is_dir():
        raise GateFailure("FAIL_UNKNOWN_FILE", "dedicated iCloud destination unavailable")
    archive_root = root / "archives"
    archive_root.mkdir(exist_ok=True)
    results: list[dict[str, Any]] = []
    for item, definition in zip(selected, config["archive_builds"]):
        source = expand(definition["path"])
        name = f"PhysiqueOS-{item['version']}-Build{item['build']}-{item['role']}-Archive"
        final = archive_root / name
        if final.exists():
            results.append({"build": item["build"], "state": "ALREADY_PRESENT", "path": str(final)})
            continue
        incoming = archive_root / f".incoming-{name}-{uuid.uuid4().hex}"
        incoming.mkdir()
        copied_archive = incoming / "Archive.xcarchive"
        copy_tree_exact(source, copied_archive)
        source_sums = tree_checksums(source)
        destination_sums = tree_checksums(copied_archive)
        if source_sums != destination_sums:
            raise GateFailure("FAIL_SCANNER_ERROR", f"archive checksum mismatch for Build {item['build']}")
        write_json(incoming / "ARCHIVE-CHECKSUMS.json",
                   {"schema_version": SCHEMA_VERSION, "build": item["build"], "files": destination_sums})
        write_json(incoming / "MANIFEST.json",
                   {"schema_version": SCHEMA_VERSION, "build": item["build"], "version": item["version"],
                    "role": item["role"], "source_identity": item, "private_keys_exported": False})
        os.rename(incoming, final)
        upload = query_icloud_upload(final)
        results.append({"build": item["build"], "state": "LOCAL_ICLOUD_CONTAINER_COMPLETE",
                        "path": str(final), "upload": upload, "file_count": len(destination_sums)})
    update_state({"archive_tier": results})
    return {"archives": results}


def complete_generations(root: pathlib.Path) -> list[pathlib.Path]:
    if not root.is_dir():
        return []
    return sorted((item for item in root.glob("PhysiqueOS-Recovery-*")
                   if item.is_dir() and (item / "COMPLETE").is_file()), reverse=True)


def retention_plan(root: pathlib.Path, config: dict[str, Any], *, first_run: bool,
                   upload_state: str) -> dict[str, Any]:
    generations = complete_generations(root)
    if first_run:
        return {"enabled": False, "reason": "first-generation-no-delete", "delete": []}
    if upload_state != "ICLOUD_UPLOAD_REPORTED_COMPLETE":
        return {"enabled": False, "reason": "upload-state-not-complete", "delete": []}
    if len(generations) <= 3:
        return {"enabled": False, "reason": "minimum-three-generations", "delete": []}
    records: list[tuple[pathlib.Path, dt.datetime, str]] = []
    for path in generations:
        try:
            manifest = read_json(path / "MANIFEST.json")
            source_time = dt.datetime.fromisoformat(manifest["source_time"].replace("Z", "+00:00"))
            reason = str(manifest.get("reason", "daily"))
            records.append((path, source_time, reason))
        except (OSError, ValueError, KeyError):
            continue
    keep: set[pathlib.Path] = {item[0] for item in records[:3]}
    daily = int(config["retention"]["daily"])
    keep.update(item[0] for item in records[:daily])
    weekly_seen: set[tuple[int, int]] = set()
    monthly_seen: set[tuple[int, int]] = set()
    release_count = 0
    for path, when, reason in records:
        week = when.isocalendar()[:2]
        month = (when.year, when.month)
        if len(weekly_seen) < int(config["retention"]["weekly"]) and week not in weekly_seen:
            weekly_seen.add(week); keep.add(path)
        if len(monthly_seen) < int(config["retention"]["monthly"]) and month not in monthly_seen:
            monthly_seen.add(month); keep.add(path)
        if reason in {"release", "checkpoint"} and release_count < int(config["retention"]["release_checkpoint"]):
            release_count += 1; keep.add(path)
    return {"enabled": True, "reason": "eligible-dry-run-only" if not os.environ.get("PHYSIQUEOS_RETENTION_APPLY") else "eligible",
            "keep": [path.name for path in sorted(keep)],
            "delete": [path.name for path, _, _ in records if path not in keep]}


def should_catch_up(now: dt.datetime, last_success: Optional[dt.datetime]) -> bool:
    if last_success is None:
        return True
    return (now - last_success).total_seconds() > 24 * 3600


def recursion_allowed(reason: str, report_path: Optional[str]) -> bool:
    if os.environ.get("PHYSIQUEOS_RECOVERY_ACTIVE") == "1":
        return False
    if reason.startswith("recovery-"):
        return False
    if report_path and "mac-icloud-backup" in report_path.lower():
        return False
    return True


class InstanceLock:
    def __init__(self, path: pathlib.Path):
        self.path = path
        self.handle: Optional[Any] = None

    def __enter__(self) -> "InstanceLock":
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.handle = self.path.open("a+")
        try:
            fcntl.flock(self.handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            if exc.errno in (errno.EACCES, errno.EAGAIN):
                self.handle.close()
                self.handle = None
                raise GateFailure("FAIL_SCANNER_ERROR", "another recovery run is active") from exc
            raise
        return self

    def __exit__(self, exc_type: Any, exc: Any, traceback: Any) -> None:
        if self.handle:
            fcntl.flock(self.handle.fileno(), fcntl.LOCK_UN)
            self.handle.close()


def notify_failure(category: str) -> None:
    message = f"PhysiqueOS recovery needs review: {category}"[:180]
    osascript = pathlib.Path("/usr/bin/osascript")
    if osascript.exists() and os.environ.get("PHYSIQUEOS_NO_NOTIFY") != "1":
        run([str(osascript), "-e", f'display notification "{message}" with title "PhysiqueOS Recovery"'],
            check=False, timeout=5)


def next_schedule(now: Optional[dt.datetime] = None) -> str:
    current = now or dt.datetime.now().astimezone()
    candidate = current.replace(hour=3, minute=30, second=0, microsecond=0)
    if candidate <= current:
        candidate += dt.timedelta(days=1)
    return candidate.isoformat()


def install_scheduler() -> dict[str, Any]:
    state = read_state()
    if state.get("local_validation") != "PASS" or state.get("icloud_local_copy") != "LOCAL_ICLOUD_CONTAINER_COMPLETE":
        raise GateFailure("FAIL_UNKNOWN_FILE", "scheduler gate: no validated iCloud generation")
    if state.get("icloud_upload_reported") != "ICLOUD_UPLOAD_REPORTED_COMPLETE":
        raise GateFailure("FAIL_UNKNOWN_FILE", "scheduler gate: upload is not reported complete")
    home = runtime_home()
    bin_dir = home / "bin"
    bin_dir.mkdir(parents=True, exist_ok=True)
    installed: list[str] = []
    for name in ("physiqueos-recovery", "physiqueos_recovery.py", "physiqueos-recovery-config.json",
                 "physiqueos_recovery_icloud_status.swift"):
        source = SCRIPT_DIR / name
        destination = bin_dir / name
        shutil.copy2(source, destination)
        if name == "physiqueos-recovery":
            destination.chmod(0o755)
        installed.append(str(destination))
    launch_dir = expand(os.environ.get("PHYSIQUEOS_LAUNCH_AGENTS", str(pathlib.Path.home() / "Library" / "LaunchAgents")))
    launch_dir.mkdir(parents=True, exist_ok=True)
    plist_path = launch_dir / "com.physiqueos.recovery.plist"
    stdout = home / "logs" / "launchd.stdout.log"
    stderr = home / "logs" / "launchd.stderr.log"
    stdout.parent.mkdir(parents=True, exist_ok=True)
    plist = {
        "Label": "com.physiqueos.recovery",
        "ProgramArguments": [str(bin_dir / "physiqueos-recovery"), "scheduled-run"],
        "RunAtLoad": True,
        "StartCalendarInterval": {"Hour": 3, "Minute": 30},
        "ProcessType": "Background",
        "StandardOutPath": str(stdout),
        "StandardErrorPath": str(stderr),
        "EnvironmentVariables": {"PATH": "/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:/usr/local/bin"},
    }
    temporary = plist_path.with_name(f".{plist_path.name}.{uuid.uuid4().hex}.tmp")
    temporary.write_bytes(plistlib.dumps(plist, fmt=plistlib.FMT_XML, sort_keys=True))
    os.replace(temporary, plist_path)
    result = run(["/bin/launchctl", "bootstrap", f"gui/{os.getuid()}", str(plist_path)], check=False, timeout=30)
    if result.returncode != 0 and b"already" not in result.stderr.lower():
        raise GateFailure("FAIL_SCANNER_ERROR", "launchd bootstrap failed")
    hooks = home / "hooks"
    hooks.mkdir(exist_ok=True)
    checkpoint = hooks / "after-major-main-checkpoint"
    release = hooks / "after-testflight-valid"
    checkpoint.write_text(f'#!/bin/sh\nexec "{bin_dir / "physiqueos-recovery"}" hook --reason checkpoint "$@"\n', encoding="utf-8")
    release.write_text(f'#!/bin/sh\nexec "{bin_dir / "physiqueos-recovery"}" hook --reason release "$@"\n', encoding="utf-8")
    checkpoint.chmod(0o755); release.chmod(0o755)
    update_state({"scheduler": {"state": "INSTALLED", "plist": str(plist_path), "installed_at": iso_utc(),
                                "next_run": next_schedule()},
                  "hooks": {"checkpoint": str(checkpoint), "release": str(release)}})
    return {"scheduler": "INSTALLED", "plist": str(plist_path), "hooks": [str(checkpoint), str(release)],
            "installed_files": installed}


def rotate_logs() -> None:
    log_dir = runtime_home() / "logs"
    if not log_dir.is_dir():
        return
    for path in log_dir.glob("*.log"):
        try:
            if path.stat().st_size <= 1024 * 1024:
                continue
            oldest = path.with_suffix(path.suffix + ".3")
            if oldest.exists(): oldest.unlink()
            for number in (2, 1):
                source = path.with_suffix(path.suffix + f".{number}")
                if source.exists(): os.replace(source, path.with_suffix(path.suffix + f".{number + 1}"))
            os.replace(path, path.with_suffix(path.suffix + ".1"))
        except OSError:
            pass


def scheduled_run(config: dict[str, Any], reason: str = "daily") -> dict[str, Any]:
    rotate_logs()
    with InstanceLock(runtime_home() / "locks" / "recovery.lock"):
        state = read_state()
        if reason == "daily" and state.get("source_time"):
            try:
                previous = dt.datetime.fromisoformat(state["source_time"].replace("Z", "+00:00"))
            except ValueError:
                previous = None
            if previous and not should_catch_up(utc_now(), previous):
                return {"result": "SKIPPED", "reason": "last-success-within-24h"}
        source = build_generation(config, reason)
        local_restore = restore_smoke_test(source)
        cloud = publish_icloud(source)
        cloud_restore = restore_smoke_test(pathlib.Path(cloud["destination"]))
        plan = retention_plan(icloud_root() / "generations", config,
                              first_run=len(complete_generations(icloud_root() / "generations")) <= 1,
                              upload_state=cloud["upload"].get("state", "REMOTE_ICLOUD_SYNC_UNKNOWN"))
        return {"result": "PASS", "local_restore": local_restore, "icloud": cloud,
                "icloud_restore": cloud_restore, "retention": plan}


def audit(config: dict[str, Any]) -> dict[str, Any]:
    home = runtime_home()
    home.mkdir(parents=True, exist_ok=True)
    temp = pathlib.Path(tempfile.mkdtemp(prefix="audit-", dir=home))
    try:
        inventory = build_aggregator(config, temp)
        archives = archive_inventory(config)
        return {"result": "PASS", "time": iso_utc(), "git": inventory, "archives": archives,
                "disk_free_bytes": shutil.disk_usage(pathlib.Path.home()).free,
                "icloud_drive_root_available": icloud_root().parent.is_dir(),
                "dedicated_destination_exists": icloud_root().exists()}
    finally:
        shutil.rmtree(temp, ignore_errors=True)


def dry_run(config: dict[str, Any]) -> dict[str, Any]:
    original = os.environ.get("PHYSIQUEOS_RECOVERY_HOME")
    temporary = pathlib.Path(tempfile.mkdtemp(prefix="physiqueos-recovery-dry-run-", dir="/private/tmp"))
    os.environ["PHYSIQUEOS_RECOVERY_HOME"] = str(temporary)
    stage = "create"
    try:
        generation = build_generation(config, "dry-run")
        stage = "verify"
        verification = verify_generation(generation)
        stage = "restore-smoke-test"
        restore = restore_smoke_test(generation)
        return {"result": "PASS", "generation": generation.name, "verification": verification,
                "restore": restore, "iCloud_writes": 0}
    except GateFailure:
        raise
    except Exception as exc:
        raise GateFailure("FAIL_SCANNER_ERROR", f"dry-run stage failed safely: {stage}") from exc
    finally:
        if original is None:
            os.environ.pop("PHYSIQUEOS_RECOVERY_HOME", None)
        else:
            os.environ["PHYSIQUEOS_RECOVERY_HOME"] = original
        shutil.rmtree(temporary, ignore_errors=True)


def status_document() -> dict[str, Any]:
    state = read_state()
    source_time = state.get("source_time")
    age_hours: Optional[float] = None
    if source_time:
        try:
            value = dt.datetime.fromisoformat(source_time.replace("Z", "+00:00"))
            age_hours = round((utc_now() - value).total_seconds() / 3600, 2)
        except ValueError:
            pass
    live_upload: Optional[dict[str, Any]] = None
    latest_icloud_path = state.get("latest_icloud_path")
    if latest_icloud_path and pathlib.Path(latest_icloud_path).is_dir():
        live_upload = query_icloud_upload(pathlib.Path(latest_icloud_path))
    return {"latest_generation": state.get("latest_generation"), "reason": state.get("reason"),
            "source_time": source_time, "age_hours": age_hours, "local_validation": state.get("local_validation", "UNKNOWN"),
            "icloud_local_copy": state.get("icloud_local_copy", "UNKNOWN"),
            "icloud_upload_reported": (live_upload or {}).get("state", state.get("icloud_upload_reported", "UNKNOWN")),
            "icloud_upload_metadata": live_upload or state.get("icloud_upload_metadata"),
            "independent_remote_confirmation": state.get("remote_confirmation", "REMOTE_ICLOUD_SYNC_UNKNOWN"),
            "last_failure": state.get("last_failure"), "next_scheduled_run": next_schedule(),
            "archive_tier": state.get("archive_tier", "NOT_COPIED"), "scheduler": state.get("scheduler", "NOT_INSTALLED"),
            "hooks": state.get("hooks", "NOT_INSTALLED")}


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(prog="physiqueos-recovery", description="PhysiqueOS fail-closed recovery bundle tool")
    result.add_argument("--config", type=pathlib.Path, default=CONFIG_PATH)
    sub = result.add_subparsers(dest="mode", required=True)
    sub.add_parser("audit")
    sub.add_parser("dry-run")
    create = sub.add_parser("create"); create.add_argument("--reason", choices=["daily", "checkpoint", "release", "manual"], default="manual")
    verify = sub.add_parser("verify"); verify.add_argument("--source", type=pathlib.Path, required=True)
    restore = sub.add_parser("restore-smoke-test"); restore.add_argument("--source", type=pathlib.Path, required=True); restore.add_argument("--keep-scratch", action="store_true")
    sub.add_parser("status")
    publish = sub.add_parser("publish-icloud"); publish.add_argument("--source", type=pathlib.Path, required=True)
    sub.add_parser("refresh-icloud-status")
    sub.add_parser("copy-archives")
    retention = sub.add_parser("retention-plan"); retention.add_argument("--first-run", action="store_true")
    sub.add_parser("install-scheduler")
    sub.add_parser("scheduled-run")
    hook = sub.add_parser("hook"); hook.add_argument("--reason", choices=["checkpoint", "release"], required=True); hook.add_argument("--report-path")
    return result


def main(argv: Optional[list[str]] = None) -> int:
    args = parser().parse_args(argv)
    config = load_config(args.config)
    try:
        if args.mode == "audit": result = audit(config)
        elif args.mode == "dry-run": result = dry_run(config)
        elif args.mode == "create": result = {"result": "PASS", "path": str(build_generation(config, args.reason))}
        elif args.mode == "verify": result = verify_generation(args.source)
        elif args.mode == "restore-smoke-test": result = restore_smoke_test(args.source, keep_scratch=args.keep_scratch)
        elif args.mode == "status": result = status_document()
        elif args.mode == "publish-icloud": result = publish_icloud(args.source)
        elif args.mode == "refresh-icloud-status": result = refresh_icloud_status()
        elif args.mode == "copy-archives": result = copy_archive_tier(config)
        elif args.mode == "retention-plan":
            result = retention_plan(icloud_root() / "generations", config, first_run=args.first_run,
                                    upload_state=read_state().get("icloud_upload_reported", "UNKNOWN"))
        elif args.mode == "install-scheduler": result = install_scheduler()
        elif args.mode == "scheduled-run": result = scheduled_run(config)
        elif args.mode == "hook":
            if not recursion_allowed(args.reason, args.report_path):
                result = {"result": "SKIPPED", "reason": "recursion-prevention"}
            else:
                result = scheduled_run(config, args.reason)
        else:
            raise GateFailure("FAIL_SCANNER_ERROR", "unknown mode")
        print(canonical_bytes(result).decode("utf-8"), end="")
        return 0
    except GateFailure as exc:
        failure = {"result": exc.outcome, "message": str(exc), "findings": exc.findings}
        update_state({"last_failure": {"time": iso_utc(), "category": exc.outcome, "message": str(exc)}})
        notify_failure(exc.outcome)
        print(canonical_bytes(failure).decode("utf-8"), end="", file=sys.stderr)
        return 2
    except Exception as exc:
        # Never include exception data that could contain secret-bearing command output.
        failure = {"result": "FAIL_SCANNER_ERROR", "message": f"safe failure: {type(exc).__name__}"}
        update_state({"last_failure": {"time": iso_utc(), "category": "FAIL_SCANNER_ERROR",
                                       "message": type(exc).__name__}})
        notify_failure("FAIL_SCANNER_ERROR")
        print(canonical_bytes(failure).decode("utf-8"), end="", file=sys.stderr)
        return 3


if __name__ == "__main__":
    raise SystemExit(main())
