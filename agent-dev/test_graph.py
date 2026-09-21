"""Test de compilación del grafo (en VPS, venv real)."""
import asyncio
import os
import sys

os.environ.setdefault("TELEGRAM_BOT_TOKEN_DEV", "x")
os.environ.setdefault("TELEGRAM_CHAT_ID_DEV", "1")
sys.path.insert(0, "/opt/rumihome-rr/agent-dev")

import graph_flow


async def main() -> None:
    g = await graph_flow.build_graph()
    nodos = sorted(g.get_graph().nodes.keys())
    print("grafo compilado OK; nodos:", nodos)
    assert set(nodos) >= {"pm_plan", "esperar_aprobar", "ux", "frontend", "backend", "qa", "qa_decide", "deploy", "fallo", "pm_cambios", "cancelado", "aprobar"}
    print("todos los nodos presentes")


asyncio.run(main())