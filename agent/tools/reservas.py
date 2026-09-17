"""Tools de reservas. Este dominio COMPARTE el historial de conversación
con el router y los demás sub-agentes (ver AGENTS.md, regla de contexto)."""
import json

from langchain_core.tools import tool

from api_client import _get, _send


@tool
def listar_reservas() -> str:
    """Lista todas las reservas con PNR, pasajero, fechas, estado, total y clave de puerta."""
    rows = _get("/reservations")
    if not rows:
        return "No hay reservas."
    out = []
    for r in rows[:20]:
        out.append(
            f"{r['pnr']} · {r['guest_name']} · {r['guest_rut']} · "
            f"{r['check_in']} → {r['check_out']} · {r['guests']} pax · "
            f"total ${r['total_price'] if r['total_price'] else 0} · {r['status']}"
            f" · clave: {r.get('door_code') or '—'}"
        )
    return "\n".join(out)


@tool
def crear_reserva(
    guest_name: str,
    guest_rut: str,
    check_in: str,
    check_out: str,
    guests: int = 2,
    price_per_night: int | None = None,
) -> str:
    """Crea una reserva nueva. Fechas en formato YYYY-MM-DD, SIEMPRE con el año actual o futuro (nunca años pasados).
    Si el usuario no especifica año, usa el año vigente (o el siguiente si el mes ya pasó).
    price_per_night opcional en CLP. Devuelve el PNR generado y la clave de puerta de 8 dígitos."""
    from datetime import date

    # Guard: rechazar fechas en el pasado (error típico del LLM sin año explícito)
    hoy = date.today()
    try:
        ci = date.fromisoformat(check_in)
        co = date.fromisoformat(check_out)
    except ValueError:
        return f"Error: fechas inválidas ({check_in} → {check_out}). Usa formato YYYY-MM-DD."
    if ci < hoy or co <= ci:
        return (
            f"Error: la fecha de check-in ({check_in}) está en el pasado o el check-out no es posterior. "
            f"Hoy es {hoy.isoformat()}. Pide al anfitrión confirmar las fechas correctas (¿quería decir {hoy.year}-{ci.month:02d}-{ci.day:02d}?)."
        )

    payload = {
        "property_id": 1,
        "guest_name": guest_name,
        "guest_rut": guest_rut,
        "check_in": check_in,
        "check_out": check_out,
        "guests": guests,
    }
    if price_per_night is not None:
        payload["price_per_night"] = price_per_night
    res = _send("POST", "/reservations", payload)
    if "error" in res:
        return f"Error: {res['error']}"
    noches = res.get("total_price") and res["price_per_night"] and res["total_price"] // res["price_per_night"]
    return (
        f"Reserva creada ✅\nPNR: {res['pnr']}\nPasajero: {res['guest_name']}\n"
        f"Fechas: {res['check_in']} → {res['check_out']} ({noches} noches)\n"
        f"Total: ${res['total_price'] or 0} CLP\nClave de puerta: {res.get('door_code')}\n"
        f"Estado: {res['status']} (recuerda confirmarla si ya está pagada)"
    )


@tool
def buscar_reserva(pnr: str) -> str:
    """Busca una reserva por su PNR (ej: RUMI-2TW7J8) y muestra todos sus datos."""
    rows = _get("/reservations")
    pnr_up = pnr.strip().upper()
    for r in rows:
        if r["pnr"].upper() == pnr_up:
            return json.dumps(r, ensure_ascii=False, indent=1)
    return f"No encontré la reserva {pnr_up}."


@tool
def cambiar_estado_reserva(pnr: str, estado: str) -> str:
    """Cambia el estado de una reserva por PNR. Estado: pendiente, confirmada, cancelada o finalizada."""
    rows = _get("/reservations")
    pnr_up = pnr.strip().upper()
    rid = next((r["id"] for r in rows if r["pnr"].upper() == pnr_up), None)
    if rid is None:
        return f"No encontré la reserva {pnr_up}."
    res = _send("PATCH", f"/reservations/{rid}", {"status": estado})
    if "error" in res:
        return f"Error: {res['error']}"
    return f"{res['pnr']} ahora está {res['status']} ✅"


RESERVAS_TOOLS = [listar_reservas, crear_reserva, buscar_reserva, cambiar_estado_reserva]