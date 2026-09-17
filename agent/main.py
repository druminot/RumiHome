"""Rumihome Assistant — bot de Telegram multi-agente (router + sub-agentes) sobre Ollama Cloud.

Arquitectura (ver AGENTS.md):
  Texto libre → router (supervisor) → delega a sub-agente (reservas/finanzas/domotica).
  /reservas, /stats → directo al sub-agente, sin pasar por el router.

Regla de contexto: los sub-agentes actuales COMPARTEN el historial de conversación
(history[-8:]). Agentes futuros para usuarios distintos al anfitrión deben ser AISLADOS.
"""
import asyncio
import logging
import os

from telegram import Update
from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

import auth
from router import router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("rumihome-agent")

TELEGRAM_BOT_TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]
ALLOWED_CHAT_ID = int(os.environ["TELEGRAM_CHAT_ID"])

auth.configure(os.environ["FIREBASE_EMAIL"], os.environ["FIREBASE_PASSWORD"])


async def run_agent(agent, messages: list) -> str:
    """Ejecuta un agente (síncrono) en un hilo para no bloquear el loop de Telegram."""
    result = await asyncio.to_thread(agent.invoke, {"messages": messages})
    return result["messages"][-1].content


def _authorized(update: Update) -> bool:
    return update.effective_chat is not None and update.effective_chat.id == ALLOWED_CHAT_ID


async def cmd_reservas(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Comando directo al sub-agente de reservas (sin router)."""
    if not _authorized(update):
        return
    from agents import build_reservas

    await context.bot.send_chat_action(chat_id=update.message.chat_id, action="typing")
    answer = await run_agent(build_reservas(), [("user", "Lista las reservas")])
    await update.message.reply_text(answer)


async def cmd_stats(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Comando directo al sub-agente de finanzas (sin router)."""
    if not _authorized(update):
        return
    from agents import build_finanzas

    await context.bot.send_chat_action(chat_id=update.message.chat_id, action="typing")
    answer = await run_agent(build_finanzas(), [("user", "Dame los stats del mes y el neto")])
    await update.message.reply_text(answer)


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _authorized(update):
        return
    await update.message.reply_text(
        "¡Hola Daniel! 👋 Soy Rumihome Assistant.\n\n"
        "Puedo crear reservas, consultar el calendario, ver stats del mes, "
        "gastos, consumo de energía y más.\n\n"
        "Ejemplos:\n"
        "• Crea una reserva para Ana López, RUT 7.777.777-7, del 20 al 25 de septiembre, 2 personas, $45.000 la noche\n"
        "• ¿Cómo va el mes?\n"
        "• Confirma la reserva RUMI-XXXXXX\n"
        "• ¿Cuánta energía usaron los huéspedes esta semana?"
    )


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _authorized(update) or not update.message or not update.message.text:
        if update.effective_chat:
            log.warning("Chat no autorizado ignorado: %s", update.effective_chat.id)
        return

    text = update.message.text
    chat_id = update.message.chat_id
    log.info("Mensaje de %s: %s", chat_id, text[:80])

    history = context.chat_data.get("history", [])
    await context.bot.send_chat_action(chat_id=chat_id, action="typing")

    messages = history[-8:] + [("user", text)]
    try:
        answer = await run_agent(router, messages)
    except Exception:
        log.exception("Error ejecutando el router")
        await update.message.reply_text("Ocurrió un error procesando tu mensaje. Intenta de nuevo.")
        return

    context.chat_data["history"] = history + [("user", text), ("assistant", answer)]

    # Telegram limita 4096 caracteres por mensaje
    for i in range(0, len(answer), 4000):
        await update.message.reply_text(answer[i : i + 4000])


def main() -> None:
    app = Application.builder().token(TELEGRAM_BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("reservas", cmd_reservas))
    app.add_handler(CommandHandler("stats", cmd_stats))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    log.info("Rumihome Assistant (router + sub-agentes) iniciado (whitelist chat %s)", ALLOWED_CHAT_ID)
    app.run_polling(drop_pending_updates=True)


if __name__ == "__main__":
    main()