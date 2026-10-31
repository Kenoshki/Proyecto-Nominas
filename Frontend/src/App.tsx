import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { 
  Users, 
  Calculator, 
  CalendarClock, 
  ShieldCheck, 
  LayoutDashboard, 
  LogOut,
  BookOpen, 
  FileSpreadsheet,
  Settings, // <--- Importamos el icono para Mantenimiento
  KeyRound
} from 'lucide-react';
import api, { SESSION_EXPIRED_EVENT } from './services/api';
import CambiarPassword from './components/CambiarPassword';

// Importación de Páginas
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import IngresoEmpleado from './pages/rrhh/IngresoEmpleado';
import Nominas from './pages/nominas/Nominas';
import Procesos from './pages/procesos/Procesos';
import Contabilidad from './pages/contabilidad/Contabilidad'
import Reporteria from './pages/reporteria/Reporteria';
import MantenimientoHub from './pages/mantenimiento/MantenimientoHub';
import Administracion from './pages/admin/Administracion';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [mostrarCambioPassword, setMostrarCambioPassword] = useState(false);

  // Al cargar la app, restaura la sesión y valida el token contra el servidor
  // (los permisos del servidor mandan sobre lo guardado en el navegador).
  useEffect(() => {
    // El listener se registra siempre: también debe cerrar la sesión si expira tras un login en esta misma carga.
    const alExpirar = () => setUser(null);
    window.addEventListener(SESSION_EXPIRED_EVENT, alExpirar);

    if (localStorage.getItem('token')) {
      api.get('/auth/me')
        .then(res => {
          localStorage.setItem('user', JSON.stringify(res.data));
          setUser(res.data);
        })
        .catch(() => { /* el interceptor limpia la sesión si fue un 401 */ });
    } else {
      localStorage.removeItem('user');
    }

    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, alExpirar);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  // Si no hay usuario, forzar la pantalla de Login
  if (!user) {
    return <Login onLoginSuccess={setUser} />;
  }

  // --- LÓGICA DE PERMISOS BOOLEANOS ---
  const isAdmin = user.es_admin;
  const canRRHH = user.es_admin || user.acceso_rrhh;
  const canNominas = user.es_admin || user.acceso_nominas;
  const canProcesos = user.es_admin || user.acceso_procesos;
  const canReporteria = canRRHH || canNominas || isAdmin; // Reportería compartida
  const canMantenimiento = user.es_admin || user.acceso_mantenimiento; // Permiso de Mantenimiento
  const canContabilidad = user.es_admin || user.acceso_contabilidad;   // Permiso Contable

  // Etiqueta visual para el menú
  const rolTexto = isAdmin ? "Administrador" : "Usuario Estándar";

  return (
    <BrowserRouter>
      <div className="flex h-screen bg-gray-50 font-sans">
        
        {/* Barra Lateral (Sidebar) */}
        <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col shadow-xl z-10">
          <div className="p-6 border-b border-slate-800">
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <span className="text-blue-500">Nómina</span>Hub
            </h1>
            <p className="text-xs text-slate-400 mt-2">Usuario: <span className="text-blue-400 font-medium">{user.username}</span></p>
            <p className="text-xs text-slate-400">Acceso: {rolTexto}</p>
          </div>
          
          <nav className="flex-1 px-4 space-y-2 mt-4 overflow-y-auto">
            <NavLink to="/" className={({isActive}) => `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 hover:text-white'}`}>
              <LayoutDashboard size={20} /> Dashboard
            </NavLink>

            {/* RRHH */}
            {canRRHH && (
              <NavLink to="/rrhh" className={({isActive}) => `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 hover:text-white'}`}>
                <Users size={20} /> Recursos Humanos
              </NavLink>
            )}

            {/* Nóminas */}
            {canNominas && (
              <NavLink to="/nominas" className={({isActive}) => `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 hover:text-white'}`}>
                <Calculator size={20} /> Nóminas
              </NavLink>
            )}

            {/* Procesos */}
            {canProcesos && (
              <NavLink to="/procesos" className={({isActive}) => `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 hover:text-white'}`}>
                <CalendarClock size={20} /> Procesos
              </NavLink>
            )}

            {/* Contabilidad */}
            {canContabilidad && (
              <NavLink to="/contabilidad" className={({isActive}) => `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 hover:text-white'}`}>
                <BookOpen size={20} /> Contabilidad
              </NavLink>
            )}

            {/* Reportería */}
            {canReporteria && (
              <NavLink to="/reporteria" className={({isActive}) => `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 hover:text-white'}`}>
                <FileSpreadsheet size={20} /> Reportería
              </NavLink>
            )}

            {/* Mantenimiento y Catálogos */}
            {canMantenimiento && (
              <NavLink to="/mantenimiento" className={({isActive}) => `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 hover:text-white'}`}>
                <Settings size={20} /> Mantenimiento
              </NavLink>
            )}

            {/* Administración */}
            {isAdmin && (
              <NavLink to="/admin" className={({isActive}) => `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 hover:text-white'}`}>
                <ShieldCheck size={20} /> Administración
              </NavLink>
            )}
          </nav>

          <div className="p-4 border-t border-slate-800">
            <button onClick={() => setMostrarCambioPassword(true)} className="flex items-center gap-3 px-4 py-3 w-full rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition-colors">
              <KeyRound size={20} /> Cambiar contraseña
            </button>
            <button onClick={handleLogout} className="flex items-center gap-3 px-4 py-3 w-full rounded-lg text-red-400 hover:bg-slate-800 hover:text-red-300 transition-colors">
              <LogOut size={20} /> Cerrar Sesión
            </button>
          </div>
        </aside>

        {/* Contenido Principal */}
        <main className="flex-1 overflow-y-auto p-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            
            {/* Protegiendo las rutas a nivel de renderizado */}
            {canRRHH && <Route path="/rrhh" element={<IngresoEmpleado />} />}
            {canNominas && <Route path="/nominas" element={<Nominas />} />}
            {canProcesos && <Route path="/procesos" element={<Procesos />} />}
            {canContabilidad && <Route path="/contabilidad" element={<Contabilidad />} />}
            {canReporteria && <Route path="/reporteria" element={<Reporteria />} />}
            {canMantenimiento && <Route path="/mantenimiento" element={<MantenimientoHub />} />}
            {isAdmin && <Route path="/admin" element={<Administracion />} />}
            
            {/* Ruta por defecto si intenta acceder a algo sin permisos o que no existe */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>

        {mostrarCambioPassword && <CambiarPassword onClose={() => setMostrarCambioPassword(false)} />}
      </div>
    </BrowserRouter>
  );
}