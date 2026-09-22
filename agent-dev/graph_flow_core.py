"""Core del puente dev: cliente opencode, parsers del plan, trazas y outbox.

Infraestructura compartida por graph_flow.py (grafo) y main.py (Telegram).
Todo corre en el VPS: sin LangSmith ni ningún servicio en la nube.

LangGraph 1.2: timeouts declarativos (TimeoutPolicy), RetryPolicy, error_handler
y graceful shutdown (RunControl) — los nodos de paso son async.
"""
import asyncio
import logging
import os
import queue  # thread-safe: los nodos del grafo corren en un executor thread
import re
import subprocess
import threading
import time
from pathlib import Path

import httpx

log = logging.getLogger("rumihome-dev.core")

BOT_TOKEN = os.environ["TELEGRAM_BOT_TOKEN_DEV"]
ALLOWED_CHAT_ID = int(os.environ["TELEGRAM_CHAT_ID_DEV"])
RR_DIR = Path("/opt/rumihome-rr")
RR_CONFIG_DIR = "/root/.config/opencode-rr"
HALT = RR_DIR / ".rr" / "HALT"
TRACE_DIR = RR_DIR / ".rr"
MAX_TRACES = 10

# Timeouts duros por rol (segundos) — ÚNICA fuente de verdad; también alimenta
# TimeoutPolicy(run_timeout=...) en add_node (graph_flow.py).
TIMEOUTS = {"pm": 480, "ux": 720, "frontend": 720, "backend": 720, "qa": 600}

# Outbox thread-safe: los nodos (executor thread o async) encolan; el drainer drena
_outbox: "queue.Queue[tuple[int, str]]" = queue.Queue()
_loop: asyncio.AbstractEventLoop | None = None  # type: ignore[name-defined]
_loop_lock = threading.Lock()

# Sesiones opencode server reutilizables por rol (se resetean por feature)
_sessions: dict[str, str] = {}
_sessions_lock = threading.Lock()


def bind_loop(loop) -> None:
    """Captura el loop de PTB para encolar mensajes thread-safe desde nodos."""
    global _loop
    _loop = loop


def _emit(chat_id: int, text: str) -> None:
    """Encola un mensaje de UI (thread-safe: desde nodos del executor)."""
    item = (chat_id, text)
    if _loop is not None:
        _loop.call_soon_threadsafe(_outbox.put, item)
    else:
        _outbox.put(item)


def drain_one() -> tuple[int, str] | None:
    try:
        return _outbox.get_nowait()
    except queue.Empty:
        return None


def _trace(feature: str, node: str, payload: str) -> None:
    """Trazas locales por feature (reemplazo de LangSmith, cero nube)."""
    try:
        safe = re.sub(r"[^a-z0-9-]+", "-", feature.lower())[:30] or "feature"
        f = TRACE_DIR / f"trace-{safe}.log"
        with open(f, "a") as fh:
            fh.write(f"\n=== {time.strftime('%d %H:%M:%S')} [{node}] ===\n{payload[-3500:]}\n")
        viejos = sorted(TRACE_DIR.glob("trace-*.log"), key=lambda p: p.stat().st_mtime)
        for viejo in viejos[:-MAX_TRACES]:
            viejo.unlink(missing_ok=True)
    except OSError:
        log.warning("No se pudo escribir traza", exc_info=True)


def _run(cmd: list, cwd: Path = RR_DIR, timeout: int = 900, opencode: bool = False) -> tuple[int, str]:
    env = os.environ.copy()
    if opencode:
        env["XDG_CONFIG_HOME"] = RR_CONFIG_DIR
    try:
        res = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout, env=env)
        return res.returncode, (res.stdout + res.stderr)[-3500:]
    except subprocess.TimeoutExpired:
        return 124, "TIMEOUT del comando"
    except Exception as e:
        return 1, str(e)


def _reset_sessions() -> None:
    """Sesiones opencode frescas por feature (evita contaminación de contexto)."""
    with _sessions_lock:
        viejas = dict(_sessions)
        _sessions.clear()
    base = "http://127.0.0.1:4096"
    auth = ("opencode", "rr-serve-6cc594626b2b")
    try:
        with httpx.Client(timeout=30, auth=auth) as client:
            for sid in viejas.values():
                client.delete(f"{base}/session/{sid}")
    except Exception:
        pass  # el server las recicla solo


async def _agent_async(agent: str, instruction: str, timeout: int | None = None) -> tuple[int, str]:
    """Invoca el agente vía opencode server persistente (sesión por rol) — async nativo.

    Cero cold boot por paso. Fallback a opencode run local (en thread) si el server no responde.
    Cancelable por asyncio → TimeoutPolicy de LangGraph puede abortar el intento.
    """
    if timeout is None:
        timeout = TIMEOUTS.get(agent, 720)
    instruccion = (
        f"{instruction}\n\n(ARRANQUE DIRECTO: el contexto completo está en .rr/plan.md y specs de .rr/. "
        "NO re-analices el problema ni releas archivos que no vas a tocar. Ve directo a tu tarea.)"
    )
    base = "http://127.0.0.1:4096"
    auth = ("opencode", "rr-serve-6cc594626b2b")
    try:
        async with httpx.AsyncClient(timeout=timeout, auth=auth) as client:
            # Lock de sesiones: crítico corto (1 POST), seguro tomarlo sync desde async
            with _sessions_lock:
                if agent not in _sessions:
                    res = await client.post(f"{base}/session", json={"title": f"dev-bot-{agent}"})
                    res.raise_for_status()
                    _sessions[agent] = res.json()["id"]
                sid = _sessions[agent]
            res = await client.post(
                f"{base}/session/{sid}/message",
                json={"agent": agent, "parts": [{"type": "text", "text": instruccion}]},
            )
            if res.status_code == 409 or res.status_code >= 500:
                await client.post(f"{base}/session/{sid}/abort")
                res = await client.post(
                    f"{base}/session/{sid}/message",
                    json={"agent": agent, "parts": [{"type": "text", "text": instruccion}]},
                )
            res.raise_for_status()
            partes = res.json().get("parts", [])
            textos = [p.get("text", "") for p in partes if p.get("type") == "text"]
            return 0, ("\n".join(textos) or "(sin salida)")[-3500:]
    except Exception as e:
        log.warning("Server opencode falló (%s) — fallback a opencode run local", e)
        return await asyncio.to_thread(
            _run, ["opencode", "run", "--agent", agent, instruccion], timeout, True
        )


def _agent(agent: str, instruction: str, timeout: int | None = None) -> tuple[int, str]:
    """Versión sync de _agent (para nodos sync como pm_plan/pm_cambios)."""
    if timeout is None:
        timeout = TIMEOUTS.get(agent, 720)
    instruccion = (
        f"{instruction}\n\n(ARRANQUE DIRECTO: el contexto completo está en .rr/plan.md y specs de .rr/. "
        "NO re-analices el problema ni releas archivos que no vas a tocar. Ve directo a tu tarea.)"
    )
    base = "http://127.0.0.1:4096"
    auth = ("opencode", "rr-serve-6cc594626b2b")
    try:
        client = httpx.Client(timeout=timeout, auth=auth)
        with _sessions_lock:
            if agent not in _sessions:
                res = client.post(f"{base}/session", json={"title": f"dev-bot-{agent}"})
                res.raise_for_status()
                _sessions[agent] = res.json()["id"]
            sid = _sessions[agent]
        res = client.post(
            f"{base}/session/{sid}/message",
            json={"agent": agent, "parts": [{"type": "text", "text": instruccion}]},
        )
        if res.status_code == 409 or res.status_code >= 500:
            client.post(f"{base}/session/{sid}/abort")
            res = client.post(
                f"{base}/session/{sid}/message",
                json={"agent": agent, "parts": [{"type": "text", "text": instruccion}]},
            )
        res.raise_for_status()
        partes = res.json().get("parts", [])
        textos = [p.get("text", "") for p in partes if p.get("type") == "text"]
        return 0, ("\n".join(textos) or "(sin salida)")[-3500:]
    except Exception as e:
        log.warning("Server opencode falló (%s) — fallback a opencode run local", e)
        return _run(["opencode", "run", "--agent", agent, instruccion], timeout=timeout, opencode=True)


def _parse_tasks() -> list:
    """Parsea la sección ## TAREAS de .rr/plan.md → [(num, agente, desc_corta)]."""
    try:
        content = (RR_DIR / ".rr" / "plan.md").read_text()
    except OSError:
        return []
    tasks, in_tasks = [], False
    for line in content.splitlines():
        if line.strip().lower().startswith("## tar"):
            in_tasks = True
            continue
        if in_tasks and line.strip().startswith("#"):
            break
        if not in_tasks:
            continue
        m = re.match(r"\s*(\d+)\.\s*\[(\w+)\]\s*(.+?)\s*(?:—|--|\Z)", line)
        if m:
            num, agent, desc = int(m.group(1)), m.group(2).lower(), m.group(3).strip()
            if len(desc) > 60:
                desc = desc[:57].rsplit(" ", 1)[0] + "…"
            tasks.append((num, agent, desc))
    return tasks


def _read_preguntas() -> list:
    """Extrae la sección ## PREGUNTAS de .rr/plan.md → [str]. El PM la escribe
    cuando hay una decisión que solo Daniel puede tomar; el grafo la convierte
    en pausa de primera clase (n_preguntar) en vez de disfrazarla de fallo."""
    try:
        content = (RR_DIR / ".rr" / "plan.md").read_text()
    except OSError:
        return []
    preguntas, in_preg = [], False
    for line in content.splitlines():
        if line.strip().lower().startswith("## pre"):
            in_preg = True
            continue
        if in_preg and line.strip().startswith("#"):
            break
        if not in_preg:
            continue
        if line.strip():
            preguntas.append(line.strip().lstrip("-*0123456789. "))
    return preguntas


def _read_dato_pedido() -> str:
    """Lee y CONSUME .rr/dato-pedido.md (marcador ## DATO_PEDIDO). Lo escribe un
    agente ejecutor cuando necesita un dato que solo Daniel puede darle; el nodo
    _paso lo convierte en interrupt (pausa del grafo) y re-inyecta la respuesta."""
    p = RR_DIR / ".rr" / "dato-pedido.md"
    try:
        texto = p.read_text()
    except OSError:
        return ""
    p.unlink(missing_ok=True)
    if "DATO_PEDIDO" not in texto:
        return ""
    lineas = [l.strip() for l in texto.splitlines() if l.strip() and not l.strip().startswith("#")]
    return "\n".join(lineas)[:800]


def _read_route() -> dict:
    """Lee la sección RUTEO de .rr/plan.md. QA siempre True (fallback defensivo)."""
    route = {"ux": True, "frontend": True, "backend": True, "qa": True}
    try:
        content = (RR_DIR / ".rr" / "plan.md").read_text()
    except OSError:
        log.warning("plan.md no encontrado — pipeline completo por defecto")
        return route
    in_route = False
    for line in content.splitlines():
        if line.strip().lower().startswith("## rut"):
            in_route = True
            continue
        if in_route and line.strip().startswith("#"):
            break
        if not in_route:
            continue
        m = re.match(r"\s*[-|\s]*(\w+)\s*[\|:]+\s*\*{0,2}(APLICA|NO APLICA)", line, re.I)
        if m:
            agent = m.group(1).lower()
            if agent in route:
                route[agent] = m.group(2).upper() == "APLICA" if agent != "qa" else True
    route["qa"] = True
    if not any(route[k] for k in ("ux", "frontend", "backend")):
        log.warning("Ruteo vacío — pipeline completo por defecto")
        route.update(ux=True, frontend=True, backend=True)
    return route


def _git_summary() -> str:
    """Resumen de commits y archivos tocados del branch actual."""
    rc, commits = _run(["git", "-C", str(RR_DIR), "log", "--oneline", "origin/rr..HEAD"])
    rc2, files = _run(["git", "-C", str(RR_DIR), "diff", "--stat", "origin/rr..HEAD"])
    stat = files.splitlines()[-1].strip() if files and files.splitlines() else ""
    return f"Commits:\n{commits or '(sin commits)'}\n\nArchivos: {stat or '—'}"


def _qa_veredicto() -> tuple[bool, str]:
    """Lee el último veredicto de .rr/qa-veredicto.md → (go?, detalle)."""
    try:
        contenido = (RR_DIR / ".rr" / "qa-veredicto.md").read_text()
        menciones = re.findall(r"NO-GO|GO ✅|GO\b", contenido)
        ultimo = menciones[-1] if menciones else ""
        return (not ultimo.startswith("NO")), contenido[-800:]
    except OSError:
        return False, "(sin veredicto en .rr/qa-veredicto.md)"