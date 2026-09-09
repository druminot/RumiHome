"""Autenticación contra Firebase Auth REST + refresh automático del idToken.

El agente se autentica como el usuario admin una sola vez, guarda el
refresh_token (larga duración) y renueva el idToken cuando expira (~1h).
"""
import time
import threading

import httpx

API_KEY = "AIzaSyCpuL_aoKkogaWtkhPKsnWRw68FP5J5ecg"
# Importante: la API key va en el header X-goog-api-key, NO como query param.
# El formato legacy (?key=) ahora devuelve tokens de sesión (iss identitytoolkit, kid corto)
# que el backend no puede verificar.
SIGNUP_URL = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword"
REFRESH_URL = f"https://securetoken.googleapis.com/v1/token?key={API_KEY}"
_headers = {"X-goog-api-key": API_KEY}

_email: str = ""
_password: str = ""
_id_token: str | None = None
_refresh_token: str | None = None
_expires_at: float = 0.0
_lock = threading.Lock()


def configure(email: str, password: str) -> None:
    global _email, _password
    _email = email
    _password = password


def _login(client: httpx.Client) -> tuple[str, str, float]:
    res = client.post(
        SIGNUP_URL,
        json={"email": _email, "password": _password, "returnSecureToken": True},
        headers=_headers,
        timeout=15,
    )
    res.raise_for_status()
    data = res.json()
    return data["idToken"], data["refreshToken"], time.time() + int(data["expiresIn"]) - 60


def _refresh(client: httpx.Client) -> tuple[str, str, float]:
    res = client.post(
        REFRESH_URL,
        json={"grant_type": "refresh_token", "refresh_token": _refresh_token},
        timeout=15,
    )
    res.raise_for_status()
    data = res.json()
    return data["id_token"], data["refresh_token"], time.time() + int(data["expires_in"]) - 60


def get_token(client: httpx.Client) -> str:
    """Devuelve un idToken válido, renovando con el refresh_token si expiró."""
    global _id_token, _refresh_token, _expires_at
    with _lock:
        if _id_token is not None and time.time() < _expires_at:
            return _id_token
        if _refresh_token is None:
            _id_token, _refresh_token, _expires_at = _login(client)
        else:
            try:
                _id_token, _refresh_token, _expires_at = _refresh(client)
            except Exception:
                # refresh inválido → re-login completo
                _id_token, _refresh_token, _expires_at = _login(client)
        return _id_token