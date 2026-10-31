import { useState, useEffect } from 'react';
import { FileSpreadsheet, FileText, Activity } from 'lucide-react';
import api, { descargarArchivo } from '../../services/api';

// 1. IMPORTAMOS NUESTRO COMPONENTE GLOBAL DE NOTIFICACIONES
import NotificacionFlotante from '../../components/NotificacionFlotante'; // Ajusta la ruta según tu estructura

export default function Reporteria() {
  const [historialNominas, setHistorialNominas] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);

  // 2. ESTADOS PARA LAS NOTIFICACIONES FLOTANTES
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  useEffect(() => {
    const fetchNominas = async () => {
      try {
        setError(null);
        const response = await api.get('/reporteria/nominas');
        setHistorialNominas(response.data);
      } catch (err: any) {
        console.error("Error al cargar historial de nóminas", err);
        setError("Error al cargar el historial de nóminas desde el servidor.");
      } finally {
        setCargando(false);
      }
    };
    fetchNominas();
  }, []);

  const descargarExcel = async (nominaId: number) => {
    try {
      await descargarArchivo(`/reporteria/nominas/${nominaId}/excel`, `SABANA_NOMINA_${nominaId}.xlsx`);
      setExito("Archivo Excel descargado.");
    } catch (err) {
      setError("No se pudo descargar el Excel.");
    }
  };

  const descargarPdf = async (nominaId: number) => {
    try {
      await descargarArchivo(`/reporteria/nominas/${nominaId}/pdf`, `BOLETAS_NOMINA_${nominaId}.pdf`);
      setExito("Boletas PDF descargadas.");
    } catch (err) {
      setError("No se pudo descargar el PDF.");
    }
  };

  return (
    // 3. AGREGAMOS 'relative' PARA CONTENER LAS NOTIFICACIONES FLOTANTES
    <div className="space-y-6 max-w-6xl mx-auto relative pb-12">
      
      {/* 4. INYECTAMOS EL COMPONENTE FLOTANTE AQUÍ */}
      <NotificacionFlotante error={error} exito={exito} setError={setError} setExito={setExito} />

      <h2 className="text-2xl font-bold text-gray-800 mb-6">Reportes y Descargas</h2>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 text-slate-600 text-sm uppercase tracking-wider">
              <th className="p-4 border-b font-medium">ID Ejecución</th>
              <th className="p-4 border-b font-medium">Periodo</th>
              <th className="p-4 border-b font-medium">Tipo</th>
              <th className="p-4 border-b font-medium">Total Líquido Planilla</th>
              <th className="p-4 border-b font-medium text-center">Exportar Sábana</th>
            </tr>
          </thead>
          <tbody className="text-gray-700 text-sm">
            {cargando ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-gray-500">
                  <Activity className="animate-spin inline-block mr-2" /> Cargando historial...
                </td>
              </tr>
            ) : historialNominas.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-gray-500">
                  Aún no se ha ejecutado ninguna nómina.
                </td>
              </tr>
            ) : (
              historialNominas.map((nomina) => (
                <tr key={nomina.id} className="hover:bg-slate-50 border-b transition-colors">
                  <td className="p-4 font-mono text-slate-500">#{nomina.id}</td>
                  <td className="p-4 font-medium">Mes {nomina.periodo_mes} / {nomina.periodo_anio}</td>
                  <td className="p-4">
                    <span className={`px-3 py-1 rounded-full text-xs ${nomina.tipo === 'Fin de Mes' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                      {nomina.tipo}
                    </span>
                  </td>
                  <td className="p-4 font-bold text-gray-800">Q. {nomina.total_liquido.toLocaleString('es-GT', { minimumFractionDigits: 2 })}</td>
                  
                  {/* CORRECCIÓN DE LA ESTRUCTURA HTML DE LA TABLA */}
                  <td className="p-4 flex gap-2 justify-center">
                    <button 
                      onClick={() => descargarExcel(nomina.id)}
                      className="flex items-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg transition-colors font-medium border border-emerald-200"
                    >
                      <FileSpreadsheet size={18} /> Excel
                    </button>

                    <button 
                      onClick={() => descargarPdf(nomina.id)}
                      className="flex items-center gap-2 px-3 py-2 bg-red-50 text-red-700 hover:bg-red-100 rounded-lg transition-colors font-medium border border-red-200"
                    >
                      <FileText size={18} /> Boletas PDF
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}