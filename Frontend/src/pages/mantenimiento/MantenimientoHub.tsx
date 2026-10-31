import { useState, useEffect } from 'react';
import { Settings, Layers, MapPin, BookOpen, Sliders, Plus } from 'lucide-react';
import api from '../../services/api';

// 1. IMPORTAMOS NUESTRO COMPONENTE GLOBAL DE NOTIFICACIONES
import NotificacionFlotante from '../../components/NotificacionFlotante'; // Ajusta la ruta según tu estructura de carpetas

export default function MantenimientoHub() {
  const [vistaActiva, setVistaActiva] = useState<'cecos' | 'centros' | 'rubros' | 'parametros' | 'puestos'>('cecos');
  
  const [cecos, setCecos] = useState<any[]>([]);
  const [centrosTrabajo, setCentrosTrabajo] = useState<any[]>([]);
  const [rubros, setRubros] = useState<any[]>([]);
  const [parametros, setParametros] = useState<any[]>([]);
  const [formParam, setFormParam] = useState({ rubro_principal_id: '', rubro_contrapartida_id: '', valor: 0, es_porcentaje: true });
  
  // 2. ESTADOS SIMPLIFICADOS PARA LAS NOTIFICACIONES FLOTANTES
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  
  const [puestos, setPuestos] = useState<any[]>([]);

  // Formularios
  const [formCeco, setFormCeco] = useState({ codigo: '', nombre: '', unidad: '', linea_negocio: '' });
  const [formCentro, setFormCentro] = useState({ nombre_ubicacion: '', direccion: '', departamento: '', municipio: '' });
  const [formRubro, setFormRubro] = useState({ 
    desc_ing_des: '', 
    clave_conta: '50', 
    cat_conta: 'Haber', 
    cuenta_mayor: '', 
    tipo_gasto: 'Fijo' 
  });
  const [formPuesto, setFormPuesto] = useState({
    nombre: '',
    unidad: '',
    tipo_puesto: 'Administrativo',
    categoria: 'Profesional',
    area_funcional: ''
  });

  useEffect(() => {
    cargarDatos();
  }, [vistaActiva]);

  const cargarDatos = async () => {
    try {
      setError(null);
      if (vistaActiva === 'cecos') {
        const res = await api.get('/mantenimiento/cecos');
        setCecos(res.data);
      } else if (vistaActiva === 'centros') {
        const res = await api.get('/mantenimiento/centros-trabajo');
        setCentrosTrabajo(res.data);
      } else if (vistaActiva === 'rubros') {
        const res = await api.get('/contabilidad/rubros');
        setRubros(res.data);
      } else if (vistaActiva === 'parametros') {
        const resParams = await api.get('/mantenimiento/parametros');
        setParametros(resParams.data);
        const resRubros = await api.get('/contabilidad/rubros');
        setRubros(resRubros.data);
      } else if (vistaActiva === 'puestos') {
        const res = await api.get('/mantenimiento/puestos');
        setPuestos(res.data);
      }
    } catch (err: any) {
      setError("Error al cargar los datos del catálogo.");
    }
  };

  const handleCrearCeco = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setExito(null);
    try {
      await api.post('/mantenimiento/cecos', formCeco);
      setExito("Centro de Costo registrado con éxito.");
      setFormCeco({ codigo: '', nombre: '', unidad: '', linea_negocio: '' });
      cargarDatos();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Error al guardar CeCo.");
    }
  };

  const handleToggleCeco = async (id: number) => {
    setError(null);
    setExito(null);
    try {
      await api.put(`/mantenimiento/cecos/${id}/toggle`);
      setExito("Estado del CeCo actualizado.");
      cargarDatos();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Error al actualizar CeCo.");
    }
  };

  const handleCrearCentro = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setExito(null);
    try {
      await api.post('/mantenimiento/centros-trabajo', formCentro);
      setExito("Centro de trabajo registrado con éxito.");
      setFormCentro({ nombre_ubicacion: '', direccion: '', departamento: '', municipio: '' });
      cargarDatos();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Error al guardar centro de trabajo.");
    }
  };

  const handleBloquearCentro = async (id: number) => {
    if (!window.confirm("¿Estás seguro de bloquear permanentemente este Centro de Trabajo? Una vez bloqueado no se podrá volver a habilitar.")) return;
    setError(null);
    setExito(null);
    try {
      await api.put(`/mantenimiento/centros-trabajo/${id}/bloquear`);
      setExito("Centro de trabajo bloqueado permanentemente.");
      cargarDatos();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Error al bloquear centro de trabajo.");
    }
  };

  const handleCrearRubro = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setExito(null);
    try {
      await api.post('/contabilidad/rubros', formRubro);
      setExito("Rubro contable registrado correctamente.");
      setFormRubro({ desc_ing_des: '', clave_conta: '50', cat_conta: 'Haber', cuenta_mayor: '', tipo_gasto: 'Fijo' });
      cargarDatos();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Error al guardar rubro.");
    }
  };

  const handleToggleRubro = async (id: number) => {
    setError(null);
    setExito(null);
    try {
      await api.put(`/contabilidad/rubros/${id}/toggle`);
      setExito("Estado del rubro contable actualizado.");
      cargarDatos();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Error al actualizar rubro.");
    }
  };

  return (
    // 3. AGREGAMOS 'relative' PARA CONTENER CORRECTAMENTE LAS NOTIFICACIONES FLOTANTES
    <div className="space-y-6 max-w-6xl mx-auto pb-12 relative">
      
      {/* 4. INYECTAMOS EL COMPONENTE GLOBAL (Se eliminaron los divs fijos de error y éxito de aquí) */}
      <NotificacionFlotante error={error} exito={exito} setError={setError} setExito={setExito} />

      <div className="flex items-center gap-3 border-b pb-4">
        <div className="bg-slate-800 p-2 rounded-lg text-white">
          <Settings size={24} />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Módulo de Mantenimiento y Catálogos</h2>
          <p className="text-sm text-gray-500">Gestión de CeCos, Centros de Trabajo y Cuentas Contables con controles de bloqueo.</p>
        </div>
      </div>

      {/* NAVEGACIÓN DE VISTAS */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <button 
          onClick={() => setVistaActiva('cecos')}
          className={`p-4 rounded-xl border text-left flex items-center gap-3 transition-all ${vistaActiva === 'cecos' ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
        >
          <Layers size={22} />
          <div>
            <p className="font-semibold text-sm">Centros de Costo</p>
            <p className={`text-xs ${vistaActiva === 'cecos' ? 'text-blue-100' : 'text-gray-400'}`}>Bloqueo / Habilitación</p>
          </div>
        </button>

        <button 
          onClick={() => setVistaActiva('centros')}
          className={`p-4 rounded-xl border text-left flex items-center gap-3 transition-all ${vistaActiva === 'centros' ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
        >
          <MapPin size={22} />
          <div>
            <p className="font-semibold text-sm">Centros de Trabajo</p>
            <p className={`text-xs ${vistaActiva === 'centros' ? 'text-blue-100' : 'text-gray-400'}`}>Bloqueo Definitivo</p>
          </div>
        </button>

        <button 
          onClick={() => setVistaActiva('rubros')}
          className={`p-4 rounded-xl border text-left flex items-center gap-3 transition-all ${vistaActiva === 'rubros' ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
        >
          <BookOpen size={22} />
          <div>
            <p className="font-semibold text-sm">Rubros Contables</p>
            <p className={`text-xs ${vistaActiva === 'rubros' ? 'text-blue-100' : 'text-gray-400'}`}>Fijos y Variables</p>
          </div>
        </button>
        <button 
          onClick={() => setVistaActiva('parametros')}
          className={`p-4 rounded-xl border text-left flex items-center gap-3 transition-all ${vistaActiva === 'parametros' ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
        >
          <Sliders size={22} />
          <div>
            <p className="font-semibold text-sm">Parámetros</p>
            <p className={`text-xs ${vistaActiva === 'parametros' ? 'text-blue-100' : 'text-gray-400'}`}>Configuraciones Ley</p>
          </div>
        </button>
        <button 
          onClick={() => { setVistaActiva('puestos'); setError(null); }}
          className={`p-4 rounded-xl border flex flex-col gap-2 items-start transition-all ${vistaActiva === 'puestos' ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
        >
          <div className="font-semibold text-sm">Puestos</div>
          <div className={`text-xs ${vistaActiva === 'puestos' ? 'text-blue-100' : 'text-gray-400'}`}>Clasificación Organizacional</div>
        </button>
      </div>

      {/* VISTA 1: CECOS CON BLOQUEO / HABILITACIÓN */}
      {vistaActiva === 'cecos' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-xl border shadow-sm lg:col-span-1">
            <h3 className="font-semibold text-gray-800 mb-4 text-sm flex items-center gap-2">
              <Plus size={18} className="text-blue-600" /> Registrar Nuevo CeCo
            </h3>
            <form onSubmit={handleCrearCeco} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Código (10 dígitos)</label>
                <input 
                  type="text" maxLength={10} required placeholder="Ej. 1010203000"
                  value={formCeco.codigo} onChange={e => setFormCeco({...formCeco, codigo: e.target.value})}
                  className="w-full border rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nombre</label>
                <input 
                  type="text" required placeholder="Ej. Depto Financiero"
                  value={formCeco.nombre} onChange={e => setFormCeco({...formCeco, nombre: e.target.value})}
                  className="w-full border rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Unidad</label>
                <input 
                  type="text" required placeholder="Ej. Administración"
                  value={formCeco.unidad} onChange={e => setFormCeco({...formCeco, unidad: e.target.value})}
                  className="w-full border rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Línea de Negocio</label>
                <input 
                  type="text" required placeholder="Ej. Corporativo"
                  value={formCeco.linea_negocio} onChange={e => setFormCeco({...formCeco, linea_negocio: e.target.value})}
                  className="w-full border rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg text-sm font-medium">
                Guardar CeCo
              </button>
            </form>
          </div>

          <div className="bg-white rounded-xl border shadow-sm lg:col-span-2 overflow-hidden">
            <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
              <h3 className="font-semibold text-gray-800 text-sm">Catálogo de Centros de Costo</h3>
              <span className="text-xs bg-blue-100 text-blue-700 px-2.5 py-1 rounded font-medium">Total: {cecos.length}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 text-xs uppercase border-b">
                    <th className="p-3">Código</th>
                    <th className="p-3">Nombre</th>
                    <th className="p-3">Estado</th>
                    <th className="p-3 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y text-gray-700">
                  {cecos.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="p-3 font-semibold text-blue-600">{c.codigo}</td>
                      <td className="p-3">{c.nombre}</td>
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${c.activo !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                          {c.activo !== false ? 'Activo' : 'Bloqueado'}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <button 
                          onClick={() => handleToggleCeco(c.id)}
                          className={`px-3 py-1 rounded text-xs font-medium text-white ${c.activo !== false ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                        >
                          {c.activo !== false ? 'Bloquear' : 'Habilitar'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VISTA 2: CENTROS DE TRABAJO (BLOQUEO PERMANENTE) */}
      {vistaActiva === 'centros' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-xl border shadow-sm lg:col-span-1">
            <h3 className="font-semibold text-gray-800 mb-4 text-sm flex items-center gap-2">
              <Plus size={18} className="text-blue-600" /> Registrar Centro de Trabajo
            </h3>
            <form onSubmit={handleCrearCentro} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nombre Ubicación / Tienda</label>
                <input 
                  type="text" required placeholder="Ej. Tienda Galerías"
                  value={formCentro.nombre_ubicacion} onChange={e => setFormCentro({...formCentro, nombre_ubicacion: e.target.value})}
                  className="w-full border rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Dirección</label>
                <input 
                  type="text" required placeholder="Ej. 12 Calle 4-50"
                  value={formCentro.direccion} onChange={e => setFormCentro({...formCentro, direccion: e.target.value})}
                  className="w-full border rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Departamento</label>
                <input 
                  type="text" required placeholder="Ej. Guatemala"
                  value={formCentro.departamento} onChange={e => setFormCentro({...formCentro, departamento: e.target.value})}
                  className="w-full border rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Municipio</label>
                <input 
                  type="text" required placeholder="Ej. Guatemala"
                  value={formCentro.municipio} onChange={e => setFormCentro({...formCentro, municipio: e.target.value})}
                  className="w-full border rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg text-sm font-medium">
                Guardar Ubicación
              </button>
            </form>
          </div>

          <div className="bg-white rounded-xl border shadow-sm lg:col-span-2 overflow-hidden">
            <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
              <h3 className="font-semibold text-gray-800 text-sm">Centros de Trabajo (Bloqueo Definitivo)</h3>
              <span className="text-xs bg-blue-100 text-blue-700 px-2.5 py-1 rounded font-medium">Total: {centrosTrabajo.length}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 text-xs uppercase border-b">
                    <th className="p-3">Ubicación / Tienda</th>
                    <th className="p-3">Dirección</th>
                    <th className="p-3">Estado</th>
                    <th className="p-3 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y text-gray-700">
                  {centrosTrabajo.map((ct) => (
                    <tr key={ct.id} className="hover:bg-slate-50">
                      <td className="p-3 font-semibold">{ct.nombre_ubicacion}</td>
                      <td className="p-3 text-xs text-gray-600">{ct.direccion} ({ct.departamento})</td>
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${ct.activo !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                          {ct.activo !== false ? 'Activo' : 'Bloqueado Definitivo'}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        {ct.activo !== false ? (
                          <button 
                            onClick={() => handleBloquearCentro(ct.id)}
                            className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-xs font-medium"
                          >
                            Bloquear Definitivo
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400 italic">No reversible</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VISTA 3: RUBROS CONTABLES (CON CLAVE, CAT, CUENTA MAYOR Y TIPO GASTO) */}
      {vistaActiva === 'rubros' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-xl border shadow-sm lg:col-span-1">
            <h3 className="font-semibold text-gray-800 mb-4 text-sm flex items-center gap-2">
              <Plus size={18} className="text-blue-600" /> Registrar Rubro Contable
            </h3>
            <form onSubmit={handleCrearRubro} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Descripción (Desc. Ing / Des)</label>
                <input 
                  type="text" required placeholder="Ej. Sueldo ordinario"
                  value={formRubro.desc_ing_des} onChange={e => setFormRubro({...formRubro, desc_ing_des: e.target.value})}
                  className="w-full border rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Clave Contable</label>
                  <input 
                    type="text" required placeholder="Ej. 40"
                    value={formRubro.clave_conta} onChange={e => setFormRubro({...formRubro, clave_conta: e.target.value})}
                    className="w-full border rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Cat. Conta (Debe/Haber)</label>
                  <select 
                    value={formRubro.cat_conta} onChange={e => setFormRubro({...formRubro, cat_conta: e.target.value})}
                    className="w-full border rounded-lg p-2.5 text-sm outline-none bg-white focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Debe">Debe</option>
                    <option value="Haber">Haber</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Cuenta Mayor (10 dígitos)</label>
                <input 
                  type="text" maxLength={10} required placeholder="Ej. 6111020000"
                  value={formRubro.cuenta_mayor} onChange={e => setFormRubro({...formRubro, cuenta_mayor: e.target.value})}
                  className="w-full border rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de Gasto</label>
                <select 
                  value={formRubro.tipo_gasto} onChange={e => setFormRubro({...formRubro, tipo_gasto: e.target.value})}
                  className="w-full border rounded-lg p-2.5 text-sm outline-none bg-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Fijo">Fijo</option>
                  <option value="Variable">Variable</option>
                </select>
              </div>
              <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg text-sm font-medium">
                Guardar Rubro
              </button>
            </form>
          </div>

          <div className="bg-white rounded-xl border shadow-sm lg:col-span-2 overflow-hidden">
            <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
              <h3 className="font-semibold text-gray-800 text-sm">Catálogo de Cuentas y Rubros Contables</h3>
              <span className="text-xs bg-blue-100 text-blue-700 px-2.5 py-1 rounded font-medium">Total: {rubros.length}</span>
            </div>
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-50 z-10">
                  <tr className="text-slate-600 text-xs uppercase border-b">
                    <th className="p-3">Descripción</th>
                    <th className="p-3">Clave / Cat.</th>
                    <th className="p-3">Cuenta Mayor</th>
                    <th className="p-3">Gasto</th>
                    <th className="p-3 text-center">Estado</th>
                    <th className="p-3 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y text-gray-700">
                  {rubros.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="p-3 font-semibold text-gray-900">{r.desc_ing_des}</td>
                      <td className="p-3 text-xs">
                        <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">{r.clave_conta}</span> - <span className="font-semibold">{r.cat_conta}</span>
                      </td>
                      <td className="p-3 font-mono text-xs text-blue-600 font-bold">{r.cuenta_mayor}</td>
                      <td className="p-3 text-xs">
                        <span className={`px-2 py-0.5 rounded font-medium ${r.tipo_gasto === 'Fijo' ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700'}`}>
                          {r.tipo_gasto}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${r.activo !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                          {r.activo !== false ? 'Activo' : 'Bloqueado'}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <button 
                          onClick={() => handleToggleRubro(r.id)}
                          className={`px-3 py-1 rounded text-xs font-medium text-white ${r.activo !== false ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                        >
                          {r.activo !== false ? 'Bloquear' : 'Habilitar'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VISTA 4: PARÁMETROS DINÁMICOS Y PARTIDA DOBLE */}
      {vistaActiva === 'parametros' && (
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-xl border shadow-sm xl:col-span-1 h-fit sticky top-4">
            <h3 className="font-semibold text-gray-800 mb-4 text-sm flex items-center gap-2">
              <Plus size={18} className="text-blue-600" /> Nuevo Parámetro
            </h3>
            <form 
              onSubmit={async (e) => {
                e.preventDefault();
                setError(null);
                setExito(null);
                try {
                  await api.post('/mantenimiento/parametros', formParam);
                  setExito("Parámetro y partida doble registrados.");
                  setFormParam({ rubro_principal_id: '', rubro_contrapartida_id: '', valor: 0, es_porcentaje: true });
                  cargarDatos();
                } catch (err: any) {
                  setError(err.response?.data?.detail || "Error al crear el parámetro.");
                }
              }} 
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Cuenta Principal</label>
                <select 
                  required value={formParam.rubro_principal_id}
                  onChange={e => setFormParam({...formParam, rubro_principal_id: e.target.value})}
                  className="w-full border rounded-lg p-2.5 text-sm outline-none bg-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Seleccionar Cuenta --</option>
                  {rubros.map(r => (
                    <option key={`p-${r.id}`} value={r.id}>{r.desc_ing_des} ({r.cuenta_mayor}) - {r.cat_conta}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Valor</label>
                  <input 
                    type="number" step="0.01" required
                    value={formParam.valor} onChange={e => setFormParam({...formParam, valor: parseFloat(e.target.value)})}
                    className="w-full border rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
                  <select 
                    value={formParam.es_porcentaje ? "true" : "false"} 
                    onChange={e => setFormParam({...formParam, es_porcentaje: e.target.value === "true"})}
                    className="w-full border rounded-lg p-2.5 text-sm outline-none bg-white focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="true">Porcentaje (%)</option>
                    <option value="false">Monto Fijo (Q.)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Cuenta Contrapartida</label>
                <select 
                  required value={formParam.rubro_contrapartida_id}
                  onChange={e => setFormParam({...formParam, rubro_contrapartida_id: e.target.value})}
                  className="w-full border rounded-lg p-2.5 text-sm outline-none bg-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Seleccionar Contrapartida --</option>
                  {rubros.map(r => (
                    <option key={`c-${r.id}`} value={r.id}>{r.desc_ing_des} ({r.cuenta_mayor}) - {r.cat_conta}</option>
                  ))}
                </select>
              </div>
              <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg text-sm font-medium">
                Registrar
              </button>
            </form>
          </div>

          <div className="bg-white p-6 rounded-xl border shadow-sm xl:col-span-3">
            <h3 className="font-semibold text-gray-800 mb-2 text-base">Cuentas Afectas al Cálculo</h3>
            <p className="text-xs text-gray-500 mb-6">Selecciona mediante Ctrl+Clic sobre qué cuentas se aplicará este parámetro (Ej. calcular IGSS sobre Sueldo Ordinario y Comisiones).</p>
            
            <div className="space-y-4">
              {parametros.map((param) => (
                <div key={param.id} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start p-4 bg-slate-50 rounded-lg border">
                  
                  <div className="md:col-span-3">
                    <label className="block text-sm font-bold text-gray-800 mb-1">{param.nombre}</label>
                    <div className="relative mb-2">
                      <input 
                        type="number" step="0.01" value={param.valor}
                        onChange={(e) => {
                          const nuevos = parametros.map(p => p.id === param.id ? {...p, valor: parseFloat(e.target.value)} : p);
                          setParametros(nuevos);
                        }}
                        className="w-full border rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="absolute right-3 top-2.5 text-gray-400 text-sm font-bold">
                        {param.es_porcentaje ? '%' : 'Q.'}
                      </span>
                    </div>
                    <button 
                      onClick={async () => {
                        if(!window.confirm(`¿Eliminar configuración de ${param.nombre}?`)) return;
                        setError(null);
                        setExito(null);
                        try {
                          await api.delete(`/mantenimiento/parametros/${param.id}`);
                          setExito("Parámetro eliminado.");
                          cargarDatos();
                        } catch (err) { setError("Error al eliminar."); }
                      }}
                      className="text-xs text-red-600 hover:underline font-medium"
                    >
                      Eliminar Parámetro
                    </button>
                  </div>

                  <div className="md:col-span-7">
                    <label className="block text-xs font-medium text-blue-700 mb-1">Cuentas Base para el Cálculo (Ctrl+Clic)</label>
                    <select 
                      multiple
                      value={param.cuentas_afectas_ids || []}
                      onChange={(e) => {
                        const seleccionadas = Array.from(e.target.selectedOptions, opt => parseInt(opt.value));
                        const nuevos = parametros.map(p => p.id === param.id ? {...p, cuentas_afectas_ids: seleccionadas} : p);
                        setParametros(nuevos);
                      }}
                      className="w-full border border-blue-200 rounded-lg p-2.5 text-sm outline-none bg-white focus:ring-2 focus:ring-blue-500 h-28"
                    >
                      {rubros.map(r => (
                        <option key={r.id} value={r.id}>{r.desc_ing_des} ({r.cuenta_mayor}) - {r.cat_conta}</option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2 flex flex-col justify-end h-full">
                    <button 
                      onClick={async () => {
                        setError(null);
                        setExito(null);
                        try {
                          await api.put(`/mantenimiento/parametros/${param.id}`, { 
                            valor: param.valor, 
                            cuentas_afectas_ids: param.cuentas_afectas_ids || []
                          });
                          setExito(`Cuentas afectas actualizadas.`);
                          cargarDatos();
                        } catch (err: any) { setError("Error al guardar."); }
                      }}
                      className="w-full bg-slate-800 hover:bg-slate-900 text-white py-2.5 rounded-lg text-sm font-medium"
                    >
                      Guardar
                    </button>
                  </div>

                </div>
              ))}
              {parametros.length === 0 && <p className="text-sm text-gray-500 italic">No hay parámetros registrados. Selecciona una cuenta principal para empezar.</p>}
            </div>
          </div>
        </div>
      )}

      {/* VISTA 5: CATÁLOGO DE PUESTOS */}
      {vistaActiva === 'puestos' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-xl border shadow-sm lg:col-span-1 h-fit">
            <h3 className="font-semibold text-gray-800 mb-4 text-sm flex items-center gap-2">
              <Plus size={18} className="text-blue-600" /> Nuevo Puesto
            </h3>
            <form 
              onSubmit={async (e) => {
                e.preventDefault();
                setError(null);
                setExito(null);
                try {
                  await api.post('/mantenimiento/puestos', formPuesto);
                  setExito("Puesto registrado correctamente.");
                  setFormPuesto({ nombre: '', unidad: '', tipo_puesto: 'Administrativo', categoria: 'Profesional', area_funcional: '' });
                  cargarDatos();
                } catch (err: any) {
                  setError(err.response?.data?.detail || "Error al crear el puesto.");
                }
              }} 
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nombre del Puesto</label>
                <input 
                  type="text" required placeholder="Ej. Analista de Nóminas"
                  value={formPuesto.nombre} onChange={e => setFormPuesto({...formPuesto, nombre: e.target.value})}
                  className="w-full border rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Área Funcional</label>
                <input 
                  type="text" required placeholder="Ej. Recursos Humanos"
                  value={formPuesto.area_funcional} onChange={e => setFormPuesto({...formPuesto, area_funcional: e.target.value})}
                  className="w-full border rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Unidad Organizativa</label>
                <input 
                  type="text" required placeholder="Ej. Gerencia Administrativa"
                  value={formPuesto.unidad} onChange={e => setFormPuesto({...formPuesto, unidad: e.target.value})}
                  className="w-full border rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
                  <select 
                    value={formPuesto.tipo_puesto} 
                    onChange={e => setFormPuesto({...formPuesto, tipo_puesto: e.target.value})}
                    className="w-full border rounded-lg p-2.5 text-sm outline-none bg-white focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Operativo">Operativo</option>
                    <option value="Administrativo">Administrativo</option>
                    <option value="Dirección">Dirección</option>
                    <option value="Ejecutivo">Ejecutivo</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Categoría</label>
                  <select 
                    value={formPuesto.categoria} 
                    onChange={e => setFormPuesto({...formPuesto, categoria: e.target.value})}
                    className="w-full border rounded-lg p-2.5 text-sm outline-none bg-white focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Gerencia">Gerencia</option>
                    <option value="Jefatura">Jefatura</option>
                    <option value="Profesional">Profesional</option>
                    <option value="Técnico">Técnico</option>
                    <option value="Asistente">Asistente</option>
                    <option value="Auxiliar">Auxiliar</option>
                  </select>
                </div>
              </div>
              <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg text-sm font-medium">
                Registrar Puesto
              </button>
            </form>
          </div>

          <div className="bg-white p-6 rounded-xl border shadow-sm lg:col-span-2">
            <h3 className="font-semibold text-gray-800 mb-4 text-base">Puestos Registrados</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-600">
                <thead className="bg-gray-50 text-gray-700 text-xs uppercase border-b">
                  <tr>
                    <th className="px-4 py-3">Puesto</th>
                    <th className="px-4 py-3">Área / Unidad</th>
                    <th className="px-4 py-3">Clasificación</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {puestos.map((p) => (
                    <tr key={p.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">{p.nombre}</td>
                      <td className="px-4 py-3">
                        <div className="text-gray-800">{p.area_funcional}</div>
                        <div className="text-xs text-gray-500">{p.unidad}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded text-xs mr-2">{p.tipo_puesto}</span>
                        <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded text-xs">{p.categoria}</span>
                      </td>
                      <td className="px-4 py-3">
                        {p.activo 
                          ? <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-medium">Activo</span>
                          : <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-medium">Bloqueado</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button 
                          onClick={async () => {
                            setError(null);
                            setExito(null);
                            try {
                              await api.put(`/mantenimiento/puestos/${p.id}/toggle`);
                              setExito(`Estado de ${p.nombre} actualizado.`);
                              cargarDatos();
                            } catch (err: any) { setError("Error al actualizar estado."); }
                          }}
                          className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${p.activo ? 'text-red-600 hover:bg-red-50' : 'text-green-600 hover:bg-green-50'}`}
                        >
                          {p.activo ? 'Bloquear' : 'Habilitar'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {puestos.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-gray-500 italic">No hay puestos registrados.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
