import { useEffect } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';

interface Props {
  error: string | null;
  exito: string | null;
  setError: (msg: string | null) => void;
  setExito: (msg: string | null) => void;
}

export default function NotificacionFlotante({ error, exito, setError, setExito }: Props) {
  
  // AUTO-OCULTAR NOTIFICACIONES
  useEffect(() => {
    if (exito) {
      const timer = setTimeout(() => setExito(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [exito, setExito]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 8000);
      return () => clearTimeout(timer);
    }
  }, [error, setError]);

  // Si no hay mensajes, no renderizamos nada en pantalla
  if (!error && !exito) return null;

  return (
    <div className="fixed top-6 right-6 z-[9999] flex flex-col gap-3 max-w-sm w-full pointer-events-none">
      {error && (
        <div className="bg-white border-l-4 border-red-500 shadow-2xl text-gray-700 p-4 rounded-lg flex items-start gap-3 pointer-events-auto">
          <AlertCircle size={24} className="text-red-500 flex-shrink-0" />
          <div className="flex-1">
            <h4 className="font-bold text-red-600 text-sm">Ocurrió un error</h4>
            <p className="text-sm mt-0.5">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="text-gray-400 hover:text-gray-600 bg-gray-50 rounded-full p-1 transition-colors">
            <X size={16} />
          </button>
        </div>
      )}

      {exito && (
        <div className="bg-white border-l-4 border-emerald-500 shadow-2xl text-gray-700 p-4 rounded-lg flex items-start gap-3 pointer-events-auto">
          <CheckCircle2 size={24} className="text-emerald-500 flex-shrink-0" />
          <div className="flex-1">
            <h4 className="font-bold text-emerald-600 text-sm">Operación Exitosa</h4>
            <p className="text-sm mt-0.5">{exito}</p>
          </div>
          <button onClick={() => setExito(null)} className="text-gray-400 hover:text-gray-600 bg-gray-50 rounded-full p-1 transition-colors">
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}