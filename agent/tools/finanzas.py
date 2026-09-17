"""Tools de finanzas. Este dominio COMPARTE el historial de conversación
con el router y los demás sub-agentes (ver AGENTS.md, regla de contexto)."""
from langchain_core.tools import tool

from api_client import _get, mes_actual


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
    m = mes or mes_actual()
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


FINANZAS_TOOLS = [stats_mensuales, calendario_mes, neto_del_mes]