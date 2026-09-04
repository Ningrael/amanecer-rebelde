# Amanecer Rebelde

PWA de inventario compartido para una mesa de rol de Star Wars.

## Funciones

- Acceso exclusivo con cuentas de Google autorizadas.
- Inventarios independientes por personaje, visibles y editables por toda la mesa.
- Objetos con nombre, cantidad, notas y estado equipado/guardado.
- Saldo de créditos editable por personaje.
- Panel de administración para agregar correos y personajes.
- Instalación como aplicación en Android, iPhone y ordenador.
- Sincronización en tiempo real mediante Firebase Firestore.

## Seguridad

La configuración pública de Firebase identifica el proyecto, pero no concede acceso a los datos. Las reglas de `firestore.rules` exigen autenticación y pertenencia a la lista privada de miembros para leer o modificar inventarios. Los correos de los jugadores no se publican en el repositorio.

## Publicación

Cada cambio enviado a la rama `main` se publica automáticamente mediante GitHub Pages.
