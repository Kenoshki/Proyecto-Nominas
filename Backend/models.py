from sqlalchemy import Column, Integer, String, Float, Boolean, Date, DateTime, ForeignKey, UniqueConstraint, Enum as SQLEnum, create_engine
from sqlalchemy.orm import relationship, declarative_base, sessionmaker
from datetime import date
from dotenv import load_dotenv
from pathlib import Path
import enum
import os

# Carga las variables del archivo .env
env_path = Path(__file__).resolve().parent / '.env'
load_dotenv(dotenv_path=env_path)

# --- CONEXIÓN A BASE DE DATOS ---
URL_BD = os.getenv("DATABASE_URL")
if not URL_BD:
    raise ValueError(f"No se encontró la variable DATABASE_URL. Asegúrate de que el archivo .env exista en esta ruta: {env_path}")

# Railway entrega mysql://...; SQLAlchemy necesita el driver explícito.
if URL_BD.startswith("mysql://"):
    URL_BD = "mysql+pymysql://" + URL_BD[len("mysql://"):]

# pool_pre_ping/recycle evitan conexiones muertas tras inactividad en el proxy de Railway.
engine = create_engine(URL_BD, pool_pre_ping=True, pool_recycle=280)

Base = declarative_base()

# --- ENUMS ---
class TipoDescuento(enum.Enum):
    EVENTUAL = "Eventual"
    CICLICO = "Cíclico"

class TipoNomina(enum.Enum):
    FIN_MES = "Fin de Mes"
    ANTICIPO = "Anticipo 15 days"


# --- MÓDULO AUTENTICACIÓN Y ROLES ---
class Usuario(Base):
    __tablename__ = 'usuarios'
    __table_args__ = {'extend_existing': True}
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    
    es_admin = Column(Boolean, default=False)
    acceso_rrhh = Column(Boolean, default=False)
    acceso_nominas = Column(Boolean, default=False)
    acceso_procesos = Column(Boolean, default=False)
    acceso_mantenimiento = Column(Boolean, default=False)
    acceso_contabilidad = Column(Boolean, default=False)


class PasswordReset(Base):
    """Código de un solo uso emitido por un administrador para restablecer una contraseña."""
    __tablename__ = 'password_resets'
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey('usuarios.id', ondelete='CASCADE'), nullable=False, index=True)
    codigo_hash = Column(String(64), nullable=False)
    expira = Column(DateTime, nullable=False)
    usado = Column(Boolean, default=False, nullable=False)


# --- MÓDULO RRHH ---
class Empleado(Base):
    __tablename__ = 'empleados'
    __table_args__ = {'extend_existing': True}
    
    id = Column(Integer, primary_key=True, index=True)
    dpi = Column(String(13), unique=True, nullable=False)
    nit = Column(String(15), nullable=True)
    numero_igss = Column(String(20), nullable=True)
    nombre_completo = Column(String(100), nullable=False)
    fecha_nacimiento = Column(Date, nullable=False)
    fecha_contratacion = Column(Date, nullable=False)
    
    puesto = Column(String(150), nullable=False, default="No Asignado") 
    centro_trabajo = Column(String(100), nullable=False)
    
    salario_base = Column(Float, nullable=False)
    bonificacion_ley = Column(Float, default=250.00)
    
    estado = Column(Boolean, default=True)
    fecha_retiro = Column(Date, nullable=True)
    motivo_retiro = Column(String(50), nullable=True)


# --- DISTRIBUCIÓN DE CENTROS DE COSTO (CeCo) ---
class EmpleadoCeCo(Base):
    __tablename__ = 'empleado_cecos'
    __table_args__ = {'extend_existing': True}
    
    id = Column(Integer, primary_key=True, index=True)
    empleado_id = Column(Integer, ForeignKey('empleados.id'), nullable=False)
    ceco = Column(String(10), nullable=False)
    porcentaje = Column(Float, nullable=False)
    
    empleado = relationship("Empleado", backref="distribucion_cecos")

class HistorialMovimiento(Base):
    """Bitácora estricta para auditoría de cambios financieros y contractuales"""
    __tablename__ = 'historial_movimientos'
    __table_args__ = {'extend_existing': True}
    
    id = Column(Integer, primary_key=True, index=True)
    empleado_id = Column(Integer, ForeignKey('empleados.id'), nullable=False)
    fecha_movimiento = Column(Date, default=date.today)
    
    tipo_movimiento = Column(String(100), nullable=False) 
    
    detalle_anterior = Column(String(1000), nullable=False)
    detalle_nuevo = Column(String(1000), nullable=False)
    motivo = Column(String(250), nullable=False)
    
    usuario_modificador = Column(String(50), default="admin")
    
    empleado = relationship("Empleado")

# --- CATÁLOGOS Y MANTENIMIENTO ---
class CentroCostoCatalogo(Base):
    __tablename__ = 'catalogo_cecos'
    __table_args__ = {'extend_existing': True}
    
    id = Column(Integer, primary_key=True, index=True)
    codigo = Column(String(10), unique=True, nullable=False)
    nombre = Column(String(100), nullable=False)
    unidad = Column(String(100), nullable=False)
    linea_negocio = Column(String(100), nullable=False)
    activo = Column(Boolean, default=True)

class CentroTrabajoCatalogo(Base):
    __tablename__ = 'catalogo_centros_trabajo'
    __table_args__ = {'extend_existing': True}
    
    id = Column(Integer, primary_key=True, index=True)
    nombre_ubicacion = Column(String(100), nullable=False)
    direccion = Column(String(200), nullable=False)
    departamento = Column(String(50), nullable=False)
    municipio = Column(String(50), nullable=False)
    activo = Column(Boolean, default=True)

class RubroContableNomina(Base):
    __tablename__ = 'rubros_contables_nomina'
    __table_args__ = {'extend_existing': True}
    
    id = Column(Integer, primary_key=True, index=True)
    desc_ing_des = Column(String(150), nullable=False)     
    clave_conta = Column(String(10), nullable=False)     
    cat_conta = Column(String(20), nullable=False)       
    cuenta_mayor = Column(String(10), nullable=False)    
    tipo_gasto = Column(String(20), nullable=False)       
    activo = Column(Boolean, default=True)               

class ParametroLegal(Base):
    __tablename__ = 'parametros_legales'
    __table_args__ = {'extend_existing': True}
    
    id = Column(Integer, primary_key=True, index=True)
    
    rubro_principal_id = Column(Integer, ForeignKey('rubros_contables_nomina.id'), nullable=False)
    rubro_contrapartida_id = Column(Integer, ForeignKey('rubros_contables_nomina.id'), nullable=False)
    
    valor = Column(Float, nullable=False)
    es_porcentaje = Column(Boolean, default=True)
    
    rubro_principal = relationship("RubroContableNomina", foreign_keys=[rubro_principal_id])
    rubro_contrapartida = relationship("RubroContableNomina", foreign_keys=[rubro_contrapartida_id])
    
    cuentas_afectas = relationship("ParametroCuentaAfecta", back_populates="parametro", cascade="all, delete-orphan")

class ConfiguracionSistema(Base):
    __tablename__ = 'configuracion_sistema'
    __table_args__ = {'extend_existing': True}
    
    id = Column(Integer, primary_key=True, index=True)
    clave = Column(String(50), unique=True, nullable=False)
    rubro_id = Column(Integer, ForeignKey('rubros_contables_nomina.id'), nullable=False)
    
    rubro = relationship("RubroContableNomina")

class ParametroCuentaAfecta(Base):
    __tablename__ = 'parametro_cuentas_afectas'
    __table_args__ = {'extend_existing': True}
    
    id = Column(Integer, primary_key=True, index=True)
    parametro_id = Column(Integer, ForeignKey('parametros_legales.id'))
    rubro_id = Column(Integer, ForeignKey('rubros_contables_nomina.id'))

    parametro = relationship("ParametroLegal", back_populates="cuentas_afectas")
    rubro = relationship("RubroContableNomina")

class PuestoCatalogo(Base):
    __tablename__ = 'catalogo_puestos'
    __table_args__ = {'extend_existing': True}
    
    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(150), unique=True, nullable=False)
    unidad = Column(String(100), nullable=False)               
    tipo_puesto = Column(String(50), nullable=False)          
    categoria = Column(String(50), nullable=False)            
    area_funcional = Column(String(100), nullable=False)      
    activo = Column(Boolean, default=True)                    

# --- MÓDULO NÓMINAS Y PROCESOS ---
class Ingreso(Base):
    __tablename__ = 'ingresos'
    __table_args__ = {'extend_existing': True}
    
    id = Column(Integer, primary_key=True, index=True)
    empleado_id = Column(Integer, ForeignKey('empleados.id'), nullable=False)
    rubro_id = Column(Integer, ForeignKey('rubros_contables_nomina.id'), nullable=False)
    monto = Column(Float, nullable=False)
    fecha = Column(Date, default=date.today)
    activo = Column(Boolean, default=True)   
    
    rubro = relationship("RubroContableNomina")

class Descuento(Base):
    __tablename__ = 'descuentos'
    __table_args__ = {'extend_existing': True}
    
    id = Column(Integer, primary_key=True, index=True)
    empleado_id = Column(Integer, ForeignKey('empleados.id'), nullable=False)
    tipo = Column(SQLEnum(TipoDescuento), nullable=False)
    rubro_id = Column(Integer, ForeignKey('rubros_contables_nomina.id'), nullable=False)
    monto = Column(Float, nullable=False)
    fecha = Column(Date, default=date.today)
    activo = Column(Boolean, default=True)   
    
    rubro = relationship("RubroContableNomina")

class Incidencia(Base):
    __tablename__ = 'incidencias'
    __table_args__ = {'extend_existing': True}
    
    id = Column(Integer, primary_key=True, index=True)
    empleado_id = Column(Integer, ForeignKey('empleados.id'))
    concepto = Column(String(100))
    fecha_incidencia = Column(Date)
    dias_descontar = Column(Integer, default=0)
    
    empleado = relationship("Empleado")


# ==========================================
# MÓDULO MAESTRO, REPORTERÍA Y CONTABILIDAD
# ==========================================

class Nomina(Base):
    __tablename__ = 'nominas'
    # Una sola nómina por periodo y tipo, garantizado por la base de datos.
    __table_args__ = (UniqueConstraint('periodo_mes', 'periodo_anio', 'tipo', name='uq_nomina_periodo_tipo'),
                      {'extend_existing': True})
    
    id = Column(Integer, primary_key=True, index=True)
    periodo_mes = Column(Integer)
    periodo_anio = Column(Integer)
    tipo = Column(SQLEnum(TipoNomina))
    fecha_ejecucion = Column(Date, default=date.today)

class AsientoContable(Base):
    """Modelo para almacenar las pólizas del libro diario (partida doble) generadas por las nominas"""
    __tablename__ = 'asientos_contables'
    __table_args__ = {'extend_existing': True}
    
    id = Column(Integer, primary_key=True, index=True)
    nomina_id = Column(Integer, ForeignKey('nominas.id'), nullable=True)
    periodo_mes = Column(Integer, nullable=False)
    periodo_anio = Column(Integer, nullable=False)
    fecha = Column(Date, default=date.today)
    cuenta_mayor = Column(String(10), nullable=False)
    descripcion = Column(String(150), nullable=False)
    debe = Column(Float, default=0.0)
    haber = Column(Float, default=0.0)
    
    nomina = relationship("Nomina", backref="asientos_contables")

class ReporteriaNomina(Base):
    __tablename__ = 'reporteria_nomina'
    __table_args__ = {'extend_existing': True}
    
    id = Column(Integer, primary_key=True, index=True)
    nomina_id = Column(Integer, ForeignKey('nominas.id'))
    empleado_id = Column(Integer, ForeignKey('empleados.id'))
    
    dias_trabajados = Column(Integer)
    salario_ordinario = Column(Float)
    bonificacion_ley = Column(Float)
    total_ingresos_extra = Column(Float)
    
    total_descuentos_ley = Column(Float, default=0.0)
    total_otros_descuentos = Column(Float, default=0.0)
    liquido_a_recibir = Column(Float)
    
    empleado = relationship("Empleado")
    nomina = relationship("Nomina")
    
    detalles_dinamicos = relationship("DetalleCalculoNomina", back_populates="reporteria", cascade="all, delete-orphan")

class DetalleCalculoNomina(Base):
    __tablename__ = 'detalle_calculo_nomina'
    __table_args__ = {'extend_existing': True}
    
    id = Column(Integer, primary_key=True, index=True)
    reporteria_id = Column(Integer, ForeignKey('reporteria_nomina.id'), nullable=False)
    
    nombre_parametro = Column(String(100), nullable=False)
    monto_calculado = Column(Float, nullable=False)
    tipo_calculo = Column(String(50), nullable=False)
    
    reporteria = relationship("ReporteriaNomina", back_populates="detalles_dinamicos")
    
Base.metadata.create_all(bind=engine)