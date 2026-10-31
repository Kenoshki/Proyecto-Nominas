# Despliegue en Railway

Arquitectura: **3 piezas** en un mismo proyecto de Railway — MySQL, `backend` (FastAPI) y `frontend` (Vite/React estático).

## 1. Repositorio
Sube solo `Backend/` y `Frontend/` (el `.gitignore` de esta carpeta excluye `venv`, `node_modules`, `.env`, etc.).
Verifica antes de hacer commit: `git status` no debe listar ningún `.env`.

## 2. Base de datos
En Railway: *New → Database → MySQL*.

## 3. Servicio `backend`
- *Root Directory*: `Backend`
- Arranque: lo toma del `Procfile` (`uvicorn main:app --host 0.0.0.0 --port $PORT ...`).
- *Healthcheck path*: `/health`
- Variables:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | `${{MySQL.MYSQL_URL}}` (se normaliza a `mysql+pymysql://`) |
| `ORIGENES` | URL pública del frontend, sin barra final (ej. `https://nomina-frontend.up.railway.app`) |
| `JWT_SECRET` | `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `ENTORNO` | `produccion` (valor por defecto; desactiva `/docs`) |
| `PROXY_HOPS` | `1` (el limitador toma la IP que añade el proxy de Railway) |
| `ADMIN_USERNAME` | `admin` |
| `ADMIN_PASSWORD` | contraseña inicial (≥ 8, con letra y número). Solo se usa si no hay usuarios. |

Al primer arranque se crean las tablas y el administrador. Después puedes **quitar `ADMIN_PASSWORD`**.

## 4. Servicio `frontend`
- *Root Directory*: `Frontend`
- Build: `npm ci && npm run build` · Start: `npm start` (sirve `dist/` con fallback SPA)
- Variable (debe existir **antes** del build): `VITE_API_URL=https://<backend>.up.railway.app/api`

Tras conocer la URL del frontend, vuelve a `backend` y completa `ORIGENES`.

## 5. Restablecimiento de contraseñas
- **Usuario normal**: el administrador entra a *Administración → Código de acceso*, entrega el código (30 min, un solo uso) y el usuario lo canjea en *¿Olvidaste tu contraseña?* del login.
- **Administrador bloqueado**: `railway run --service backend python create_admin.py` con `ADMIN_USERNAME`/`ADMIN_PASSWORD` definidos.

## 6. Notas operativas
- Ejecuta una sola réplica del backend: el límite de intentos de login vive en memoria del proceso.
- Usuarios creados con la versión anterior (contraseña en texto plano) **no podrán iniciar sesión**; restablécelos con `create_admin.py` o borra la tabla `usuarios` y reinicia con `ADMIN_PASSWORD`.
- La tabla `nominas` tiene `UNIQUE(periodo_mes, periodo_anio, tipo)` solo en bases nuevas. En una base ya creada ejecuta una vez:
  `ALTER TABLE nominas ADD CONSTRAINT uq_nomina_periodo_tipo UNIQUE (periodo_mes, periodo_anio, tipo);` (antes borra duplicados si existen).
- Pruebas: `cd Backend && python -m pytest tests -q` (usan SQLite temporal).
