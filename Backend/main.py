from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker, Session
from pydantic import BaseModel, Field
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from typing import List, Optional
from fastapi.responses import StreamingResponse
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from dotenv import load_dotenv
import hmac
import logging
import threading
import os
import pandas as pd
import io
import json
import models

load_dotenv()
import security  # noqa: E402  (requiere el .env ya cargado)

logger = logging.getLogger("nomina")


def _ahora_utc() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)

SessionLocal = sessionmaker(bind=models.engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def autenticar(request: Request, db: Session = Depends(get_db)):
    """Dependencia global: exige sesión válida y permiso del módulo en toda ruta no pública."""
    if request.method == "OPTIONS" or security.es_ruta_publica(request.url.path):
        return None

    cabecera = request.headers.get("Authorization", "")
    esquema, _, token = cabecera.partition(" ")
    payload = security.decodificar_token(token) if esquema.lower() == "bearer" and token else None
    if not payload:
        raise HTTPException(status_code=401, detail="Sesión inválida o expirada.",
                            headers={"WWW-Authenticate": "Bearer"})

    usuario = db.query(models.Usuario).filter(models.Usuario.id == int(payload["sub"])).first()
    if not usuario or not security.token_coincide_con_usuario(payload, usuario):
        raise HTTPException(status_code=401, detail="Sesión inválida o expirada.",
                            headers={"WWW-Authenticate": "Bearer"})

    if not security.usuario_autorizado(usuario, request.method, request.url.path):
        raise HTTPException(status_code=403, detail="No tienes permisos para esta operación.")

    request.state.usuario = usuario
    return usuario


def usuario_actual(request: Request) -> "models.Usuario":
    return request.state.usuario


def _bootstrap_admin():
    """Crea el administrador inicial si no hay usuarios y ADMIN_PASSWORD está definido."""
    password = os.getenv("ADMIN_PASSWORD", "")
    if not password:
        return
    db = SessionLocal()
    try:
        if db.query(models.Usuario).count() > 0:
            return
        error = security.validar_password_nueva(password)
        if error:
            logger.error("ADMIN_PASSWORD no cumple la política: %s", error)
            return
        db.add(models.Usuario(
            username=os.getenv("ADMIN_USERNAME", "admin").strip() or "admin",
            password_hash=security.hashear_password(password),
            es_admin=True, acceso_rrhh=True, acceso_nominas=True,
            acceso_procesos=True, acceso_mantenimiento=True, acceso_contabilidad=True,
        ))
        db.commit()
        logger.info("Administrador inicial creado.")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    _bootstrap_admin()
    yield


app = FastAPI(
    title="API Sistema de Nómina y Contabilidad",
    description="Backend completo con Módulos de RRHH, Mantenimiento, Nóminas y Contabilidad",
    version="2.6.0",
    dependencies=[Depends(autenticar)],
    lifespan=lifespan,
    docs_url=None if security.EN_PRODUCCION else "/docs",
    redoc_url=None if security.EN_PRODUCCION else "/redoc",
    openapi_url=None if security.EN_PRODUCCION else "/openapi.json",
)

ORIGENES_PERMITIDOS = [o.strip().rstrip("/") for o in os.getenv("ORIGENES", "").split(",") if o.strip()]
if "*" in ORIGENES_PERMITIDOS:
    raise RuntimeError("ORIGENES no puede contener '*'. Indica la URL exacta del Frontend.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGENES_PERMITIDOS,
    allow_credentials=False,  # la sesión viaja en Authorization: Bearer, no en cookies
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.middleware("http")
async def cabeceras_seguridad(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Cache-Control", "no-store")
    return response


@app.get("/health")
def health(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ok"}


# ==========================================
# MÓDULO AUTH
# ==========================================

class LoginRequest(BaseModel):
    username: str = Field(max_length=50)
    password: str = Field(max_length=128)


class CambioPasswordRequest(BaseModel):
    password_actual: str = Field(max_length=128)
    password_nueva: str = Field(max_length=128)


class RestablecerPasswordRequest(BaseModel):
    username: str = Field(max_length=50)
    codigo: str = Field(max_length=32)
    password_nueva: str = Field(max_length=128)


def _ip_cliente(request: Request) -> str:
    """IP para el limitador. Tras el proxy de Railway se toma la entrada que ESE proxy añadió
    (la n-ésima desde la derecha de X-Forwarded-For), nunca la que envía el cliente."""
    if security.PROXY_HOPS > 0:
        partes = [p.strip() for p in request.headers.get("X-Forwarded-For", "").split(",") if p.strip()]
        if len(partes) >= security.PROXY_HOPS:
            return partes[-security.PROXY_HOPS]
    return request.client.host if request.client else "desconocida"


def _perfil(usuario: "models.Usuario") -> dict:
    return {
        "id": usuario.id,
        "username": usuario.username,
        "es_admin": usuario.es_admin,
        "acceso_rrhh": usuario.acceso_rrhh,
        "acceso_nominas": usuario.acceso_nominas,
        "acceso_procesos": usuario.acceso_procesos,
        "acceso_mantenimiento": usuario.acceso_mantenimiento,
        "acceso_contabilidad": usuario.acceso_contabilidad,
    }


@app.post("/api/auth/login")
def login(req: LoginRequest, request: Request, db: Session = Depends(get_db)):
    clave_ip = f"login:{_ip_cliente(request)}"
    clave_usuario = f"login-user:{security.normalizar_username(req.username)}"
    if security.limitador_login.bloqueado(clave_ip) or security.limitador_login.bloqueado(clave_usuario):
        raise HTTPException(status_code=429, detail="Demasiados intentos fallidos. Intenta de nuevo en 15 minutos.")

    usuario = db.query(models.Usuario).filter(models.Usuario.username == req.username.strip()).first()
    if usuario and security.verificar_password(usuario.password_hash, req.password):
        security.limitador_login.exito(clave_ip)
        security.limitador_login.exito(clave_usuario)
        return {"token": security.crear_token(usuario), "usuario": _perfil(usuario)}

    if not usuario:
        security.verificar_password_falso(req.password)
    security.limitador_login.fallo(clave_ip)
    security.limitador_login.fallo(clave_usuario)
    raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")


@app.get("/api/auth/me")
def perfil_actual(usuario: models.Usuario = Depends(usuario_actual)):
    return _perfil(usuario)


@app.post("/api/auth/cambiar-password")
def cambiar_password(req: CambioPasswordRequest, usuario: models.Usuario = Depends(usuario_actual),
                     db: Session = Depends(get_db)):
    clave = f"cambio:{usuario.id}"
    if security.limitador_login.bloqueado(clave):
        raise HTTPException(status_code=429, detail="Demasiados intentos fallidos. Intenta de nuevo en 15 minutos.")
    if not security.verificar_password(usuario.password_hash, req.password_actual):
        security.limitador_login.fallo(clave)
        raise HTTPException(status_code=400, detail="La contraseña actual es incorrecta.")
    security.limitador_login.exito(clave)
    error = security.validar_password_nueva(req.password_nueva)
    if error:
        raise HTTPException(status_code=400, detail=error)
    usuario.password_hash = security.hashear_password(req.password_nueva)
    db.commit()
    # El hash cambió: los tokens anteriores dejan de valer; se devuelve uno nuevo.
    return {"mensaje": "Contraseña actualizada correctamente.", "token": security.crear_token(usuario)}


@app.post("/api/auth/restablecer-password")
def restablecer_password(req: RestablecerPasswordRequest, request: Request, db: Session = Depends(get_db)):
    """Restablece la contraseña con un código de un solo uso emitido por un administrador."""
    clave_ip = f"reset:{_ip_cliente(request)}"
    clave_usuario = f"reset-user:{security.normalizar_username(req.username)}"
    if security.limitador_login.bloqueado(clave_ip) or security.limitador_login.bloqueado(clave_usuario):
        raise HTTPException(status_code=429, detail="Demasiados intentos fallidos. Intenta de nuevo en 15 minutos.")

    error_politica = security.validar_password_nueva(req.password_nueva)
    if error_politica:
        raise HTTPException(status_code=400, detail=error_politica)

    mensaje_generico = "Código inválido o vencido. Solicita uno nuevo al administrador."
    usuario = db.query(models.Usuario).filter(models.Usuario.username == req.username).first()
    registro = None
    if usuario:
        registro = db.query(models.PasswordReset).filter(
            models.PasswordReset.usuario_id == usuario.id,
            models.PasswordReset.usado == False,  # noqa: E712
            models.PasswordReset.expira > _ahora_utc(),
        ).order_by(models.PasswordReset.id.desc()).first()

    codigo_ok = bool(registro) and hmac.compare_digest(
        registro.codigo_hash, security.hashear_codigo(req.codigo))
    if not codigo_ok:
        security.limitador_login.fallo(clave_ip)
        security.limitador_login.fallo(clave_usuario)
        raise HTTPException(status_code=400, detail=mensaje_generico)

    usuario.password_hash = security.hashear_password(req.password_nueva)
    db.query(models.PasswordReset).filter(models.PasswordReset.usuario_id == usuario.id).update({"usado": True})
    db.commit()
    security.limitador_login.exito(clave_ip)
    security.limitador_login.exito(clave_usuario)
    return {"mensaje": "Contraseña restablecida. Ya puedes iniciar sesión."}


# ==========================================
# MÓDULO ADMIN: GESTIÓN DE PERMISOS
# ==========================================

class PermisosUpdate(BaseModel):
    es_admin: bool
    acceso_rrhh: bool
    acceso_nominas: bool
    acceso_procesos: bool
    acceso_mantenimiento: bool
    acceso_contabilidad: bool

class UsuarioCreate(BaseModel):
    username: str = Field(min_length=3, max_length=50, pattern=r"^[A-Za-z0-9._-]+$")
    password: str = Field(max_length=128)

@app.get("/api/admin/usuarios")
def listar_usuarios(db: Session = Depends(get_db)):
    return [_perfil(u) for u in db.query(models.Usuario).order_by(models.Usuario.id).all()]

@app.post("/api/admin/usuarios", status_code=201)
def crear_usuario(req: UsuarioCreate, db: Session = Depends(get_db)):
    error = security.validar_password_nueva(req.password)
    if error:
        raise HTTPException(status_code=400, detail=error)
    if db.query(models.Usuario).filter(models.Usuario.username == req.username).first():
        raise HTTPException(status_code=400, detail="El nombre de usuario ya existe.")
    db.add(models.Usuario(username=req.username, password_hash=security.hashear_password(req.password)))
    db.commit()
    return {"mensaje": f"Usuario {req.username} creado sin permisos. Asigna los módulos desde esta pantalla."}

@app.post("/api/admin/usuarios/{usuario_id}/reset-codigo")
def emitir_codigo_reset(usuario_id: int, db: Session = Depends(get_db)):
    """Genera un código de un solo uso (30 min) que el usuario canjea en la pantalla de login."""
    usuario = db.query(models.Usuario).filter(models.Usuario.id == usuario_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    db.query(models.PasswordReset).filter(models.PasswordReset.usuario_id == usuario.id).update({"usado": True})
    codigo = security.generar_codigo_reset()
    db.add(models.PasswordReset(
        usuario_id=usuario.id,
        codigo_hash=security.hashear_codigo(codigo),
        expira=_ahora_utc() + timedelta(minutes=security.RESET_EXPIRA_MINUTOS),
    ))
    db.commit()
    return {"username": usuario.username, "codigo": codigo, "expira_en_minutos": security.RESET_EXPIRA_MINUTOS}

@app.put("/api/admin/usuarios/{usuario_id}/permisos")
def actualizar_permisos(usuario_id: int, req: PermisosUpdate, db: Session = Depends(get_db)):
    usuario = db.query(models.Usuario).filter(models.Usuario.id == usuario_id).with_for_update().first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if usuario.es_admin and not req.es_admin:
        # Bloquea las filas de los demás administradores para que dos degradaciones simultáneas se serialicen.
        otros_admins = len(db.query(models.Usuario).filter(
            models.Usuario.es_admin == True, models.Usuario.id != usuario.id).with_for_update().all())  # noqa: E712
        if otros_admins == 0:
            raise HTTPException(status_code=400, detail="Debe existir al menos un administrador.")

    usuario.es_admin = req.es_admin
    usuario.acceso_rrhh = req.acceso_rrhh
    usuario.acceso_nominas = req.acceso_nominas
    usuario.acceso_procesos = req.acceso_procesos
    usuario.acceso_mantenimiento = req.acceso_mantenimiento
    usuario.acceso_contabilidad = req.acceso_contabilidad
    
    db.commit()
    return {"mensaje": f"Permisos de {usuario.username} actualizados correctamente"}


# ==========================================
# MÓDULO MANTENIMIENTO (CATÁLOGOS Y BLOQUEOS)
# ==========================================

@app.get("/api/mantenimiento/cecos")
def listar_catalogo_cecos(db: Session = Depends(get_db)):
    return db.query(models.CentroCostoCatalogo).all()

@app.post("/api/mantenimiento/cecos")
def crear_catalogo_ceco(datos: dict, db: Session = Depends(get_db)):
    codigo = datos.get("codigo", "")
    if not codigo.isdigit() or len(codigo) != 10:
        raise HTTPException(status_code=400, detail="El CeCo debe tener exactamente 10 dígitos numéricos.")
        
    if db.query(models.CentroCostoCatalogo).filter(models.CentroCostoCatalogo.codigo == codigo).first():
        raise HTTPException(status_code=400, detail="El código de CeCo ya existe en el catálogo.")

    nuevo = models.CentroCostoCatalogo(
        codigo=codigo,
        nombre=datos.get("nombre"),
        unidad=datos.get("unidad"),
        linea_negocio=datos.get("linea_negocio"),
        activo=True
    )
    db.add(nuevo)
    db.commit()
    return {"mensaje": "Centro de Costo registrado en catálogo exitosamente."}

@app.put("/api/mantenimiento/cecos/{ceco_id}/toggle")
def toggle_ceco(ceco_id: int, db: Session = Depends(get_db)):
    ceco = db.query(models.CentroCostoCatalogo).filter(models.CentroCostoCatalogo.id == ceco_id).first()
    if not ceco:
        raise HTTPException(status_code=404, detail="Centro de costo no encontrado en catálogo.")
    ceco.activo = not ceco.activo
    db.commit()
    return {"mensaje": f"Estado del CeCo actualizado correctamente. Activo: {ceco.activo}"}


@app.get("/api/mantenimiento/centros-trabajo")
def listar_centros_trabajo(db: Session = Depends(get_db)):
    return db.query(models.CentroTrabajoCatalogo).all()

@app.post("/api/mantenimiento/centros-trabajo")
def crear_centro_trabajo(datos: dict, db: Session = Depends(get_db)):
    nombre = datos.get("nombre_ubicacion", "").strip().title()
    direccion = datos.get("direccion", "").strip()
    departamento = datos.get("departamento", "").strip().title()
    municipio = datos.get("municipio", "").strip().title()

    nuevo = models.CentroTrabajoCatalogo(
        nombre_ubicacion=nombre,
        direccion=direccion,
        departamento=departamento,
        municipio=municipio,
        activo=True
    )
    db.add(nuevo)
    db.commit()
    return {"mensaje": "Centro de trabajo normalizado y registrado correctamente."}

@app.put("/api/mantenimiento/centros-trabajo/{ct_id}/bloquear")
def bloquear_centro_trabajo(ct_id: int, db: Session = Depends(get_db)):
    ct = db.query(models.CentroTrabajoCatalogo).filter(models.CentroTrabajoCatalogo.id == ct_id).first()
    if not ct:
        raise HTTPException(status_code=404, detail="Centro de trabajo no encontrado.")
    if not ct.activo:
        raise HTTPException(status_code=400, detail="Este Centro de Trabajo ya fue bloqueado permanentemente y no puede rehabilitarse.")
    
    ct.activo = False
    db.commit()
    return {"mensaje": "Centro de trabajo bloqueado permanentemente de forma exitosa."}

@app.get("/api/mantenimiento/puestos")
def listar_catalogo_puestos(db: Session = Depends(get_db)):
    return db.query(models.PuestoCatalogo).all()

@app.post("/api/mantenimiento/puestos")
def crear_catalogo_puesto(datos: dict, db: Session = Depends(get_db)):
    nombre = datos.get("nombre", "").strip().title()
    
    if db.query(models.PuestoCatalogo).filter(models.PuestoCatalogo.nombre == nombre).first():
        raise HTTPException(status_code=400, detail="Este puesto ya existe en el catálogo.")

    nuevo = models.PuestoCatalogo(
        nombre=nombre,
        unidad=datos.get("unidad", "").strip(),
        tipo_puesto=datos.get("tipo_puesto", "").strip(),
        categoria=datos.get("categoria", "").strip(),
        area_funcional=datos.get("area_funcional", "").strip(),
        activo=True
    )
    db.add(nuevo)
    db.commit()
    return {"mensaje": "Puesto registrado en catálogo exitosamente."}

@app.put("/api/mantenimiento/puestos/{puesto_id}/toggle")
def toggle_puesto(puesto_id: int, db: Session = Depends(get_db)):
    puesto = db.query(models.PuestoCatalogo).filter(models.PuestoCatalogo.id == puesto_id).first()
    if not puesto:
        raise HTTPException(status_code=404, detail="Puesto no encontrado.")
    
    puesto.activo = not puesto.activo
    db.commit()
    return {"mensaje": f"Estado del puesto actualizado. Activo: {puesto.activo}"}


# ==========================================
# PARÁMETROS LEGALES, PARTIDA DOBLE Y CUENTAS AFECTAS
# ==========================================

class ParametroCreate(BaseModel):
    rubro_principal_id: int
    rubro_contrapartida_id: int
    valor: float = Field(ge=0, le=1_000_000, allow_inf_nan=False)
    es_porcentaje: bool

class ParametroUpdate(BaseModel):
    valor: float = Field(ge=0, le=1_000_000, allow_inf_nan=False)
    cuentas_afectas_ids: List[int] = Field(max_length=200)

def _exigir_rubros(db: Session, ids):
    ids = set(ids)
    existentes = {r for (r,) in db.query(models.RubroContableNomina.id).filter(models.RubroContableNomina.id.in_(ids)).all()}
    if ids - existentes:
        raise HTTPException(status_code=400, detail="Uno o más rubros indicados no existen.")

@app.get("/api/mantenimiento/parametros")
def listar_parametros(db: Session = Depends(get_db)):
    parametros = db.query(models.ParametroLegal).all()
    return [{
        "id": p.id,
        "nombre": p.rubro_principal.desc_ing_des if p.rubro_principal else "Desconocido",
        "valor": p.valor,
        "es_porcentaje": p.es_porcentaje,
        "rubro_principal_id": p.rubro_principal_id,
        "rubro_contrapartida_id": p.rubro_contrapartida_id,
        "cuentas_afectas_ids": [c.rubro_id for c in p.cuentas_afectas]
    } for p in parametros]

@app.post("/api/mantenimiento/parametros")
def crear_parametro(req: ParametroCreate, db: Session = Depends(get_db)):
    if db.query(models.ParametroLegal).filter(models.ParametroLegal.rubro_principal_id == req.rubro_principal_id).first():
        raise HTTPException(status_code=400, detail="Este rubro ya tiene un parámetro configurado.")
    if req.es_porcentaje and req.valor > 100:
        raise HTTPException(status_code=400, detail="Un porcentaje no puede superar 100.")
    _exigir_rubros(db, [req.rubro_principal_id, req.rubro_contrapartida_id])
        
    nuevo = models.ParametroLegal(
        rubro_principal_id=req.rubro_principal_id,
        rubro_contrapartida_id=req.rubro_contrapartida_id,
        valor=req.valor, 
        es_porcentaje=req.es_porcentaje
    )
    db.add(nuevo)
    db.commit()
    return {"mensaje": "Parámetro legal registrado exitosamente."}

@app.put("/api/mantenimiento/parametros/{param_id}")
def actualizar_parametro(param_id: int, req: ParametroUpdate, db: Session = Depends(get_db)):
    param = db.query(models.ParametroLegal).filter(models.ParametroLegal.id == param_id).first()
    if not param:
        raise HTTPException(status_code=404, detail="Parámetro no encontrado")
        
    if param.es_porcentaje and req.valor > 100:
        raise HTTPException(status_code=400, detail="Un porcentaje no puede superar 100.")
    cuentas = sorted(set(req.cuentas_afectas_ids))
    _exigir_rubros(db, cuentas)
    param.valor = req.valor
    
    db.query(models.ParametroCuentaAfecta).filter(models.ParametroCuentaAfecta.parametro_id == param_id).delete()
    for r_id in cuentas:
        db.add(models.ParametroCuentaAfecta(parametro_id=param_id, rubro_id=r_id))
        
    db.commit()
    return {"mensaje": f"Cuentas afectas configuradas."}

@app.delete("/api/mantenimiento/parametros/{param_id}")
def eliminar_parametro(param_id: int, db: Session = Depends(get_db)):
    param = db.query(models.ParametroLegal).filter(models.ParametroLegal.id == param_id).first()
    if not param:
        raise HTTPException(status_code=404, detail="Parámetro no encontrado")
    db.delete(param)
    db.commit()
    return {"mensaje": "Parámetro eliminado correctamente."}


# ==========================================
# MÓDULO CONTABLE: RUBROS, CUENTAS Y ASIENTOS
# ==========================================

@app.get("/api/contabilidad/rubros")
def listar_rubros_contables(db: Session = Depends(get_db)):
    return db.query(models.RubroContableNomina).all()

@app.post("/api/contabilidad/rubros")
def crear_rubro_contable(datos: dict, db: Session = Depends(get_db)):
    cuenta_mayor = datos.get("cuenta_mayor", "")
    if cuenta_mayor and (not cuenta_mayor.isdigit() or len(cuenta_mayor) != 10):
        raise HTTPException(status_code=400, detail="La cuenta de mayor debe tener exactamente 10 dígitos numéricos.")

    nuevo = models.RubroContableNomina(
        desc_ing_des=datos.get("desc_ing_des"),
        clave_conta=datos.get("clave_conta"),
        cat_conta=datos.get("cat_conta"),
        cuenta_mayor=cuenta_mayor,
        tipo_gasto=datos.get("tipo_gasto"),
        activo=True
    )
    db.add(nuevo)
    db.commit()
    return {"mensaje": "Rubro y cuentas contables vinculadas exitosamente."}

@app.put("/api/contabilidad/rubros/{rubro_id}/toggle")
def toggle_rubro(rubro_id: int, db: Session = Depends(get_db)):
    rubro = db.query(models.RubroContableNomina).filter(models.RubroContableNomina.id == rubro_id).first()
    if not rubro:
        raise HTTPException(status_code=404, detail="Rubro contable no encontrado.")
    rubro.activo = not rubro.activo
    db.commit()
    return {"mensaje": f"Estado del rubro contable actualizado. Activo: {rubro.activo}"}

@app.get("/api/contabilidad/asientos")
def listar_asientos_contables(mes: int, anio: int, db: Session = Depends(get_db)):
    asientos = db.query(models.AsientoContable).filter(
        models.AsientoContable.periodo_mes == mes,
        models.AsientoContable.periodo_anio == anio
    ).all()
    
    return [{
        "id": a.id,
        "poliza_id": a.nomina_id,
        "fecha": str(a.fecha),
        "cuenta_mayor": a.cuenta_mayor,
        "descripcion": a.descripcion,
        "debe": a.debe,
        "haber": a.haber
    } for a in asientos]


# ==========================================
# MÓDULO RRHH: EMPLEADOS Y BAJAS
# ==========================================


class EmpleadoBasicoUpdate(BaseModel):
    dpi: str = Field(pattern=r"^\d{13}$")
    nit: str = Field(default="", max_length=15)
    numero_igss: str = Field(default="", max_length=20)
    nombre_completo: str = Field(min_length=1, max_length=100)
    fecha_nacimiento: date

class CeCoItem(BaseModel):
    ceco: str = Field(min_length=1, max_length=10)
    porcentaje: float = Field(ge=0, le=100, allow_inf_nan=False)

class MovimientoPersonal(BaseModel):
    tipo_movimiento: str = Field(min_length=1, max_length=100)
    nuevo_puesto: str = Field(min_length=1, max_length=150)
    nuevo_centro: str = Field(min_length=1, max_length=100)
    nuevo_salario: float = Field(gt=0, le=10_000_000, allow_inf_nan=False)
    nuevos_cecos: List[CeCoItem] = Field(min_length=1, max_length=50)
    motivo: str = Field(min_length=1, max_length=250)


def _registrar_historial(db: Session, emp: "models.Empleado", tipo: str, anterior: dict, nuevo: dict,
                         motivo: str, usuario: "models.Usuario"):
    """Bitácora: siempre atribuida al usuario autenticado (nunca al valor por defecto)."""
    db.add(models.HistorialMovimiento(
        empleado_id=emp.id, tipo_movimiento=tipo[:100],
        detalle_anterior=json.dumps(anterior, default=str)[:1000],
        detalle_nuevo=json.dumps(nuevo, default=str)[:1000],
        motivo=motivo[:250], usuario_modificador=usuario.username[:50]))


def _validar_catalogos_empleado(db: Session, puesto: str, centro: str):
    """Un puesto o centro de trabajo bloqueado/inactivo en el catálogo no puede usarse."""
    p = db.query(models.PuestoCatalogo).filter(models.PuestoCatalogo.nombre == puesto).first()
    if p is not None and not p.activo:
        raise HTTPException(status_code=400, detail="El puesto indicado está inactivo en el catálogo.")
    c = db.query(models.CentroTrabajoCatalogo).filter(models.CentroTrabajoCatalogo.nombre_ubicacion == centro).first()
    if c is not None and not c.activo:
        raise HTTPException(status_code=400, detail="El centro de trabajo indicado está bloqueado en el catálogo.")


def _validar_cecos(db: Session, codigos):
    """Cada CeCo debe existir y estar activo en el catálogo."""
    codigos = set(codigos)
    activos = {c for (c,) in db.query(models.CentroCostoCatalogo.codigo).filter(
        models.CentroCostoCatalogo.codigo.in_(codigos), models.CentroCostoCatalogo.activo == True).all()}  # noqa: E712
    if codigos - activos:
        raise HTTPException(status_code=400, detail="Uno o más CeCo no existen o están inactivos en el catálogo.")

@app.put("/api/empleados/{empleado_id}/basico")
def corregir_datos_basicos(empleado_id: int, req: EmpleadoBasicoUpdate, db: Session = Depends(get_db),
                           usuario: models.Usuario = Depends(usuario_actual)):
    emp = db.query(models.Empleado).filter(models.Empleado.id == empleado_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Empleado no encontrado")
    if db.query(models.Empleado.id).filter(models.Empleado.dpi == req.dpi, models.Empleado.id != emp.id).first():
        raise HTTPException(status_code=400, detail="Ya existe otro empleado con este número de DPI.")

    anterior = {"dpi": emp.dpi, "nit": emp.nit, "numero_igss": emp.numero_igss,
                "nombre_completo": emp.nombre_completo, "fecha_nacimiento": emp.fecha_nacimiento}
    nuevo_det = {"dpi": req.dpi, "nit": req.nit or None, "numero_igss": req.numero_igss or None,
                 "nombre_completo": req.nombre_completo, "fecha_nacimiento": req.fecha_nacimiento}
    _registrar_historial(db, emp, "Corrección de datos básicos", anterior, nuevo_det, "Corrección de identificación", usuario)
    emp.dpi = req.dpi
    emp.nit = req.nit if req.nit else None
    emp.numero_igss = req.numero_igss if req.numero_igss else None
    emp.nombre_completo = req.nombre_completo
    emp.fecha_nacimiento = req.fecha_nacimiento
    
    db.commit()
    return {"mensaje": "Datos de identificación actualizados correctamente."}

@app.post("/api/empleados/{empleado_id}/movimientos")
def registrar_movimiento_personal(empleado_id: int, req: MovimientoPersonal, db: Session = Depends(get_db),
                                  usuario: models.Usuario = Depends(usuario_actual)):
    emp = db.query(models.Empleado).filter(models.Empleado.id == empleado_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Empleado no encontrado")
    _validar_catalogos_empleado(db, req.nuevo_puesto, req.nuevo_centro)
    _validar_cecos(db, [c.ceco for c in req.nuevos_cecos])

    cecos_actuales = db.query(models.EmpleadoCeCo).filter(models.EmpleadoCeCo.empleado_id == emp.id).all()
    detalle_anterior = {
        "puesto": emp.puesto,
        "centro_trabajo": emp.centro_trabajo,
        "salario_base": emp.salario_base,
        "cecos": [{"ceco": c.ceco, "porcentaje": c.porcentaje} for c in cecos_actuales]
    }

    detalle_nuevo = {
        "puesto": req.nuevo_puesto,
        "centro_trabajo": req.nuevo_centro,
        "salario_base": req.nuevo_salario,
        "cecos": [{"ceco": c.ceco, "porcentaje": c.porcentaje} for c in req.nuevos_cecos]
    }

    total_porcentaje = sum([item.porcentaje for item in req.nuevos_cecos])
    if round(total_porcentaje, 2) != 100.0:
        raise HTTPException(status_code=400, detail="Los nuevos CeCos no suman 100%.")

    _registrar_historial(db, emp, req.tipo_movimiento, detalle_anterior, detalle_nuevo, req.motivo, usuario)

    emp.puesto = req.nuevo_puesto
    emp.centro_trabajo = req.nuevo_centro
    emp.salario_base = req.nuevo_salario

    db.query(models.EmpleadoCeCo).filter(models.EmpleadoCeCo.empleado_id == emp.id).delete()
    for item in req.nuevos_cecos:
        db.add(models.EmpleadoCeCo(empleado_id=emp.id, ceco=item.ceco, porcentaje=item.porcentaje))

    db.commit()
    return {"mensaje": "Movimiento registrado y auditado exitosamente."}

@app.get("/api/empleados/{empleado_id}/historial")
def obtener_historial(empleado_id: int, db: Session = Depends(get_db),
                      usuario: models.Usuario = Depends(usuario_actual)):
    if not (usuario.es_admin or usuario.acceso_rrhh):
        raise HTTPException(status_code=403, detail="El historial solo está disponible para Recursos Humanos.")
    historial = db.query(models.HistorialMovimiento).filter(models.HistorialMovimiento.empleado_id == empleado_id).order_by(models.HistorialMovimiento.id.desc()).all()
    
    resultado = []
    for h in historial:
        resultado.append({
            "id": h.id,
            "fecha": h.fecha_movimiento,
            "tipo": h.tipo_movimiento,
            "motivo": h.motivo,
            "usuario": h.usuario_modificador,
            "anterior": json.loads(h.detalle_anterior),
            "nuevo": json.loads(h.detalle_nuevo)
        })
    return resultado

@app.get("/api/empleados")
@app.get("/api/rrhh/empleados")
def listar_empleados(db: Session = Depends(get_db), usuario: models.Usuario = Depends(usuario_actual)):
    empleados = db.query(models.Empleado).all()
    if not (usuario.es_admin or usuario.acceso_rrhh):
        # Procesos y Nóminas solo necesitan identificar al empleado: sin NIT, IGSS, salarios ni nacimiento.
        return [{"id": e.id, "dpi": e.dpi, "nombre_completo": e.nombre_completo, "puesto": e.puesto,
                 "centro_trabajo": e.centro_trabajo, "estado": e.estado} for e in empleados]
    resultado = []
    for emp in empleados:
        cecos_asociados = db.query(models.EmpleadoCeCo).filter(models.EmpleadoCeCo.empleado_id == emp.id).all()
        resultado.append({
            "id": emp.id,
            "dpi": emp.dpi,
            "nit": emp.nit,
            "numero_igss": emp.numero_igss,
            "nombre_completo": emp.nombre_completo,
            "fecha_nacimiento": emp.fecha_nacimiento,
            "fecha_contratacion": emp.fecha_contratacion,
            "puesto": emp.puesto,
            "centro_trabajo": emp.centro_trabajo,
            "salario_base": emp.salario_base,
            "bonificacion_ley": emp.bonificacion_ley,
            "estado": emp.estado,
            "fecha_retiro": emp.fecha_retiro,
            "motivo_retiro": emp.motivo_retiro,
            "distribucion_cecos": [{"ceco": c.ceco, "porcentaje": c.porcentaje} for c in cecos_asociados]
        })
    return resultado

class EmpleadoCreate(BaseModel):
    dpi: str
    nit: Optional[str] = Field(default="", max_length=15)
    numero_igss: Optional[str] = Field(default="", max_length=20)
    nombre_completo: str = Field(min_length=1, max_length=100)
    fecha_nacimiento: date
    fecha_contratacion: date
    puesto: str = Field(default="No Asignado", max_length=150)
    centro_trabajo: str = Field(min_length=1, max_length=100)
    salario_base: float = Field(gt=0)
    bonificacion_ley: float = Field(default=250.00, ge=0)

@app.post("/api/empleados")
def crear_empleado(empleado: EmpleadoCreate, db: Session = Depends(get_db)):
    dpi = empleado.dpi
    nit = (empleado.nit or "").strip()
    numero_igss = (empleado.numero_igss or "").strip()

    if not dpi.isdigit() or len(dpi) != 13:
        raise HTTPException(status_code=400, detail="El DPI debe contener exactamente 13 dígitos numéricos.")

    if db.query(models.Empleado).filter(models.Empleado.dpi == dpi).first():
        raise HTTPException(status_code=400, detail="Ya existe un empleado registrado con este número de DPI.")
    _validar_catalogos_empleado(db, empleado.puesto, empleado.centro_trabajo)

    nuevo = models.Empleado(
        dpi=dpi,
        nit=nit if nit else None,
        numero_igss=numero_igss if numero_igss else None,
        nombre_completo=empleado.nombre_completo,
        fecha_nacimiento=empleado.fecha_nacimiento,
        fecha_contratacion=empleado.fecha_contratacion,
        puesto=empleado.puesto,
        centro_trabajo=empleado.centro_trabajo,
        salario_base=empleado.salario_base,
        bonificacion_ley=empleado.bonificacion_ley,
        estado=True
    )
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)
    return {"mensaje": "Empleado registrado exitosamente.", "empleado_id": nuevo.id}

class AsignacionCeCoRequest(BaseModel):
    empleado_id: int
    distribucion: List[CeCoItem] = Field(min_length=1, max_length=50)

@app.post("/api/empleados/cecos")
def asignar_centros_costo(req: AsignacionCeCoRequest, db: Session = Depends(get_db),
                          usuario: models.Usuario = Depends(usuario_actual)):
    emp = db.query(models.Empleado).filter(models.Empleado.id == req.empleado_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Empleado no encontrado.")
    _validar_cecos(db, [i.ceco for i in req.distribucion])
    previos = [{"ceco": c.ceco, "porcentaje": c.porcentaje} for c in
               db.query(models.EmpleadoCeCo).filter(models.EmpleadoCeCo.empleado_id == emp.id).all()]
    _registrar_historial(db, emp, "Distribución de CeCo", {"cecos": previos},
                         {"cecos": [{"ceco": i.ceco, "porcentaje": i.porcentaje} for i in req.distribucion]},
                         "Asignación de centros de costo", usuario)

    total_porcentaje = sum([item.porcentaje for item in req.distribucion])
    if round(total_porcentaje, 2) != 100.0:
        raise HTTPException(status_code=400, detail=f"La suma de los porcentajes debe ser exactamente 100%. Suma actual: {total_porcentaje}%")
    
    db.query(models.EmpleadoCeCo).filter(models.EmpleadoCeCo.empleado_id == req.empleado_id).delete()
    
    for item in req.distribucion:
        db.add(models.EmpleadoCeCo(empleado_id=req.empleado_id, ceco=item.ceco, porcentaje=item.porcentaje))
        
    db.commit()
    return {"mensaje": "Distribución de Centros de Costo actualizada exitosamente."}

class RetiroRequest(BaseModel):
    fecha_retiro: date
    motivo_retiro: str = Field(min_length=1, max_length=50)

@app.put("/api/empleados/{empleado_id}/retirar")
def retirar_empleado(empleado_id: int, datos: RetiroRequest, db: Session = Depends(get_db),
                     usuario: models.Usuario = Depends(usuario_actual)):
    emp = db.query(models.Empleado).filter(models.Empleado.id == empleado_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Empleado no encontrado.")
    _registrar_historial(db, emp, "Retiro", {"estado": emp.estado},
                         {"estado": False, "fecha_retiro": datos.fecha_retiro}, datos.motivo_retiro, usuario)

    emp.estado = False
    emp.fecha_retiro = datos.fecha_retiro
    emp.motivo_retiro = datos.motivo_retiro
    db.commit()
    return {"mensaje": "Empleado dado de baja correctamente."}

@app.put("/api/empleados/{empleado_id}/reactivar")
def reactivar_empleado(empleado_id: int, db: Session = Depends(get_db),
                       usuario: models.Usuario = Depends(usuario_actual)):
    emp = db.query(models.Empleado).filter(models.Empleado.id == empleado_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Empleado no encontrado.")
    _registrar_historial(db, emp, "Reactivación", {"estado": emp.estado}, {"estado": True},
                         "Reactivación de empleado", usuario)
    emp.estado = True
    emp.fecha_retiro = None
    emp.motivo_retiro = None
    db.commit()
    return {"mensaje": "Empleado reactivado correctamente."}


# ==========================================
# MÓDULO PROCESOS E INCIDENCIAS
# ==========================================

class IncidenciaCreate(BaseModel):
    empleado_id: int
    concepto: str = Field(max_length=100)
    fecha_incidencia: date
    dias_descontar: int = Field(ge=0, le=30)

def _exigir_empleado(db: Session, empleado_id: int):
    if not db.query(models.Empleado.id).filter(models.Empleado.id == empleado_id).first():
        raise HTTPException(status_code=404, detail="Empleado no encontrado.")

@app.post("/api/procesos/incidencias")
def registrar_incidencia(req: IncidenciaCreate, db: Session = Depends(get_db)):
    _exigir_empleado(db, req.empleado_id)
    nueva_incidencia = models.Incidencia(
        empleado_id=req.empleado_id,
        concepto=req.concepto,
        fecha_incidencia=req.fecha_incidencia,
        dias_descontar=req.dias_descontar
    )
    db.add(nueva_incidencia)
    db.commit()
    return {"mensaje": "Incidencia registrada correctamente"}


# ==========================================
# MÓDULO NÓMINAS Y CONTABILIZACIÓN
# ==========================================

@app.get("/api/contabilidad/rubros/ingresos")
def listar_rubros_para_ingresos(db: Session = Depends(get_db)):
    return db.query(models.RubroContableNomina).filter(models.RubroContableNomina.cat_conta == 'Debe').all()

@app.get("/api/contabilidad/rubros/descuentos")
def listar_rubros_para_descuentos(db: Session = Depends(get_db)):
    return db.query(models.RubroContableNomina).filter(
        models.RubroContableNomina.cat_conta == 'Haber',
        models.RubroContableNomina.cuenta_mayor.like('2%')
    ).all()

class NominaRequest(BaseModel):
    mes: int = Field(ge=1, le=12)
    anio: int = Field(ge=2000, le=2100)
    tipo_nomina: str

class IngresoCreate(BaseModel):
    empleado_id: int
    rubro_id: int
    monto: float = Field(gt=0)

class DescuentoCreate(BaseModel):
    empleado_id: int
    tipo: str
    rubro_id: int
    monto: float = Field(gt=0)

@app.post("/api/nominas/ingresos")
def registrar_ingreso(req: IngresoCreate, db: Session = Depends(get_db)):
    _exigir_empleado(db, req.empleado_id)
    rubro = db.query(models.RubroContableNomina).filter(models.RubroContableNomina.id == req.rubro_id).first()
    if not rubro:
        raise HTTPException(status_code=404, detail="Rubro contable no encontrado.")
    if not rubro.activo or rubro.cat_conta != 'Debe':
        raise HTTPException(status_code=400, detail="El rubro debe estar activo y ser de ingreso (Debe).")
    nuevo = models.Ingreso(empleado_id=req.empleado_id, rubro_id=req.rubro_id, monto=req.monto)
    db.add(nuevo)
    db.commit()
    return {"mensaje": "Ingreso extra registrado vinculado a gasto."}

@app.post("/api/nominas/descuentos")
def registrar_descuento(req: DescuentoCreate, db: Session = Depends(get_db)):
    _exigir_empleado(db, req.empleado_id)
    rubro = db.query(models.RubroContableNomina).filter(models.RubroContableNomina.id == req.rubro_id).first()
    if not rubro:
        raise HTTPException(status_code=404, detail="Rubro contable no encontrado.")
    if not rubro.activo or rubro.cat_conta != 'Haber' or not rubro.cuenta_mayor.startswith('2'):
        raise HTTPException(status_code=400, detail="El rubro debe estar activo y ser de descuento (Haber, cuenta 2).")
    try:
        tipo_enum = models.TipoDescuento(req.tipo)
    except ValueError:
        raise HTTPException(status_code=400, detail="Tipo de descuento inválido.")
    nuevo = models.Descuento(empleado_id=req.empleado_id, tipo=tipo_enum, rubro_id=req.rubro_id, monto=req.monto)
    db.add(nuevo)
    db.commit()
    return {"mensaje": "Descuento registrado vinculado a pasivo."}

_lock_nomina = threading.Lock()

@app.post("/api/nominas/ejecutar")
def ejecutar_calculo(req: NominaRequest, db: Session = Depends(get_db)):
    # Una sola ejecución a la vez por proceso; la restricción UNIQUE de la BD cubre varias réplicas.
    if not _lock_nomina.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="Ya hay una nómina en ejecución. Intenta de nuevo en unos segundos.")
    try:
        return _ejecutar_calculo(req, db)
    finally:
        _lock_nomina.release()

def _ejecutar_calculo(req: NominaRequest, db: Session):
    try:
        tipo_enum = models.TipoNomina(req.tipo_nomina)
    except ValueError:
        raise HTTPException(status_code=400, detail="Tipo de nómina inválido.")

    if db.query(models.Nomina).filter(
        models.Nomina.periodo_mes == req.mes,
        models.Nomina.periodo_anio == req.anio,
        models.Nomina.tipo == tipo_enum,
    ).first():
        raise HTTPException(status_code=409, detail="Ya existe una nómina de este tipo para el periodo indicado.")

    try:
        if db.query(models.ConfiguracionSistema).count() == 0:
            c_salario = db.query(models.RubroContableNomina).filter(models.RubroContableNomina.cuenta_mayor == '6111020000').first()
            c_bono = db.query(models.RubroContableNomina).filter(models.RubroContableNomina.cuenta_mayor == '6111100000').first()
            if c_salario: db.add(models.ConfiguracionSistema(clave="CUENTA_SALARIO_BASE", rubro_id=c_salario.id))
            if c_bono: db.add(models.ConfiguracionSistema(clave="CUENTA_BONO_LEY", rubro_id=c_bono.id))
            db.commit()

        conf_salario = db.query(models.ConfiguracionSistema).filter_by(clave="CUENTA_SALARIO_BASE").first()
        conf_bono = db.query(models.ConfiguracionSistema).filter_by(clave="CUENTA_BONO_LEY").first()
        
        if not conf_salario or not conf_bono:
            raise HTTPException(status_code=400, detail="Falta configurar las cuentas base (6111020000 y 6111100000).")

        parametros_legales = db.query(models.ParametroLegal).all()
        
        nomina_actual = models.Nomina(periodo_mes=req.mes, periodo_anio=req.anio, tipo=tipo_enum)
        db.add(nomina_actual)
        db.flush()
        
        empleados = db.query(models.Empleado).filter(models.Empleado.estado == True).all()
        
        for emp in empleados:
            incidencias = db.query(models.Incidencia).filter(models.Incidencia.empleado_id == emp.id).all()
            dias_descontar = sum([i.dias_descontar for i in incidencias])
            dias_efectivos = 15 if tipo_enum == models.TipoNomina.ANTICIPO else max(0, min(30, 30 - dias_descontar))
            
            salario_proporcional = (emp.salario_base / 30) * dias_efectivos
            bono_ley_proporcional = (emp.bonificacion_ley / 30) * dias_efectivos
            
            ingresos_por_rubro = {
                conf_salario.rubro_id: salario_proporcional,
                conf_bono.rubro_id: bono_ley_proporcional
            }
            
            ingresos_var = db.query(models.Ingreso).filter(models.Ingreso.empleado_id == emp.id).all()
            total_ingresos_extra = sum([i.monto for i in ingresos_var])
            for iv in ingresos_var:
                ingresos_por_rubro[iv.rubro_id] = ingresos_por_rubro.get(iv.rubro_id, 0) + iv.monto
                
            descuentos_var = db.query(models.Descuento).filter(models.Descuento.empleado_id == emp.id, models.Descuento.activo == True).all()
            total_otros_descuentos = sum([d.monto for d in descuentos_var])
            
            registro = models.ReporteriaNomina(
                nomina_id=nomina_actual.id, empleado_id=emp.id, dias_trabajados=dias_efectivos,
                salario_ordinario=salario_proporcional, bonificacion_ley=bono_ley_proporcional,
                total_ingresos_extra=total_ingresos_extra, total_otros_descuentos=total_otros_descuentos,
                total_descuentos_ley=0.0, liquido_a_recibir=0.0
            )
            db.add(registro)
            db.flush()
            
            total_descuentos_ley = 0.0
            
            for param in parametros_legales:
                base_calculo = sum([ingresos_por_rubro.get(ca.rubro_id, 0.0) for ca in param.cuentas_afectas])
                
                if base_calculo > 0:
                    valor_tasa = (param.valor / 100) if param.es_porcentaje else param.valor
                    monto_calculado = base_calculo * valor_tasa
                    nombre_param = param.rubro_principal.desc_ing_des
                    
                    es_descuento_empleado = any(palabra in nombre_param.lower() for palabra in ["laboral", "isr", "retención"])
                    
                    if es_descuento_empleado:
                        total_descuentos_ley += monto_calculado
                        tipo_calc = "Descuento"
                    else:
                        tipo_calc = "Provisión"
                        
                    db.add(models.DetalleCalculoNomina(
                        reporteria_id=registro.id,
                        nombre_parametro=nombre_param,
                        monto_calculado=monto_calculado,
                        tipo_calculo=tipo_calc
                    ))
            
            total_ingresos = salario_proporcional + bono_ley_proporcional + total_ingresos_extra
            registro.total_descuentos_ley = total_descuentos_ley
            registro.liquido_a_recibir = total_ingresos - total_descuentos_ley - total_otros_descuentos
            
            # --- GENERACIÓN AUTOMÁTICA DE ASIENTOS CONTABLES ---
            db.add(models.AsientoContable(
                nomina_id=nomina_actual.id,
                periodo_mes=req.mes,
                periodo_anio=req.anio,
                cuenta_mayor=conf_salario.rubro.cuenta_mayor,
                descripcion=f"Sueldo Ordinario - {emp.nombre_completo}",
                debe=salario_proporcional,
                haber=0.0
            ))

            if total_descuentos_ley > 0:
                db.add(models.AsientoContable(
                    nomina_id=nomina_actual.id,
                    periodo_mes=req.mes,
                    periodo_anio=req.anio,
                    cuenta_mayor="2111010000",
                    descripcion=f"Retenciones Ley - {emp.nombre_completo}",
                    debe=0.0,
                    haber=total_descuentos_ley
                ))
            
            for d in descuentos_var:
                if d.tipo == models.TipoDescuento.EVENTUAL: d.activo = False
                    
        db.commit()
        return {"mensaje": f"Planilla calculada y asientos contables generados para {len(empleados)} empleados."}
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Ya existe una nómina de este tipo para el periodo indicado.")
    except Exception:
        db.rollback()
        logger.exception("Error al ejecutar la nómina")
        raise HTTPException(status_code=500, detail="Error interno al calcular la nómina.")


# ==========================================
# DASHBOARD Y REPORTERÍA
# ==========================================

@app.get("/api/dashboard/stats")
def obtener_estadisticas(db: Session = Depends(get_db)):
    emp_activos = db.query(models.Empleado).filter(models.Empleado.estado == True).count()
    incidencias_mes = db.query(models.Incidencia).count()
    
    ultima_nomina = db.query(models.Nomina).order_by(models.Nomina.id.desc()).first()
    total_ultima = 0
    if ultima_nomina:
        detalles = db.query(models.ReporteriaNomina).filter(models.ReporteriaNomina.nomina_id == ultima_nomina.id).all()
        total_ultima = sum([d.liquido_a_recibir for d in detalles])
        
    return {
        "empleados_activos": emp_activos,
        "ultima_nomina_total": total_ultima,
        "incidencias_mes": incidencias_mes,
        "carga_prestacional": "29.15%"
    }

@app.get("/api/reporteria/nominas")
def listar_nominas_historial(db: Session = Depends(get_db)):
    nominas = db.query(models.Nomina).order_by(models.Nomina.id.desc()).all()
    resultado = []
    for n in nominas:
        detalles = db.query(models.ReporteriaNomina).filter(models.ReporteriaNomina.nomina_id == n.id).all()
        total_pagar = sum([d.liquido_a_recibir for d in detalles])
        
        resultado.append({
            "id": n.id,
            "periodo_mes": n.periodo_mes,
            "periodo_anio": n.periodo_anio,
            "tipo": n.tipo.value,
            "fecha_ejecucion": n.fecha_ejecucion,
            "total_liquido": total_pagar
        })
    return resultado

def _celda_segura(valor):
    """Evita inyección de fórmulas: un texto que empieza por = + - @ (o tab/CR) se antepone con apóstrofo."""
    if isinstance(valor, str) and valor[:1] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + valor
    return valor

@app.get("/api/reporteria/nominas/{nomina_id}/excel")
def descargar_excel_nomina(nomina_id: int, db: Session = Depends(get_db)):
    nomina = db.query(models.Nomina).filter(models.Nomina.id == nomina_id).first()
    if not nomina:
        raise HTTPException(status_code=404, detail="Nómina no encontrada")
        
    detalles = db.query(models.ReporteriaNomina).filter(models.ReporteriaNomina.nomina_id == nomina_id).all()
    
    data = []
    for d in detalles:
        cecos_str = ", ".join([f"{c.ceco} ({c.porcentaje}%)" for c in d.empleado.distribucion_cecos])
        
        fila = {
            "DPI": d.empleado.dpi,
            "Nombre Completo": d.empleado.nombre_completo,
            "Distribución CeCo": cecos_str,
            "Días Trabajados": d.dias_trabajados,
            "Salario Ordinario": round(d.salario_ordinario, 2),
            "Bonificación Ley": round(d.bonificacion_ley, 2),
            "Ingresos Extra": round(d.total_ingresos_extra, 2),
            "Descuentos Ley (Total)": round(d.total_descuentos_ley, 2),
            "Otros Descuentos": round(d.total_otros_descuentos, 2),
            "TOTAL LÍQUIDO": round(d.liquido_a_recibir, 2)
        }
        
        for calc in d.detalles_dinamicos:
            fila[f"{calc.tipo_calculo}: {calc.nombre_parametro}"] = round(calc.monto_calculado, 2)
            
        data.append(fila)
        
    data = [{k: _celda_segura(v) for k, v in fila.items()} for fila in data]
    df = pd.DataFrame(data)
    df.fillna(0.0, inplace=True)
    
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name=f"Planilla {nomina.periodo_mes}-{nomina.periodo_anio}")
        
    output.seek(0)
    nombre_archivo = f"SABANA_NOMINA_{nomina.tipo.value}_{nomina.periodo_mes}_{nomina.periodo_anio}.xlsx"
    headers = {'Content-Disposition': f'attachment; filename="{nombre_archivo}"'}
    return StreamingResponse(output, headers=headers, media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

@app.get("/api/reporteria/nominas/{nomina_id}/pdf")
def descargar_boletas_pdf(nomina_id: int, db: Session = Depends(get_db)):
    nomina = db.query(models.Nomina).filter(models.Nomina.id == nomina_id).first()
    detalles = db.query(models.ReporteriaNomina).filter(models.ReporteriaNomina.nomina_id == nomina_id).all()
    
    if not nomina or not detalles:
        raise HTTPException(status_code=404, detail="Nómina no encontrada")

    output = io.BytesIO()
    p = canvas.Canvas(output, pagesize=letter)
    width, height = letter

    for d in detalles:
        cecos_str = " | ".join([f"CeCo: {c.ceco} ({c.porcentaje}%)" for c in d.empleado.distribucion_cecos])

        p.setFont("Helvetica-Bold", 16)
        p.drawString(50, height - 50, "BOLETA DE PAGO DE NÓMINA")
        p.setFont("Helvetica", 10)
        p.drawString(50, height - 70, f"Empresa: NóminaHub S.A.")
        p.drawString(50, height - 85, f"Periodo: Mes {nomina.periodo_mes} / {nomina.periodo_anio} - {nomina.tipo.value}")

        p.setFont("Helvetica-Bold", 12)
        p.drawString(50, height - 120, "DATOS DEL EMPLEADO")
        p.setFont("Helvetica", 10)
        p.drawString(50, height - 140, f"Nombre: {d.empleado.nombre_completo}")
        p.drawString(50, height - 155, f"DPI: {d.empleado.dpi} | NIT: {d.empleado.nit or 'N/D'}")
        p.drawString(300, height - 155, f"Días Trabajados: {d.dias_trabajados}")
        p.drawString(50, height - 170, cecos_str if cecos_str else "CeCo: Sin asignar")

        p.setFont("Helvetica-Bold", 12)
        p.drawString(50, height - 205, "INGRESOS (+)")
        p.setFont("Helvetica", 10)
        p.drawString(50, height - 225, f"Salario Ordinario: Q. {d.salario_ordinario:,.2f}")
        p.drawString(50, height - 240, f"Bonificación de Ley: Q. {d.bonificacion_ley:,.2f}")
        p.drawString(50, height - 255, f"Ingresos Extra: Q. {d.total_ingresos_extra:,.2f}")

        p.setFont("Helvetica-Bold", 12)
        p.drawString(300, height - 205, "DESCUENTOS (-)")
        p.setFont("Helvetica", 10)
        p.drawString(300, height - 225, f"Descuentos de Ley: Q. {d.total_descuentos_ley:,.2f}")
        p.drawString(300, height - 240, f"Otros Descuentos: Q. {d.total_otros_descuentos:,.2f}")

        p.setFont("Helvetica-Bold", 14)
        p.drawString(50, height - 310, f"TOTAL LÍQUIDO A RECIBIR: Q. {d.liquido_a_recibir:,.2f}")

        p.setFont("Helvetica", 10)
        p.drawString(50, height - 380, "________________________________________________")
        p.drawString(50, height - 395, "Firma de Conformidad del Empleado")

        p.showPage()

    p.save()
    output.seek(0)
    nombre_archivo = f"BOLETAS_{nomina.tipo.value}_{nomina.periodo_mes}_{nomina.periodo_anio}.pdf"
    headers = {'Content-Disposition': f'attachment; filename="{nombre_archivo}"'}
    return StreamingResponse(output, headers=headers, media_type='application/pdf')