import axios from 'axios';

// En producción VITE_API_URL es obligatoria (se incrusta en el build); el respaldo local solo aplica en desarrollo.
const baseURL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000/api' : '/api');

const api = axios.create({ baseURL });

export const SESSION_EXPIRED_EVENT = 'sesion-expirada';

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/** FastAPI devuelve `detail` como arreglo en los 422; las páginas lo pintan como texto, así que se aplana aquí. */
function aplanarDetalle(detail: unknown): string {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d: any) => {
        const campo = Array.isArray(d?.loc) ? d.loc.filter((p: unknown) => p !== 'body').join('.') : '';
        return campo ? `${campo}: ${d?.msg ?? 'valor inválido'}` : (d?.msg ?? 'valor inválido');
      })
      .join('; ');
  }
  return 'Solicitud inválida.';
}

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.data && 'detail' in err.response.data && typeof err.response.data.detail !== 'string') {
      err.response.data.detail = aplanarDetalle(err.response.data.detail);
    }
    // Un 401 fuera del login significa sesión vencida o revocada.
    const esLogin = err.config?.url?.startsWith('/auth/login') || err.config?.url?.startsWith('/auth/restablecer');
    if (err.response?.status === 401 && !esLogin) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    return Promise.reject(err);
  },
);

/** Descarga un archivo protegido enviando el token (no se puede usar window.open). */
export async function descargarArchivo(ruta: string, nombre: string) {
  const res = await api.get(ruta, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default api;
