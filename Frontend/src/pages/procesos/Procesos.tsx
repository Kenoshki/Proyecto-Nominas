import { useState, useEffect } from 'react';
import { CalendarClock, AlertTriangle } from 'lucide-react';
import api from '../../services/api';

// 1. IMPORTAMOS NUESTRO COMPONENTE GLOBAL DE NOTIFICACIONES
import NotificacionFlotante from '../../components/NotificacionFlotante'; // Ajusta la ruta si es necesario

export default function Procesos() {
  const [empleados, setEmpleados] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    empleado_id: '',
    concepto: 'Suspensión IGSS',
    fecha_incidencia: '',
    dias_descontar: ''
  });

  // 2. SIMPLIFICAMOS LOS ESTADOS A 'error' y 'exito' PARA EL COMPONENTE FLOTANTE
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  // Cargar lista de empleados al abrir la pantalla
  useEffect(() => {
    const fetchEmpleados = async () => {
      try {
        const response = await api.get('/rrhh/empleados');
        setEmpleados(response.data);
      } catch (err) {
        console.error("Error al cargar empleados", err);
      }
    };
    fetchEmpleados();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setExito(null);

    if (!formData.empleado_id) {
      setError('Por favor seleccione un empleado');
      return;
    }

    try {
      const payload = {
        empleado_id: parseInt(formData.empleado_id),
        concepto: formData.concepto,
        fecha_incidencia: formData.fecha_incidencia,
        dias_descontar: parseInt(formData.dias_descontar) || 0
      };
      
      await api.post('/procesos/incidencias', payload);
      
      // 3. USAMOS setExito EN LUGAR DE setMensaje
      setExito('Incidencia registrada exitosamente.');
      setFormData({ empleado_id: '', concepto: 'Suspensión IGSS', fecha_incidencia: '', dias_descontar: '' });
    } catch (err: any) {
      // 4. USAMOS setError EN LUGAR DE setMensaje
      setError(err.response?.data?.detail || 'Error al registrar la incidencia.');
    }
  };

  return (
    // Agregamos 'relative' para que contenga correctamente las capas si fuera necesario
    <div className="max-w-4xl mx-auto bg-white p-8 rounded-xl shadow-sm border border-gray-100 relative">
      
      {/* 5. INYECTAMOS EL COMPONENTE FLOTANTE AQUÍ (Se borró el antiguo bloque {mensaje && ...}) */}
      <NotificacionFlotante error={error} exito={exito} setError={setError} setExito={setExito} />

      <div className="flex items-center gap-3 mb-6 border-b pb-4">
        <div className="bg-orange-100 p-2 rounded-lg text-orange-600">
          <CalendarClock size={24} />
        </div>
        <h2 className="text-2xl font-bold text-gray-800">Registro de Incidencias</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Empleado</label>
            <select required className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              value={formData.empleado_id} onChange={(e) => setFormData({...formData, empleado_id: e.target.value})}>
              <option value="">Seleccione un empleado...</option>
              {empleados.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.nombre_completo} (DPI: {emp.dpi})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Incidencia</label>
            <select required className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              value={formData.concepto} onChange={(e) => setFormData({...formData, concepto: e.target.value})}>
              <option value="Suspensión IGSS">Suspensión IGSS</option>
              <option value="Falta Injustificada">Falta Injustificada</option>
              <option value="Permiso sin Goce de Sueldo">Permiso sin Goce de Sueldo</option>
              <option value="Llamada de Atención">Llamada de Atención (Sin descuento)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de la Incidencia</label>
            <input required type="date" className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none" 
              value={formData.fecha_incidencia} onChange={(e) => setFormData({...formData, fecha_incidencia: e.target.value})}/>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Días a descontar en Planilla</label>
            <input required type="number" min="0" className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Ej. 1" 
              value={formData.dias_descontar} onChange={(e) => setFormData({...formData, dias_descontar: e.target.value})}/>
          </div>
        </div>
        <div className="flex justify-end pt-4">
          <button type="submit" className="bg-orange-600 hover:bg-orange-700 text-white font-medium py-2 px-6 rounded-md flex items-center gap-2 transition-colors">
            <AlertTriangle size={18} /> Registrar Incidencia
          </button>
        </div>
      </form>
    </div>
  );
}