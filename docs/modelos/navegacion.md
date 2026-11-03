# Modelo navegacional

Modelo navegacional UWE del frontend: los 8 nodos y 12 enlaces del Entregable 1 (E1 Cap. I, Modelo Navegacional), sin cambios, y su ampliación para las pantallas de #40 a #47. Cada nodo es una página del frontend, y cada pantalla se valida contra su nodo (#35, decisiones 1 y 2). Responde al issue #49.

Este documento todavía no incluye un diagrama: solo lista los nodos y los enlaces.

## 1. Convenciones

- **Ids:** `N1`–`N8` y `E1`–`E12` son los nodos y enlaces de E1, en el mismo orden en que se leen en su diagrama. `N9` en adelante y `A1` en adelante son la ampliación.
- **Roles:** Entrada común (sin sesión), Cliente y Administrador, con los colores de la leyenda de E1.
- **Estereotipos:** el estereotipo refleja el propósito principal del nodo.
  - «menu»: menú del rol.
  - «query»: consultar, con o sin filtros.
  - «processClass»: ejecutar un proceso de negocio.
  - Una acción secundaria dentro de la página no cambia el estereotipo. Por ejemplo, Historial de reservas es «query» en E1 aunque desde ahí se cancela.
- **Menú persistente:** el nodo «menu» de cada rol (Catálogo de canchas para el cliente, Panel administrador para el administrador) está en todas las páginas autenticadas de ese rol, como dice el texto de E1. Desde cualquier nodo se puede volver a las opciones del menú y cerrar sesión. Por eso la tabla de enlaces solo registra las entradas desde el menú (E5, E6, E8, E9 y A1 a A4) y no repite esos retornos para cada nodo.
- **Acciones:** las acciones con confirmación (cancelar, dar de baja, cambiar rol, etc.) se resuelven dentro de la página del nodo y no tienen nodo propio. Se listan en la tabla de nodos con su requisito y su issue. Las clases de proceso de E1, como `CancelarReserva`, siguen en el modelo de procesos.
- **Líneas de E1:** la línea sólida es navegación; la punteada es retorno, cierre de sesión o enlace hacia adelante.

## 2. Nodos

| Id | Nodo | Estereotipo | Rol | Pantalla | Acciones en la página | Origen |
| --- | --- | --- | --- | --- | --- | --- |
| N1 | Login | — (sin estereotipo en E1) | Entrada común | #40 | Iniciar sesión (RF15, #40) | E1 |
| N2 | Registro | — (sin estereotipo en E1) | Entrada común | #40 | Registrarse como cliente (RF01, #40) | E1 |
| N3 | Catálogo de canchas | «menu» | Cliente | #43; menú en #40 | Consultar disponibilidad por fecha y tipo (RF02, #43). Menú con cierre de sesión (RF16, #40) e indicador de notificaciones no leídas (RF12, #45) | E1 |
| N4 | Detalle y reserva | «processClass» | Cliente | #43 | Elegir un bloque y reservar con pago simulado (RF03, RF06, #43). Si el bloque se ocupó, mostrar los bloques libres alternativos (RF03, CU-01 A1, #43) | E1 |
| N5 | Historial de reservas | «query» | Cliente | #44 | Ver estado, monto y pagos de cada reserva (RF07, #44). Cancelar con confirmación previa, mostrando la penalización y el reembolso que devuelve la API (RF04, RF05, #44) | E1 |
| N6 | Confirmación de reserva | — (sin estereotipo en E1) | Cliente | #43 | Ver la reserva creada y su pago simulado (RF06, #43) | E1 |
| N7 | Panel administrador | «menu» | Administrador | #40 | Menú con cierre de sesión (RF16, #40) | E1 |
| N8 | Gestionar canchas | «processClass» | Administrador | #41 | Alta, edición, baja con alerta y confirmación cuando hay reservas futuras, y reactivación (RF08, #41) | E1 |
| N9 | Horario de cancha | «processClass» | Administrador | #41 | Reemplazar el horario semanal de la cancha (RF09, #41) | Ampliación (RF09) |
| N10 | Reservas del complejo | «query» | Administrador | #42 | Filtrar por fecha, cancha y estado (RF10, #42). Confirmar y cancelar con motivo, mostrando la penalización y el reembolso (RF11, #42). Registrar asistencia (#42; estado `COMPLETADA`, #17) | Ampliación (RF10) |
| N11 | Gestionar usuarios | «processClass» | Administrador | #46 | Filtrar por rol y estado. Cambiar el rol y activar o desactivar, con confirmación previa (RF17, #46) | Ampliación (RF17) |
| N12 | Auditoría | «query» | Administrador | #47 | Filtrar por entidad e id (RF13, #47). Es el primer recorte si un hito se atrasa (#35) | Ampliación (RF13) |
| N13 | Notificaciones | «query» | Cliente | #45 | Marcar una notificación como leída (RF12, #45) | Ampliación (RF12) |

Por qué la ampliación lleva esos estereotipos:

- **N9** es «processClass» porque su propósito es definir el horario de una cancha.
- **N10** es «query» porque RF10 es visualizar las reservas con filtros (CU-GEN-14, «Ver reservas del complejo»). Confirmar, cancelar y registrar asistencia son acciones secundarias, como cancelar en Historial.
- **N11** es «processClass» porque RF17 es gestionar usuarios (CU-GEN-08), igual que Gestionar canchas en E1.
- **N12** es «query» porque solo consulta.
- **N13** es «query» porque consulta; marcar como leída es una acción secundaria.

La disponibilidad no tiene nodo propio: se consulta en el Catálogo, como en el modelo de presentación de E1.

## 3. Enlaces

| Id | Origen → destino | Condición | Origen |
| --- | --- | --- | --- |
| E1 | Login → Registro | El usuario no tiene cuenta | E1 (sólida) |
| E2 | Registro → Login | Retorno a Login | E1 (punteada) |
| E3 | Login → Catálogo de canchas | Inicio de sesión de un cliente | E1 (sólida) |
| E4 | Login → Panel administrador | Inicio de sesión de un administrador | E1 (sólida) |
| E5 | Catálogo de canchas → Login | Cerrar sesión desde el menú | E1 (punteada, «cerrar sesión») |
| E6 | Panel administrador → Login | Cerrar sesión desde el menú | E1 (punteada, «cerrar sesión») |
| E7 | Catálogo de canchas → Detalle y reserva | El cliente elige una cancha y un bloque | E1 (sólida) |
| E8 | Catálogo de canchas → Historial de reservas | Opción del menú | E1 (sólida) |
| E9 | Panel administrador → Gestionar canchas | Opción del menú | E1 (sólida) |
| E10 | Detalle y reserva → Confirmación de reserva | La reserva se creó con su pago simulado | E1 (sólida, «processLink») |
| E11 | Confirmación de reserva → Historial de reservas | Enlace hacia adelante | E1 (punteada) |
| E12 | Confirmación de reserva → Catálogo de canchas | Enlace hacia adelante | E1 (punteada) |
| A1 | Catálogo de canchas → Notificaciones | Opción del menú, con el indicador de no leídas | Ampliación (#45, RF12) |
| A2 | Panel administrador → Reservas del complejo | Opción del menú | Ampliación (#42, RF10) |
| A3 | Panel administrador → Gestionar usuarios | Opción del menú | Ampliación (#46, RF17) |
| A4 | Panel administrador → Auditoría | Opción del menú | Ampliación (#47, RF13) |
| A5 | Gestionar canchas → Horario de cancha | El administrador elige editar el horario de una cancha | Ampliación (#41, RF09) |
| A6 | Horario de cancha → Gestionar canchas | Retorno: guarda el horario o desiste | Ampliación (#41, RF09) |
| A7 | Cualquier nodo de cliente o administrador → Login | Sesión expirada: la API responde 401 `NO_AUTENTICADO` | Ampliación (#40, RF15; CU-01 A2) |
| A8 | Login → nodo de origen de A7 | Vuelve a iniciar sesión y retoma el flujo donde quedó | Ampliación (#40, RF15; CU-01 A2) |

## 4. Notas sobre la lectura de E1

- **E12:** en la imagen de E1, la línea punteada que va de Confirmación de reserva a Catálogo de canchas pasa pegada a «Detalle y reserva» y puede confundirse con un enlace que sale de ese nodo. El texto de E1 la confirma: «Confirmación de reserva enlaza hacia adelante a Catálogo de canchas e Historial de reservas». El diagrama nuevo debe dibujarla sin pasar junto a Detalle y reserva.
- **«processLink»:** en E1, el rótulo queda entre E10 y E11. Se asigna a E10 porque sale de un nodo «processClass» hacia el resultado del proceso, igual que `CrearReserva` → `ConfirmacionReserva` en la estructura de procesos de E1.
- **Sin estereotipo:** Login, Registro y Confirmación de reserva no tienen estereotipo en E1 y se dejan así.
- **Cierre de sesión:** E1 lo modela como una acción del menú persistente (E5 y E6), disponible en cualquier página autenticada del rol.
- **Condiciones de E1:** E1 solo rotula E5, E6 y E10. Las demás condiciones de los enlaces E1 a E12 se derivan del texto y de la leyenda de E1, sin cambiar sus nodos ni sus enlaces.
