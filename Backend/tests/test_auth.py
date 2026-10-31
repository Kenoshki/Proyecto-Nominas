import os
import sys
import tempfile
from pathlib import Path

_dir = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_dir) / 'test.db'}"
os.environ["JWT_SECRET"] = "x" * 48
os.environ["ORIGENES"] = "http://localhost:5173"
os.environ["ADMIN_USERNAME"] = "admin"
os.environ["ADMIN_PASSWORD"] = "Clave12345"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
import security  # noqa: E402


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as c:
        yield c


@pytest.fixture(autouse=True)
def limpiar_limitador():
    security.limitador_login._intentos.clear()


def login(client, user="admin", pw="Clave12345"):
    return client.post("/api/auth/login", json={"username": user, "password": pw})


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_rutas_sin_token_devuelven_401(client):
    for ruta in ["/api/empleados", "/api/admin/usuarios", "/api/dashboard/stats",
                 "/api/reporteria/nominas", "/api/mantenimiento/cecos"]:
        assert client.get(ruta).status_code == 401, ruta
    assert client.post("/api/nominas/ejecutar", json={}).status_code == 401


def test_setup_ya_no_existe(client):
    assert client.post("/api/auth/setup").status_code in (401, 404, 405)


def test_login_correcto_e_incorrecto(client):
    r = login(client)
    assert r.status_code == 200 and "token" in r.json()
    assert "password_hash" not in r.text
    assert login(client, pw="mala").status_code == 401
    assert login(client, user="nadie").status_code == 401


def test_token_invalido_o_manipulado(client):
    assert client.get("/api/empleados", headers=auth("abc.def.ghi")).status_code == 401
    token = login(client).json()["token"]
    assert client.get("/api/empleados", headers=auth(token[:-2] + "xx")).status_code == 401


def test_listado_usuarios_no_expone_hash(client):
    token = login(client).json()["token"]
    r = client.get("/api/admin/usuarios", headers=auth(token))
    assert r.status_code == 200 and "password" not in r.text


def test_rbac_usuario_sin_permisos(client):
    admin = login(client).json()["token"]
    assert client.post("/api/admin/usuarios", headers=auth(admin),
                       json={"username": "aux", "password": "Auxiliar123"}).status_code == 201
    token = login(client, "aux", "Auxiliar123").json()["token"]
    assert client.get("/api/admin/usuarios", headers=auth(token)).status_code == 403
    assert client.get("/api/empleados", headers=auth(token)).status_code == 403
    assert client.post("/api/nominas/ejecutar", headers=auth(token),
                       json={"mes": 1, "anio": 2026, "tipo_nomina": "Fin de Mes"}).status_code == 403
    assert client.get("/api/dashboard/stats", headers=auth(token)).status_code == 200
    # Concede RRHH y verifica el cambio inmediato
    uid = next(u["id"] for u in client.get("/api/admin/usuarios", headers=auth(admin)).json() if u["username"] == "aux")
    permisos = dict(es_admin=False, acceso_rrhh=True, acceso_nominas=False, acceso_procesos=False,
                    acceso_mantenimiento=False, acceso_contabilidad=False)
    assert client.put(f"/api/admin/usuarios/{uid}/permisos", headers=auth(admin), json=permisos).status_code == 200
    assert client.get("/api/empleados", headers=auth(token)).status_code == 200
    assert client.post("/api/nominas/ejecutar", headers=auth(token),
                       json={"mes": 1, "anio": 2026, "tipo_nomina": "Fin de Mes"}).status_code == 403


def test_no_se_puede_quitar_el_ultimo_admin(client):
    admin = login(client).json()["token"]
    uid = next(u["id"] for u in client.get("/api/admin/usuarios", headers=auth(admin)).json() if u["username"] == "admin")
    permisos = dict(es_admin=False, acceso_rrhh=True, acceso_nominas=True, acceso_procesos=True,
                    acceso_mantenimiento=True, acceso_contabilidad=True)
    assert client.put(f"/api/admin/usuarios/{uid}/permisos", headers=auth(admin), json=permisos).status_code == 400


def test_bloqueo_por_intentos(client):
    for _ in range(5):
        assert login(client, pw="mala").status_code == 401
    assert login(client).status_code == 429


def test_cambiar_password_invalida_token_anterior(client):
    admin = login(client).json()["token"]
    client.post("/api/admin/usuarios", headers=auth(admin), json={"username": "cambio", "password": "Inicial123"})
    t1 = login(client, "cambio", "Inicial123").json()["token"]
    r = client.post("/api/auth/cambiar-password", headers=auth(t1),
                    json={"password_actual": "Inicial123", "password_nueva": "Segunda456"})
    assert r.status_code == 200
    assert client.get("/api/auth/me", headers=auth(t1)).status_code == 401
    assert client.get("/api/auth/me", headers=auth(r.json()["token"])).status_code == 200
    assert login(client, "cambio", "Inicial123").status_code == 401
    assert login(client, "cambio", "Segunda456").status_code == 200


def test_politica_de_password(client):
    admin = login(client).json()["token"]
    for pw in ["corta1", "sinnumeroslargo", "12345678901"]:
        r = client.post("/api/admin/usuarios", headers=auth(admin), json={"username": "pol", "password": pw})
        assert r.status_code == 400, pw


def test_restablecer_password_flujo_completo(client):
    admin = login(client).json()["token"]
    client.post("/api/admin/usuarios", headers=auth(admin), json={"username": "olvido", "password": "Inicial123"})
    uid = next(u["id"] for u in client.get("/api/admin/usuarios", headers=auth(admin)).json() if u["username"] == "olvido")
    antiguo = login(client, "olvido", "Inicial123").json()["token"]

    codigo = client.post(f"/api/admin/usuarios/{uid}/reset-codigo", headers=auth(admin)).json()["codigo"]
    body = {"username": "olvido", "codigo": codigo, "password_nueva": "Nueva12345"}

    # código incorrecto
    assert client.post("/api/auth/restablecer-password", json={**body, "codigo": "AAAAAAAAAA"}).status_code == 400
    # contraseña débil
    assert client.post("/api/auth/restablecer-password", json={**body, "password_nueva": "abc"}).status_code == 400
    # correcto (acepta minúsculas y guiones)
    assert client.post("/api/auth/restablecer-password", json={**body, "codigo": codigo.lower()}).status_code == 200
    # un solo uso
    assert client.post("/api/auth/restablecer-password", json=body).status_code == 400
    assert login(client, "olvido", "Nueva12345").status_code == 200
    assert login(client, "olvido", "Inicial123").status_code == 401
    assert client.get("/api/auth/me", headers=auth(antiguo)).status_code == 401


def test_codigo_vencido_y_reemplazado(client):
    from datetime import datetime, timedelta
    admin = login(client).json()["token"]
    client.post("/api/admin/usuarios", headers=auth(admin), json={"username": "venc", "password": "Inicial123"})
    uid = next(u["id"] for u in client.get("/api/admin/usuarios", headers=auth(admin)).json() if u["username"] == "venc")
    c1 = client.post(f"/api/admin/usuarios/{uid}/reset-codigo", headers=auth(admin)).json()["codigo"]
    c2 = client.post(f"/api/admin/usuarios/{uid}/reset-codigo", headers=auth(admin)).json()["codigo"]
    body = {"username": "venc", "password_nueva": "Nueva12345"}
    assert client.post("/api/auth/restablecer-password", json={**body, "codigo": c1}).status_code == 400
    db = main.SessionLocal()
    db.query(main.models.PasswordReset).filter_by(usuario_id=uid, usado=False).update(
        {"expira": datetime.now(__import__("datetime").timezone.utc).replace(tzinfo=None) - timedelta(minutes=1)})
    db.commit()
    db.close()
    assert client.post("/api/auth/restablecer-password", json={**body, "codigo": c2}).status_code == 400


def test_restablecer_con_usuario_inexistente_no_filtra(client):
    r = client.post("/api/auth/restablecer-password",
                    json={"username": "fantasma", "codigo": "AAAAAAAAAA", "password_nueva": "Nueva12345"})
    assert r.status_code == 400 and "inválido" in r.json()["detail"]


def test_cors_no_refleja_origen_ajeno(client):
    r = client.options("/api/auth/login", headers={"Origin": "https://evil.example",
                                                   "Access-Control-Request-Method": "POST"})
    assert "access-control-allow-origin" not in r.headers
    r = client.options("/api/auth/login", headers={"Origin": "http://localhost:5173",
                                                   "Access-Control-Request-Method": "POST"})
    assert r.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_health_publico(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_empleado_validaciones(client):
    admin = login(client).json()["token"]
    base = dict(dpi="1234567890123", nombre_completo="Ana", fecha_nacimiento="1990-01-01",
                fecha_contratacion="2024-01-01", centro_trabajo="Central", salario_base=3000)
    assert client.post("/api/empleados", headers=auth(admin), json={**base, "salario_base": -1}).status_code == 422
    assert client.post("/api/empleados", headers=auth(admin), json={**base, "dpi": "abc"}).status_code == 400
    assert client.post("/api/empleados", headers=auth(admin), json=base).status_code == 200
    assert client.post("/api/empleados", headers=auth(admin), json=base).status_code == 400
    assert client.post("/api/procesos/incidencias", headers=auth(admin),
                       json={"empleado_id": 999, "concepto": "x", "fecha_incidencia": "2026-01-01",
                             "dias_descontar": 1}).status_code == 404
