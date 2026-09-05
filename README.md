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

## Inventario v2 · septiembre de 2026

- Selección de los cuatro miembros siempre visible, con distinción visual entre máster y PJ.
- Inventario compacto con búsqueda por nombre/notas, filtros y ordenación.
- Equipar/guardar y ajustar cantidades sin abrir el editor; confirmación al quitar la última unidad.
- Saldo editable con confirmación explícita. No hay compras ni transferencias automáticas.
- Vista «La mesa»: créditos de los PJ, inventarios de todos y búsqueda global. El máster abre aquí por defecto.
- Catálogo de 91 objetos del Manual Básico Revisado: armas, munición, blindajes y equipo, con datos de referencia y resúmenes originales.
- Exportación privada de los inventarios en JSON desde «La mesa». No incluye miembros, no es una copia integral de Firebase ni una instantánea atómica entre colecciones. No editar durante la exportación. No se publica el archivo en GitHub.
- No incluye dados, fichas, seguimiento de combate ni notas secretas.

### Catálogo y fuentes

Fuente: Manual Básico Revisado en español proporcionado por el usuario, capítulo 7. Tablas 7-2 (página impresa 132 / página PDF 133), 7-3 (138 / PDF 139) y 7-4 (143 / PDF 144), cotejadas con las imágenes de las páginas. Descripciones redactadas como resúmenes, no copiadas literalmente. No incluye servicios, vehículos ni suplementos. Los ataques «sin armas» no son objetos y no se añaden al inventario.

Los valores son los de referencia de las tablas, no una ficha de combate completa ni un cálculo automático de reglas. El máster decide variantes, disponibilidad y precios. Los lotes mantienen el precio y peso del lote. El peso ausente se indica como desconocido, no como cero.

Al añadir del catálogo, nombre y resumen pasan a los campos existentes. No se añaden campos a Firestore ni se transforman objetos anteriores. La referencia desplegable se reconoce por el nombre del objeto; las notas de la mesa prevalecen. Los PDF y sus direcciones de Drive no se redistribuyen en este repositorio.

### Respaldo y reversión

Antes de editar se creó en GitHub la rama `backup/pre-mesa-revised-2026-09-05`, en el commit `da78ff7b2093789cf90af667afc6550fe4f03a53`, que conserva la aplicación anterior completa. Es un respaldo de **código**, no de datos privados de Firebase.

Para volver a la interfaz anterior, revertir el commit de esta actualización en `main` mediante un nuevo commit (sin forzar ni reescribir el historial). GitHub Pages volverá a publicar la versión previa. No se requiere revertir datos: el esquema, los permisos y la configuración de Firebase no cambian. Los nuevos objetos son compatibles con la versión anterior, incluido el texto del catálogo en sus notas.

### Seguridad y comprobaciones

- Se conserva el acceso de Google, la lista privada de miembros y las reglas de servidor existentes. No se modifica la facturación ni el plan Firebase.
- La etiqueta «Máster» se reconoce por el nombre para organizar la interfaz; **no** concede privilegios de administrador. La vista de mesa está disponible para todos, según los permisos compartidos solicitados. No existe almacenamiento privado del máster.
- Las ediciones usan transacciones y detectan cambios concurrentes antes de sobrescribir. Los botones se bloquean durante el guardado. Las cantidades rápidas usan el valor actual del servidor.
- Los errores de acceso retiran los datos de la interfaz y detienen escuchas. El cierre de sesión limpia formularios, listas y menús.
- La caché solo incluye recursos públicos de esta app. No guarda respuestas de inventarios ni borra cachés de otras aplicaciones del mismo GitHub Pages.
- Las actualizaciones de la PWA ofrecen confirmación para no cerrar editores abiertos.
- Ejecutar `node --test tests/inventory.test.mjs` para pruebas locales de búsqueda, catálogo, validación, transacciones simuladas y alcance de caché. No requieren credenciales ni escriben datos reales.
- Estas pruebas no sustituyen una prueba con las cuentas reales ni con el emulador de reglas. La actualización se comprobó estáticamente y con dobles locales; no se realizaron operaciones sobre inventarios reales durante su desarrollo.

## Seguridad

La configuración pública de Firebase identifica el proyecto, pero no concede acceso a los datos. Las reglas de `firestore.rules` exigen autenticación y pertenencia a la lista privada de miembros para leer o modificar inventarios. Los correos de los jugadores no se publican en el repositorio.

## Publicación

Cada cambio enviado a la rama `main` se publica automáticamente mediante GitHub Pages.
