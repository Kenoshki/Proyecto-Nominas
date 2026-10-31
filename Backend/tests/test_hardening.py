"""Regresiones de las pistas de la auditoría (run-1) y del endurecimiento posterior."""
import io

import pytest
from fastapi.testclient import TestClient
from openpyxl import load_workbook
from sqlalchemy.exc import IntegrityError

import test_auth as base  # fija el entorno y la BD SQLite temporal antes de importar main
import main
import models
import security

auth = base.auth


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as c:
        yield c


@pytest.fixture(autouse=True)
def limpiar():
    security.limitador_login._intentos.clear()


@pytest.fixture(scope="module")
def admin(client):
    return client.post("/api/auth/login", json={"username": "admin", "password": "Clave12345"}).json()["token"]


def crear_usuario(client, admin, nombre, **permisos):
    client.post("/api/admin/usuarios", headers=auth(admin), json={"username": nombre, "password": "Clave12345x"})
    uid = next(u["id"] for u in client.get("/api/admin/usuarios", headers=auth(admin)).json() if u["username"] == nombre)
    flags = dict(es_admin=False, acceso_rrhh=False, acceso_nominas=False, acceso_procesos=False,
                 acceso_mantenimiento=False, acceso_contabilidad=False)
    flags.update(permisos)
    assert client.put(f"/api/admin/usuarios/{uid}/permisos", headers=auth(admin), json=flags).status_code == 200
    return client.post("/api/auth/login", json={"username": nombre, "password": "Clave12345x"}).json()["token"]


def empleado(client, token, dpi, nombre="Ana Pérez", **extra):
    body = dict(dpi=dpi, nombre_completo=nombre, fecha_nacimiento="1990-01-01", fecha_contratacion="2024-01-01",
                centro_trabajo="Central", salario_base=3000)
    body.update(extra)
    r = client.post("/api/empleados", headers=auth(token), json=body)
    assert r.status_code == 200, r.text
    return r.json()["empleado_id"]


def rubro(client, admin, mayor, cat, nombre):
    r = client.post("/api/contabilidad/rubros", headers=auth(admin), json=dict(
        desc_ing_des=nombre, clave_conta="K1", cat_conta=cat, cuenta_mayor=mayor, tipo_gasto="Fijo"))
    assert r.status_code == 200, r.text


def test_excel_neutraliza_formulas(client, admin):
    emp_id = empleado(client, admin, "1111111111111", nombre="=HYPERLINK(\"http://x\",\"a\")")
    db = main.SessionLocal()
    nom = models.Nomina(periodo_mes=1, periodo_anio=2031, tipo=models.TipoNomina.FIN_MES)
    db.add(nom)
    db.flush()
    db.add(models.ReporteriaNomina(nomina_id=nom.id, empleado_id=emp_id, dias_trabajados=30, salario_ordinario=1,
                                   bonificacion_ley=0, total_ingresos_extra=0, total_descuentos_ley=0,
                                   total_otros_descuentos=0, liquido_a_recibir=1))
    db.commit()
    nid = nom.id
    db.close()
    r = client.get(f"/api/reporteria/nominas/{nid}/excel", headers=auth(admin))
    assert r.status_code == 200
    ws = load_workbook(io.BytesIO(r.content)).active
    celda = next(c for c in ws[2] if isinstance(c.value, str) and "HYPERLINK" in c.value)
    assert celda.data_type == "s" and celda.value.startswith("'=")


def test_nomina_unica_por_periodo(client, admin):
    db = main.SessionLocal()
    db.add(models.Nomina(periodo_mes=2, periodo_anio=2031, tipo=models.TipoNomina.FIN_MES))
    db.commit()
    db.add(models.Nomina(periodo_mes=2, periodo_anio=2031, tipo=models.TipoNomina.FIN_MES))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()
    db.close()
    r = client.post("/api/nominas/ejecutar", headers=auth(admin),
                    json={"mes": 2, "anio": 2031, "tipo_nomina": "Fin de Mes"})
    assert r.status_code == 409


def test_dias_efectivos_no_negativos(client, admin):
    rubro(client, admin, "6111020000", "Debe", "Sueldo ordinario")
    rubro(client, admin, "6111100000", "Debe", "Bonificación ley")
    emp_id = empleado(client, admin, "2222222222222")
    for _ in range(2):
        assert client.post("/api/procesos/incidencias", headers=auth(admin), json=dict(
            empleado_id=emp_id, concepto="Falta", fecha_incidencia="2026-01-01", dias_descontar=30)).status_code == 200
    r = client.post("/api/nominas/ejecutar", headers=auth(admin),
                    json={"mes": 3, "anio": 2031, "tipo_nomina": "Fin de Mes"})
    assert r.status_code == 200, r.text
    db = main.SessionLocal()
    filas = db.query(models.ReporteriaNomina).filter(models.ReporteriaNomina.empleado_id == emp_id).all()
    asientos = db.query(models.AsientoContable).filter(models.AsientoContable.periodo_anio == 2031,
                                                       models.AsientoContable.periodo_mes == 3).all()
    db.close()
    assert filas and all(f.dias_trabajados >= 0 and f.liquido_a_recibir >= 0 for f in filas)
    assert all(a.debe >= 0 for a in asientos)


def test_listado_empleados_sin_pii_para_procesos(client, admin):
    empleado(client, admin, "3333333333333", nit="1234567-8")
    procesos = crear_usuario(client, admin, "soloprocesos", acceso_procesos=True)
    lista = client.get("/api/rrhh/empleados", headers=auth(procesos))
    assert lista.status_code == 200 and lista.json()
    for e in lista.json():
        assert "salario_base" not in e and "nit" not in e and "numero_igss" not in e and "fecha_nacimiento" not in e
    assert client.get("/api/empleados/1/historial", headers=auth(procesos)).status_code == 403
    completo = client.get("/api/rrhh/empleados", headers=auth(admin)).json()
    assert "salario_base" in completo[0]


def test_bitacora_registra_al_actor_real(client, admin):
    client.post("/api/mantenimiento/cecos", headers=auth(admin),
                json=dict(codigo="1000000001", nombre="Ventas", unidad="U", linea_negocio="L"))
    rrhh = crear_usuario(client, admin, "rrhhuno", acceso_rrhh=True)
    emp_id = empleado(client, rrhh, "4444444444444")
    mov = dict(tipo_movimiento="Aumento", nuevo_puesto="Analista", nuevo_centro="Central", nuevo_salario=4000,
               nuevos_cecos=[{"ceco": "1000000001", "porcentaje": 100}], motivo="Mérito")
    assert client.post(f"/api/empleados/{emp_id}/movimientos", headers=auth(rrhh), json=mov).status_code == 200
    assert client.put(f"/api/empleados/{emp_id}/retirar", headers=auth(rrhh),
                      json={"fecha_retiro": "2026-02-01", "motivo_retiro": "Renuncia"}).status_code == 200
    assert client.put(f"/api/empleados/{emp_id}/reactivar", headers=auth(rrhh)).status_code == 200
    historial = client.get(f"/api/empleados/{emp_id}/historial", headers=auth(rrhh)).json()
    assert len(historial) >= 3 and all(h["usuario"] == "rrhhuno" for h in historial)


def test_movimiento_rechaza_valores_invalidos(client, admin):
    emp_id = empleado(client, admin, "5555555555555")
    base_mov = dict(tipo_movimiento="X", nuevo_puesto="P", nuevo_centro="C", nuevo_salario=1000,
                    nuevos_cecos=[{"ceco": "1000000001", "porcentaje": 100}], motivo="m")
    for cambio in [{"nuevo_salario": -1}, {"nuevo_salario": 0},
                   {"nuevos_cecos": [{"ceco": "1000000001", "porcentaje": 150}, {"ceco": "1000000001", "porcentaje": -50}]},
                   {"nuevos_cecos": [{"ceco": "9999999999", "porcentaje": 100}]}]:
        r = client.post(f"/api/empleados/{emp_id}/movimientos", headers=auth(admin), json={**base_mov, **cambio})
        assert r.status_code in (400, 422), cambio


def test_basico_valida_dpi_y_duplicados(client, admin):
    a = empleado(client, admin, "6666666666666")
    empleado(client, admin, "7777777777777")
    datos = dict(dpi="abc", nit="", numero_igss="", nombre_completo="Ana", fecha_nacimiento="1990-01-01")
    assert client.put(f"/api/empleados/{a}/basico", headers=auth(admin), json=datos).status_code == 422
    assert client.put(f"/api/empleados/{a}/basico", headers=auth(admin),
                      json={**datos, "dpi": "7777777777777"}).status_code == 400


def test_parametro_legal_validado(client, admin):
    rubro(client, admin, "2111010000", "Haber", "ISR laboral")
    db = main.SessionLocal()
    ids = [r.id for r in db.query(models.RubroContableNomina).all()]
    db.close()
    r = client.post("/api/mantenimiento/parametros", headers=auth(admin), json=dict(
        rubro_principal_id=ids[-1], rubro_contrapartida_id=ids[0], valor=-5, es_porcentaje=True))
    assert r.status_code == 422
    r = client.post("/api/mantenimiento/parametros", headers=auth(admin), json=dict(
        rubro_principal_id=ids[-1], rubro_contrapartida_id=ids[0], valor=150, es_porcentaje=True))
    assert r.status_code == 400
    assert client.post("/api/mantenimiento/parametros", headers=auth(admin), json=dict(
        rubro_principal_id=ids[-1], rubro_contrapartida_id=ids[0], valor=4.83, es_porcentaje=True)).status_code == 200
    pid = client.get("/api/mantenimiento/parametros", headers=auth(admin)).json()[-1]["id"]
    assert client.put(f"/api/mantenimiento/parametros/{pid}", headers=auth(admin),
                      json={"valor": 4.83, "cuentas_afectas_ids": [999999]}).status_code == 400
    assert client.put(f"/api/mantenimiento/parametros/{pid}", headers=auth(admin),
                      json={"valor": 4.83, "cuentas_afectas_ids": [ids[0], ids[0]]}).status_code == 200
    guardado = client.get("/api/mantenimiento/parametros", headers=auth(admin)).json()[-1]
    assert guardado["cuentas_afectas_ids"] == [ids[0]]


def test_catalogos_bloqueados_se_aplican_en_servidor(client, admin):
    client.post("/api/mantenimiento/centros-trabajo", headers=auth(admin), json=dict(
        nombre_ubicacion="sede norte", direccion="Zona 1", departamento="guatemala", municipio="guatemala"))
    cid = next(c["id"] for c in client.get("/api/mantenimiento/centros-trabajo", headers=auth(admin)).json()
               if c["nombre_ubicacion"] == "Sede Norte")
    assert client.put(f"/api/mantenimiento/centros-trabajo/{cid}/bloquear", headers=auth(admin)).status_code == 200
    r = client.post("/api/empleados", headers=auth(admin), json=dict(
        dpi="8888888888888", nombre_completo="Luis", fecha_nacimiento="1990-01-01", fecha_contratacion="2024-01-01",
        centro_trabajo="Sede Norte", salario_base=3000))
    assert r.status_code == 400
    # rubro inactivo / categoría incorrecta no puede usarse en ingresos
    emp_id = empleado(client, admin, "9999999999999")
    db = main.SessionLocal()
    debe = db.query(models.RubroContableNomina).filter(models.RubroContableNomina.cat_conta == "Debe").first()
    haber = db.query(models.RubroContableNomina).filter(models.RubroContableNomina.cat_conta == "Haber").first()
    db.close()
    assert client.post("/api/nominas/ingresos", headers=auth(admin),
                       json=dict(empleado_id=emp_id, rubro_id=haber.id, monto=10)).status_code == 400
    client.put(f"/api/contabilidad/rubros/{debe.id}/toggle", headers=auth(admin))
    assert client.post("/api/nominas/ingresos", headers=auth(admin),
                       json=dict(empleado_id=emp_id, rubro_id=debe.id, monto=10)).status_code == 400
    client.put(f"/api/contabilidad/rubros/{debe.id}/toggle", headers=auth(admin))
    assert client.post("/api/nominas/ingresos", headers=auth(admin),
                       json=dict(empleado_id=emp_id, rubro_id=debe.id, monto=10)).status_code == 200


def test_limitador_no_confia_en_xff_del_cliente(client):
    # PROXY_HOPS=0 (por defecto): X-Forwarded-For del cliente se ignora.
    for i in range(5):
        r = client.post("/api/auth/login", json={"username": "admin", "password": "mala"},
                        headers={"X-Forwarded-For": f"10.0.0.{i}"})
        assert r.status_code == 401
    r = client.post("/api/auth/login", json={"username": "admin", "password": "mala"},
                    headers={"X-Forwarded-For": "10.9.9.9"})
    assert r.status_code == 429


def test_ip_cliente_usa_el_salto_del_proxy(monkeypatch):
    class Req:
        headers = {"X-Forwarded-For": "6.6.6.6, 203.0.113.7"}
        client = type("C", (), {"host": "10.1.1.1"})()
    monkeypatch.setattr(security, "PROXY_HOPS", 1)
    assert main._ip_cliente(Req()) == "203.0.113.7"
    monkeypatch.setattr(security, "PROXY_HOPS", 0)
    assert main._ip_cliente(Req()) == "10.1.1.1"


def test_username_normalizado_para_el_limitador():
    assert security.normalizar_username(" Admín ") == security.normalizar_username("admin")


def test_codigo_reset_usa_subclave():
    import hashlib
    import hmac as _hmac
    plano = _hmac.new(security.JWT_SECRET.encode(), b"ABC", hashlib.sha256).hexdigest()
    assert security.hashear_codigo("ABC") != plano
