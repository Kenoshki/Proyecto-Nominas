"""Autenticación, autorización y utilidades de seguridad del backend."""
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple
import hashlib
import hmac
import os
import re
import secrets
import threading
import time
import unicodedata

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

import models

# ==========================================
# CONFIGURACIÓN
# ==========================================

JWT_SECRET = os.getenv("JWT_SECRET", "")
if len(JWT_SECRET) < 32:
    raise RuntimeError("JWT_SECRET es obligatorio y debe tener al menos 32 caracteres.")

JWT_ALGORITMO = "HS256"
JWT_EXPIRA_MINUTOS = int(os.getenv("JWT_EXPIRA_MINUTOS", "480"))
RESET_EXPIRA_MINUTOS = 30
EN_PRODUCCION = os.getenv("ENTORNO", "produccion").lower() == "produccion"
# Saltos de proxy de confianza delante de la app (Railway = 1). 0 = no usar X-Forwarded-For.
PROXY_HOPS = int(os.getenv("PROXY_HOPS", "0"))


def normalizar_username(username: str) -> str:
    """Clave canónica para el limitador: sin espacios, sin acentos y sin distinguir mayúsculas,
    como lo hacen las colaciones habituales de MySQL."""
    base = unicodedata.normalize("NFKD", username.strip())
    return "".join(c for c in base if not unicodedata.combining(c)).casefold()

# ==========================================
# CONTRASEÑAS
# ==========================================

_hasher = PasswordHasher()
# Hash de relleno para igualar el tiempo de respuesta cuando el usuario no existe.
_HASH_FALSO = _hasher.hash("relleno-contra-enumeracion-de-usuarios")


def hashear_password(password: str) -> str:
    return _hasher.hash(password)


def verificar_password(hash_guardado: str, password: str) -> bool:
    try:
        return _hasher.verify(hash_guardado, password)
    except (VerificationError, InvalidHashError):
        # Incluye valores heredados en texto plano: nunca autentican.
        return False


def verificar_password_falso(password: str) -> None:
    verificar_password(_HASH_FALSO, password)


def validar_password_nueva(password: str) -> Optional[str]:
    """Devuelve un mensaje de error si la contraseña no cumple la política, o None."""
    if len(password) < 8:
        return "La contraseña debe tener al menos 8 caracteres."
    if len(password) > 128:
        return "La contraseña no puede superar los 128 caracteres."
    if not re.search(r"[A-Za-z]", password) or not re.search(r"\d", password):
        return "La contraseña debe incluir al menos una letra y un número."
    return None


# ==========================================
# JWT
# ==========================================

def _huella_password(password_hash: str) -> str:
    # Cambiar la contraseña invalida los tokens emitidos antes del cambio.
    return hashlib.sha256(password_hash.encode()).hexdigest()[:16]


def crear_token(usuario: "models.Usuario") -> str:
    ahora = datetime.now(timezone.utc)
    payload = {
        "sub": str(usuario.id),
        "pwd": _huella_password(usuario.password_hash),
        "iat": ahora,
        "exp": ahora + timedelta(minutes=JWT_EXPIRA_MINUTOS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITMO)


def decodificar_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(
            token, JWT_SECRET, algorithms=[JWT_ALGORITMO],
            options={"require": ["exp", "sub", "pwd"]},
        )
    except jwt.PyJWTError:
        return None


def token_coincide_con_usuario(payload: dict, usuario: "models.Usuario") -> bool:
    return hmac.compare_digest(payload.get("pwd", ""), _huella_password(usuario.password_hash))


# ==========================================
# CÓDIGOS DE RESTABLECIMIENTO
# ==========================================

# Subclave derivada: el secreto de firma de JWT no se reutiliza directamente como clave del HMAC.
_CLAVE_RESET = hmac.new(JWT_SECRET.encode(), b"nomina:reset-code:v1", hashlib.sha256).digest()

_ALFABETO_CODIGO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # sin 0/O/1/I


def generar_codigo_reset() -> str:
    return "".join(secrets.choice(_ALFABETO_CODIGO) for _ in range(10))


def hashear_codigo(codigo: str) -> str:
    normalizado = codigo.strip().upper().replace("-", "").replace(" ", "")
    return hmac.new(_CLAVE_RESET, normalizado.encode(), hashlib.sha256).hexdigest()


# ==========================================
# LIMITADOR DE INTENTOS (en memoria, por proceso)
# ==========================================

class LimitadorIntentos:
    def __init__(self, maximo: int, ventana_seg: int):
        self.maximo = maximo
        self.ventana = ventana_seg
        self._intentos: dict = {}
        self._lock = threading.Lock()

    def _purgar(self, clave: str, ahora: float) -> list:
        vigentes = [t for t in self._intentos.get(clave, []) if ahora - t < self.ventana]
        if vigentes:
            self._intentos[clave] = vigentes
        else:
            self._intentos.pop(clave, None)
        return vigentes

    def bloqueado(self, clave: str) -> bool:
        with self._lock:
            return len(self._purgar(clave, time.monotonic())) >= self.maximo

    def fallo(self, clave: str) -> None:
        with self._lock:
            ahora = time.monotonic()
            if len(self._intentos) > 10000:
                for k in list(self._intentos):
                    self._purgar(k, ahora)
            self._intentos.setdefault(clave, []).append(ahora)

    def exito(self, clave: str) -> None:
        with self._lock:
            self._intentos.pop(clave, None)


limitador_login = LimitadorIntentos(maximo=5, ventana_seg=15 * 60)


# ==========================================
# AUTORIZACIÓN POR RUTA (denegar por defecto)
# ==========================================

RUTAS_PUBLICAS = {
    "/health",
    "/api/auth/login",
    "/api/auth/restablecer-password",
}

_MODULOS_LECTURA_EMPLEADOS = ("acceso_rrhh", "acceso_nominas", "acceso_procesos")

# prefijo -> permisos (cualquiera de ellos basta) para métodos que modifican datos
_ESCRITURA = (
    ("/api/empleados", ("acceso_rrhh",)),
    ("/api/rrhh", ("acceso_rrhh",)),
    ("/api/nominas", ("acceso_nominas",)),
    ("/api/procesos", ("acceso_procesos",)),
    ("/api/mantenimiento", ("acceso_mantenimiento",)),
    ("/api/contabilidad", ("acceso_contabilidad",)),
)

# Lecturas restringidas; el resto de GET exige solo sesión válida.
_LECTURA = (
    ("/api/contabilidad/asientos", ("acceso_contabilidad",)),
    ("/api/reporteria", ("acceso_rrhh", "acceso_nominas")),
    ("/api/empleados", _MODULOS_LECTURA_EMPLEADOS),
    ("/api/rrhh", _MODULOS_LECTURA_EMPLEADOS),
)


def _empieza_con(ruta: str, prefijo: str) -> bool:
    return ruta == prefijo or ruta.startswith(prefijo + "/")


def es_ruta_publica(ruta: str) -> bool:
    return ruta.rstrip("/") in RUTAS_PUBLICAS


def permisos_requeridos(metodo: str, ruta: str) -> Tuple[bool, Tuple[str, ...]]:
    """Devuelve (solo_admin, permisos_alternativos). Tupla vacía = basta con sesión válida."""
    ruta = ruta.rstrip("/")
    if _empieza_con(ruta, "/api/admin"):
        return True, ()
    tabla = _LECTURA if metodo in ("GET", "HEAD") else _ESCRITURA
    for prefijo, permisos in tabla:
        if _empieza_con(ruta, prefijo):
            return False, permisos
    if metodo not in ("GET", "HEAD") and not _empieza_con(ruta, "/api/auth"):
        # Escritura en una ruta sin regla: solo administradores.
        return True, ()
    return False, ()


def usuario_autorizado(usuario: "models.Usuario", metodo: str, ruta: str) -> bool:
    solo_admin, permisos = permisos_requeridos(metodo, ruta)
    if usuario.es_admin:
        return True
    if solo_admin:
        return False
    return not permisos or any(getattr(usuario, p, False) for p in permisos)
