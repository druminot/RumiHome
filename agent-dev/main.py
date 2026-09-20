"""RumiHome Dev Bot — puente Telegram → opencode para el entorno RR (staging).

Flujo con plan-aprobación-avances:
  1. Daniel pide feature → PM PIENSA Y REFINA internamente → plan final
  2. Bot envía el PLAN como lista numerada → espera APROBAR / CAMBIOS / CANCELAR
  3. APROBAR → ejecuta paso a paso, avisando ✅ N/M tras cada finalización
  4. QA = GO → deploy staging → RESUMEN final (tareas, archivos, commits, link)
  5. APROBAR contextual → promote a prod | CAMBIOS → iteración
  - Supervisor puede frenar todo (.rr/HALT) y el bot informa
  - PM monitorea rotativamente cada 5 min durante ejecución

Aislamiento: corre SOLO contra /opt/rumihome-rr. Sin acceso a prod.
"""
import asyncio
import logging
import os
import re
import subprocess
from pathlib import Path

from telegram import Update
from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("rumihome-dev")

BOT_TOKEN = os.environ["TELEGRAM_BOT_TOKEN_DEV"]
ALLOWED_CHAT_ID = int(os.environ["TELEGRAM_CHAT_ID_DEV"])
RR_DIR = Path("/opt/rumihome-rr")
RR_CONFIG_DIR = "/root/.config/opencode-rr"
HALT = RR_DIR / ".rr" / "HALT"

# Timeouts duros por rol (segundos) — un agente colgado NUNCA bloquea el flujo
TIMEOUTS = {"pm": 480, "ux": 720, "frontend": 720, "backend": 720, "qa": 600, "supervisor": 600}

# Sesiones opencode server reutilizables por rol (persistencia de contexto)
_sessions: dict[str, str] = {}

# Estados del flujo: idle → planning → awaiting_approval → executing → done
_state = {
    "state": "idle",  # idle | planning | awaiting_approval | executing | done
    "branch": None,
    "task": None,
    "monitor": None,
    "tasks": [],      # [(num, agente, descripcion_corta)]
    "total_steps": 0,
    "done_steps": 0,
    "last_outputs": {},  # agente -> último output (para el resumen)
}


def _authorized(update: Update) -> bool:
    return update.effective_chat is not None and update.effective_chat.id == ALLOWED_CHAT_ID


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


def _agent(agent: str, instruction: str, timeout: int | None = None) -> tuple[int, str]:
    """Invoca el agente vía opencode server persistente (sin cold boot).

    Técnica de la industria (Claude Code --continue, opencode --attach):
    sesión por rol reutilizable → el contexto del repo se carga una vez por rol.
    Fallback a opencode run local si el server no responde."""
    if timeout is None:
        timeout = TIMEOUTS.get(agent, 720)
    instruccion = f"{instruction}\n\n(ARRANQUE DIRECTO: el contexto completo está en .rr/plan.md y specs de .rr/. NO re-analices el problema ni releas archivos que no vas a tocar. Ve directo a tu tarea.)"

    import httpx

    base = "http://127.0.0.1:4096"
    auth = ("opencode", "rr-serve-6cc594626b2b")
    try:
        client = httpx.Client(timeout=timeout, auth=auth)
        # sesión reutilizable por rol
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
            # sesión atascada → abortar y reintentar una vez
            client.post(f"{base}/session/{sid}/abort")
            res = client.post(
                f"{base}/session/{sid}/message",
                json={"agent": agent, "parts": [{"type": "text", "text": instruccion}]},
            )
        res.raise_for_status()
        data = res.json()
        partes = data.get("parts", [])
        textos = [p.get("text", "") for p in partes if p.get("type") == "text"]
        return 0, ("\n".join(textos))[-3500:] or "(sin salida)"
    except Exception as e:
        log.warning("Server opencode falló (%s) — fallback a opencode run local", e)
        return _run(["opencode", "run", "--agent", agent, instruccion], timeout=timeout, opencode=True)


async def _send(chat_id: int, text: str, context) -> None:
    for i in range(0, len(text), 3900):
        await context.bot.send_message(chat_id=chat_id, text=text[i : i + 3900])


def _parse_tasks() -> list:
    """Parsea la sección ## TAREAS de .rr/plan.md → [(num, agente, descripcion_corta)]."""
    plan_file = RR_DIR / ".rr" / "plan.md"
    try:
        content = plan_file.read_text()
    except OSError:
        return []
    tasks = []
    in_tasks = False
    for line in content.splitlines():
        if line.strip().lower().startswith("## tar"):
            in_tasks = True
            continue
        if in_tasks and line.strip().startswith("#"):
            break
        if not in_tasks:
            continue
        m = re.match(r"\s*(\d+)\.\s*\[(\w+)\]\s*(.+?)\s*(?:—|-{2,}|\Z)", line)
        if m:
            num, agent, desc = int(m.group(1)), m.group(2).lower(), m.group(3).strip()
            # descripción corta: hasta 60 chars, corta en palabra
            if len(desc) > 60:
                desc = desc[:57].rsplit(" ", 1)[0] + "…"
            tasks.append((num, agent, desc))
    return tasks


def _read_route() -> dict:
    """Lee la sección RUTEO de .rr/plan.md. QA siempre True (fallback defensivo)."""
    route = {"ux": True, "frontend": True, "backend": True, "qa": True}
    plan_file = RR_DIR / ".rr" / "plan.md"
    try:
        content = plan_file.read_text()
    except OSError:
        log.warning("plan.md no encontrado — usando pipeline completo por defecto")
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
            applies = m.group(2).upper() == "APLICA"
            if agent in route:
                route[agent] = applies if agent != "qa" else True
    route["qa"] = True
    if not any(route[k] for k in ("ux", "frontend", "backend")):
        log.warning("Ruteo vacío — pipeline completo por defecto")
        route.update(ux=True, frontend=True, backend=True)
    return route


async def _monitor_loop(chat_id: int, context: ContextTypes.DEFAULT_TYPE):
    """PM monitoriza rotativamente cada 5 min: un agente por ronda (solo en executing)."""
    agents = ["frontend", "backend", "ux", "qa"]
    i = 0
    while _state["state"] == "executing" and not HALT.exists():
        await asyncio.sleep(300)
        if _state["state"] != "executing" or HALT.exists():
            break
        target = agents[i % len(agents)]
        i += 1
        rc, out = _agent(
            "pm",
            f"MONITOREO ROTATIVO: revisa el trabajo de '{target}' ahora. "
            "Compara git diff con plan.md y registra desviaciones si las hay.",
            timeout=600,
        )
        if HALT.exists():
            break
        if rc != 0 or "DESVIACIÓN" in out or "desviación" in out:
            rc2, out2 = _agent(
                "supervisor",
                "El PM reportó posible desviación durante monitoreo. Audita y actúa (HALT si corresponde).",
                timeout=900,
            )
            if HALT.exists():
                await _send(chat_id, f"🛨 SUPERVISOR FRENO TODO:\n{out2[:1500]}")
                return
        await context.bot.send_chat_action(chat_id=chat_id, action="typing")


def _git_summary() -> str:
    """Resumen de commits y archivos tocados del branch actual."""
    rc, commits = _run(["git", "-C", str(RR_DIR), "log", "--oneline", "origin/rr..HEAD"])
    rc2, files = _run(["git", "-C", str(RR_DIR), "diff", "--stat", "origin/rr..HEAD"])
    stat = files.splitlines()[-1].strip() if files and files.splitlines() else ""
    return f"Commits:\n{commits or '(sin commits)'}\n\nArchivos: {stat or '—'}"


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _authorized(update):
        return
    await update.message.reply_text(
        "🛠 Dev Bot RR listo.\n\n"
        "Pídeme una feature: 'agrega filtro por estado en /admin'\n"
        "→ pensaré, te mostraré el PLAN y solo trabajo con tu APROBAR.\n\n"
        "Comandos:\n"
        "• estado — cómo va el flujo\n"
        "• APROBAR — aprueba el plan o promueve a prod (contextual)\n"
        "• CAMBIOS: <texto> — ajusta el plan o itera\n"
        "• CANCELAR — descarta la feature en curso\n"
        "• REANUDAR — levanta HALT del supervisor\n"
        "• reset staging — restaura DB staging desde prod"
    )


async def cmd_estado(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _authorized(update):
        return
    chat_id = update.message.chat_id
    if HALT.exists():
        await _send(chat_id, f"🛨 HALT ACTIVO:\n{HALT.read_text()[:1500]}\n\nResponde REANUDAR para continuar.")
        return
    estado_humano = {
        "idle": "esperando una feature",
        "planning": "🧠 PM pensando y refinando el plan…",
        "awaiting_approval": "⏸ esperando tu APROBAR del plan",
        "executing": f"⚙️ ejecutando ({_state['done_steps']}/{_state['total_steps']} pasos listos)",
        "done": "📦 terminado — APROBAR para promote o CAMBIOS para iterar",
    }.get(_state["state"], _state["state"])
    msg = f"📌 Estado: {estado_humano}\n📌 Branch: {_state['branch'] or '—'}"
    if _state["state"] == "awaiting_approval":
        tareas = "\n".join(f"{n}. [{a}] {d}" for n, a, d in _state["tasks"])
        msg += f"\n\nPlan pendiente de aprobación:\n{tareas}"
    await _send(chat_id, msg)


async def _plan_feature(chat_id: int, text: str, context) -> None:
    """Fase planning: PM piensa+refina y entrega el plan para aprobación."""
    _state.update(state="planning", task=text, branch=None, done_steps=0, total_steps=0, last_outputs={})
    await context.bot.send_chat_action(chat_id=chat_id, action="typing")
    await _send(chat_id, "🧠 Pensando a detalle qué hacer y refinando internamente…")

    # Fase interna: PM refina y escribe plan.md (invisible el proceso)
    rc, out = _agent("pm", f"Nueva feature de Daniel: {text}", timeout=1200)
    if HALT.exists():
        _state.update(state="idle")
        await _send(chat_id, f"🛨 HALT del supervisor durante planificación:\n{HALT.read_text()[:1200]}")
        return

    route = _read_route()
    tasks = _parse_tasks()
    if not tasks:
        # El PM no generó TAREAS parseables: mostrar su salida y pedirle reformatear
        rc2, out2 = _agent(
            "pm",
            "Tu plan no tiene la sección ## TAREAS parseable. Reescribe .rr/plan.md con "
            "TAREAS numeradas en formato: 'N. [agente] descripcion corta'.",
            timeout=600,
        )
        tasks = _parse_tasks()
        if not tasks:
            _state.update(state="idle")
            await _send(chat_id, f"⚠️ No pude estructurar el plan. Respuesta del PM:\n{out[:1200]}")
            return

    _state["tasks"] = tasks
    total = sum(1 for _, a, _ in tasks if a in ("ux", "frontend", "backend", "qa"))
    _state["total_steps"] = total
    _state["state"] = "awaiting_approval"

    lista = "\n".join(f"{n}. [{a}] {d}" for n, a, d in tasks)
    ruteo = ", ".join(f"{k}={'✅' if v else '⏭️'}" for k, v in route.items() if k != "qa" or v)
    await _send(
        chat_id,
        f"📋 PLAN para: “{text[:150]}”\n\n{lista}\n\n"
        f"🧭 Ruteo: {ruteo}\n\n"
        "Responde APROBAR para que empiece a trabajar, o CAMBIOS: <qué ajustar>, o CANCELAR.",
    )


async def _execute_pipeline(chat_id: int, context) -> None:
    """Fase executing: corre los pasos APLICA avisando ✅ N/M tras cada uno."""
    _state.update(state="executing", done_steps=0)
    text = _state["task"]
    route = _read_route()
    tasks = _state["tasks"]

    monitor = asyncio.create_task(_monitor_loop(chat_id, context))
    _state["monitor"] = monitor

    pasos = {
        "ux": ("🎨 UX", f"Feature: {text}. Ejecuta las tareas de ux según .rr/plan.md y la spec. NO salgas de tu rol."),
        "frontend": ("⚙️ Frontend", f"Feature: {text}. Ejecuta SOLO las tareas de frontend según .rr/plan.md (y la spec ux si existe)."),
        "backend": ("🗄 Backend", f"Feature: {text}. Ejecuta SOLO las tareas de backend según .rr/plan.md."),
        "qa": ("🔍 QA", f"Valida la feature: {text}. Criterios del plan y de las specs. Veredicto GO/NO-GO en .rr/qa-veredicto.md."),
    }

    salida_qa = ""
    qa_go = False

    async def _run_step(agente: str) -> tuple[str, str, int]:
        etiqueta, instruccion = pasos[agente]
        tdesc = next((d for n, a, d in tasks if a == agente), agente)
        idx = _state["done_steps"] + 1
        await _send(chat_id, f"▶️ {idx}/{_state['total_steps']} — {etiqueta} trabajando: {tdesc}…")
        await context.bot.send_chat_action(chat_id=chat_id, action="typing")
        rc, out = _agent(agente, instruccion, timeout=TIMEOUTS.get(agente, 720))
        _state["last_outputs"][agente] = out
        _state["done_steps"] += 1
        return etiqueta, tdesc, rc

    # Fase secuencial: UX primero (dependencia real de frontend)
    if route.get("ux"):
        etiqueta, tdesc, rc = await _run_step("ux")
        if HALT.exists():
            monitor.cancel()
            _state.update(state="idle", done_steps=0, total_steps=0)
            await _send(chat_id, f"🛨 HALT: {HALT.read_text()[:1200]}\n\nResponde REANUDAR para levantarlo.")
            return
        await _send(chat_id, f"✅ {_state['done_steps']}/{_state['total_steps']} — UX listo: {tdesc}")

    # Paralelismo (agent teams pattern): frontend y backend con ownership disjunto
    if route.get("frontend") and route.get("backend"):
        await _send(chat_id, "⚡ Frontend y Backend en paralelo (archivos disjuntos)…")
        results = await asyncio.gather(
            _run_step("frontend"),
            _run_step("backend"),
            return_exceptions=True,
        )
        for r in results:
            if isinstance(r, Exception):
                log.exception("Paso paralelo falló: %s", r)
            else:
                etiqueta, tdesc, rc = r
                await _send(chat_id, f"✅ {_state['done_steps']}/{_state['total_steps']} — {etiqueta.split(' ', 1)[0]} listo: {tdesc}")
        if HALT.exists():
            monitor.cancel()
            _state.update(state="idle", done_steps=0, total_steps=0)
            await _send(chat_id, f"🛨 HALT: {HALT.read_text()[:1200]}\n\nResponde REANUDAR para levantarlo.")
            return
    else:
        for agente in ("frontend", "backend"):
            if not route.get(agente):
                continue
            etiqueta, tdesc, rc = await _run_step(agente)
            if HALT.exists():
                monitor.cancel()
                _state.update(state="idle", done_steps=0, total_steps=0)
                await _send(chat_id, f"🛨 HALT: {HALT.read_text()[:1200]}\n\nResponde REANUDAR para levantarlo.")
                return
            await _send(chat_id, f"✅ {_state['done_steps']}/{_state['total_steps']} — {etiqueta.split(' ', 1)[0]} listo: {tdesc}")

    # QA SIEMPRE al final
    etiqueta, tdesc, rc = await _run_step("qa")
    salida_qa = _state["last_outputs"].get("qa", "")
    if HALT.exists():
        monitor.cancel()
        _state.update(state="idle", done_steps=0, total_steps=0)
        await _send(chat_id, f"🛨 HALT: {HALT.read_text()[:1200]}\n\nResponde REANUDAR para levantarlo.")
        return
    if "NO-GO" in salida_qa:
        await _send(chat_id, f"❌ {_state['done_steps']}/{_state['total_steps']} — QA dio NO-GO")
    else:
        await _send(chat_id, f"✅ {_state['done_steps']}/{_state['total_steps']} — QA listo: {tdesc}")

    monitor.cancel()

    # Detectar veredicto QA (del output o del archivo de veredicto)
    veredicto_file = RR_DIR / ".rr" / "qa-veredicto.md"
    try:
        contenido_v = veredicto_file.read_text()
        menciones = re.findall(r"NO-GO|GO ✅|GO\b", contenido_v)
        ultimo = menciones[-1] if menciones else ""
        qa_go = not ultimo.startswith("NO")
    except OSError:
        qa_go = "NO-GO" not in salida_qa

    if qa_go:
        _state.update(state="done")
        rc_d, out_d = _run(
            ["docker", "compose", "-f", "docker-compose.rr.yml", "up", "-d", "--build"],
            timeout=900,
        )
        resumen_tareas = "\n".join(f"✅ {n}. [{a}] {d}" for n, a, d in tasks if a in ("ux", "frontend", "backend", "qa"))
        await _send(
            chat_id,
            f"📦 RESUMEN — feature terminada\n\n{resumen_tareas}\n\n"
            f"{_git_summary()}\n\n"
            f"👀 Revisa: https://rumihome.io/rr/\n\n"
            "• APROBAR → promueve a PROD (merge + healthcheck + rollback point)\n"
            "• CAMBIOS: <detalle> → itera en el mismo branch\n"
            "• 'rollback' → revierte esta feature del staging",
        )
    else:
        _state.update(state="done")
        await _send(
            chat_id,
            f"⚠️ La feature terminó con NO-GO de QA:\n{salida_qa or out[:1200]}\n\n"
            "Responde CAMBIOS: <qué corregir> para iterar, o CANCELAR.",
        )


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _authorized(update) or not update.message or not update.message.text:
        return
    text = update.message.text.strip()
    upper = text.upper()
    chat_id = update.message.chat_id
    state = _state["state"]

    # --- REANUDAR (siempre disponible) ---
    if upper.startswith("REANUDAR"):
        if HALT.exists():
            HALT.unlink()
        _state.update(state="idle", busy=False)
        await _send(chat_id, "▶️ HALT levantado. Pídeme la feature de nuevo o responde CAMBIOS.")
        return

    # --- CANCELAR ---
    if upper == "CANCELAR":
        if state in ("planning", "awaiting_approval", "done"):
            if _state["monitor"]:
                _state["monitor"].cancel()
            _state.update(state="idle", busy=False, branch=None, task=None, done_steps=0, total_steps=0)
            await _send(chat_id, "🚫 Cancelado. Espejo en su branch actual; pídeme una feature nueva cuando quieras.")
        else:
            await _send(chat_id, "No hay nada que cancelar.")
        return

    # --- APROBAR contextual ---
    if upper == "APROBAR":
        if state == "awaiting_approval":
            branch = f"rr/feature-{re.sub(r'[^a-z0-9]+', '-', _state['task'].lower())[:30].strip('-') or 'feature'}"
            branch = branch.replace("/", "-")
            _run(["git", "checkout", "-B", branch, "origin/rr"])
            _state.update(state="executing", branch=branch, done_steps=0)
            await _send(chat_id, f"🚀 Plan aprobado — trabajando en {branch}\nTe aviso tras cada paso…")
            await _execute_pipeline(chat_id, context)
            return
        if state == "done":
            rc, out = _run(["bash", str(RR_DIR / "scripts" / "promote.sh")], timeout=1200)
            await _send(chat_id, ("✅ PROMOCIÓN COMPLETADA — en prod\n" if rc == 0 else "❌ PROMOTE FALLÓ:\n") + out)
            _state.update(state="idle", branch=None, done_steps=0, total_steps=0)
            return
        await _send(chat_id, "No hay nada para APROBAR ahora (hay que pedir una feature primero o esperar el plan).")
        return

    # --- CAMBIOS ---
    if upper.startswith("CAMBIOS"):
        feedback = text.split(":", 1)[1].strip() if ":" in text else "revisar lo pedido"
        if state == "awaiting_approval":
            await _send(chat_id, "🔄 PM ajustando el plan con tu feedback…")
            rc, out = _agent(
                "pm",
                f"Daniel pidió cambios al PLAN antes de aprobarlo: {feedback}. "
                "Actualiza .rr/plan.md (ruteo/tareas) y deja las TAREAS parseables.",
                timeout=900,
            )
            tasks = _parse_tasks()
            _state["tasks"] = tasks
            _state["total_steps"] = sum(1 for _, a, _ in tasks if a in ("ux", "frontend", "backend", "qa"))
            _state["state"] = "awaiting_approval"
            lista = "\n".join(f"{n}. [{a}] {d}" for n, a, d in tasks)
            await _send(chat_id, f"📋 Plan actualizado:\n\n{lista}\n\nAPROBAR para empezar, o más CAMBIOS.")
        elif state == "done":
            await _send(chat_id, "🔄 PM reasignando trabajo con tu feedback…")
            rc, out = _agent(
                "pm",
                f"Daniel pidió cambios tras el deploy: {feedback}. Actualiza el plan y reasigna tareas.",
                timeout=900,
            )
            tasks = _parse_tasks()
            _state["tasks"] = tasks
            _state["total_steps"] = sum(1 for _, a, _ in tasks if a in ("ux", "frontend", "backend", "qa"))
            _state["done_steps"] = 0
            _state["state"] = "awaiting_approval"
            lista = "\n".join(f"{n}. [{a}] {d}" for n, a, d in tasks)
            await _send(chat_id, f"📋 Nuevo plan de iteración:\n\n{lista}\n\nAPROBAR para ejecutarlo.")
        else:
            await _send(chat_id, "CAMBIOS aplica cuando hay un plan pendiente de aprobar o una feature terminada.")
        return

    if upper == "RESET STAGING":
        rc, out = _run(["docker", "compose", "-f", "docker-compose.rr.yml", "down"])
        rc2, out2 = _run(["cp", "/root/backups/staging-seed.db", str(RR_DIR / "data" / "rumihome.db")])
        rc3, out3 = _run(["docker", "compose", "-f", "docker-compose.rr.yml", "up", "-d"], timeout=600)
        await _send(chat_id, "♻️ Staging reseteado al snapshot inicial." if rc3 == 0 else f"Error: {out3[:800]}")
        return

    # --- Feature nueva (solo desde idle/done) ---
    if state in ("planning", "awaiting_approval", "executing"):
        await _send(chat_id, f"⏳ Estoy en '{state}'. Espera, responde al plan pendiente, o CANCELAR para abortar.")
        return

    await _plan_feature(chat_id, text, context)


def main() -> None:
    app = Application.builder().token(BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("estado", cmd_estado))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    log.info("Dev Bot RR iniciado (flujo plan-aprobación) (whitelist chat %s)", ALLOWED_CHAT_ID)
    app.run_polling(drop_pending_updates=True)


if __name__ == "__main__":
    main()