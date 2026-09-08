"""Rumihome Assistant — bot de Telegram con agente LangChain sobre Ollama Cloud.

Arquitectura:
  Telegram (polling) → python-telegram-bot → agente LangChain (create_agent)
  → Ollama Cloud (glm-5.3-flash, endpoint OpenAI-compatible) → tools → API interna.

Solo responde al chat ID autorizado (whitelist de administrador).
"""
import logging
import os

from langchain.agents import create_agent
from langchain_openai import ChatOpenAI
from telegram import Update
from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

import auth
from tools import ALL_TOOLS

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("rumihome-agent")

TELEGRAM_BOT_TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]
ALLOWED_CHAT_ID = int(os.environ["TELEGRAM_CHAT_ID"])

auth.configure(os.environ["FIREBASE_EMAIL"], os.environ["FIREBASE_PASSWORD"])

SYSTEM_PROMPT = """Eres Rumihome Assistant, el asistente de administración del departamento
de arriendo temporal "Departamento Concepción" (rumihome.io). Ayudas a Daniel, el anfitrión,
a gestionar su negocio de arriendo por Telegram.

Reglas:
- Responde SIEMPRE en español, breve y directo. Usa emojis con moderación.
- Para cualquier operación de reservas, finanzas o domótica usa las herramientas disponibles.
- NUNCA inventes datos de reservas, precios ni consumos: consulta las herramientas.
- Fechas en formato YYYY-MM-DD. Dinero en pesos chilenos (CLP).
- Si una herramienta devuelve error, explícalo claramente y sugiere corregir los datos.
- Al crear una reserva, entrega siempre el PNR y la clave de puerta al anfitrión.
- Las reservas nuevas nacen "pendiente": pregunta si desea confirmarla (eso habilita la
  clave de puerta para el pasajero en su portal).
- Arriendos mínimos: desde 2 noches.
- Si piden algo fuera de tu alcance (reservas, stats, gastos, domótica), dilo con cortesía."""


def build_agent():
    llm = ChatOpenAI(
        base_url="https://ollama.com/v1",
        api_key=os.environ["OLLAMA_API_KEY"],
        model="glm-5.3-flash",
        temperature=0.2,
        max_retries=2,
        timeout=90,
    )
    return create_agent(llm, tools=ALL_TOOLS, system_prompt=SYSTEM_PROMPT)


agent = build_agent()


async def run_agent(messages: list) -> str:
    """Ejecuta el agente (síncrono) en un hilo para no bloquear el loop de Telegram."""
    import asyncio

    result = await asyncio.to_thread(agent.invoke, {"messages": messages})
    return result["messages"][-1].content


def _authorized(update: Update) -> bool:
    return update.effective_chat is not None and update.effective_chat.id == ALLOWED_CHAT_ID


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
        answer = await run_agent(messages)
    except Exception:
        log.exception("Error ejecutando el agente")
        await update.message.reply_text("Ocurrió un error procesando tu mensaje. Intenta de nuevo.")
        return

    context.chat_data["history"] = history + [("user", text), ("assistant", answer)]

    # Telegram limita 4096 caracteres por mensaje
    for i in range(0, len(answer), 4000):
        await update.message.reply_text(answer[i : i + 4000])


def main() -> None:
    app = Application.builder().token(TELEGRAM_BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    log.info("Rumihome Assistant iniciado (whitelist chat %s)", ALLOWED_CHAT_ID)
    app.run_polling(drop_pending_updates=True)


if __name__ == "__main__":
    main()