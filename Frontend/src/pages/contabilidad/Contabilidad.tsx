import { useState, useEffect } from 'react';
import { BookOpen, Search } from 'lucide-react';
import api from '../../services/api';

// 1. IMPORTAMOS NUESTRO COMPONENTE GLOBAL DE NOTIFICACIONES
import NotificacionFlotante from '../../components/NotificacionFlotante'; // Ajusta la ruta según tu estructura

export default function Contabilidad() {
  const [asientos, setAsientos] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  
  // Filtros de consulta por periodo
  const [filtroMes, setFiltroMes] = useState(new Date().getMonth() + 1);
  const [filtroAnio, setFiltroAnio] = useState(new Date().getFullYear());

  // Estados para las notificaciones flotantes
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  useEffect(() => {
    cargarAsientosContables();
  }, [filtroMes, filtroAnio]);

  const cargarAsientosContables = async () => {
    try {
      setCargando(true);
      setError(null);
      const res = await api.get(`/contabilidad/asientos?mes=${filtroMes}&anio=${filtroAnio}`);
      setAsientos(res.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Error al cargar los asientos contables del periodo.");
    } finally {
      setCargando(false);
    }
  };

  return (
    // Contenedor principal con 'relative' para el posicionamiento correcto de las notificaciones
    <div className="space-y-6 max-w-7xl mx-auto pb-12 relative">
      
      {/* 2. INYECTAMOS EL COMPONENTE DE NOTIFICACIONES FLOTANTES */}
      <NotificacionFlotante error={error} exito={exito} setError={setError} setExito={setExito} />

      {/* CABECERA DEL MÓDULO */}
      <div className="flex items-center gap-3 border-b pb-4">
        <div className="bg-indigo-600 p-2 rounded-lg text-white">
          <BookOpen size={24} />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Módulo Contable y Partida Doble</h2>
          <p className="text-sm text-gray-500">Visualización de pólizas de diario, gastos y pasivos generados por las ejecuciones de nómina.</p>
        </div>
      </div>

      {/* BARRA DE FILTROS POR PERIODO */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Filtrar por Mes</label>
            <select 
              value={filtroMes} 
              onChange={e => setFiltroMes(parseInt(e.target.value))}
              className="border rounded-lg p-2 text-sm outline-none bg-white focus:ring-2 focus:ring-indigo-500"
            >
              {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                <option key={m} value={m}>Mes {m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Año</label>
            <input 
              type="number" 
              value={filtroAnio} 
              onChange={e => setFiltroAnio(parseInt(e.target.value))}
              className="border rounded-lg p-2 text-sm outline-none w-28 focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
        <button 
          onClick={cargarAsientosContables}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shadow-sm transition-colors"
        >
          <Search size={16} /> Consultar Pólizas
        </button>
      </div>

      {/* LISTADO DE ASIENTOS CONTABLES / PÓLIZAS */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
          <h3 className="font-semibold text-gray-800 text-sm">Libro Diario - Pólizas de Nómina</h3>
          <span className="text-xs bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full font-medium">
            Registros encontrados: {asientos.length}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-600 text-xs uppercase border-b">
                <th className="p-3.5">No. Póliza / ID</th>
                <th className="p-3.5">Fecha</th>
                <th className="p-3.5">Cuenta Mayor</th>
                <th className="p-3.5">Descripción del Rubro</th>
                <th className="p-3.5 text-right">Debe (Q.)</th>
                <th className="p-3.5 text-right">Haber (Q.)</th>
              </tr>
            </thead>
            <tbody className="divide-y text-gray-700">
              {cargando ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500 italic">
                    Cargando movimientos contables...
                  </td>
                </tr>
              ) : asientos.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500 italic">
                    No hay asientos contables registrados para el periodo seleccionado.
                  </td>
                </tr>
              ) : (
                asientos.map((asiento, index) => (
                  <tr key={index} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3.5 font-mono text-indigo-600 font-semibold">#{asiento.poliza_id || asiento.id}</td>
                    <td className="p-3.5 text-xs text-gray-600">{asiento.fecha || 'N/D'}</td>
                    <td className="p-3.5 font-mono text-xs">{asiento.cuenta_mayor}</td>
                    <td className="p-3.5 font-medium text-gray-900">{asiento.descripcion}</td>
                    <td className="p-3.5 text-right font-mono font-semibold text-emerald-700">
                      {asiento.debe > 0 ? `Q. ${asiento.debe.toLocaleString('es-GT', { minimumFractionDigits: 2 })}` : '-'}
                    </td>
                    <td className="p-3.5 text-right font-mono font-semibold text-blue-700">
                      {asiento.haber > 0 ? `Q. ${asiento.haber.toLocaleString('es-GT', { minimumFractionDigits: 2 })}` : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}