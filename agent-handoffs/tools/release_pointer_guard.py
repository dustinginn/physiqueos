#!/usr/bin/env python3
"""release_pointer_guard: refuse non-release changes to agent-handoffs/latest.json / latest.md.

Rule (agent-handoffs/RELEASE_AUTHORITY.md): latest.json and latest.md are the latest ACCEPTED
NATIVE RELEASE AUTHORITY, not the latest agent task/report. Only an accepted Native release
workflow may move them. Audit, design, report-only, incident and implementation-candidate tasks
publish timestamped reports under agent-handoffs/reports/ and leave the pointer unchanged.

The decision uses the structured schema-v1 handoff fields, never commit-message text. A
proposed pointer is release authority only when ALL of:
  task.status == "completed"           result.success is true
  result.testflight_uploaded is true   (set only by the guarded upload once delivery is VALID)
  authority.native_sha is a hex SHA    authority.native_build is an integer
and, relative to the pointer it replaces (when that one is readable):
  native_build does not go backwards, and the same build keeps the same native_sha.
latest.md must be exactly the pointer generated from the new latest.json.

Usage (stdlib only; run from the repository):
  release_pointer_guard.py --base origin/main [--head HEAD]     # git range check (pre-push / review)
  release_pointer_guard.py --old OLD.json --new NEW.json [--new-md NEW.md]   # file check (publisher)
Exit 0 = allowed (or pointer unchanged), 1 = refused, 2 = usage/IO error.
"""
import argparse
import json
import re
import subprocess
import sys

LATEST = "agent-handoffs/latest.json"
POINTER = "agent-handoffs/latest.md"
SHA_RE = re.compile(r"^[0-9a-f]{7,40}$")
REPORT_RE = re.compile(r"^agent-handoffs/reports/\d{8}T\d{6}Z-[a-z0-9][a-z0-9-]{1,60}\.md$")


def render_pointer(doc):
    """Byte-identical to pointer_text() in ~/.physiqueos-release/bin/physiqueos-handoff-publish."""
    t, r = doc["task"], doc["result"]
    return ("# PhysiqueOS latest agent handoff\n\n"
            "Machine-readable interface: `agent-handoffs/latest.json` (read this first).\n\n"
            "- Task: %s (`%s`)\n- Agent: %s\n- Status: %s\n- Generated (UTC): %s\n- Success: %s\n\n"
            "Summary: %s\n\nDetailed report: `%s`\n\nProtocol: `agent-handoffs/README.md`\n"
            % (t["title"], t["id"], t["agent"], t["status"], doc["generated_at_utc"],
               str(r["success"]).lower(), r["summary"], doc["full_report_path"]))


def _get(doc, *path):
    cur = doc
    for key in path:
        if not isinstance(cur, dict) or key not in cur:
            return None
        cur = cur[key]
    return cur


def _build(doc):
    nb = _get(doc, "authority", "native_build")
    if isinstance(nb, bool):
        return None
    if isinstance(nb, int):
        return nb
    if isinstance(nb, str) and nb.isdigit():
        return int(nb)
    return None


def release_authority_errors(doc):
    """Why `doc` is NOT an accepted Native release-authority pointer (empty list = it is)."""
    if not isinstance(doc, dict):
        return ["latest.json is not a JSON object"]
    errs = []
    task_id = _get(doc, "task", "id") or "<unknown task>"
    if _get(doc, "task", "status") != "completed":
        errs.append("task.status is %r, not 'completed'" % _get(doc, "task", "status"))
    if _get(doc, "result", "success") is not True:
        errs.append("result.success is not true")
    if _get(doc, "result", "testflight_uploaded") is not True:
        errs.append("result.testflight_uploaded is not true: %s is not an accepted Native release "
                    "(audit/design/report-only/incident/implementation-candidate/Server-only tasks "
                    "publish a timestamped report and MUST NOT move latest)" % task_id)
    sha = _get(doc, "authority", "native_sha")
    if not (isinstance(sha, str) and SHA_RE.match(sha)):
        errs.append("authority.native_sha is not a lowercase hex SHA")
    if _build(doc) is None:
        errs.append("authority.native_build is not an integer build number")
    if not (isinstance(doc.get("full_report_path"), str) and REPORT_RE.match(doc["full_report_path"])):
        errs.append("full_report_path is not agent-handoffs/reports/<YYYYMMDDTHHMMSSZ>-<slug>.md")
    return errs


def transition_errors(old_doc, new_doc, new_md=None):
    """Errors for replacing pointer `old_doc` with `new_doc` (+ generated `new_md`)."""
    errs = release_authority_errors(new_doc)
    if errs:
        return errs
    old_build = _build(old_doc) if isinstance(old_doc, dict) else None
    new_build = _build(new_doc)
    if old_build is not None:
        if new_build < old_build:
            errs.append("native_build would go backwards (%d -> %d)" % (old_build, new_build))
        elif new_build == old_build:
            old_sha = _get(old_doc, "authority", "native_sha")
            if old_sha and old_sha != new_doc["authority"]["native_sha"]:
                errs.append("build %d already points at native_sha %s; a pointer for the same build "
                            "cannot name %s" % (new_build, old_sha, new_doc["authority"]["native_sha"]))
    if new_md is not None and new_md != render_pointer(new_doc):
        errs.append("latest.md is not the pointer generated from latest.json")
    return errs


def _git_show(ref, path):
    proc = subprocess.run(["git", "show", "%s:%s" % (ref, path)], capture_output=True, text=True)
    return proc.stdout if proc.returncode == 0 else None


def _loads(text):
    try:
        return json.loads(text) if text is not None else None
    except ValueError:
        return None


def check_git_range(base, head):
    old_json, new_json = _git_show(base, LATEST), _git_show(head, LATEST)
    old_md, new_md = _git_show(base, POINTER), _git_show(head, POINTER)
    if old_json == new_json and old_md == new_md:
        return [], "latest.json/latest.md unchanged between %s and %s" % (base, head)
    new_doc = _loads(new_json)
    if new_doc is None:
        return ["latest.json at %s is missing or not valid JSON" % head], None
    errs = transition_errors(_loads(old_json), new_doc, new_md)
    if not errs and _git_show(head, new_doc["full_report_path"]) is None:
        errs.append("full_report_path %s does not exist at %s" % (new_doc["full_report_path"], head))
    return errs, "pointer moved to accepted Native release %s (build %s, native %s)" % (
        new_doc["task"]["id"], new_doc["authority"]["native_build"], new_doc["authority"]["native_sha"][:8])


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base")
    ap.add_argument("--head", default="HEAD")
    ap.add_argument("--old")
    ap.add_argument("--new")
    ap.add_argument("--new-md")
    args = ap.parse_args(argv)
    if args.base:
        errs, ok_msg = check_git_range(args.base, args.head)
    elif args.new:
        try:
            old_doc = _loads(open(args.old, encoding="utf-8").read()) if args.old else None
            new_doc = json.loads(open(args.new, encoding="utf-8").read())
            new_md = open(args.new_md, encoding="utf-8").read() if args.new_md else None
        except (OSError, ValueError) as exc:
            print("ERROR: %s" % exc)
            return 2
        errs = transition_errors(old_doc, new_doc, new_md)
        ok_msg = "accepted Native release pointer"
    else:
        ap.print_usage()
        return 2
    if errs:
        for e in errs:
            print("  [FAIL] release-pointer: %s" % e)
        print("REFUSED: latest.json/latest.md are release authority; leave them unchanged and publish "
              "only the timestamped report (agent-handoffs/RELEASE_AUTHORITY.md).")
        return 1
    print("  [PASS] release-pointer: %s" % ok_msg)
    return 0


if __name__ == "__main__":
    sys.exit(main())
