import { useState } from 'react';
import { Lock, User, KeyRound } from 'lucide-react';
import api from '../services/api';

interface LoginProps {
  onLoginSuccess: (user: any) => void;
}

const inputClase = "w-full pl-10 p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none";

export default function Login({ onLoginSuccess }: LoginProps) {
  const [modo, setModo] = useState<'login' | 'restablecer'>('login');
  const [credenciales, setCredenciales] = useState({ username: '', password: '' });
  const [reset, setReset] = useState({ username: '', codigo: '', password_nueva: '', confirmar: '' });
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');
  const [enviando, setEnviando] = useState(false);

  const cambiarModo = (nuevo: 'login' | 'restablecer') => {
    setError('');
    setExito('');
    setModo(nuevo);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setExito('');
    setEnviando(true);
    try {
      const response = await api.post('/auth/login', credenciales);
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.usuario));
      onLoginSuccess(response.data.usuario);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Error de conexión');
    } finally {
      setEnviando(false);
    }
  };

  const handleRestablecer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setExito('');
    if (reset.password_nueva !== reset.confirmar) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setEnviando(true);
    try {
      const res = await api.post('/auth/restablecer-password', {
        username: reset.username,
        codigo: reset.codigo,
        password_nueva: reset.password_nueva,
      });
      setCredenciales({ username: reset.username, password: '' });
      setReset({ username: '', codigo: '', password_nueva: '', confirmar: '' });
      setModo('login');
      setExito(res.data.mensaje);
    } catch (err: any) {
      const detalle = err.response?.data?.detail;
      setError(typeof detalle === 'string' ? detalle : 'Error de conexión');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="bg-slate-900 p-8 text-center">
          <h1 className="text-3xl font-bold text-white flex justify-center items-center gap-2">
            <span className="text-blue-500">Nómina</span>Hub
          </h1>
          <p className="text-slate-400 mt-2">
            {modo === 'login' ? 'Acceso al Sistema Corporativo' : 'Restablecer contraseña'}
          </p>
        </div>

        <div className="p-8">
          {error && <div role="alert" className="bg-red-50 text-red-600 p-3 rounded-md text-sm mb-4 border border-red-200 text-center">{error}</div>}
          {exito && <div role="status" className="bg-green-50 text-green-700 p-3 rounded-md text-sm mb-4 border border-green-200 text-center">{exito}</div>}

          {modo === 'login' ? (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Usuario</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400"><User size={18} /></div>
                  <input required type="text" autoComplete="username" maxLength={50} className={inputClase}
                    value={credenciales.username} onChange={(e) => setCredenciales({ ...credenciales, username: e.target.value })} />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400"><Lock size={18} /></div>
                  <input required type="password" autoComplete="current-password" maxLength={128} className={inputClase}
                    value={credenciales.password} onChange={(e) => setCredenciales({ ...credenciales, password: e.target.value })} />
                </div>
              </div>

              <button type="submit" disabled={enviando} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg transition-colors">
                {enviando ? 'Ingresando...' : 'Iniciar Sesión'}
              </button>

              <button type="button" onClick={() => cambiarModo('restablecer')} className="w-full text-sm text-blue-600 hover:underline">
                ¿Olvidaste tu contraseña?
              </button>
            </form>
          ) : (
            <form onSubmit={handleRestablecer} className="space-y-5">
              <p className="text-sm text-gray-600">
                Solicita a un administrador un <strong>código de restablecimiento</strong> (válido 30 minutos, un solo uso)
                e ingrésalo aquí junto con tu nueva contraseña.
              </p>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Usuario</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400"><User size={18} /></div>
                  <input required type="text" autoComplete="username" maxLength={50} className={inputClase}
                    value={reset.username} onChange={(e) => setReset({ ...reset, username: e.target.value })} />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Código de restablecimiento</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400"><KeyRound size={18} /></div>
                  <input required type="text" autoComplete="off" maxLength={32} className={`${inputClase} uppercase tracking-widest`}
                    value={reset.codigo} onChange={(e) => setReset({ ...reset, codigo: e.target.value })} />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nueva contraseña</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400"><Lock size={18} /></div>
                  <input required type="password" autoComplete="new-password" minLength={8} maxLength={128} className={inputClase}
                    value={reset.password_nueva} onChange={(e) => setReset({ ...reset, password_nueva: e.target.value })} />
                </div>
                <p className="text-xs text-gray-500 mt-1">Mínimo 8 caracteres, con al menos una letra y un número.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar contraseña</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400"><Lock size={18} /></div>
                  <input required type="password" autoComplete="new-password" maxLength={128} className={inputClase}
                    value={reset.confirmar} onChange={(e) => setReset({ ...reset, confirmar: e.target.value })} />
                </div>
              </div>

              <button type="submit" disabled={enviando} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg transition-colors">
                {enviando ? 'Procesando...' : 'Restablecer contraseña'}
              </button>

              <button type="button" onClick={() => cambiarModo('login')} className="w-full text-sm text-blue-600 hover:underline">
                Volver al inicio de sesión
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
