#!/usr/bin/env python3
"""history.py — genera /var/lib/rumihome/deploy/history.json (o deploy-dev) cada minuto.

Fuentes de verdad (ambas en el host, leídas con git --git-dir):
  MAIN_REPO: /opt/rumihome    (prod)
  RR_REPO:   /opt/rumihome-rr (staging/espejo)

Salida (JSON):
  prod:  {sha, tag, date}
  tags:  [{tag, sha, date, commits: [ {sha, author, date, msg, files: [{path, add, del}], total_add, total_del } ] }]   # main desde tag-pre hasta tag
  staging: {branch, sha, date, ahead_commits: [...mismos commits...], ahead_count}
  branches: [{name, sha, date, msg, ahead_of_rr}]   # rr-feature-* activos
"""
import json
import os
import subprocess
import sys
from datetime import datetime, timezone

MAIN_REPO = os.environ.get("MAIN_REPO", "/opt/rumihome")
RR_REPO = os.environ.get("RR_REPO", "/opt/rumihome-rr")
OUT = os.environ.get("DEPLOY_DIR", "/var/lib/rumihome/deploy") + "/history.json"
MAX_TAGS = int(os.environ.get("HISTORY_MAX_TAGS", "20"))
MAX_COMMITS = int(os.environ.get("HISTORY_MAX_COMMITS", "40"))

FMT = "%H%x01%h%x01%an%x01%aI%x01%s"


def git(repo: str, *args: str) -> str:
    r = subprocess.run(
        ["git", "--git-dir", f"{repo}/.git", "--work-tree", repo, *args],
        capture_output=True, text=True, timeout=30,
    )
    return r.stdout if r.returncode == 0 else ""


def git_show(repo: str, sha: str) -> str:
    r = subprocess.run(
        ["git", "--git-dir", f"{repo}/.git", "--work-tree", repo, "show", "--numstat", "--format=", sha],
        capture_output=True, text=True, timeout=30,
    )
    return r.stdout if r.returncode == 0 else ""


def parse_commits(raw: str, repo: str) -> list:
    out = []
    for line in raw.splitlines():
        if not line.strip():
            continue
        sha, h, author, date, msg = line.split("\x01", 4)
        files, add, dele = [], 0, 0
        for st in (git_show(repo, sha) or "").splitlines():
            parts = st.split("\t")
            if len(parts) == 3:
                a, d, path = parts
                try:
                    a, d = int(a), int(d)
                except ValueError:
                    a = d = 0
                files.append({"path": path, "add": a, "del": d})
                add += a
                dele += d
        out.append({
            "sha": h, "full_sha": sha, "author": author, "date": date, "msg": msg,
            "files": files[:40], "total_add": add, "total_del": dele,
        })
    return out


def main() -> None:
    data = {"generated_at": datetime.now(timezone.utc).isoformat(), "prod": {}, "tags": [], "staging": {}, "branches": []}

    # --- prod ---
    prod_sha = git(MAIN_REPO, "rev-parse", "HEAD").strip()
    prod_tag = git(MAIN_REPO, "describe", "--tags", "--match", "prod-*", "--abbrev=0").strip()
    data["prod"] = {"sha": prod_sha[:7], "tag": prod_tag or None}

    # --- tags prod-* con commits entre tag-pre y tag ---
    tags = (git(MAIN_REPO, "tag", "--sort=-creatordate", "--list", "prod-*") or "").split()
    real = [t for t in tags if not t.endswith("-pre")]
    for tag in real[:MAX_TAGS]:
        pre = f"{tag}-pre"
        rng = f"{pre}..{tag}" if (git(MAIN_REPO, "rev-parse", "-q", "--verify", pre).strip()) else tag
        commits = parse_commits(git(MAIN_REPO, "log", f"--format={FMT}", rng) or "", MAIN_REPO)
        data["tags"].append({"tag": tag, "date": tag[5:], "commits": commits[:MAX_COMMITS], "commit_count": len(commits)})

    # --- staging (rr): adelantos respecto a main ---
    rr_branch = (git(RR_REPO, "rev-parse", "--abbrev-ref", "HEAD") or "rr").strip()
    rr_sha = git(RR_REPO, "rev-parse", "HEAD").strip()
    ahead_raw = git(RR_REPO, "log", f"--format={FMT}", f"main..{rr_branch}")
    ahead = parse_commits(ahead_raw, RR_REPO)
    data["staging"] = {"branch": rr_branch, "sha": rr_sha[:7], "ahead": ahead[:MAX_COMMITS], "ahead_count": len(ahead)}

    # --- branches rr-feature-* ---
    brs = (git(RR_REPO, "branch", "--format=%(refname:short)%01%(objectname:short)%01%(committerdate:iso8601)", "--sort=-committerdate") or "").splitlines()
    for b in brs:
        name, sha, date = (b.split("\x01") + ["", ""])[:3]
        if name.startswith("rr-feature-"):
            n_ahead = len((git(RR_REPO, "log", "--format=%H", f"rr..{name}") or "").split())
            data["branches"].append({"name": name, "sha": sha, "date": date, "ahead_of_rr": n_ahead})
    data["branches"] = data["branches"][:15]

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    tmp = OUT + ".tmp"
    with open(tmp, "w") as f:
        json.dump(data, f, ensure_ascii=False)
    os.replace(tmp, OUT)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # noqa: BLE001
        print(f"history error: {e}", file=sys.stderr)
        sys.exit(1)