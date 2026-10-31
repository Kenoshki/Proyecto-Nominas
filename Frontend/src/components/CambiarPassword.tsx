import { useState } from 'react';
import { X } from 'lucide-react';
import api from '../services/api';

interface Props {
  onClose: () => void;
}

export default function CambiarPassword({ onClose }: Props) {
  const [form, setForm] = useState({ password_actual: '', password_nueva: '', confirmar: '' });
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.password_nueva !== form.confirmar) {
      setError('Las contraseñas nuevas no coinciden.');
      return;
    }
    try {
      const res = await api.post('/auth/cambiar-password', {
        password_actual: form.password_actual,
        password_nueva: form.password_nueva,
      });
      // El backend invalida el token anterior y entrega uno nuevo.
      localStorage.setItem('token', res.data.token);
      setExito(res.data.mensaje);
      setForm({ password_actual: '', password_nueva: '', confirmar: '' });
    } catch (err: any) {
      const detalle = err.response?.data?.detail;
      setError(typeof detalle === 'string' ? detalle : 'No se pudo cambiar la contraseña.');
    }
  };

  const campo = "w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-gray-800">Cambiar contraseña</h3>
          <button onClick={onClose} aria-label="Cerrar" className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        {error && <div role="alert" className="bg-red-50 text-red-600 p-2 rounded text-sm mb-3 border border-red-200">{error}</div>}
        {exito && <div role="status" className="bg-green-50 text-green-700 p-2 rounded text-sm mb-3 border border-green-200">{exito}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña actual</label>
            <input required type="password" autoComplete="current-password" maxLength={128} className={campo}
              value={form.password_actual} onChange={e => setForm({ ...form, password_actual: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nueva contraseña</label>
            <input required type="password" autoComplete="new-password" minLength={8} maxLength={128} className={campo}
              value={form.password_nueva} onChange={e => setForm({ ...form, password_nueva: e.target.value })} />
            <p className="text-xs text-gray-500 mt-1">Mínimo 8 caracteres, con al menos una letra y un número.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar nueva contraseña</label>
            <input required type="password" autoComplete="new-password" maxLength={128} className={campo}
              value={form.confirmar} onChange={e => setForm({ ...form, confirmar: e.target.value })} />
          </div>
          <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg">
            Guardar
          </button>
        </form>
      </div>
    </div>
  );
}
