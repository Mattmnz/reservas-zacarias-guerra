# Frontend

HTML, CSS y JavaScript sin framework, servido por Express desde `public/` (#35, decisiones 1 a 3). Cada página es un nodo de [`docs/modelos/navegacion.md`](../docs/modelos/navegacion.md).

## Nodos y rutas

| Nodo | Ruta | Issue |
| --- | --- | --- |
| Entrada (sin nodo: redirige según la sesión) | `/index.html` | #40 |
| N1 Login | `/login.html` | #40 |
| N2 Registro | `/registro.html` | #40 |
| N3 Catálogo de canchas | `/cliente/catalogo.html` | #40 (esqueleto), #43 |
| N4 Detalle y reserva | `/cliente/reserva.html` | #43 |
| N5 Historial de reservas | `/cliente/historial.html` | #44 |
| N6 Confirmación de reserva | `/cliente/confirmacion.html` | #43 |
| N7 Panel administrador | `/admin/panel.html` | #40 |
| N8 Gestionar canchas | `/admin/canchas.html` | #41 |
| N9 Horario de cancha | `/admin/horario.html` | #41 |
| N10 Reservas del complejo | `/admin/reservas.html` | #42 |
| N11 Gestionar usuarios | `/admin/usuarios.html` | #46 |
| N12 Auditoría | `/admin/auditoria.html` | #47 |
| N13 Notificaciones | `/cliente/notificaciones.html` | #45 |

N4, N6 y N9 no van en el menú: se enlazan desde su nodo de origen. Las demás rutas ya están en `MENUS`, en `js/sesion.js`.

## Cómo se arma una página

1. Copiá `cliente/catalogo.html` a la ruta de la tabla. Mantené `data-menu`, `data-carga`, `data-error` y `data-contenido`: `exigirRol` los usa.
2. Cambiá el `<title>`, el contenido del `<main>` y el script. Cada página carga un solo script, como módulo y con ruta absoluta:

   ```html
   <script type="module" src="/js/paginas/historial.js"></script>
   ```

3. El script exige el rol antes de hacer cualquier otra cosa:

   ```js
   import { pedir } from '../api.js';
   import { exigirRol } from '../sesion.js';

   const usuario = await exigirRol('CLIENTE'); // o 'ADMIN'
   const reservas = await pedir('/reservas/mias');
   ```

`exigirRol` manda al login si no hay sesión y al inicio del rol si es otro. Después arma el menú, muestra el `<main>` y devuelve `{ id, nombre, rol }`.

## Reglas

- **Llamadas a la API:** van en `js/api.js`, nunca con `fetch` en la página. `pedir(ruta, { metodo, cuerpo })` devuelve `data` y lanza `ErrorApi { status, codigo, mensaje }`. Mostrá `error.mensaje`.
- **Sesión expirada:** un 401 lo resuelve `api.js`: guarda la página actual, va al login y vuelve después de iniciar sesión. Si el flujo tiene que retomarse en un punto exacto, ese dato va en la query de la URL.
- **Datos del servidor:** siempre con `textContent`, nunca con `innerHTML`.
- **Cada pantalla:** muestra los estados de carga, vacío y error. Las acciones con efecto piden confirmación, y los montos penalizados y reembolsados se ven explícitos.
- **Fechas y montos:** con `js/formato.js`. Las fechas de la API son hora de Nicaragua sin zona: no las formatees con métodos locales de `Date`.
- **Parámetros de la URL:** se validan con `js/parametros.js` antes de llamar a la API.
- **Usuarios:** los nombres de los roles, la query de los filtros y los textos de cada acción salen de `js/usuarios.js`.
- **Auditoría:** los nombres de las entidades, la query de los filtros y los textos de cada registro salen de `js/auditoria.js`.
- **Indicador de no leídas:** `exigirRol` lo carga en el menú del cliente. Una página que cambia la cantidad lo actualiza con `mostrarNoLeidas(cantidad)`, de `js/sesion.js`.
- **Reservas:** el texto y la clase del estado, la tabla de pagos, el reembolso, la query de los filtros del administrador y cuándo se ofrece confirmar, registrar asistencia o cancelar salen de `js/reservas.js`. La penalización y el reembolso los da la API: la pantalla no los calcula.

## Componentes CSS

Todos están en `css/estilos.css`. Los colores y medidas son variables de `:root`.

| Clase | Uso |
| --- | --- |
| `.contenedor`, `.contenedor--angosto` | Ancho y margen de la página; angosto para formularios sueltos |
| `.rejilla` | Tarjetas en una columna, dos desde 768 px |
| `.boton`, `--secundario`, `--peligro`, `--bloque` | Botones y enlaces con forma de botón |
| `.campo`, `.campo__etiqueta`, `.campo__ayuda` | `<label>` con su etiqueta, control y ayuda |
| `.tarjeta` | Superficie; también sobre un `<a>` |
| `.tarjeta--no-leida`, `.etiqueta--no-leida` | Notificación sin leer |
| `.bloques` | Grupo de enlaces con forma de botón, como los bloques horarios |
| `.titulo-seccion` | Separa un bloque del anterior dentro de la página |
| `.aviso`, `--info`, `--error`, `--exito` | Mensajes; con `role="alert"` si es un error |
| `.estado-carga`, `.vacio` | Estados de carga y de lista vacía |
| `.etiqueta`, `--pagada`, `--confirmada`, `--completada`, `--cancelada`, `--no-show` | Estado de una reserva |
| `.etiqueta--activo`, `--inactivo` | Estado de un usuario |
| `.tarjeta--usuario`, `.tarjeta--auditoria` | Tarjeta que corta un correo o un motivo largo en el celular |
| `.tabla-envoltorio`, `.tabla` | Tabla con scroll propio en el celular |
| `.dialogo`, `.dialogo__acciones` | Confirmación con `<dialog>` y `showModal()` |

`package.json` declara esta carpeta como módulos ES para que `npm test` pueda importar `js/*.js`. Las pruebas de `js/*.test.js` corren con el resto y no entran en la imagen Docker.
