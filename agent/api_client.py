"""Cliente HTTP de la API interna de Rumihome, compartido por todas las tools.

Incluye la autenticación (idToken de Firebase renovado por auth.py) y los
helpers _get/_send con reintentos ante token expirado (401).
"""
import httpx

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


def mes_actual() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).strftime("%Y-%m")