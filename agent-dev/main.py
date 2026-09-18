"""RumiHome Dev Bot — puente Telegram → opencode para el entorno RR (staging).

Flujo:
  Daniel pide feature → PM (plan) → UX → frontend/backend → QA
  - PM monitorea rotativamente cada 5 min (loop interno del orquestador)
  - Supervisor audita alineación; si detecta desvío → .rr/HALT → bot frena y avisa
  - QA = GO → deploy staging → bot avisa "listo en /rr/"
  - Daniel: APROBAR → scripts/promote.sh (merge a main + prod + healthcheck)
  - Daniel: REANUDAR → levanta .rr/HALT y reactiva el equipo

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

# Sesión activa: una feature a la vez (estado en memoria)
_state = {"busy": False, "branch": None, "task": None, "monitor": None}


def _authorized(update: Update) -> bool:
    return update.effective_chat is not None and update.effective_chat.id == ALLOWED_CHAT_ID


def _run(cmd: list, cwd: Path = RR_DIR, timeout: int = 900) -> tuple[int, str]:
    try:
        res = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout)
        return res.returncode, (res.stdout + res.stderr)[-3500:]
    except subprocess.TimeoutExpired:
        return 124, "TIMEOUT del comando"
    except Exception as e:
        return 1, str(e)


def _opencode(agent: str, instruction: str, timeout: int = 1800) -> str:
    """Ejecuta opencode headless con el agente dado en /opt/rumihome-rr."""
    cmd = [
        "opencode", "run",
        "--config", f"{RR_CONFIG_DIR}/opencode.json",
        "--agent", agent,
        "--format", "plain",
        "--quiet",
        agent,  # el prompt va como parte del comando; el agente define su rol
    ]
    # opencode run acepta el prompt como argumento final
    cmd = ["opencode", "run", "--agent", agent, "--format", "plain", agent]
    env = os.environ.copy()
    env["OPENCODE_CONFIG"] = RR_CONFIG_DIR
    env["XDG_CONFIG_HOME"] = RR_CONFIG_DIR
    try:
        res = subprocess.run(
            ["opencode", "run", "--agent", agent, agent],
            cwd=RR_DIR, capture_output=True, text=True, timeout=timeout, env=env,
        )
        return (res.stdout + res.stderr)[-3500:] or "(sin salida)"
    except subprocess.TimeoutExpired:
        return "TIMEOUT: el agente tardó demasiado"
    except Exception as e:
        return f"ERROR: {e}"


async def _send(chat_id: int, text: str, context) -> None:
    for i in range(0, len(text), 3900):
        await context.bot.send_message(chat_id=chat_id, text=text[i : i + 3900])


async def _monitor_loop(chat_id: int, context: ContextTypes.DEFAULT_TYPE):
    """PM monitoriza rotativamente cada 5 min: un agente por ronda."""
    agents = ["frontend", "backend", "ux", "qa"]
    i = 0
    while _state["busy"] and not HALT.exists():
        await asyncio.sleep(300)
        if not _state["busy"] or HALT.exists():
            break
        target = agents[i % len(agents)]
        i += 1
        rc, out = _run(
            ["opencode", "run", "--agent", "pm",
             f"MONITOREO ROTATIVO: revisa el trabajo de '{target}' ahora. "
             "Compara git diff con plan.md y registra desviaciones si las hay."],
            timeout=600,
        )
        if HALT.exists():
            await _send(chat_id, "🛨 HALT detectado durante monitoreo — frena todo.", None) if False else None
            break
        if rc != 0 or "DESVIACIÓN" in out or "desviación" in out:
            # invoca supervisor para veredicto formal
            rc2, out2 = _run(
                ["opencode", "run", "--agent", "supervisor",
                 "El PM reportó posible desviación durante monitoreo. Audita y actúa (HALT si corresponde)."],
                timeout=900,
            )
            if HALT.exists():
                await _send(chat_id, f"🛨 SUPERVISOR FRENO TODO:\n{out2[:1500]}")
                return
        await context.bot.send_chat_action(chat_id=chat_id, action="typing")


def _deploy_staging(chat_id: int, context) -> None:
    """Deploy staging: build + up de los servicios -rr."""
    rc, out = _run(["docker", "compose", "-f", "docker-compose.rr.yml", "up", "-d", "--build"], timeout=600)
    return rc, out


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _authorized(update):
        return
    await update.message.reply_text(
        "🛠 Dev Bot RR listo.\n\n"
        "Pídeme una feature: 'agrega filtro por estado en /admin'\n\n"
        "Comandos:\n"
        "• estado — cómo va el trabajo\n"
        "• APROBAR — promueve rr→prod (después de que avise 'listo')\n"
        "• CAMBIOS: <texto> — iteración en el mismo branch\n"
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
    rc, out = _run(["git", "-C", str(RR_DIR), "log", "--oneline", "-5"])
    rc2, plan = _run(["cat", ".rr/plan.md"], timeout=10)
    await _send(chat_id, f"📌 Branch: {_state['branch'] or '—'}\n\nÚltimos commits:\n{out}\n\nPlan:\n{plan[:1800]}")


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _authorized(update) or not update.message or not update.message.text:
        return
    text = update.message.text.strip()
    chat_id = update.message.chat_id

    # --- Aprobación manual ---
    if text.strip().upper() == "APROBAR":
        rc, out = _run(["bash", "/opt/rumihome-rr/scripts/promote.sh"], timeout=1200)
        await _send(chat_id, ("✅ PROMOCIÓN COMPLETADA\n" if rc == 0 else "❌ PROMOTE FALLÓ:\n") + out)
        return

    if text.strip().upper().startswith("REANUDAR"):
        if HALT.exists():
            HALT.unlink()
        await _send(chat_id, "▶️ HALT levantado. Equipo puede continuar (pidanme la feature de nuevo o digan CAMBIOS).")
        return

    if text.strip().upper().startswith("CAMBIOS"):
        feedback = text.split(":", 1)[1].strip() if ":" in text else "revisar lo pedido"
        if _state["busy"] and _state["branch"]:
            rc, out = _run(["git", "checkout", _state["branch"]])
            rc2, out2 = _run(["opencode", "run", "--agent", "pm",
                              f"Daniel pidió cambios en {_state['branch']}: {feedback}. Actualiza el plan y reasigna tareas."],
                             timeout=900)
            await _send(chat_id, f"🔄 Iteración iniciada en {_state['branch']}:\n{out2[:1500]}")
        else:
            await _send(chat_id, "No hay feature activa. Pídeme una feature nueva.")
        return

    if text.strip().lower() == "reset staging":
        rc, out = _run(["docker", "compose", "-f", "docker-compose.rr.yml", "down"])
        rc2, out2 = _run(["cp", "/root/backups/staging-seed.db", str(RR_DIR / "data" / "rumihome.db")])
        rc3, out3 = _run(["docker", "compose", "-f", "docker-compose.rr.yml", "up", "-d"], timeout=600)
        await _send(chat_id, "♻️ Staging reseteado al snapshot inicial." if rc3 == 0 else f"Error: {out3[:800]}")
        return

    # --- Feature nueva ---
    if _state["busy"]:
        await _send(chat_id, "⏳ Hay una feature en curso ('estado' para ver). Termínala o espera.")
        return

    slug = re.sub(r"[^a-z0-9]+", "-", text.lower())[:30].strip("-") or "feature"
    branch = f"rr/feature-{slug}"
    _state.update(busy=True, branch=branch, task=text)

    await context.bot.send_chat_action(chat_id=chat_id, action="typing")
    _run(["git", "checkout", "-B", branch, "origin/rr"])

    await _send(chat_id, f"🚀 Iniciando feature en {branch}\n1/4 PM analizando...")
    rc, out = _run(["opencode", "run", "--agent", "pm", f"Nueva feature de Daniel: {text}"], timeout=900)
    if HALT.exists():
        await _send(chat_id, f"🛨 HALT: {HALT.read_text()[:1200]}")
        _state.update(busy=False)
        return
    await _send(chat_id, f"📋 PM:\n{out[:1200]}")

    monitor = asyncio.create_task(_monitor_loop(chat_id, context))
    _state["monitor"] = monitor

    # UX spec
    await _send(chat_id, "🎨 UX generando spec...")
    rc, out = _run(["opencode", "run", "--agent", "ux", f"Feature: {text}. Genera la spec de UI."], timeout=900)
    if HALT.exists():
        monitor.cancel(); _state.update(busy=False)
        await _send(chat_id, f"🛨 HALT: {HALT.read_text()[:1200]}")
        return
    await _send(chat_id, f"🎨 UX:\n{out[:1200]}")

    # Frontend + Backend
    await _send(chat_id, "⚙️ Frontend trabajando...")
    rc_f, out_f = _run(["opencode", "run", "--agent", "frontend", f"Implementa: {text}"], timeout=1800)
    if HALT.exists():
        monitor.cancel(); _state.update(busy=False)
        await _send(chat_id, f"🛨 HALT: {HALT.read_text()[:1200]}")
        return
    await _send(chat_id, f"💻 Frontend:\n{out_f[:1200]}")

    await _send(chat_id, "🗄 Backend trabajando...")
    rc_b, out_b = _run(["opencode", "run", "--agent", "backend", f"Soporta: {text}"], timeout=1800)
    if HALT.exists():
        monitor.cancel(); _state.update(busy=False)
        await _send(chat_id, f"🛨 HALT: {HALT.read_text()[:1200]}")
        return
    await _send(chat_id, f"🗄 Backend:\n{out_b[:1200]}")

    # QA
    await _send(chat_id, "🔍 QA validando...")
    rc_q, out_q = _run(["opencode", "run", "--agent", "qa", f"Valida: {text}"], timeout=1200)
    if HALT.exists():
        monitor.cancel(); _state.update(busy=False)
        await _send(chat_id, f"🛨 HALT: {HALT.read_text()[:1200]}")
        return

    if "GO" in out_q and "NO-GO" not in out_q:
        rc_d, out_d = _run(["docker", "compose", "-f", "docker-compose.rr.yml", "up", "-d", "--build"], timeout=900)
        msg = ("✅ Feature lista en staging: https://rumihome.io/rr/\n\n"
               f"QA:\n{out_q[:1000]}\n\nResponde APROBAR para llevar a prod, o CAMBIOS: <detalle>")
    else:
        msg = f"⚠️ QA dio NO-GO:\n{out_q[:1500]}\n\nResponde CAMBIOS: <qué corregir>"

    monitor.cancel()
    _state.update(busy=False)
    await _send(chat_id, msg)


def main() -> None:
    app = Application.builder().token(BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("estado", cmd_estado))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    log.info("Dev Bot RR iniciado (whitelist chat %s)", ALLOWED_CHAT_ID)
    app.run_polling(drop_pending_updates=True)


if __name__ == "__main__":
    main()