import { useState, useEffect } from 'react';
import { Users, Banknote, AlertCircle, TrendingUp, Activity } from 'lucide-react';
import api from '../services/api';

export default function Dashboard() {
  const [stats, setStats] = useState({
    empleados_activos: 0,
    ultima_nomina_total: 0,
    incidencias_mes: 0,
    carga_prestacional: '0%'
  });
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await api.get('/dashboard/stats');
        setStats(res.data);
      } catch (error) {
        console.error("Error al cargar estadísticas", error);
      } finally {
        setCargando(false);
      }
    };
    fetchStats();
  }, []);

  if (cargando) return <div className="p-8 text-gray-500"><Activity className="animate-spin inline mr-2" /> Cargando panel...</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">Panel de Control</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="bg-blue-100 p-4 rounded-full text-blue-600"><Users size={24} /></div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Empleados Activos</p>
            <p className="text-2xl font-bold text-gray-800">{stats.empleados_activos}</p>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="bg-emerald-100 p-4 rounded-full text-emerald-600"><Banknote size={24} /></div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Última Nómina</p>
            <p className="text-2xl font-bold text-gray-800">Q {stats.ultima_nomina_total.toLocaleString('es-GT', { minimumFractionDigits: 2 })}</p>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="bg-orange-100 p-4 rounded-full text-orange-600"><AlertCircle size={24} /></div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Incidencias (Mes)</p>
            <p className="text-2xl font-bold text-gray-800">{stats.incidencias_mes}</p>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="bg-purple-100 p-4 rounded-full text-purple-600"><TrendingUp size={24} /></div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Carga Prestacional</p>
            <p className="text-2xl font-bold text-gray-800">{stats.carga_prestacional}</p>
          </div>
        </div>
      </div>
    </div>
  );
}