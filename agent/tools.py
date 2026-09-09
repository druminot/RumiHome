"""Tools del agente: envuelven la API REST interna de Rumihome.

Cada herramienta es una función Python que LangChain puede invocar.
La autenticación usa el idToken de Firebase renovado por auth.py.
"""
import calendar as cal
import json
from datetime import datetime, timezone

import httpx
from langchain_core.tools import tool

import auth

API_BASE = "http://rumihome-api:3001/api"
_client = httpx.Client(timeout=30)


def _get(path: str, params: dict | None = None) -> dict | list:
    token = auth.get_token(_client)
    res = _client.get(f"{API_BASE}{path}", params=params, headers={"Authorization": f"Bearer {token}"})
    if res.status_code == 401:
        token = auth.get_token(_client)  # fuerza renovación
        res = _client.get(f"{API_BASE}{path}", params=params, headers={"Authorization": f"Bearer {token}"})
    res.raise_for_status()
    return res.json() if res.status_code != 204 else {}


def _send(method: str, path: str, payload: dict | None = None) -> dict | list:
    token = auth.get_token(_client)
    res = _client.request(method, f"{API_BASE}{path}", json=payload, headers={"Authorization": f"Bearer {token}"})
    if res.status_code == 401:
        token = auth.get_token(_client)
        res = _client.request(method, f"{API_BASE}{path}", json=payload, headers={"Authorization": f"Bearer {token}"})
    if res.status_code >= 400:
        return {"error": res.json().get("error", f"HTTP {res.status_code}"), "status": res.status_code}
    return res.json() if res.status_code != 204 else {"ok": True}


def _mes_actual() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


# ============ Reservas ============

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


# ============ Negocio ============

@tool
def stats_mensuales() -> str:
    """Métricas del mes: ingresos, ocupación %, próximas llegadas y próximo check-in."""
    s = _get("/stats")
    nxt = s.get("next_checkin")
    return (
        f"📊 Stats del mes\n"
        f"Ingresos: ${s['month_income']} CLP\n"
        f"Ocupación: {s['occupancy_percent']}%\n"
        f"Próximas llegadas: {s['upcoming_checkins']}\n"
        f"Reservas activas: {s['active_reservations']}\n"
        f"Próximo check-in: {nxt['guest_name']} ({nxt['check_in']})" if nxt else "Sin próximos check-ins"
    )


@tool
def calendario_mes(anio: int, mes: int) -> str:
    """Ocupación del calendario de un mes (1-12). Devuelve los días libres y ocupados con PNR."""
    days = _get(f"/calendar/1/{anio}/{mes}")["days"]
    libres = [d["date"][-2:] for d in days if d["status"] == "libre"]
    ocupados = [f"{d['date'][-2:]} ({d.get('pnr', '')})" for d in days if d["status"] != "libre"]
    MESES_ES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"]
    nombre = MESES_ES[mes - 1]
    return (
        f"📅 {nombre} {anio}\n"
        f"Libres: {', '.join(libres) if libres else 'ninguno'}\n"
        f"Ocupados: {', '.join(ocupados) if ocupados else 'ninguno'}"
    )


@tool
def neto_del_mes(mes: str | None = None) -> str:
    """Resumen financiero: neto del mes (ingresos - gastos - supermercado - publicidad) con desglose.
    Formato del mes: YYYY-MM. Sin argumento usa el mes actual."""
    m = mes or _mes_actual()
    f = _get("/analytics/finance", {"month": m})
    cats = ", ".join(f"{c['category']}: ${c['total']}" for c in f["expenses_by_category"]) or "sin gastos"
    social = ", ".join(
        f"{p['platform']}: ${p['ad_spend']} ({p['bookings']} reservas)"
        for p in f["social_by_platform"]
    ) or "sin publicidad"
    return (
        f"💰 {m}\n"
        f"Ingresos: ${f['income']}\n"
        f"Gastos generales: ${sum(c['total'] for c in f['expenses_by_category'])} ({cats})\n"
        f"Supermercado: ${f['supermarket_total']}\n"
        f"Publicidad: ${f['ad_spend_total']} ({social})\n"
        f"NETO: ${f['net']}"
    )


# ============ Domótica ============

@tool
def resumen_domotica() -> str:
    """Estado domótico: dispositivos, energía diaria huésped vs admin, uso por dispositivo y eventos de llave."""
    s = _get("/smarthome/summary", {"days": 7})
    devs = "\n".join(f"· {d['name']} ({d['type']}) {'ON' if d.get('state') == 'on' else 'off'}" for d in s["devices"]) or "sin dispositivos"
    kwh_guest = sum(d["kwh_guest"] for d in s["energy_daily"])
    kwh_admin = s["admin_usage"]["kwh"]
    events = "\n".join(f"· {e['event_at'][:16]} {e['event_type']} {e.get('detail') or ''}" for e in s["key_events"][:5]) or "sin eventos"
    return (
        f"🏠 Domótica (7 días)\n"
        f"Dispositivos:\n{devs}\n"
        f"Energía huéspedes: {kwh_guest:.1f} kWh · Admin: {kwh_admin:.1f} kWh · "
        f"Tarifa: ${s['kwh_price']}/kWh\n"
        f"Eventos de llave recientes:\n{events}"
    )


ALL_TOOLS = [
    listar_reservas,
    crear_reserva,
    buscar_reserva,
    cambiar_estado_reserva,
    stats_mensuales,
    calendario_mes,
    neto_del_mes,
    resumen_domotica,
]