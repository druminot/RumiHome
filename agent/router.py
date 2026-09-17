"""Router (supervisor): clasifica el mensaje del anfitrión y delega al
sub-agente correspondiente mediante tools de delegación.

El router NO conoce la API de Rumihome: solo decide a quién pasarle la
conversación y devuelve la respuesta del sub-agente elegido.
"""
import os

from langchain.agents import create_agent
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI

from agents import build_domotica, build_finanzas, build_reservas

# Sub-agentes construidos una sola vez (reutilizables entre mensajes)
_agent_reservas = build_reservas()
_agent_finanzas = build_finanzas()
_agent_domotica = build_domotica()


@tool
def preguntar_reservas(consulta: str) -> str:
    """Delega al agente de reservas: crear, listar o buscar reservas, cambiar estado (confirmar/cancelar), PNR, clave de puerta."""
    return _agent_reservas.invoke({"messages": [("user", consulta)]})["messages"][-1].content


@tool
def preguntar_finanzas(consulta: str) -> str:
    """Delega al agente de finanzas: stats del mes, ingresos, ocupación, calendario, gastos y neto del mes."""
    return _agent_finanzas.invoke({"messages": [("user", consulta)]})["messages"][-1].content


@tool
def preguntar_domotica(consulta: str) -> str:
    """Delega al agente de domótica: dispositivos, energía de huéspedes vs admin, tarifa y eventos de llave."""
    return _agent_domotica.invoke({"messages": [("user", consulta)]})["messages"][-1].content


ROUTER_SYSTEM_PROMPT = """Eres el router de Rumihome Assistant, el asistente de Telegram de Daniel
(anfitrión del departamento de arriendo temporal "Departamento Concepción", rumihome.io).

Tu único trabajo es clasificar el mensaje y delegar al agente correcto:
- preguntar_reservas: crear/listar/buscar reservas, cambiar estado, PNR, clave de puerta, disponibilidad de fechas.
- preguntar_finanzas: ingresos, ocupación, stats, calendario, gastos, supermercado, publicidad, neto del mes.
- preguntar_domotica: dispositivos, energía eléctrica, tarifa kWh, eventos de llave.

Reglas:
- NO respondas datos de negocio tú mismo: SIEMPRE delega con la herramienta correcta.
- Si el mensaje mezcla dos dominios (ej. "crea la reserva y dime el neto del mes"), delega primero
  al dominio principal y menciona en tu respuesta que pueden consultar el otro por separado.
- Para saludos, agradecimientos o preguntas sobre ti mismo, responde breve y en español sin delegar."""


def build_router():
    llm = ChatOpenAI(
        base_url="https://ollama.com/v1",
        api_key=os.environ["OLLAMA_API_KEY"],
        model="glm-5.3-flash",
        temperature=0.0,
        max_retries=2,
        timeout=120,
    )
    return create_agent(llm, tools=[preguntar_reservas, preguntar_finanzas, preguntar_domotica], system_prompt=ROUTER_SYSTEM_PROMPT)


router = build_router()