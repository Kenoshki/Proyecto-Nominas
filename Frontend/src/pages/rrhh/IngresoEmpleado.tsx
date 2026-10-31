import { useState, useEffect } from 'react';
import { UserPlus, Users, AlertCircle, CheckCircle2, UserX, Plus, Trash2, PieChart, Edit, FileText, History, Briefcase, X } from 'lucide-react';
import api from '../../services/api';

export default function IngresoEmpleado() {
  const [empleados, setEmpleados] = useState<any[]>([]);
  
  // Catálogos
  const [catPuestos, setCatPuestos] = useState<any[]>([]);
  const [catCentros, setCatCentros] = useState<any[]>([]);
  const [catCecos, setCatCecos] = useState<any[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  // Formulario principal del empleado
  const [form, setForm] = useState({
    dpi: '',
    nit: '',
    numero_igss: '',
    nombre_completo: '',
    fecha_nacimiento: '',
    fecha_contratacion: '',
    puesto: '',
    centro_trabajo: '',
    salario_base: '',
    bonificacion_ley: 250.00
  });

  // Lista dinámica de CeCos para el nuevo empleado
  const [cecosForm, setCecosForm] = useState([
    { ceco: '', porcentaje: 100 }
  ]);

  // ESTADOS: EDICIÓN BÁSICA (Errores de digitación)
  const [empleadoEditar, setEmpleadoEditar] = useState<any | null>(null);
  const [formBasico, setFormBasico] = useState({
    dpi: '', nit: '', numero_igss: '', nombre_completo: '', fecha_nacimiento: ''
  });

  // ESTADOS: ACCIÓN DE PERSONAL Y BITÁCORA (Financiero)
  const [empleadoMovimiento, setEmpleadoMovimiento] = useState<any | null>(null);
  const [tabMovimiento, setTabMovimiento] = useState<'nuevo' | 'historial'>('nuevo');
  const [historial, setHistorial] = useState<any[]>([]);
  const [formMov, setFormMov] = useState({
    tipo_movimiento: 'Ajuste Salarial',
    nuevo_puesto: '',
    nuevo_centro: '',
    nuevo_salario: '',
    motivo: ''
  });
  const [cecosMov, setCecosMov] = useState<{ ceco: string; porcentaje: number }[]>([]);

  // Modal para dar de baja
  const [empleadoRetirar, setEmpleadoRetirar] = useState<any | null>(null);
  const [datosRetiro, setDatosRetiro] = useState({
    fecha_retiro: '',
    motivo_retiro: 'Renuncia'
  });

  useEffect(() => {
    cargarEmpleados();
    cargarCatalogos();
  }, []);

  // AUTO-OCULTAR NOTIFICACIONES FLOTANTES
  useEffect(() => {
    if (exito) {
      const timer = setTimeout(() => setExito(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [exito]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 8000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const cargarEmpleados = async () => {
    try {
      const res = await api.get('/empleados');
      setEmpleados(res.data);
    } catch (err) {
      console.error("Error al cargar empleados", err);
    }
  };

  const cargarCatalogos = async () => {
    try {
      const resPuestos = await api.get('/mantenimiento/puestos');
      setCatPuestos(resPuestos.data.filter((p: any) => p.activo));
      
      const resCentros = await api.get('/mantenimiento/centros-trabajo');
      setCatCentros(resCentros.data.filter((c: any) => c.activo));
      
      const resCecos = await api.get('/mantenimiento/cecos');
      setCatCecos(resCecos.data.filter((c: any) => c.activo));
    } catch (err) {
      console.error("Error al cargar catálogos", err);
    }
  };

  const agregarCeCoForm = () => {
    setCecosForm([...cecosForm, { ceco: '', porcentaje: 0 }]);
  };

  const eliminarCeCoForm = (index: number) => {
    const nuevos = cecosForm.filter((_, i) => i !== index);
    setCecosForm(nuevos);
  };

  const actualizarCeCoForm = (index: number, campo: string, valor: any) => {
    const nuevos = [...cecosForm];
    nuevos[index] = { ...nuevos[index], [campo]: campo === 'porcentaje' ? parseFloat(valor) || 0 : valor };
    setCecosForm(nuevos);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setExito(null);

    if (form.dpi.length !== 13 || isNaN(Number(form.dpi))) {
      setError("El DPI debe contener exactamente 13 dígitos numéricos.");
      return;
    }

    const sumaPorcentajes = cecosForm.reduce((acc, curr) => acc + curr.porcentaje, 0);
    if (Math.round(sumaPorcentajes) !== 100) {
      setError(`La suma de los porcentajes de los CeCo debe ser exactamente 100%. Actualmente suma ${sumaPorcentajes}%.`);
      return;
    }

    try {
      const resEmp = await api.post('/empleados', {
        ...form,
        salario_base: parseFloat(form.salario_base)
      });

      const empleadoId = resEmp.data.empleado_id;

      await api.post('/empleados/cecos', {
        empleado_id: empleadoId,
        distribucion: cecosForm
      });

      setExito("¡Empleado y distribución de Centros de Costo registrados exitosamente!");
      setForm({
        dpi: '', nit: '', numero_igss: '', nombre_completo: '', fecha_nacimiento: '',
        fecha_contratacion: '', puesto: '', centro_trabajo: '', salario_base: '', bonificacion_ley: 250.00
      });
      setCecosForm([{ ceco: '', porcentaje: 100 }]);
      cargarEmpleados();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Error al registrar el empleado.");
    }
  };

  const abrirEdicionBasica = (emp: any) => {
    setFormBasico({
      dpi: emp.dpi,
      nit: emp.nit || '',
      numero_igss: emp.numero_igss || '',
      nombre_completo: emp.nombre_completo,
      fecha_nacimiento: emp.fecha_nacimiento
    });
    setEmpleadoEditar(emp);
  };

  const handleGuardarBasico = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.put(`/empleados/${empleadoEditar.id}/basico`, formBasico);
      setExito("Datos de identificación corregidos correctamente.");
      setEmpleadoEditar(null);
      cargarEmpleados();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Error al actualizar datos.");
    }
  };

  const abrirMovimiento = async (emp: any) => {
    setFormMov({
      tipo_movimiento: 'Ajuste Salarial',
      nuevo_puesto: emp.puesto,
      nuevo_centro: emp.centro_trabajo,
      nuevo_salario: emp.salario_base,
      motivo: ''
    });
    setCecosMov(emp.distribucion_cecos.length > 0 ? [...emp.distribucion_cecos] : [{ceco: '', porcentaje: 100}]);
    setEmpleadoMovimiento(emp);
    setTabMovimiento('nuevo');
    
    try {
      const res = await api.get(`/empleados/${emp.id}/historial`);
      setHistorial(res.data);
    } catch (err) {
      console.error("Error al cargar historial");
    }
  };

  const handleGuardarMovimiento = async (e: React.FormEvent) => {
    e.preventDefault();
    const suma = cecosMov.reduce((acc, curr) => acc + curr.porcentaje, 0);
    if (Math.round(suma) !== 100) {
      setError(`Los CeCos suman ${suma}%. Debe ser exactamente 100%.`);
      return;
    }

    try {
      await api.post(`/empleados/${empleadoMovimiento.id}/movimientos`, {
        ...formMov,
        nuevo_salario: parseFloat(formMov.nuevo_salario),
        nuevos_cecos: cecosMov
      });
      setExito("Movimiento registrado y auditado correctamente.");
      setEmpleadoMovimiento(null);
      cargarEmpleados();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Error al registrar movimiento.");
    }
  };

  const handleRetirar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empleadoRetirar) return;
    setError(null);

    try {
      await api.put(`/empleados/${empleadoRetirar.id}/retirar`, datosRetiro);
      setExito(`Empleado ${empleadoRetirar.nombre_completo} dado de baja correctamente.`);
      setEmpleadoRetirar(null);
      cargarEmpleados();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Error al procesar el retiro.");
    }
  };

  const handleReactivar = async (id: number, nombre: string) => {
    setError(null);
    try {
      await api.put(`/empleados/${id}/reactivar`);
      setExito(`Empleado ${nombre} reactivado correctamente.`);
      cargarEmpleados();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Error al reactivar.");
    }
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12 relative">
      
      {/* --- NOTIFICACIONES FLOTANTES TIPO TOAST (Z-INDEX 9999) --- */}
      <div className="fixed top-6 right-6 z-[9999] flex flex-col gap-3 max-w-sm w-full pointer-events-none">
        {error && (
          <div className="bg-white border-l-4 border-red-500 shadow-2xl text-gray-700 p-4 rounded-lg flex items-start gap-3 pointer-events-auto">
            <AlertCircle size={24} className="text-red-500 flex-shrink-0" />
            <div className="flex-1">
              <h4 className="font-bold text-red-600 text-sm">Ocurrió un error</h4>
              <p className="text-sm mt-0.5">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-gray-400 hover:text-gray-600 bg-gray-50 rounded-full p-1"><X size={16} /></button>
          </div>
        )}

        {exito && (
          <div className="bg-white border-l-4 border-emerald-500 shadow-2xl text-gray-700 p-4 rounded-lg flex items-start gap-3 pointer-events-auto">
            <CheckCircle2 size={24} className="text-emerald-500 flex-shrink-0" />
            <div className="flex-1">
              <h4 className="font-bold text-emerald-600 text-sm">Operación Exitosa</h4>
              <p className="text-sm mt-0.5">{exito}</p>
            </div>
            <button onClick={() => setExito(null)} className="text-gray-400 hover:text-gray-600 bg-gray-50 rounded-full p-1"><X size={16} /></button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 border-b pb-4">
        <div className="bg-blue-600 p-2 rounded-lg text-white">
          <Users size={24} />
        </div>
        <h2 className="text-2xl font-bold text-gray-800">Gestión de Recursos Humanos y Auditoría</h2>
      </div>

      {/* FORMULARIO DE INGRESO COMPLETAMENTE EXPANDIDO */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <UserPlus size={20} className="text-blue-600" /> Registrar Nuevo Empleado
        </h3>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">DPI (13 dígitos)</label>
              <input 
                type="text" maxLength={13} required placeholder="Ej. 2500123450101"
                value={form.dpi} onChange={e => setForm({...form, dpi: e.target.value})}
                className="w-full border rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">NIT</label>
              <input 
                type="text" placeholder="Ej. 1234567-8"
                value={form.nit} onChange={e => setForm({...form, nit: e.target.value})}
                className="w-full border rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">No. IGSS (Afiliación)</label>
              <input 
                type="text" placeholder="Ej. 1990-12345"
                value={form.numero_igss} onChange={e => setForm({...form, numero_igss: e.target.value})}
                className="w-full border rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre Completo</label>
              <input 
                type="text" required placeholder="Nombres y Apellidos"
                value={form.nombre_completo} onChange={e => setForm({...form, nombre_completo: e.target.value})}
                className="w-full border rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de Nacimiento</label>
              <input 
                type="date" required
                value={form.fecha_nacimiento} onChange={e => setForm({...form, fecha_nacimiento: e.target.value})}
                className="w-full border rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de Contratación</label>
              <input 
                type="date" required
                value={form.fecha_contratacion} onChange={e => setForm({...form, fecha_contratacion: e.target.value})}
                className="w-full border rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Puesto</label>
              <select 
                required
                value={form.puesto} onChange={e => setForm({...form, puesto: e.target.value})}
                className="w-full border rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              >
                <option value="">-- Seleccionar Puesto --</option>
                {catPuestos.map(p => (
                  <option key={p.id} value={p.nombre}>{p.nombre}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Centro de Trabajo</label>
              <select 
                required
                value={form.centro_trabajo} onChange={e => setForm({...form, centro_trabajo: e.target.value})}
                className="w-full border rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              >
                <option value="">-- Seleccionar Centro --</option>
                {catCentros.map(c => (
                  <option key={c.id} value={c.nombre_ubicacion}>{c.nombre_ubicacion}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Salario Base (Q.)</label>
              <input 
                type="number" step="0.01" required placeholder="0.00"
                value={form.salario_base} onChange={e => setForm({...form, salario_base: e.target.value})}
                className="w-full border rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bonificación de Ley (Q.)</label>
              <input 
                type="number" disabled
                value={form.bonificacion_ley}
                className="w-full border rounded-lg p-2.5 text-sm bg-gray-100 text-gray-600 font-semibold outline-none"
              />
            </div>
          </div>

          <div className="border-t pt-4">
            <div className="flex justify-between items-center mb-3">
              <div>
                <h4 className="font-semibold text-gray-800 text-sm flex items-center gap-1.5">
                  <PieChart size={16} className="text-blue-600" /> Distribución de Centros de Costo (CeCo)
                </h4>
                <p className="text-xs text-gray-500">Puedes asignar uno o varios CeCos. La suma de los porcentajes debe ser exactamente 100%.</p>
              </div>
              <button 
                type="button" onClick={agregarCeCoForm}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors"
              >
                <Plus size={14} /> Agregar CeCo
              </button>
            </div>

            <div className="space-y-3">
              {cecosForm.map((item, index) => (
                <div key={index} className="flex items-center gap-3 bg-slate-50 p-3 rounded-lg border">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-600 mb-1">CeCo (10 dígitos)</label>
                    <select 
                      required
                      value={item.ceco} onChange={e => actualizarCeCoForm(index, 'ceco', e.target.value)}
                      className="w-full border rounded-lg p-2 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">-- Seleccionar CeCo --</option>
                      {catCecos.map(c => (
                        <option key={c.id} value={c.codigo}>{c.codigo} - {c.nombre}</option>
                      ))}
                    </select>
                  </div>
                  <div className="w-36">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Porcentaje (%)</label>
                    <input 
                      type="number" step="0.01" min="1" max="100" required
                      value={item.porcentaje} onChange={e => actualizarCeCoForm(index, 'porcentaje', e.target.value)}
                      className="w-full border rounded-lg p-2 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  {cecosForm.length > 1 && (
                    <button 
                      type="button" onClick={() => eliminarCeCoForm(index)}
                      className="mt-5 text-red-600 hover:text-red-800 p-2 transition-colors"
                      title="Eliminar CeCo"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="text-right mt-2">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-md ${
                cecosForm.reduce((acc, curr) => acc + curr.porcentaje, 0) === 100 
                  ? 'bg-emerald-100 text-emerald-700' 
                  : 'bg-amber-100 text-amber-800'
              }`}>
                Total Asignado: {cecosForm.reduce((acc, curr) => acc + curr.porcentaje, 0)}%
              </span>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-2.5 rounded-lg transition-colors flex items-center gap-2 text-sm shadow-sm">
              <UserPlus size={18} /> Registrar Empleado
            </button>
          </div>
        </form>
      </div>

      {/* TABLA DE EMPLEADOS COMPLETAMENTE EXPANDIDA */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
          <h3 className="font-semibold text-gray-800">Listado General de Empleados y CeCos</h3>
          <span className="text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-medium">Total: {empleados.length}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-600 uppercase tracking-wider text-xs">
                <th className="p-3 border-b">Datos / Identificación</th>
                <th className="p-3 border-b">NIT / No. IGSS</th>
                <th className="p-3 border-b">Distribución Centros de Costo (CeCo)</th>
                <th className="p-3 border-b text-right">Salario Base</th>
                <th className="p-3 border-b text-center">Estado</th>
                <th className="p-3 border-b text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              {empleados.map((emp) => (
                <tr key={emp.id} className="hover:bg-slate-50 border-b">
                  <td className="p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium text-gray-900">{emp.nombre_completo}</p>
                      <button onClick={() => abrirEdicionBasica(emp)} className="text-gray-400 hover:text-blue-600" title="Corregir datos de identificación">
                        <Edit size={14} />
                      </button>
                    </div>
                    <p className="text-xs text-blue-600 font-semibold mb-1">{emp.puesto} | {emp.centro_trabajo}</p>
                    <p className="text-xs text-gray-500">DPI: {emp.dpi}</p>
                  </td>
                  <td className="p-3 text-xs text-gray-600">
                    <p>NIT: {emp.nit || 'N/D'}</p>
                    <p>IGSS: {emp.numero_igss || 'N/D'}</p>
                  </td>
                  <td className="p-3">
                    <div className="space-y-1">
                      {emp.distribucion_cecos?.map((c: any, i: number) => (
                        <div key={i} className="text-xs bg-slate-100 px-2 py-0.5 rounded inline-block mr-1">
                          <span className="font-semibold">{c.ceco}</span>: {c.porcentaje}%
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="p-3 text-right font-medium text-gray-900">Q {emp.salario_base?.toLocaleString('es-GT', {minimumFractionDigits: 2})}</td>
                  
                  <td className="p-3 text-center">
                    {emp.estado ? (
                      <span className="bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full text-xs font-semibold">Activo</span>
                    ) : (
                      <span className="bg-red-100 text-red-700 px-2.5 py-1 rounded-full text-xs font-semibold" title={`Motivo: ${emp.motivo_retiro}`}>Retirado</span>
                    )}
                  </td>

                  <td className="p-3 text-center space-y-2">
                    {emp.estado ? (
                      <>
                        <button 
                          onClick={() => abrirMovimiento(emp)}
                          className="w-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 p-2 rounded-lg text-xs font-medium border border-indigo-200 flex items-center justify-center gap-1 transition-colors"
                        >
                          <Briefcase size={14} /> Acción / Bitácora
                        </button>
                        <button 
                          onClick={() => setEmpleadoRetirar(emp)}
                          className="w-full bg-red-50 hover:bg-red-100 text-red-700 p-2 rounded-lg text-xs font-medium border border-red-200 flex items-center justify-center gap-1 transition-colors"
                        >
                          <UserX size={14} /> Dar de baja
                        </button>
                      </>
                    ) : (
                      <button 
                        onClick={() => handleReactivar(emp.id, emp.nombre_completo)}
                        className="w-full bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-lg text-xs font-medium border border-emerald-200 flex items-center justify-center gap-1 transition-colors"
                      >
                        Reactivar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: EDICIÓN BÁSICA (Errores de dedo) */}
      {empleadoEditar && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-xl shadow-xl max-w-lg w-full mx-4">
            <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Edit size={20} className="text-blue-600"/> Corregir Datos de Identificación
            </h3>
            <form onSubmit={handleGuardarBasico} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Nombre Completo</label>
                  <input type="text" required value={formBasico.nombre_completo} onChange={e => setFormBasico({...formBasico, nombre_completo: e.target.value})} className="w-full border rounded p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">DPI</label>
                  <input type="text" maxLength={13} required value={formBasico.dpi} onChange={e => setFormBasico({...formBasico, dpi: e.target.value})} className="w-full border rounded p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">NIT</label>
                  <input type="text" value={formBasico.nit} onChange={e => setFormBasico({...formBasico, nit: e.target.value})} className="w-full border rounded p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">No. IGSS</label>
                  <input type="text" value={formBasico.numero_igss} onChange={e => setFormBasico({...formBasico, numero_igss: e.target.value})} className="w-full border rounded p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Fecha Nacimiento</label>
                  <input type="date" required value={formBasico.fecha_nacimiento} onChange={e => setFormBasico({...formBasico, fecha_nacimiento: e.target.value})} className="w-full border rounded p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4 border-t mt-4">
                <button type="button" onClick={() => setEmpleadoEditar(null)} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium">Cancelar</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">Guardar Cambios</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: ACCIÓN DE PERSONAL Y BITÁCORA */}
      {empleadoMovimiento && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            
            <div className="p-6 border-b bg-gray-50 flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold text-gray-800">Acción de Personal y Bitácora</h3>
                <p className="text-sm text-gray-600">Empleado: <span className="font-semibold text-blue-700">{empleadoMovimiento.nombre_completo}</span></p>
              </div>
              <button onClick={() => setEmpleadoMovimiento(null)} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>

            <div className="flex border-b px-6 pt-2 bg-white">
              <button onClick={() => setTabMovimiento('nuevo')} className={`pb-3 px-4 text-sm font-medium border-b-2 flex items-center gap-2 transition-colors ${tabMovimiento === 'nuevo' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                <FileText size={16} /> Nuevo Movimiento
              </button>
              <button onClick={() => setTabMovimiento('historial')} className={`pb-3 px-4 text-sm font-medium border-b-2 flex items-center gap-2 transition-colors ${tabMovimiento === 'historial' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                <History size={16} /> Historial de Auditoría
              </button>
            </div>

            <div className="p-6 overflow-y-auto bg-white flex-1">
              {tabMovimiento === 'nuevo' && (
                <form onSubmit={handleGuardarMovimiento} className="space-y-5">
                  <div className="bg-blue-50 border border-blue-100 p-4 rounded-lg">
                    <label className="block text-sm font-bold text-blue-900 mb-1">Tipo de Acción / Movimiento</label>
                    <select value={formMov.tipo_movimiento} onChange={e => setFormMov({...formMov, tipo_movimiento: e.target.value})} className="w-full border-blue-200 rounded p-2 text-sm outline-none bg-white focus:ring-2 focus:ring-blue-500">
                      <option value="Ajuste Salarial">Ajuste Salarial</option>
                      <option value="Promoción de Puesto">Promoción de Puesto</option>
                      <option value="Traslado de Área/Centro">Traslado de Área / Centro de Trabajo</option>
                      <option value="Cambio en Distribución de Costos (CeCo)">Cambio en Distribución de Costos (CeCo)</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Nuevo Puesto</label>
                      <select required value={formMov.nuevo_puesto} onChange={e => setFormMov({...formMov, nuevo_puesto: e.target.value})} className="w-full border rounded p-2 text-sm outline-none bg-white focus:ring-2 focus:ring-indigo-500">
                        <option value="">-- Seleccionar --</option>
                        {catPuestos.map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Nuevo Centro de Trabajo</label>
                      <select required value={formMov.nuevo_centro} onChange={e => setFormMov({...formMov, nuevo_centro: e.target.value})} className="w-full border rounded p-2 text-sm outline-none bg-white focus:ring-2 focus:ring-indigo-500">
                        <option value="">-- Seleccionar --</option>
                        {catCentros.map(c => <option key={c.id} value={c.nombre_ubicacion}>{c.nombre_ubicacion}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Nuevo Salario Base (Q.)</label>
                      <input type="number" step="0.01" required value={formMov.nuevo_salario} onChange={e => setFormMov({...formMov, nuevo_salario: e.target.value})} className="w-full border rounded p-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Motivo / Justificación (Obligatorio)</label>
                      <input type="text" required placeholder="Ej. Aprobado por Gerencia General (Memo 123)" value={formMov.motivo} onChange={e => setFormMov({...formMov, motivo: e.target.value})} className="w-full border rounded p-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="text-sm font-semibold text-gray-800">Nueva Distribución CeCo</h4>
                      <button type="button" onClick={() => setCecosMov([...cecosMov, {ceco: '', porcentaje: 0}])} className="text-xs text-blue-600 hover:underline font-medium flex items-center gap-1">
                        <Plus size={14} /> Agregar CeCo
                      </button>
                    </div>
                    <div className="space-y-2">
                      {cecosMov.map((item, index) => (
                        <div key={index} className="flex gap-2">
                          <select required value={item.ceco} onChange={e => { const n = [...cecosMov]; n[index].ceco = e.target.value; setCecosMov(n); }} className="flex-1 border rounded p-1.5 text-xs bg-white outline-none focus:ring-2 focus:ring-indigo-500">
                            <option value="">-- Seleccionar CeCo --</option>
                            {catCecos.map(c => <option key={c.id} value={c.codigo}>{c.codigo} - {c.nombre}</option>)}
                          </select>
                          <input type="number" step="0.01" required value={item.porcentaje} onChange={e => { const n = [...cecosMov]; n[index].porcentaje = parseFloat(e.target.value)||0; setCecosMov(n); }} className="w-20 border rounded p-1.5 text-xs bg-white outline-none text-center focus:ring-2 focus:ring-indigo-500" />
                          <span className="p-1.5 text-xs text-gray-500 font-bold">%</span>
                          {cecosMov.length > 1 && (
                            <button type="button" onClick={() => setCecosMov(cecosMov.filter((_, i) => i !== index))} className="text-red-500 hover:text-red-700 p-1">
                              <Trash2 size={16}/>
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-4 border-t mt-4">
                    <button type="button" onClick={() => setEmpleadoMovimiento(null)} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors">Cancelar</button>
                    <button type="submit" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium shadow-sm transition-colors">Registrar y Auditar</button>
                  </div>
                </form>
              )}

              {tabMovimiento === 'historial' && (
                <div className="space-y-4">
                  {historial.length === 0 ? (
                    <div className="text-center py-10 text-gray-500 italic">No hay movimientos registrados en la bitácora para este empleado.</div>
                  ) : (
                    historial.map((h, i) => (
                      <div key={i} className="border rounded-lg p-4 bg-slate-50 shadow-sm text-sm">
                        <div className="flex justify-between items-start mb-3 border-b pb-2">
                          <div>
                            <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">{h.tipo}</span>
                            <p className="text-xs text-gray-500 mt-1">Autorizado por: <strong>{h.usuario}</strong> el {h.fecha}</p>
                          </div>
                          <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded font-mono">ID Mov: {h.id}</span>
                        </div>
                        <p className="text-xs text-gray-700 mb-3 font-medium">Motivo: <span className="font-normal italic">{h.motivo}</span></p>
                        
                        <div className="grid grid-cols-2 gap-4 text-xs bg-white p-3 rounded border">
                          <div>
                            <h5 className="font-bold text-red-600 mb-2 border-b pb-1">Valor Anterior</h5>
                            <p className="mb-1"><span className="text-gray-500 font-medium">Puesto:</span> {h.anterior.puesto}</p>
                            <p className="mb-1"><span className="text-gray-500 font-medium">Centro:</span> {h.anterior.centro_trabajo}</p>
                            <p className="mb-1"><span className="text-gray-500 font-medium">Salario:</span> Q {h.anterior.salario_base?.toLocaleString('es-GT', {minimumFractionDigits: 2})}</p>
                            <p><span className="text-gray-500 font-medium">CeCos:</span> {h.anterior.cecos?.map((c:any) => `${c.ceco} (${c.porcentaje}%)`).join(', ')}</p>
                          </div>
                          <div>
                            <h5 className="font-bold text-emerald-600 mb-2 border-b pb-1">Nuevo Valor</h5>
                            <p className="mb-1"><span className="text-gray-500 font-medium">Puesto:</span> {h.nuevo.puesto}</p>
                            <p className="mb-1"><span className="text-gray-500 font-medium">Centro:</span> {h.nuevo.centro_trabajo}</p>
                            <p className="mb-1"><span className="text-gray-500 font-medium">Salario:</span> Q {h.nuevo.salario_base?.toLocaleString('es-GT', {minimumFractionDigits: 2})}</p>
                            <p><span className="text-gray-500 font-medium">CeCos:</span> {h.nuevo.cecos?.map((c:any) => `${c.ceco} (${c.porcentaje}%)`).join(', ')}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE RETIRO COMPLETAMENTE EXPANDIDO */}
      {empleadoRetirar && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-xl shadow-xl max-w-md w-full mx-4">
            <h3 className="text-lg font-bold text-gray-800 mb-2">Dar de baja a empleado</h3>
            <p className="text-sm text-gray-600 mb-4">Empleado: <span className="font-semibold">{empleadoRetirar.nombre_completo}</span></p>

            <form onSubmit={handleRetirar} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de Retiro</label>
                <input 
                  type="date" required
                  value={datosRetiro.fecha_retiro} onChange={e => setDatosRetiro({...datosRetiro, fecha_retiro: e.target.value})}
                  className="w-full border rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Motivo de Retiro</label>
                <select 
                  value={datosRetiro.motivo_retiro} onChange={e => setDatosRetiro({...datosRetiro, motivo_retiro: e.target.value})}
                  className="w-full border rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-red-500 bg-white"
                >
                  <option value="Renuncia">Renuncia</option>
                  <option value="Despido">Despido</option>
                  <option value="Abandono">Abandono</option>
                  <option value="Reestructuración">Reestructuración</option>
                  <option value="Asuntos Personales">Asuntos Personales</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button 
                  type="button" onClick={() => setEmpleadoRetirar(null)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium shadow-sm transition-colors"
                >
                  Confirmar Retiro
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}