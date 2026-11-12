#!/usr/bin/env python3
"""Explicit local test profiles; --list never imports tests or starts a runner."""
import argparse
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scripts/testing-profiles.json"
EXCLUDED = (".repos/", "infra/task-cache/vendor/")


def inventory(config):
    paths = subprocess.check_output(
        ["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
        cwd=ROOT,
    ).decode().split("\0")
    rows = []
    registered = {arg for job in config["groups"].values() for arg in job["argv"]}
    for name in sorted(set(paths)):
        if not name or name.startswith(EXCLUDED):
            continue
        base = Path(name).name
        if re.search(r"\.(?:test|spec)\.[cm]?[jt]sx?$", name):
            route = "node-tools" if name.startswith(".github/scripts/") and name.endswith(".test.cjs") else "vitest"
        elif base.endswith(".py") and (base.startswith("test") or re.search(r"[._]test\.py$", base)):
            route = "python"
        elif name.endswith("Cargo.toml") and name.startswith("native/"):
            route = "rust-crate"
        elif re.search(r"(?:/src/test/.*Test\.(?:kt|java)|/tests/.*\.(?:cpp|swift))$", name):
            route = "native-platform"
        else:
            continue
        rows.append({
            "path": name,
            "route": route,
            "present": (ROOT / name).is_file(),
            "registered": name in registered if route in ("python", "node-tools") else None,
        })
    return rows


def commands(profile, config):
    if "unavailable" in profile:
        raise ValueError(profile["unavailable"])
    jobs = []
    for group in profile["groups"]:
        job = config["groups"][group]
        for required in job["required"]:
            path = ROOT / required
            if not path.is_file():
                raise ValueError(f"Required input absent (including sparse checkout): {required}")
        argv = [sys.executable if arg == "{python}" else arg for arg in job["argv"]]
        if argv[0] == "{vp}":
            argv[0] = str(ROOT / "node_modules/.bin/vp")
        jobs.append({"group": group, "cwd": str(ROOT / job["cwd"]), "argv": argv})
    if not jobs:
        raise ValueError("Empty required test profile")
    return jobs


def main():
    config = json.loads(MANIFEST.read_text())
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("profile", choices=["inventory", *config["profiles"]])
    parser.add_argument("--list", action="store_true", help="print exact commands, without running")
    args = parser.parse_args()
    if args.profile == "inventory":
        rows = inventory(config)
        print(json.dumps(rows, indent=2))
        return 1 if any(row["registered"] is False for row in rows) else 0
    try:
        jobs = commands(config["profiles"][args.profile], config)
    except ValueError as error:
        parser.error(str(error))
    if args.list:
        print(json.dumps(jobs, indent=2))
        return 0
    for job in jobs:
        print(f"[{job['group']}] {json.dumps(job['argv'])}", flush=True)
        result = subprocess.run(job["argv"], cwd=job["cwd"], check=False)
        if result.returncode:
            return result.returncode if result.returncode > 0 else 128 - result.returncode
    return 0


if __name__ == "__main__":
    sys.exit(main())
