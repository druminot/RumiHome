"""RumiHome Dev Bot — capa Telegram del puente LangGraph → opencode (entorno RR).

El grafo vive en graph_flow.py (StateGraph + SqliteSaver + protocolo de fallos).
Esta capa: comandos Telegram, invocación del grafo con thread_id por feature,
drenaje de la outbox hacia Telegram y comandos de control.

FASE 2 (100% en el VPS): LangGraph OSS + SqliteSaver (flujo.db) — sin nube.
"""
import asyncio
import logging
import os
import re
import threading
from pathlib import Path

from telegram import Update
from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

from graph_flow import build_graph
from graph_flow_core import (  # noqa: F401
    ALLOWED_CHAT_ID,
    BOT_TOKEN,
    HALT,
    RR_DIR,
    bind_loop,
    drain_one,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("rumihome-dev")

# Estado de UI (espejo ligero; la verdad vive en flujo.db + .rr/plan.md)
_ui = {
    "state": "idle",  # idle | planning | awaiting_approval | executing | done
    "feature": None,
    "thread_id": None,
    "runner": None,  # asyncio.Task del grafo en curso
}

_drainer_task: asyncio.Task | None = None  # type: ignore[name-defined]
_drainer_stop = threading.Event()


def _authorized(update: Update) -> bool:
    return update.effective_chat is not None and update.effective_chat.id == ALLOWED_CHAT_ID


async def _outbox_drainer(app: Application) -> None:
    """Drena la outbox thread-safe del grafo hacia Telegram."""
    while not _drainer_stop.is_set():
        try:
            par = await asyncio.to_thread(drain_one_blocking, 0.5)
            if par is None:
                continue
            chat_id, text = par
            for i in range(0, len(text), 3900):
                await app.bot.send_message(chat_id=chat_id, text=text[i : i + 3900])
        except Exception:
            log.exception("drenador outbox", exc_info=True)
            await asyncio.sleep(1)


def drain_one_blocking(timeout: float) -> tuple[int, str] | None:
    import queue as _q

    from graph_flow_core import _outbox

    try:
        return _outbox.get(timeout=timeout)
    except _q.Empty:
        return None


async def _post_startup(app: ContextTypes.DEFAULT_TYPE) -> None:
    global _drainer_task
    bind_loop(asyncio.get_running_loop())
    # build_graph async (AsyncSqliteSaver necesita loop corriendo)
    if "graph" not in app.bot_data:
        app.bot_data["graph"] = await build_graph()
    _drainer_stop.clear()
    _drainer_task = asyncio.create_task(_outbox_drainer(app))


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _authorized(update):
        return
    await update.message.reply_text(
        "🛠 Dev Bot RR v2 (LangGraph) listo.\n\n"
        "Pídeme una feature: 'agrega filtro por estado en /admin'\n"
        "→ PM la planifica, tú apruebas con APROBAR, y avanzo paso a paso.\n\n"
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
    humano = {
        "idle": "esperando una feature",
        "planning": "🧠 PM pensando y refinando el plan…",
        "awaiting_approval": "⏸ esperando tu APROBAR del plan",
        "executing": "⚙️ ejecutando el plan aprobado…",
        "done": "📦 terminado — APROBAR para promover o CAMBIOS para iterar",
    }.get(_ui["state"], _ui["state"])
    msg = f"📌 Estado: {humano}\n📌 Feature: {_ui['feature'] or '—'}"
    if _ui["state"] == "awaiting_approval":
        msg += "\n\nResponde APROBAR / CAMBIOS: <ajustes> / CANCELAR."
    await update.message.reply_text(msg)


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _authorized(update) or not update.message or not update.message.text:
        return
    text = update.message.text.strip()
    upper = text.upper()
    chat_id = update.message.chat_id

    # Gate de conversación: saludos y pruebas cortas se responden localmente,
    # sin gastar una invocación del PM (antes llegaban al grafo y terminaban
    # en "Plan no parseable" — el PM no tiene forma de decir "no hay feature").
    SALUDOS = ("hola", "hey", "buenas", "qué tal", "que tal", "hi", "hello", "chao", "gracias")
    if not any(k in upper for k in ("APROBAR", "CAMBIOS", "CANCELAR", "REANUDAR", "RESET")) and (
        upper in [s.upper() for s in SALUDOS]
        or (len(text) < 40 and any(upper.startswith(s.upper()) for s in SALUDOS))
    ):
        await update.message.reply_text(
            "👋 Hola Daniel. Soy el PM-bot del equipo dev. Descríbeme una feature o bug a "
            "desarrollar (ej: «agregar X a la landing», «endpoint Y», «bug Z») y planifico, "
            "ejecuto y te traigo staging listo para revisar. ¿Qué hacemos hoy?"
        )
        return

    if upper.startswith("REANUDAR"):
        if HALT.exists():
            HALT.unlink()
        await update.message.reply_text("▶️ HALT levantado. Pídeme la feature de nuevo o responde CAMBIOS.")
        return

    if upper == "CANCELAR":
        if _ui["runner"] and not _ui["runner"].done():
            await _resume(chat_id, context, "CANCELAR")
            return
        _ui.update(state="idle", feature=None, thread_id=None)
        await update.message.reply_text("🚫 Cancelado. Espejo en su branch actual; pídeme una feature nueva cuando quieras.")
        return

    if upper == "APROBAR":
        if _ui["state"] == "awaiting_approval":
            await _resume(chat_id, context, "APROBAR")
            return
        if _ui["state"] == "done":
            # Promoción removida del bot (decisión Daniel 2026-09-21):
            # el merge → prod se valida desde https://rumihome.io/code
            await update.message.reply_text(
                "🚦 La promoción a PROD ahora se valida desde https://rumihome.io/code "
                "(revisa el árbol de versiones y presiona MERGE → PROD)."
            )
            return
        await update.message.reply_text("No hay nada para APROBAR ahora (pide una feature primero).")
        return

    if upper.startswith("CAMBIOS"):
        feedback = text.split(":", 1)[1].strip() if ":" in text else "revisar lo pedido"
        if _ui["state"] == "awaiting_approval":
            await _resume(chat_id, context, f"CAMBIOS: {feedback}")
            return
        if _ui["state"] == "done":
            await _start_feature(chat_id, f"{_ui['feature']} — CAMBIOS: {feedback}")
            return
        await update.message.reply_text("CAMBIOS aplica con un plan pendiente o una feature terminada.")
        return

    if upper == "RESET STAGING":
        _run(["docker", "compose", "-f", "docker-compose.rr.yml", "down"])
        _run(["cp", "/root/backups/staging-seed.db", str(RR_DIR / "data" / "rumihome.db")])
        rc, out = _run(["docker", "compose", "-f", "docker-compose.rr.yml", "up", "-d"], timeout=600)
        await update.message.reply_text("♻️ Staging reseteado al snapshot inicial." if rc == 0 else f"Error: {out[:800]}")
        return

    if _ui["state"] in ("planning", "awaiting_approval", "executing"):
        await update.message.reply_text(f"⏳ Estoy en '{_ui['state']}'. Responde al plan pendiente o CANCELAR.")
        return

    await _start_feature(chat_id, text)


async def _start_feature(chat_id: int, feature: str) -> None:
    from langgraph.types import Command  # noqa: F401  (por claridad del flujo)

    graph = _app.bot_data["graph"]
    thread_id = _new_thread_id(feature)
    _ui.update(state="planning", feature=feature, thread_id=thread_id)
    config = {"configurable": {"thread_id": thread_id}}
    state_in = {
        "thread_id": thread_id,
        "chat_id": chat_id,
        "feature": feature,
        "feedback": "",
        "branch": "",
        "route": {},
        "tasks": [],
        "total_steps": 0,
        "hechos": [],
        "iteracion": 0,
        "veredicto": "",
        "fallos": [],
        "plan_texto": "",
    }

    async def runner() -> None:
        global _run_control
        try:
            from langgraph.runtime import RunControl

            control = RunControl()
            _run_control = control
            # ainvoke (LangGraph 1.2): nodos async en el event loop → TimeoutPolicy
            # cancelable, GraphOutput con .interrupts separado y graceful shutdown.
            final = await graph.ainvoke(state_in, config, version="v2", control=control)
            veredicto = final.value.get("veredicto", "") if hasattr(final, "value") else final.get("veredicto", "")
            if veredicto == "FALLO":
                _ui.update(state="awaiting_approval")  # CAMBIOS para reintentar distinto
            elif veredicto == "CANCELADO":
                _ui.update(state="idle", feature=None, thread_id=None)
            else:
                _ui.update(state="done")
        except Exception:
            log.exception("Grafo falló de forma catastrófica")
            _ui.update(state="idle", feature=None, thread_id=None)
        finally:
            _run_control = None

    _ui["runner"] = asyncio.create_task(runner())


async def _resume(chat_id: int, decision: str) -> None:
    """Reanuda el grafo pausado en el interrupt (APROBAR/CAMBIOS/CANCELAR)."""
    from langgraph.types import Command

    graph = _app.bot_data["graph"]
    thread_id = _ui["thread_id"]
    config = {"configurable": {"thread_id": thread_id}}
    _ui["state"] = "executing" if decision in ("APROBAR",) else "planning"

    async def runner() -> None:
        global _run_control
        try:
            from langgraph.runtime import RunControl

            control = RunControl()
            _run_control = control
            final = await graph.ainvoke(Command(resume=decision), config, version="v2", control=control)
            veredicto = final.value.get("veredicto", "") if hasattr(final, "value") else final.get("veredicto", "")
            if veredicto in ("FALLO", "CANCELADO", "CONVERSACION"):
                _ui.update(state="idle", feature=None, thread_id=None)
            else:
                _ui.update(state="done")
        except Exception:
            log.exception("Grafo (resume) falló")
            _ui.update(state="idle", feature=None, thread_id=None)
        finally:
            _run_control = None

    _ui["runner"] = asyncio.create_task(runner())


def _new_thread_id(feature: str) -> str:
    safe = re.sub(r"[^a-z0-9-]+", "-", feature.lower())[:24].strip("-") or "feature"
    return f"{safe}-{int(asyncio.get_event_loop().time() * 1000) % 1000000}"


_app: Application | None = None

# Graceful shutdown (LangGraph 1.2): SIGTERM de systemd → request_drain() → el grafo
# termina el superstep en curso y deja checkpoint resumible. En el próximo arranque,
# la feature se reanuda con invoke(None, config).
_run_control = None  # langgraph.runtime.RunControl (lazy)


def _sigterm_handler(signum, frame) -> None:
    """systemd stop/restart: drena el grafo en curso (checkpoint limpio) en vez de matarlo."""
    global _run_control
    if _run_control is not None:
        log.info("SIGTERM: solicitando drain del grafo en curso…")
        try:
            _run_control.request_drain("sigterm")
        except Exception:
            log.warning("request_drain falló", exc_info=True)
    else:
        log.info("SIGTERM sin grafo en curso — salida directa")


def main() -> None:
    global _app
    import signal

    app = Application.builder().token(BOT_TOKEN).build()
    _app = app
    signal.signal(signal.SIGTERM, _sigterm_handler)
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("estado", cmd_estado))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    app.post_init = _post_init_hook
    log.info("Dev Bot RR v2 (LangGraph, todo en VPS) iniciado (whitelist chat %s)", ALLOWED_CHAT_ID)
    app.run_polling(drop_pending_updates=True)


async def _post_init_hook(app: Application) -> None:
    await _post_startup(app)


if __name__ == "__main__":
    main()