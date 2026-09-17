"""Tools de domótica. Este dominio COMPARTE el historial de conversación
con el router y los demás sub-agentes (ver AGENTS.md, regla de contexto)."""
from langchain_core.tools import tool

from api_client import _get


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


DOMOTICA_TOOLS = [resumen_domotica]