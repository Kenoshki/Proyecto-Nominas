import { useState, useEffect } from 'react';
import { Shield } from 'lucide-react';
import api from '../../services/api';

// 1. IMPORTAMOS NUESTRO COMPONENTE GLOBAL DE NOTIFICACIONES
import NotificacionFlotante from '../../components/NotificacionFlotante'; // Ajusta la ruta según tu estructura de carpetas

export default function Administracion() {
  const [usuarios, setUsuarios] = useState<any[]>([]);
  
  // 2. ESTADOS SIMPLIFICADOS PARA LAS NOTIFICACIONES FLOTANTES
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  useEffect(() => {
    cargarUsuarios();
  }, []);

  const cargarUsuarios = async () => {
    try {
      setError(null);
      const res = await api.get('/admin/usuarios');
      setUsuarios(res.data);
    } catch (err) {
      setError("Error al cargar los usuarios.");
    }
  };

  const handleCheckboxChange = (usuarioId: number, campo: string, valor: boolean) => {
    setUsuarios(usuarios.map(u => {
      if (u.id === usuarioId) {
        return { ...u, [campo]: valor };
      }
      return u;
    }));
  };

  const guardarPermisos = async (usuario: any) => {
    setError(null);
    setExito(null);
    try {
      await api.put(`/admin/usuarios/${usuario.id}/permisos`, {
        es_admin: usuario.es_admin,
        acceso_rrhh: usuario.acceso_rrhh,
        acceso_nominas: usuario.acceso_nominas,
        acceso_procesos: usuario.acceso_procesos,
        acceso_mantenimiento: usuario.acceso_mantenimiento,
        acceso_contabilidad: usuario.acceso_contabilidad
      });
      setExito(`Permisos de ${usuario.username} actualizados correctamente.`);
      cargarUsuarios();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Error al actualizar permisos.");
    }
  };

  const [nuevo, setNuevo] = useState({ username: '', password: '' });
  const [codigoEmitido, setCodigoEmitido] = useState<{ username: string; codigo: string; expira_en_minutos: number } | null>(null);

  const crearUsuario = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setExito(null);
    try {
      const res = await api.post('/admin/usuarios', nuevo);
      setExito(res.data.mensaje);
      setNuevo({ username: '', password: '' });
      cargarUsuarios();
    } catch (err: any) {
      const detalle = err.response?.data?.detail;
      setError(typeof detalle === 'string' ? detalle : "Datos de usuario inválidos (usuario: 3-50 caracteres alfanuméricos).");
    }
  };

  const emitirCodigo = async (usuario: any) => {
    setError(null);
    setExito(null);
    try {
      const res = await api.post(`/admin/usuarios/${usuario.id}/reset-codigo`);
      setCodigoEmitido(res.data);
      // El código es un secreto de un solo uso: se oculta solo a los 2 minutos.
      setTimeout(() => setCodigoEmitido(null), 120_000);
    } catch (err: any) {
      setError(err.response?.data?.detail || "No se pudo generar el código.");
    }
  };

  return (
    // 3. AGREGAMOS 'relative' PARA CONTENER CORRECTAMENTE LAS NOTIFICACIONES FLOTANTES
    <div className="space-y-6 max-w-7xl mx-auto pb-12 relative">
      
      {/* 4. INYECTAMOS EL COMPONENTE GLOBAL (Se eliminaron los divs fijos de error y éxito antiguos) */}
      <NotificacionFlotante error={error} exito={exito} setError={setError} setExito={setExito} />

      <div className="flex items-center gap-3 border-b pb-4">
        <div className="bg-slate-800 p-2 rounded-lg text-white">
          <Shield size={24} />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Gestión de Accesos (RBAC)</h2>
          <p className="text-sm text-gray-500">Administra los permisos y privilegios por módulo para cada usuario del sistema.</p>
        </div>
      </div>

      <form onSubmit={crearUsuario} className="bg-white rounded-xl shadow-sm border p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Nuevo usuario</label>
          <input required minLength={3} maxLength={50} pattern="[A-Za-z0-9._-]+" autoComplete="off"
            className="p-2 border rounded-lg text-sm" value={nuevo.username}
            onChange={e => setNuevo({ ...nuevo, username: e.target.value })} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Contraseña inicial</label>
          <input required type="password" minLength={8} maxLength={128} autoComplete="new-password"
            className="p-2 border rounded-lg text-sm" value={nuevo.password}
            onChange={e => setNuevo({ ...nuevo, password: e.target.value })} />
        </div>
        <button type="submit" className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium">
          Crear usuario
        </button>
        <p className="text-xs text-gray-500 w-full">Se crea sin permisos; asígnalos en la tabla. Mínimo 8 caracteres con letra y número.</p>
      </form>

      {codigoEmitido && (
        <div role="status" className="bg-amber-50 border border-amber-300 rounded-xl p-4 text-sm text-amber-900">
          <p>
            Código de restablecimiento para <strong>{codigoEmitido.username}</strong> (válido {codigoEmitido.expira_en_minutos} min, un solo uso):
          </p>
          <p className="text-2xl font-mono tracking-widest my-2 select-all">{codigoEmitido.codigo}</p>
          <p className="text-xs">Entrégalo al usuario por un canal seguro. Solo se muestra ahora; no se puede recuperar después.</p>
          <button onClick={() => setCodigoEmitido(null)} className="mt-2 text-xs underline">Ocultar</button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="p-4 bg-gray-50 border-b">
          <h3 className="font-semibold text-gray-800 text-sm">Control de Privilegios de Usuarios</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-600 uppercase text-xs border-b">
                <th className="p-3.5">Usuario</th>
                <th className="p-3.5 text-center">Admin Total</th>
                <th className="p-3.5 text-center">RRHH</th>
                <th className="p-3.5 text-center">Nóminas</th>
                <th className="p-3.5 text-center">Procesos</th>
                <th className="p-3.5 text-center">Mantenimiento</th>
                <th className="p-3.5 text-center">Contabilidad</th>
                <th className="p-3.5 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y text-gray-700">
              {usuarios.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="p-3.5 font-semibold text-gray-900">{u.username}</td>
                  
                  <td className="p-3.5 text-center">
                    <input 
                      type="checkbox" checked={u.es_admin}
                      onChange={e => handleCheckboxChange(u.id, 'es_admin', e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                    />
                  </td>

                  <td className="p-3.5 text-center">
                    <input 
                      type="checkbox" checked={u.acceso_rrhh}
                      onChange={e => handleCheckboxChange(u.id, 'acceso_rrhh', e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                    />
                  </td>

                  <td className="p-3.5 text-center">
                    <input 
                      type="checkbox" checked={u.acceso_nominas}
                      onChange={e => handleCheckboxChange(u.id, 'acceso_nominas', e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                    />
                  </td>

                  <td className="p-3.5 text-center">
                    <input 
                      type="checkbox" checked={u.acceso_procesos}
                      onChange={e => handleCheckboxChange(u.id, 'acceso_procesos', e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                    />
                  </td>

                  <td className="p-3.5 text-center">
                    <input 
                      type="checkbox" checked={u.acceso_mantenimiento}
                      onChange={e => handleCheckboxChange(u.id, 'acceso_mantenimiento', e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                    />
                  </td>

                  <td className="p-3.5 text-center">
                    <input 
                      type="checkbox" checked={u.acceso_contabilidad}
                      onChange={e => handleCheckboxChange(u.id, 'acceso_contabilidad', e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                    />
                  </td>

                  <td className="p-3.5 text-center">
                    <button 
                      onClick={() => guardarPermisos(u)}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium shadow-sm transition-colors"
                    >
                      Guardar
                    </button>
                    <button
                      onClick={() => emitirCodigo(u)}
                      className="ml-2 bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium shadow-sm transition-colors"
                    >
                      Código de acceso
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}