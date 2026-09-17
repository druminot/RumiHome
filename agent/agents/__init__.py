"""Fábrica de sub-agentes LangChain sobre Ollama Cloud.

Cada sub-agente tiene su system prompt específico y solo las tools de su
dominio. El contexto compartido (historial) lo inyecta main.py al invocarlos.

Regla de contexto: los sub-agentes actuales COMPARTEN historial; agentes
futuros para usuarios distintos al anfitrión deben ser AISLADOS (AGENTS.md).
"""
import os
from datetime import date

from langchain.agents import create_agent
from langchain_openai import ChatOpenAI

from tools.domotica import DOMOTICA_TOOLS
from tools.finanzas import FINANZAS_TOOLS
from tools.reservas import RESERVAS_TOOLS


def _llm() -> ChatOpenAI:
    return ChatOpenAI(
        base_url="https://ollama.com/v1",
        api_key=os.environ["OLLAMA_API_KEY"],
        model="glm-5.3-flash",
        temperature=0.2,
        max_retries=2,
        timeout=90,
    )


def _base_prompt(rol: str, alcance: str) -> str:
    hoy = date.today()
    return f"""Eres el agente de {rol} de Rumihome, asistente del departamento de arriendo
temporal "Departamento Concepción" (rumihome.io). Ayudas a Daniel, el anfitrión, por Telegram.

{alcance}

Reglas:
- Responde SIEMPRE en español, breve y directo. Usa emojis con moderación.
- NUNCA inventes datos de reservas, precios ni consumos: consulta las herramientas.
- Fechas en formato YYYY-MM-DD. Dinero en pesos chilenos (CLP).
- CRÍTICO en fechas: SIEMPRE piensa el año explícitamente. Estamos en {hoy.strftime("%d-%m-%Y")}. Si el usuario dice
  "del 15 al 18 de noviembre" sin año, usa noviembre de {hoy.year} si aún no pasó, o el año siguiente.
  NUNCA uses años pasados. Verifica el año ANTES de llamar a la herramienta.
- Si una herramienta devuelve error, explícalo claramente y sugiere corregir los datos.
- Arriendos mínimos: desde 2 noches.
- Si piden algo fuera de tu alcance, dilo con cortesía y sugiere reformular la consulta."""


PROMPT_RESERVAS = _base_prompt(
    "reservas",
    "Tu alcance: crear, listar, buscar y cambiar el estado de reservas. Al crear una reserva, "
    "entrega siempre el PNR y la clave de puerta al anfitrión. Las reservas nuevas nacen 'pendiente': "
    "pregunta si desea confirmarla (eso habilita la clave de puerta para el pasajero en su portal).",
)

PROMPT_FINANZAS = _base_prompt(
    "finanzas",
    "Tu alcance: métricas del mes, calendario de ocupación y resumen financiero (neto con desglose "
    "de gastos, supermercado y publicidad).",
)

PROMPT_DOMOTICA = _base_prompt(
    "domótica",
    "Tu alcance: estado domótico del departamento — dispositivos, energía huésped vs admin, tarifa "
    "y eventos de llave.",
)


def build_reservas():
    return create_agent(_llm(), tools=RESERVAS_TOOLS, system_prompt=PROMPT_RESERVAS)


def build_finanzas():
    return create_agent(_llm(), tools=FINANZAS_TOOLS, system_prompt=PROMPT_FINANZAS)


def build_domotica():
    return create_agent(_llm(), tools=DOMOTICA_TOOLS, system_prompt=PROMPT_DOMOTICA)