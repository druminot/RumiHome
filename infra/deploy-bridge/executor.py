#!/usr/bin/env python3
"""executor.py — procesa UNA petición de cola y ejecuta promote/rollback real.

Activa por systemd .path al aparecer queue/*.json. El API-server escribe la
petición tras validar auth+nonce; aquí se revalida la forma ( defensa en
profundidad) y se ejecuta scripts/promote.sh o scripts/rollback.sh.

Modo staging (STAGING=1): dry-run — escribe result con "dry_run": true sin
ejecutar nada que afecte prod.
"""
import fcntl
import json
import os
import subprocess
import sys
import time

DEPLOY_DIR = os.environ.get("DEPLOY_DIR", "/var/lib/rumihome/deploy")
STAGING = os.environ.get("STAGING", "0") == "1"
RR_DIR = os.environ.get("RR_DIR", "/opt/rumihome-rr")
PROD_DIR = os.environ.get("PROD_DIR", "/opt/rumihome")
LOCK = os.path.join(DEPLOY_DIR, ".executor.lock")
TAG_RE = r"^prod-[a-z0-9][a-z0-9-]*$"  # tags reales: -HHMM, -base, -final, pre-*
VALID_ACTIONS = {"promote", "rollback"}


def validate(req: dict) -> str | None:
    if req.get("action") not in VALID_ACTIONS:
        return "acción inválida"
    if req.get("action") == "rollback":
        tag = req.get("tag", "")
        if tag and not __import__("re").match(TAG_RE, tag):
            return "tag inválido"
    if req.get("action") == "promote" and req.get("restore_db"):
        return "promote no acepta restore_db"
    return None


def run_cmd(cmd: list, timeout: int) -> tuple[int, str]:
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, cwd=RR_DIR)
        out = (r.stdout + r.stderr)[-4000:]
        return r.returncode, out
    except subprocess.TimeoutExpired:
        return 124, f"timeout {timeout}s"
    except Exception as e:  # noqa: BLE001
        return 1, str(e)


def main() -> None:
    queue = os.path.join(DEPLOY_DIR, "queue")
    reqs = sorted(f for f in os.listdir(queue) if f.endswith(".json")) if os.path.isdir(queue) else []
    if not reqs:
        return

    with open(os.path.join(DEPLOY_DIR, ".executor.lock"), "w") as lockf:
        fcntl.flock(lockf, fcntl.LOCK_EX)
        reqs = sorted(f for f in os.listdir(queue) if f.endswith(".json"))
        for fname in reqs:
            path = os.path.join(queue, fname)
            os.rename(path, path + ".processing")
            src = path + ".processing"
            try:
                with open(src) as f:
                    req = json.load(f)
                err = validate(req)
                if err:
                    result = {"ok": False, "error": err, "action": req.get("action")}
                elif STAGING:
                    result = {"ok": True, "dry_run": True, "action": req["action"],
                              "tag": req.get("tag"), "restore_db": bool(req.get("restore_db")),
                              "detail": f"staging dry-run: {req['action']} {'(tag ' + req['tag'] + ')' if req.get('tag') else ''}{' +restore_db' if req.get('restore_db') else ''}"}
                elif req["action"] == "promote":
                    rc, out = run_cmd(["bash", os.path.join(PROD_DIR, "scripts", "promote.sh")], 1800)
                    result = {"ok": rc == 0, "rc": rc, "output": out, "action": "promote"}
                else:
                    cmd = ["bash", os.path.join(PROD_DIR, "scripts", "rollback.sh")]
                    if req.get("restore_db"):
                        cmd.insert(1, "--db")
                    if req.get("tag"):
                        cmd.append(req["tag"])
                    rc, out = run_cmd(cmd, 1800)
                    result = {"ok": rc == 0, "rc": rc, "output": out, "action": "rollback",
                              "tag": req.get("tag"), "restore_db": bool(req.get("restore_db"))}
            except Exception as e:  # noqa: BLE001
                result = {"ok": False, "error": str(e), "action": req.get("action", "?")}
            result["requested_by"] = req.get("requested_by", "?")
            result["requested_at"] = req.get("requested_at")
            import datetime
            result["finished_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
            res_path = os.path.join(DEPLOY_DIR, "results", fname.replace(".json", ".result.json"))
            os.makedirs(os.path.dirname(res_path), exist_ok=True)
            with open(res_path + ".tmp", "w") as f:
                json.dump(result, f, ensure_ascii=False)
            os.replace(res_path + ".tmp", res_path)
            os.remove(src)
            sys.stderr.write(f"executor: {fname} → {'OK' if result.get('ok') else 'FALLO'}\n")


if __name__ == "__main__":
    main()