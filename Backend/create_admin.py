"""Crea o restablece al administrador desde consola (recuperación si se pierde el acceso).

Uso:
    ADMIN_USERNAME=admin ADMIN_PASSWORD='NuevaClave123' python create_admin.py
En Railway:  railway run python create_admin.py
"""
import os
import sys

from dotenv import load_dotenv

load_dotenv()
import models  # noqa: E402
import security  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402


def main() -> int:
    username = os.getenv("ADMIN_USERNAME", "admin").strip() or "admin"
    password = os.getenv("ADMIN_PASSWORD", "")
    error = security.validar_password_nueva(password)
    if error:
        print(f"ADMIN_PASSWORD inválida: {error}")
        return 1

    db = sessionmaker(bind=models.engine)()
    try:
        usuario = db.query(models.Usuario).filter(models.Usuario.username == username).first()
        if usuario is None:
            usuario = models.Usuario(username=username)
            db.add(usuario)
        usuario.password_hash = security.hashear_password(password)
        usuario.es_admin = True
        usuario.acceso_rrhh = usuario.acceso_nominas = usuario.acceso_procesos = True
        usuario.acceso_mantenimiento = usuario.acceso_contabilidad = True
        db.commit()
        print(f"Administrador '{username}' creado/actualizado.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
