import { useState, useEffect } from 'react';
import { PlusCircle, MinusCircle, Play } from 'lucide-react';
import api from '../../services/api';
import NotificacionFlotante from '../../components/NotificacionFlotante'; // 1. IMPORTAMOS NUESTRO NUEVO COMPONENTE GLOBAL

export default function Nominas() {
  const [empleados, setEmpleados] = useState<any[]>([]);
  
  const [rubrosIngresos, setRubrosIngresos] = useState<any[]>([]);
  const [rubrosDescuentos, setRubrosDescuentos] = useState<any[]>([]);
  
  // 2. SIMPLIFICAMOS LOS ESTADOS DE MENSAJE (El componente flotante usa 'error' y 'exito')
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  const [formIngreso, setFormIngreso] = useState({ empleado_id: '', rubro_id: '', monto: '' });
  const [formDescuento, setFormDescuento] = useState({ empleado_id: '', tipo: 'Eventual', rubro_id: '', monto: '' });
  const [periodo, setPeriodo] = useState({ mes: new Date().getMonth() + 1, anio: new Date().getFullYear(), tipo_nomina: 'Fin de Mes' });

  useEffect(() => {
    api.get('/rrhh/empleados').then(res => setEmpleados(res.data)).catch(console.error);
    api.get('/contabilidad/rubros/ingresos').then(res => setRubrosIngresos(res.data)).catch(console.error);
    api.get('/contabilidad/rubros/descuentos').then(res => setRubrosDescuentos(res.data)).catch(console.error);
  }, []);

  const handleIngreso = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setExito(null);
    try {
      await api.post('/nominas/ingresos', { 
        ...formIngreso, 
        monto: parseFloat(formIngreso.monto),
        rubro_id: parseInt(formIngreso.rubro_id)
      });
      // 3. EN LUGAR DE setMensaje, USAMOS setExito (El timeout ya lo maneja el componente flotante)
      setExito('Ingreso variable registrado vinculado a gasto.');
      setFormIngreso({ empleado_id: '', rubro_id: '', monto: '' });
    } catch (err) {
      setError('Error al registrar ingreso');
    }
  };

  const handleDescuento = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setExito(null);
    try {
      await api.post('/nominas/descuentos', { 
        ...formDescuento, 
        monto: parseFloat(formDescuento.monto),
        rubro_id: parseInt(formDescuento.rubro_id)
      });
      setExito('Descuento registrado vinculado a pasivo.');
      setFormDescuento({ empleado_id: '', tipo: 'Eventual', rubro_id: '', monto: '' });
    } catch (err) {
      setError('Error al registrar descuento');
    }
  };

  const ejecutarNomina = async () => {
    if (!confirm(`¿Está seguro de procesar la planilla de ${periodo.tipo_nomina} para el periodo ${periodo.mes}/${periodo.anio}?`)) return;
    setError(null);
    setExito(null);
    try {
      const response = await api.post('/nominas/ejecutar', periodo);
      setExito(response.data.mensaje);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Error en el cálculo maestro');
    }
  };

  return (
    // Agregamos 'relative' para que no interfiera con otros elementos si es necesario
    <div className="space-y-6 max-w-6xl mx-auto relative">
      
      <NotificacionFlotante error={error} exito={exito} setError={setError} setExito={setExito} />

      {/* CABECERA Y EJECUCIÓN */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-wrap justify-between items-end gap-4">
        <div className="flex gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Mes</label>
            <select className="p-2 border rounded-md" value={periodo.mes} onChange={e => setPeriodo({...periodo, mes: parseInt(e.target.value)})}>
              {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => <option key={m} value={m}>Mes {m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Año</label>
            <input type="number" className="p-2 border rounded-md w-24" value={periodo.anio} onChange={e => setPeriodo({...periodo, anio: parseInt(e.target.value)})} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Tipo de Planilla</label>
            <select className="p-2 border rounded-md" value={periodo.tipo_nomina} onChange={e => setPeriodo({...periodo, tipo_nomina: e.target.value})}>
              <option value="Fin de Mes">Fin de Mes</option>
              <option value="Anticipo 15 días">Anticipo 15 días</option>
            </select>
          </div>
        </div>
        <button onClick={ejecutarNomina} className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-3 px-6 rounded-md flex items-center gap-2 shadow-lg hover:shadow-xl transition-all">
          <Play size={20} /> EJECUTAR CÁLCULO MAESTRO
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* PANEL INGRESOS VARIABLES */}
        <form onSubmit={handleIngreso} className="bg-white p-6 rounded-xl shadow-sm border border-emerald-100">
          <div className="flex items-center gap-2 mb-4 text-emerald-600">
            <PlusCircle size={20} />
            <h3 className="text-lg font-bold">Asignar Ingreso Extra</h3>
          </div>
          <div className="space-y-4">
            <select required className="w-full p-2 border rounded-md" value={formIngreso.empleado_id} onChange={e => setFormIngreso({...formIngreso, empleado_id: e.target.value})}>
              <option value="">Seleccione empleado...</option>
              {empleados.map(emp => <option key={emp.id} value={emp.id}>{emp.nombre_completo}</option>)}
            </select>
            
            <select required className="w-full p-2 border rounded-md" value={formIngreso.rubro_id} onChange={e => setFormIngreso({...formIngreso, rubro_id: e.target.value})}>
              <option value="">Seleccione concepto (Gasto)...</option>
              {rubrosIngresos.map(r => <option key={r.id} value={r.id}>{r.desc_ing_des}</option>)}
            </select>

            <input required type="number" step="0.01" placeholder="Monto (Q)" className="w-full p-2 border rounded-md" value={formIngreso.monto} onChange={e => setFormIngreso({...formIngreso, monto: e.target.value})} />
            <button type="submit" className="w-full bg-emerald-50 text-emerald-700 hover:bg-emerald-100 py-2 border border-emerald-200 rounded-md font-medium transition-colors">
              Guardar Ingreso
            </button>
          </div>
        </form>

        {/* PANEL DESCUENTOS */}
        <form onSubmit={handleDescuento} className="bg-white p-6 rounded-xl shadow-sm border border-red-100">
          <div className="flex items-center gap-2 mb-4 text-red-500">
            <MinusCircle size={20} />
            <h3 className="text-lg font-bold">Aplicar Descuento</h3>
          </div>
          <div className="space-y-4">
            <select required className="w-full p-2 border rounded-md" value={formDescuento.empleado_id} onChange={e => setFormDescuento({...formDescuento, empleado_id: e.target.value})}>
              <option value="">Seleccione empleado...</option>
              {empleados.map(emp => <option key={emp.id} value={emp.id}>{emp.nombre_completo}</option>)}
            </select>
            <div className="flex gap-2">
              <select className="w-1/3 p-2 border rounded-md" value={formDescuento.tipo} onChange={e => setFormDescuento({...formDescuento, tipo: e.target.value})}>
                <option value="Eventual">1 Sola Vez</option>
                <option value="Cíclico">Todos los meses</option>
              </select>
              
              <select required className="w-2/3 p-2 border rounded-md" value={formDescuento.rubro_id} onChange={e => setFormDescuento({...formDescuento, rubro_id: e.target.value})}>
                <option value="">Seleccione concepto (Pasivo)...</option>
                {rubrosDescuentos.map(r => <option key={r.id} value={r.id}>{r.desc_ing_des} </option>)}
              </select>
            </div>
            <input required type="number" step="0.01" placeholder="Monto (Q)" className="w-full p-2 border rounded-md" value={formDescuento.monto} onChange={e => setFormDescuento({...formDescuento, monto: e.target.value})} />
            <button type="submit" className="w-full bg-red-50 text-red-700 hover:bg-red-100 py-2 border border-red-200 rounded-md font-medium transition-colors">
              Guardar Descuento
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}