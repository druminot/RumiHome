"""Runner de prueba del grafo (T3): ejecuta el flujo completo y cronometra.

Uso: .venv/bin/python runner_test.py "<feature>" [decision_aprobar]
La decisión (APROBAR) se auto-envía al interrupt para pruebas de regresión.
"""
import asyncio
import os
import sys
import time

sys.path.insert(0, "/opt/rumihome-rr/agent-dev")
os.environ.setdefault("TELEGRAM_BOT_TOKEN_DEV", "x")
os.environ.setdefault("TELEGRAM_CHAT_ID_DEV", "1")

from graph_flow import build_graph  # noqa: E402
from graph_flow_core import _outbox, bind_loop  # noqa: E402

FEATURE = sys.argv[1] if len(sys.argv) > 1 else "T3: agrega una seccion de testimonios al landing (3 tarjetas con cita, nombre y comuna; estilos acordes al landing actual)"
AUTO_DECISION = sys.argv[2] if len(sys.argv) > 2 else "APROBAR"
THREAD = f"t3-{int(time.time()) % 100000}"

T0 = time.time()


def t() -> str:
    return f"[{int(time.time() - T0):4d}s]"


def drain_print() -> None:
    """Drena la outbox e imprime a stdout (UI de prueba)."""
    import queue as _q

    while True:
        try:
            chat_id, text = _outbox.get(timeout=2)
            print(f"\n{t()} ── TELEGRAM ──\n{text[:800]}\n", flush=True)
            _outbox.task_done()
        except _q.Empty:
            continue


async def main() -> None:
    bind_loop(asyncio.get_running_loop())
    graph = await build_graph()
    drainer = asyncio.to_thread(drain_print)
    state_in = {
        "thread_id": THREAD,
        "chat_id": 0,  # sin Telegram real en el test
        "feature": FEATURE,
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
    config = {"configurable": {"thread_id": THREAD}}
    print(f"{t()} ▶ invocando grafo (pm_plan)…", flush=True)
    final = await graph.ainvoke(state_in, config, version="v2")
    final_v = final.value if hasattr(final, "value") else final
    print(f"\n{t()} ── grafo pausado en awaiting_approval; estado: veredicto={final_v.get('veredicto')!r}", flush=True)

    # APROBAR automático (test de regresión)
    from langgraph.types import Command

    print(f"{t()} ▶ reanudando con: {AUTO_APPROBAR}", flush=True)
    final = await graph.ainvoke(Command(resume=AUTO_APPROBAR), config, version="v2")
    final_v = final.value if hasattr(final, "value") else final
    print(f"\n{t()} ── FIN del grafo. veredicto final: {final_v.get('veredicto')!r}", flush=True)
    print(f"{t()} hechos: {final_v.get('hechos')}", flush=True)
    print(f"{t()} fallos: {final_v.get('fallos') or '(ninguno)'}", flush=True)


AUTO_APPROBAR = "APROBAR"

if __name__ == "__main__":
    asyncio.run(main())