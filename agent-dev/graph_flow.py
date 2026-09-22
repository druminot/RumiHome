"""Grafo LangGraph del puente dev (FASE 2) — 100% en el VPS, cero nube.

pm_plan → esperar_aprobar(interrupt) → [ux? → Send(FE∥BE)] → qa → deploy
  · CAMBIOS → pm_cambios → esperar_aprobar (loop máx 3 iteraciones)
  · fallo de paso → protocolo PM v2 (REINTENTO/ESCALAR) → fallo(END)
  · SqliteSaver: checkpoint tras cada super-step (sobrevive reinicios)
  · Trazas locales .rr/trace-<feature>.log con rotación (sin LangSmith)

LangGraph 1.2 adoptado:
  · Nodos de paso async + TimeoutPolicy(run_timeout=) declarativo (set_node_defaults)
  · RetryPolicy para fallos transitorios de red (antes de despertar al PM)
  · error_handler= → NodeError tipado → Command(goto="fallo") con contexto
  · Streaming v2: GraphOutput con .value/.interrupts (sin hack __interrupt__)
"""
import logging
import operator
import re
from pathlib import Path
from typing import Annotated, TypedDict

import aiosqlite
import httpx
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from langgraph.errors import NodeError
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, RetryPolicy, TimeoutPolicy

from graph_flow_core import (
    HALT,
    RR_DIR,
    TIMEOUTS,
    _agent,
    _agent_async,
    _emit,
    _git_summary,
    _parse_tasks,
    _qa_veredicto,
    _read_dato_pedido,
    _read_preguntas,
    _read_route,
    _reset_sessions,
    _run,
    _trace,
)

FLOW_DB = Path(__file__).resolve().parent / "flujo.db"

log = logging.getLogger("rumihome-dev.flow")


class FlowState(TypedDict):
    thread_id: str
    chat_id: int
    feature: str
    feedback: str
    branch: str
    route: dict
    tasks: list
    total_steps: int
    hechos: Annotated[list[str], operator.add]  # pasos completados (por agente)
    iteracion: int
    veredicto: str
    fallos: Annotated[list[str], operator.add]
    plan_texto: str


# ------------------------------------------------------------------- nodos


def n_pm_plan(state: dict) -> dict:
    """PM clasifica complejidad, rutea y delega (formato v2)."""
    chat_id, feature = state["chat_id"], state["feature"]
    # Limpiar artefactos de la feature anterior: sin esto el PM puede reutilizar
    # el plan viejo (vimos al PM "verificar" el plan de T3 en vez de escribir uno nuevo).
    for viejo in ("plan.md", "qa-veredicto.md"):
        try:
            (RR_DIR / ".rr" / viejo).unlink()
        except OSError:
            pass
    _reset_sessions()  # sesiones frescas por feature
    _emit(chat_id, "🧠 Pensando a detalle qué hacer y refinando internamente…")
    rc, out = _agent("pm", f"Nueva feature de Daniel: {feature}", timeout=1200)
    _trace(feature, "pm_plan", out)
    if HALT.exists():
        return {"veredicto": "HALT", "fallos": [f"HALT durante planificación:\n{HALT.read_text()[:800]}"]}
    # NO_FEATURE: el PM determinó que el mensaje era conversación, no feature.
    # Su respuesta tras el marcador ya fue emitida por la sesión; terminamos limpio.
    if out.strip().startswith("NO_FEATURE"):
        _emit(chat_id, out.strip()[len("NO_FEATURE"):].strip() or "👋 De acuerdo — cuando tengas una feature concreta, la describo y planifico.")
        return {"veredicto": "CONVERSACION", "tasks": [], "plan_texto": ""}
    tasks, route = _parse_tasks(), _read_route()
    if not tasks:
        # El PM pudo dejar PREGUNTAS (decisión que solo Daniel toma): pausa
        # de primera clase en vez de disfrazarla de "plan no parseable".
        preguntas = _read_preguntas()
        if preguntas:
            _emit(chat_id, "❓ " + "\n".join(preguntas[:5])[:1200] + "\n\nResponde directo con tus respuestas · CANCELAR para abortar")
            return {"veredicto": "PREGUNTA_PM", "tasks": [], "plan_texto": ""}
        rc2, out2 = _agent(
            "pm",
            "Tu plan no tiene la sección ## TAREAS parseable. Reescribe .rr/plan.md con "
            "TAREAS numeradas en formato: 'N. [agente] descripcion corta'.",
            timeout=600,
        )
        _trace(feature, "pm_reparse", out2)
        tasks = _parse_tasks()
        if not tasks:
            return {"veredicto": "FALLO_PLAN", "fallos": [f"Plan no parseable:\n{out[:800]}"]}
    total = sum(1 for _, a, _ in tasks if a in ("ux", "frontend", "backend", "qa"))
    lista = "\n".join(f"{n}. [{a}] {d}" for n, a, d in tasks)
    ruteo = ", ".join(f"{k}={'✅' if v else '⏭️'}" for k, v in route.items())
    _emit(
        chat_id,
        f"📋 PLAN para: “{feature[:150]}”\n\n{lista}\n\n🧭 Ruteo: {ruteo}\n\n"
        "APROBAR para empezar · CAMBIOS: <ajustes> · CANCELAR",
    )
    return {"route": route, "tasks": tasks, "total_steps": total, "plan_texto": lista}


def n_preguntar(state: dict) -> dict:
    """Pausa nativa del grafo: pregunta del PM esperando respuesta de Daniel.

    El PM dejó PREGUNTAS en plan.md (dato que solo Daniel conoce). La respuesta
    libre de Daniel se pasa al PM como feedback para re-planificar.
    """
    from langgraph.types import interrupt

    respuesta = str(interrupt({"tipo": "pregunta_pm", "feature": state["feature"]}))
    if respuesta.upper() == "CANCELAR":
        return {"veredicto": "CANCELADO"}
    return {
        "feedback": f"Respuestas de Daniel a tus preguntas: {respuesta}",
        "veredicto": "CAMBIOS",  # reusa el loop pm_cambios → re-planifica con las respuestas
    }


def n_esperar_aprobar(state: dict) -> dict:
    """Human-in-the-loop nativo: el grafo SE PAUSA aquí (checkpoint + interrupt)."""
    from langgraph.types import interrupt

    decision = str(interrupt({"feature": state["feature"], "plan": state.get("plan_texto", "")}))
    if decision.upper().startswith("CAMBIOS"):
        return {
            "feedback": decision.split(":", 1)[1].strip() if ":" in decision else "revisar lo pedido",
            "veredicto": "CAMBIOS",
        }
    if decision.upper() == "CANCELAR":
        return {"veredicto": "CANCELADO"}
    return {"veredicto": "APROBADO"}


def n_aprobar(state: dict) -> dict:
    """Determinista: crea el branch de la feature (tras el APROBAR humano)."""
    branch = f"rr-feature-{re.sub(r'[^a-z0-9]+', '-', state['feature'].lower())[:30].strip('-') or 'feature'}"
    _run(["git", "checkout", "-B", branch, "origin/rr"])
    _emit(
        state["chat_id"],
        f"🚀 Plan aprobado — trabajando en {branch} (iteración {state.get('iteracion', 0) + 1})\nTe aviso tras cada paso…",
    )
    return {"branch": branch}


def n_pm_cambios(state: dict) -> dict:
    """CAMBIOS de Daniel: PM ajusta plan.md y vuelve a esperar aprobación."""
    chat_id, feedback = state["chat_id"], state.get("feedback") or "revisar lo pedido"
    _emit(chat_id, "🔄 PM ajustando el plan con tu feedback…")
    rc, out = _agent(
        "pm",
        f"Daniel pidió cambios sobre la feature en curso: {feedback}. "
        "Actualiza .rr/plan.md (ruteo/tareas) y deja las TAREAS parseables.",
        timeout=900,
    )
    _trace(state["feature"], "pm_cambios", out)
    tasks = _parse_tasks()
    if not tasks:
        return {"veredicto": "FALLO_PLAN", "fallos": [f"pm_cambios dejó el plan sin TAREAS:\n{out[:600]}"]}
    total = sum(1 for _, a, _ in tasks if a in ("ux", "frontend", "backend", "qa"))
    lista = "\n".join(f"{n}. [{a}] {d}" for n, a, d in tasks)
    _emit(
        chat_id,
        f"📋 Plan actualizado (iteración {state.get('iteracion', 0) + 1}):\n\n{lista}\n\n"
        "APROBAR para ejecutar · CAMBIOS: <más ajustes> · CANCELAR",
    )
    return {
        "tasks": tasks,
        "route": _read_route(),
        "total_steps": total,
        "hechos": [],  # nueva iteración: pasos desde cero
        "iteracion": state.get("iteracion", 0) + 1,
    }


def _paso(agente: str):
    """Nodo agéntico async: invoca opencode con el protocolo de fallos del PM v2.

    LangGraph 1.2: TimeoutPolicy corta intentos colgados; RetryPolicy reintenta
    fallos transitorios de red; el protocolo PM v2 queda para fallos SEMÁNTICOS.
    """
    etiqueta = {"ux": "🎨 UX", "frontend": "⚙️ Frontend", "backend": "🗄 Backend", "qa": "🔍 QA"}[agente]

    async def node(state: dict) -> dict:
        chat_id, feature, tasks = state["chat_id"], state["feature"], state["tasks"]
        instruccion_base = {
            "ux": f"Feature: {feature}. Ejecuta las tareas de ux según .rr/plan.md y la spec. NO salgas de tu rol.",
            "frontend": f"Feature: {feature}. Ejecuta SOLO las tareas de frontend según .rr/plan.md (y la spec ux si existe).",
            "backend": f"Feature: {feature}. Ejecuta SOLO las tareas de backend según .rr/plan.md.",
            "qa": f"Valida la feature: {feature}. Criterios del plan y de las specs. Veredicto GO/NO-GO en .rr/qa-veredicto.md.",
        }[agente]
        tdesc = next((d for n, a, d in tasks if a == agente), agente)
        paso_num = len(state.get("hechos", [])) + 1

        async def intento(instruccion: str) -> tuple[int, str]:
            _emit(chat_id, f"▶️ {paso_num}/{state['total_steps']} — {etiqueta} trabajando: {tdesc}…")
            rc, out = await _agent_async(agente, instruccion, timeout=TIMEOUTS.get(agente, 720))
            _trace(feature, agente, out)
            return rc, out

        rc, out = await intento(instruccion_base)
        if rc != 0:
            # Puede ser un DATO_PEDIDO disfrazado de salida no-cero: revisar antes de fallar.
            dato = _read_dato_pedido()
            if dato:
                return await _pedir_dato(state, agente, instruccion_base, dato)
            fallo = f"agente {agente} salió rc={rc}" + (" (timeout)" if rc == 124 else "")
            log.warning("Paso %s falló: %s", agente, fallo)
            _emit(chat_id, f"⚠️ {etiqueta.split(' ', 1)[0]} falló ({fallo}) — consultando al PM…")
            diag_rc, diag_out = await _agent_async(
                "pm",
                f"FALLO DE AGENTE en la feature en curso. Agente: {agente}. Detalle: {fallo}.\n"
                f"ÚLTIMAS LÍNEAS DE SU OUTPUT:\n{out[-1500:]}\n\n"
                "Aplica tu PROTOCOLO DE FALLOS (diagnostica con ground truth en .rr/ y el repo, decide).\n"
                "Responde OBLIGATORIAMENTE terminando con una línea de decisión:\n"
                f"DECISION: REINTENTO — <instrucción corregida para {agente}>\n"
                "DECISION: ESCALAR — <diagnóstico para Daniel>",
                timeout=TIMEOUTS.get("pm", 480),
            )
            _trace(feature, f"pm_fallo_{agente}", diag_out)
            m = re.search(r"DECISION:\s*(REINTENTO|ESCALAR)(.*)", diag_out, re.IGNORECASE | re.DOTALL)
            decision = m.group(1).upper() if m else "ESCALAR"
            extra = (m.group(2) or "").strip()
            if decision == "REINTENTO":
                _emit(chat_id, f"🔁 PM ordena reintento de {etiqueta.split(' ', 1)[0]} con instrucción corregida…")
                rc, out = await intento(
                    f"{instruccion_base}\n\nINSTRUCCIÓN CORREGIDA POR EL PM TRAS FALLO:\n{extra}"
                )
                if rc != 0:
                    _emit(
                        chat_id,
                        f"❌ {etiqueta.split(' ', 1)[0]} falló 2 veces. Flujo detenido "
                        "(CAMBIOS: <ajuste> para reintentar distinto · CANCELAR para abortar).",
                    )
                    return {"fallos": [f"{fallo} ×2 — decisión PM: {diag_out[-600:]}"]}
            else:
                return {"fallos": [f"{fallo} — decisión PM: ESCALAR. {diag_out[-600:]}"]}
        # rc==0 pero el agente pudo dejar un DATO_PEDIDO (terminó su turno sin completar)
        dato = _read_dato_pedido()
        if dato:
            return await _pedir_dato(state, agente, instruccion_base, dato)
        return {"hechos": [agente]}

    node.__name__ = f"n_{agente}"
    return node


async def _pedir_dato(state: dict, agente: str, instruccion_base: str, pregunta: str) -> dict:
    """El agente necesita un dato que solo Daniel tiene: pausa el grafo con
    interrupt, emite la pregunta por Telegram y — al reanudar con la respuesta —
    re-invoca al MISMO agente con el dato inyectado. Máx 1 pregunta por paso."""
    from langgraph.types import interrupt

    chat_id = state["chat_id"]
    etiqueta = {"ux": "🎨 UX", "frontend": "⚙️ Frontend", "backend": "🗄 Backend", "qa": "🔍 QA"}[agente]
    _emit(chat_id, f"❓ {etiqueta} necesita un dato tuyo:\n\n{pregunta}\n\nResponde directo con el dato · CANCELAR para abortar.")
    respuesta = str(interrupt({"tipo": "dato_pedido", "agente": agente, "pregunta": pregunta[:400]}))
    if respuesta.upper() == "CANCELAR":
        return {"veredicto": "CANCELADO"}
    # Re-invocación con el dato real (continúa la tarea pendiente, no la reinicia)
    _emit(chat_id, f"✅ Dato recibido — {etiqueta} continúa…")
    rc, out = await _agent_async(
        agente,
        f"{instruccion_base}\n\nDATO QUE PEDISTE — RESPUESTA DE DANIEL (úsalo tal cual, NO lo inventes):\n{respuesta[:800]}\n\n"
        "Retoma la tarea pendiente donde la dejaste (revisa plan.md y tu trabajo previo en el branch).",
        timeout=TIMEOUTS.get(agente, 720),
    )
    _trace(state["feature"], f"{agente}_dato", out)
    if rc != 0:
        return {"fallos": [f"{agente} falló tras recibir el dato (rc={rc}): {out[-400:]}"]}
    # Tras recibir el dato puede pedir OTRO (máx 1 por vuelta — si insiste, escala)
    otro = _read_dato_pedido()
    if otro:
        return {"fallos": [f"{agente} pidió otro dato tras recibir respuesta — escalando: {otro[:300]}"]}
    return {"hechos": [agente]}


def _paso_error_handler(agente: str):
    """Error handler declarativo (LangGraph 1.2): tras agotar retries, escalar con contexto.

    La firma exige el 2º parámetro anotado como NodeError (inyección por tipo).
    El PM v2 sigue a cargo de los fallos rc≠0 (semánticos); esto cubre excepciones
    duras (timeout, cancelación, crash del cliente).
    """

    def handler(state: dict, error: NodeError) -> Command:
        detalle = f"{agente}: excepción {type(error.error).__name__}: {error.error}"
        return Command(
            update={"fallos": [detalle]},
            goto="fallo",
        )

    return handler


def n_qa_decide(state: dict) -> dict:
    go, detalle = _qa_veredicto()
    if go:
        _emit(state["chat_id"], "✅ QA listo (GO). Desplegando a staging…")
    else:
        _emit(state["chat_id"], f"❌ QA dio NO-GO:\n{detalle[:600]}")
    return {"veredicto": "GO" if go else "NO-GO"}


def n_deploy(state: dict) -> dict:
    chat_id, tasks = state["chat_id"], state["tasks"]
    _run(["docker", "compose", "-f", "docker-compose.rr.yml", "up", "-d", "--build"], timeout=900)
    resumen = "\n".join(f"✅ {n}. [{a}] {d}" for n, a, d in tasks if a in ("ux", "frontend", "backend", "qa"))
    _emit(
        chat_id,
        f"📦 RESUMEN — feature terminada (iteración {state.get('iteracion', 0) + 1})\n\n{resumen}\n\n"
        f"{_git_summary()}\n\n👀 Revisa: https://rumihome.io/rr/\n\n"
        "• Valida y haz MERGE → PROD en https://rumihome.io/code (árbol de versiones)\n"
        "• CAMBIOS: <detalle> → itera en el mismo branch\n"
        "• 'rollback' → revierte esta feature del staging",
    )
    return {"resumen": resumen}


def n_fallo(state: dict) -> dict:
    detalle = "\n".join(state.get("fallos", []) or ["fallo desconocido"])
    _emit(
        state["chat_id"],
        f"⛔ Flujo detenido por fallos:\n{detalle[:1200]}\n\n"
        "CAMBIOS: <ajuste> para reintentar distinto · CANCELAR para abortar.",
    )
    return {"veredicto": "FALLO"}


def n_cancelado(state: dict) -> dict:
    if state.get("veredicto") != "CONVERSACION":  # CONVERSACION ya emitió su respuesta
        _emit(state["chat_id"], "🚫 Cancelado. Espejo en su branch actual; pídeme una feature nueva cuando quieras.")
    return {}


# ----------------------------------------------------------------- routing


def _ruta_desde_pm(state: dict) -> str:
    if state.get("veredicto") == "CONVERSACION":
        return "cancelado"  # fin limpio sin mensaje de cancelación redundante
    if state.get("veredicto") == "PREGUNTA_PM":
        return "preguntar"  # pausa nativa esperando respuesta de Daniel
    if state.get("veredicto") in ("HALT", "FALLO_PLAN"):
        return "fallo"
    return "esperar_aprobar"


def _ruta_post_aprobar(state: dict) -> str:
    """Tras el interrupt: APROBADO → ejecutar; CAMBIOS → pm_cambios; CANCELADO → fin."""
    if state.get("veredicto") == "APROBADO":
        return "aprobar"
    if state.get("veredicto") == "CAMBIOS":
        return "pm_cambios"
    return "cancelado"


def _siguiente(state: dict) -> str | list:
    """Routing determinista según RUTEO: ux? → Send(FE∥BE) → qa. Send = paralelo.

    v2: el estado que llega ya no contiene __interrupt__ (GraphOutput lo separa),
    pero el pop defensivo se mantiene como no-op inofensivo por compatibilidad.
    """
    if state.get("fallos"):
        return "fallo"
    from langgraph.types import Send

    route = state.get("route") or {}
    hechos = set(state.get("hechos", []))

    def pendiente(a: str) -> bool:
        return bool(route.get(a)) and a not in hechos

    if pendiente("ux"):
        return "ux"
    sends = []
    for a in ("frontend", "backend"):
        if pendiente(a):
            sub = dict(state)
            sub.pop("__interrupt__", None)  # defensivo: v1 legacy, v2 nunca lo incluye
            sends.append(Send(a, sub))
    if sends:
        return sends
    return "qa"


def _post_paso_paralelo(state: dict) -> str:
    """FE y BE corren en la misma superstep; al fusionarse, ambas aristas ven esto."""
    return "fallo" if state.get("fallos") else "qa"


def _ruta_qa(state: dict) -> str:
    if state.get("veredicto") == "GO":
        return "deploy"
    if state.get("iteracion", 0) < 3:
        return "pm_cambios"
    return "fallo"


def _ruta_pm_cambios(state: dict) -> str:
    return "fallo" if state.get("veredicto") == "FALLO_PLAN" else "esperar_aprobar"


async def build_graph():
    """Compila el grafo. Async: AsyncSqliteSaver requiere running loop (aiosqlite).

    Usar: graph = await build_graph()  (en _post_startup del bot, loop ya corriendo).
    """
    conn = await aiosqlite.connect(str(FLOW_DB))
    saver = AsyncSqliteSaver(conn)

    g = StateGraph(FlowState)
    g.add_node("pm_plan", n_pm_plan)
    g.add_node("esperar_aprobar", n_esperar_aprobar)
    g.add_node("preguntar", n_preguntar)
    g.add_node("aprobar", n_aprobar)  # determinista: crea branch rr-feature-*
    g.add_node("pm_cambios", n_pm_cambios)

    # Nodos de paso: async + TimeoutPolicy declarativo (única fuente: TIMEOUTS en core)
    # + RetryPolicy para fallos transitorios + error_handler para excepciones duras.
    # Nota: run_timeout = timeout por INTENTO + margen 60s (RetryPolicy re-invoca).
    for agente in ("ux", "frontend", "backend", "qa"):
        g.add_node(
            agente,
            _paso(agente),
            timeout=TimeoutPolicy(run_timeout=TIMEOUTS.get(agente, 720) + 60),
            retry_policy=RetryPolicy(max_attempts=2, retry_on=(ConnectionError, httpx.TransportError)),
            error_handler=_paso_error_handler(agente),
        )

    g.add_node("qa_decide", n_qa_decide)
    g.add_node("deploy", n_deploy)
    g.add_node("fallo", n_fallo)
    g.add_node("cancelado", n_cancelado)

    g.add_edge(START, "pm_plan")
    g.add_conditional_edges("pm_plan", _ruta_desde_pm, ["esperar_aprobar", "preguntar", "fallo"])
    g.add_conditional_edges("preguntar", _ruta_post_aprobar, ["aprobar", "pm_cambios", "cancelado"])
    g.add_conditional_edges("esperar_aprobar", _ruta_post_aprobar, ["aprobar", "pm_cambios", "cancelado"])
    g.add_conditional_edges("aprobar", _siguiente, ["ux", "frontend", "backend", "qa", "fallo"])
    g.add_conditional_edges("ux", _siguiente, ["frontend", "backend", "qa", "fallo"])
    g.add_conditional_edges("frontend", _post_paso_paralelo, ["qa", "fallo"])
    g.add_conditional_edges("backend", _post_paso_paralelo, ["qa", "fallo"])
    g.add_edge("qa", "qa_decide")
    g.add_conditional_edges("qa_decide", _ruta_qa, ["deploy", "pm_cambios", "fallo"])
    g.add_edge("deploy", END)
    g.add_conditional_edges("pm_cambios", _ruta_pm_cambios, ["esperar_aprobar", "fallo"])
    g.add_edge("fallo", END)
    g.add_edge("cancelado", END)

    return g.compile(checkpointer=saver)