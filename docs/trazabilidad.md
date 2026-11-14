# Matriz de trazabilidad

Seguimiento de cada compromiso de los entregables 1 a 3: dónde se cumple y en qué estado está. Responde al issue #49.

## 1. Propósito y alcance

**Fuentes**

| Fuente | Entrega | Contenido |
| --- | --- | --- |
| Entregable 1 (E1) | 16/08 | Introducción, objetivos, caso de estudio y Capítulo I: requisitos, casos de uso y modelos UWE |
| Entregable 2 (E2) | 23/08 | Repite completo el Capítulo I de E1 (mismo texto y mismos diagramas) y agrega el Capítulo II: arquitectura |
| Entregable 3 (E3) | 11/10 | Capítulo III: tecnología backend, patrón de diseño, estrategias de desarrollo y avance |

Como el Capítulo I es el mismo en E1 y E2, se cita una sola vez como `E1 Cap. I`.

**Fuentes de las justificaciones:** §1 de la guía principal (decisiones cerradas del dominio), el contrato técnico del equipo, que se versionará como `docs/contrato.md` (#36); #31 (redistribución de tareas) y #35 (plan del sprint final, con sus comentarios).

**Corte de la evidencia:** `develop` en el commit `4579453` (merge del PR #93), al 13/11/2026. Ese día `npm test` da 710 pruebas, 710 en verde.

**Cómo se mantiene:**
- Cuando un PR se integra a `develop`, sus filas pasan de `pendiente (#N)` a `cumplido` o `modificado`, con la evidencia nueva, y se actualiza el corte.
- El issue #49 se cierra cuando ninguna fila queda en `pendiente` y los modelos corregidos están listos.

## 2. Convenciones

### Estados

| Estado | Significado |
| --- | --- |
| `cumplido` | Está en `develop` tal como se comprometió. Cita evidencia: archivo, endpoint, prueba o PR integrado |
| `modificado` | Está en `develop`, pero distinto de lo comprometido. Cita la evidencia y la justificación (Guía §1, contrato técnico, #31 o #35) |
| `omitido` | Se recortó según el orden de recorte de #35 o por decisión del responsable registrada en #35. Cita la justificación. Los recortes aplicados no eran filas de la matriz (sección 7) |
| `pendiente (#N)` | Todavía no está en `develop`; lo resuelve el issue #N. Es un estado transitorio |

- Si un compromiso tiene partes con estados o evidencias distintas, se divide en sub-filas (`.a`, `.b`, …). Si no, va en una sola fila.
- Lo que no tiene issue no lleva estado: va en la sección 5.

### Identificadores

| Prefijo | Origen |
| --- | --- |
| `RF01`–`RF17`, `RNF01`–`RNF09` | Tablas de requisitos de E1 Cap. I |
| `CU-GEN-nn` | Cada caso del diagrama general de casos de uso |
| `CU-01.x`, `CU-02.x` | Fichas y diagramas de los casos de uso específicos (`PRE` precondición, `FBn` paso del flujo básico, `A1`/`A2` flujos alternativos, `POST` postcondición) |
| `CU-NEG-n` | Diagrama de casos de uso de negocio |
| `MOD-xxx` | Modelos UWE: contenido, navegación, presentación, procesos y estados |
| `OBJ-n`, `DOM-nn` | Objetivos específicos y caso de estudio de E1 |
| `ARQ-nn` | Decisiones de arquitectura de E2 Cap. II |
| `DES-nn` | Decisiones de desarrollo de E3 Cap. III |

Las rutas de archivo son relativas a la raíz del repositorio. Los endpoints se escriben sin el prefijo `/api`, salvo donde hace falta.

## 3. Matriz

### 3.1 Requisitos funcionales

| ID | Compromiso | Fuente | Dónde se cumple (evidencia) | Estado | Justificación / nota |
| --- | --- | --- | --- | --- | --- |
| RF01.a | El cliente puede registrarse (API) | E1 Cap. I | `POST /api/auth/registro`; `auth.service.registrar` crea siempre `rol: CLIENTE`; `docs/http/auth.http`; PR #32 | cumplido | El registro público solo crea clientes (Guía §1, Usuarios) |
| RF01.b | Pantalla de registro | E1 Cap. I | `public/registro.html`, `public/js/paginas/registro.js`; PR #65 y #69 | cumplido | Formulario por `POST` y botón deshabilitado hasta que carga el módulo, para que la contraseña no viaje en la URL (PR #69) |
| RF02.a | Consultar disponibilidad por fecha y horario (API) | E1 Cap. I | `GET /api/disponibilidad?fecha=YYYY-MM-DD&tipo=` (`disponibilidad.routes.js`, con `autenticar`); `disponibilidad.service.test.js`; `docs/http/disponibilidad.http`; PR #58 | cumplido | Solo ofrece bloques con `0 < inicio − ahora ≤ 30 días`, la misma ventana que crear una reserva (#35, comentario del 01/11) |
| RF02.b | Pantalla de disponibilidad | E1 Cap. I | `public/cliente/catalogo.html`, `public/js/paginas/catalogo.js` (filtros de fecha y tipo, bloques libres por cancha); PR #68 | cumplido | |
| RF03.a | Crear una reserva sobre un horario disponible (API) | E1 Cap. I | `POST /api/reservas` (`reservas.routes.js`); `reservas.service.crear` valida el horario de la cancha (`obtenerDelDia`) y la ventana de 30 días; `reservas.service.test.js`; PR #53 | cumplido | Ventana `0 < inicio − ahora ≤ 30 días` (#35, comentario del 01/11) |
| RF03.b | Pantalla de reserva | E1 Cap. I | `public/cliente/reserva.html`, `public/js/paginas/reserva.js` (resumen y diálogo de confirmación); PR #68 | cumplido | Limitación ante un corte de red: ver CU-01.A1.b |
| RF04 | El cliente cancela una reserva propia | E1 Cap. I | `POST /api/reservas/:id/cancelar` y vista previa `GET /api/reservas/:id/cancelacion`, PR #64; `public/cliente/historial.html`, `public/js/paginas/historial.js`, PR #70 | cumplido | El cliente solo cancela las propias (403 `SIN_PERMISO`). La pantalla muestra los montos que devuelve la API y no los calcula |
| RF05.a | Aplicar automáticamente la penalización por no-show | E1 Cap. I | `reservas.service.barrerNoShow` y `reservas.repository.marcarNoShowVencidas`: `NO_SHOW` con `MontoPenalizado = Monto` y sin pago `REEMBOLSO`; prueba "audita como sistema y notifica a cada cliente, sin reembolso"; PR #57; `public/js/paginas/historial.js` muestra el monto penalizado y el reembolso de C$ 0.00, PR #70 | cumplido | Barrido perezoso, sin tareas programadas (Guía §1, No-show) |
| RF05.b | Aplicar automáticamente la penalización por cancelación tardía | E1 Cap. I | `reservas.service.cancelar` con `calcularCancelacion`; pruebas "menos de 24 h antes → 50 %" y "exactamente 24 h antes → 0 % de penalización y reembolso total SIM-R-<id>", PR #64; `public/js/paginas/historial.js` muestra penalización y reembolso, PR #70 | cumplido | |
| RF06.a | Simular el pago y actualizar el estado a "pagada" | E1 Cap. I | `reservas.service.crear` inserta la reserva en `PAGADA` y el cargo `SIM-C-<id>` en la misma transacción; prueba "inserta el cargo simulado por el mismo monto con referencia SIM-C-<id>"; PR #53 | modificado | No hay un paso de actualización: la reserva nace `PAGADA`, porque el pago es simulado e inmediato dentro de la transacción de creación y no existe `PENDIENTE` (Guía §1, Pago y Estados) |
| RF06.b | Mostrar el pago simulado al cliente | E1 Cap. I | Aclaración de pago simulado y diálogo en `public/cliente/reserva.html`; tabla de pagos `SIM-C-<id>` en `public/cliente/confirmacion.html`, `public/js/paginas/confirmacion.js`; PR #68 | cumplido | |
| RF07 | El cliente ve el historial de sus reservas | E1 Cap. I | `GET /api/reservas/mias`, pruebas de "listarMias", PR #63; `public/cliente/historial.html`, `public/js/paginas/historial.js`, PR #70 | cumplido | |
| RF08.a | El administrador registra y edita canchas | E1 Cap. I | `POST /api/canchas`, `PUT /api/canchas/:id`, `PATCH /api/canchas/:id/alta`, `PUT /api/tipos-cancha/:id/precio`; `canchas.service.test.js`; `docs/http/canchas.http`; PR #34 | cumplido | |
| RF08.b | Baja lógica con alerta y confirmación ("proceder de igual forma") si hay reservas activas | E1 Cap. I | `PATCH /api/canchas/:id/baja`, `canchas.service.darDeBaja`; pruebas "con reservas y … → 409 CANCHA_CON_RESERVAS con la cantidad, sin cancelar ni auditar" y "con confirmar: true cancela con la transacción y audita la cifra que devuelve cancelar"; `docs/http/canchas.http`; PR #66 | cumplido | La alerta cuenta las reservas `PAGADA`/`CONFIRMADA` futuras y en curso; con confirmación se cancelan con reembolso del 100 % (#35, comentario del 05/11). La alerta en pantalla está en RF08.c |
| RF08.c | Pantallas de canchas | E1 Cap. I | `public/admin/canchas.html`, `public/js/paginas/canchas.js`, `public/js/canchas.js` y `canchas.test.js`; PR #80; en producción con el PR #83 | cumplido | Baja en dos pasos: la segunda confirmación muestra la cantidad que informa el 409. El precio por tipo no tiene pantalla (PR #80) |
| RF09.a | El administrador define los horarios de cada cancha | E1 Cap. I | `GET` y `PUT /api/canchas/:id/horarios`; `horarios.service.test.js`, `horarios.controller.test.js`; `docs/http/horarios.http`; PR #52 | cumplido | Horario semanal por día; reemplazarlo no modifica las reservas ya hechas (#35, comentario de #14) |
| RF09.b | Pantalla de horarios | E1 Cap. I | `public/admin/horario.html`, `public/js/paginas/horario.js`, `public/js/horarios.js` y `horarios.test.js`; PR #80; en producción con el PR #83 | cumplido | La confirmación lista solo los días que cambian |
| RF10.a | El administrador ve todas las reservas, con filtros por fecha, cancha o estado (API) | E1 Cap. I | `GET /api/reservas` con `requerirRol(ROLES.ADMIN)` y filtros `desde`, `hasta`, `canchaId` y `estado`; pruebas de "listar (admin)"; `docs/http/reservas.http`; PR #63 | cumplido | |
| RF10.b | Pantalla de reservas del complejo | E1 Cap. I | `public/admin/reservas.html`, `public/js/paginas/reservas.js`, `public/js/reservas.js` y `reservas.test.js`; PR #81; en producción con el PR #83 | cumplido | Filtros de fecha, cancha y estado. Sin query, la agenda arranca en hoy |
| RF11.a | El administrador confirma una reserva (API) | E1 Cap. I | `PATCH /api/reservas/:id/confirmar` con `requerirRol(ROLES.ADMIN)`; pruebas de "confirmar" en `reservas.service.test.js`; `docs/http/reservas.http`; PR #57 | cumplido | Solo desde `PAGADA` y antes del inicio (Guía §1, Confirmar) |
| RF11.c | Pantalla para confirmar una reserva | E1 Cap. I | Botón Confirmar en `public/admin/reservas.html` (`puedeConfirmar` en `public/js/reservas.js`, con pruebas); PR #81 | cumplido | El predicado solo decide si se ofrece el botón: la regla la aplica la API |
| RF11.b | El administrador cancela manualmente una reserva (API) | E1 Cap. I | `POST /api/reservas/:id/cancelar`; prueba "el admin cancela una reserva ajena: audita con su id y notifica al dueño"; PR #64 | cumplido | Misma regla de penalización que el cliente (Guía §1, Cancelación) |
| RF11.d | Pantalla para cancelar una reserva como administrador | E1 Cap. I | Botón Cancelar en `public/admin/reservas.html`, con la vista previa de `GET /api/reservas/:id/cancelacion` y motivo opcional (`public/js/paginas/reservas.js`); PR #81 | cumplido | La pantalla muestra los montos que devuelve la API y no los calcula |
| RF12.a | Notificar al cliente: al crear la reserva | E1 Cap. I | `notificaciones.service.crear` llamado en la transacción de `reservas.service.crear` (PR #53); `GET /api/notificaciones` y `PATCH /api/notificaciones/:id/leida` (PR #33) | cumplido | Las notificaciones se guardan en una tabla y no se envían correos (Guía §1, Notificaciones) |
| RF12.b | Notificar al cliente: al confirmar, registrar asistencia y marcar no-show | E1 Cap. I | `notificaciones.service.crear` en `reservas.service` (`aplicarTransicion` y el barrido de no-show); pruebas "audita con el admin y notifica al cliente dentro de la transacción" y "audita como sistema y notifica a cada cliente, sin reembolso"; PR #57 | cumplido | |
| RF12.d | Notificar al cliente: al cancelar | E1 Cap. I | `notificaciones.service.crear` en la transacción de `reservas.service.cancelar`; prueba "audita con el motivo recortado y notifica al cliente en la misma transacción"; PR #64 | cumplido | |
| RF12.c | Pantalla de notificaciones | E1 Cap. I | `public/cliente/notificaciones.html`, `public/js/paginas/notificaciones.js`; indicador de no leídas (`mostrarNoLeidas` en `public/js/sesion.js`, con pruebas en `sesion.test.js`); PR #71 | cumplido | `GET /notificaciones` no corre el barrido de no-show: esa notificación aparece después de que otra pantalla lo ejecute (PR #71, Pendientes) |
| RF13.a | Auditar los cambios de cada reserva: creación | E1 Cap. I | `auditoria.service.registrar` con `CREAR` en la transacción de creación; prueba "audita y notifica dentro de la misma transacción"; PR #53 | cumplido | |
| RF13.b | Auditar los cambios de cada reserva: confirmar, asistencia y no-show | E1 Cap. I | `auditoria.service.registrar` con `CONFIRMAR`, `REGISTRAR_ASISTENCIA` y `MARCAR_NO_SHOW` en `reservas.service`; las mismas pruebas de RF12.b; PR #57 | cumplido | El no-show se audita con `usuarioId = NULL` (Guía §1, No-show) |
| RF13.f | Auditar los cambios de cada reserva: cancelar | E1 Cap. I | `auditoria.service.registrar` con `CANCELAR` en la transacción de `reservas.service.cancelar`; prueba "audita con el motivo recortado y notifica al cliente en la misma transacción"; PR #64 | cumplido | |
| RF13.c | Auditar los cambios de cada cancha: creación, edición, alta y horario | E1 Cap. I | `canchas.service` (`CREAR`, `EDITAR`, `ALTA`), PR #34; `horarios.service` (`CAMBIAR_HORARIO`), PR #52 | cumplido | `CAMBIAR_HORARIO` se agregó en #35 (comentario de #14) |
| RF13.d | Auditar los cambios de cada cancha: baja | E1 Cap. I | `auditoria.service.registrar` con `BAJA` en `canchas.service.darDeBaja`; prueba "sin reservas: desactiva primero, cuenta con la transacción y audita BAJA"; PR #66 | cumplido | |
| RF13.e | Consultar la auditoría (API) | E1 Cap. I | `GET /api/auditoria` (ADMIN), `auditoria.service.test.js`, PR #33 | cumplido | El recorte de la vista en el frontend no se aplicó: ver RF13.g y la sección 7 |
| RF13.g | Pantalla de auditoría | E1 Cap. I | `public/admin/auditoria.html`, `public/js/paginas/auditoria.js`, `public/js/auditoria.js` y `auditoria.test.js`; PR #73 | cumplido | La API no pagina (#35, decisiones de #19). Observación de #33: `?entidadId` sin `entidad` mezcla registros de entidades distintas con el mismo id y la API no responde 400; la pantalla no lo impide ("Todas" más un id). No se implementa, porque cada tarjeta nombra su entidad (recorte 2, sección 7) |
| RF14.a | Solo el rol Administrador accede a la administración (API) | E1 Cap. I | `src/middlewares/requerirRol.js` y `requerirRol.test.js`; rutas de administración con `requerirRol(ROLES.ADMIN)`; `autenticar` lee el rol de la base (`auth.service.usuarioDelToken`); PR #32 | cumplido | |
| RF14.b | Menú y acceso por rol en el frontend | E1 Cap. I | `MENUS` y `exigirRol` en `public/js/sesion.js`, que lee el rol de `GET /api/auth/yo`; pruebas "con el rol correcto arma solo el menú de ese rol y muestra la página" y "con otro rol va al inicio del rol real y no muestra la página"; PR #65 | cumplido | |
| RF15.a | Iniciar sesión con credenciales (API) | E1 Cap. I | `POST /api/auth/login`, `GET /api/auth/yo`; `docs/http/auth.http`; PR #32 | cumplido | |
| RF15.b | Pantalla de inicio de sesión | E1 Cap. I | `public/login.html`, `public/js/paginas/login.js`; PR #65 y #69 | cumplido | Formulario por `POST` y botón deshabilitado hasta que carga el módulo, para que la contraseña no viaje en la URL (PR #69) |
| RF16 | Cerrar sesión desde el menú principal del rol | E1 Cap. I | `cerrarSesion` en `public/js/sesion.js`, botón en el menú de cada rol; prueba "cerrarSesion borra todo y va al login"; PR #65 | cumplido | Con JWT el cierre de sesión consiste en que el frontend descarta el token (contrato técnico, Autenticación; #35 dec. 3) |
| RF17.a | El administrador gestiona usuarios (API) | E1 Cap. I | `GET /api/usuarios`, `PATCH /api/usuarios/:id`; `usuarios.service.test.js`; `docs/http/usuarios.http`; PR #51 | cumplido | Auditoría `CAMBIAR_ROL`/`ACTIVAR`/`DESACTIVAR` (#35 dec. 8) |
| RF17.b | Pantalla de usuarios | E1 Cap. I | `public/admin/usuarios.html`, `public/js/paginas/usuarios.js`, `public/js/usuarios.js` y `usuarios.test.js`; PR #72 | cumplido | Cambiar el rol y activar o desactivar piden confirmación (#35 dec. 2) |

### 3.2 Requisitos no funcionales

| ID | Compromiso | Fuente | Dónde se cumple (evidencia) | Estado | Justificación / nota |
| --- | --- | --- | --- | --- | --- |
| RNF01 | Interfaz clara y usable sin capacitación | E1 Cap. I | `docs/guion-demo.md`: recorrido completo por las pantallas y registro de ejecución contra producción (sección 8). Corrida 1 (06/11/2026): siete pasos omitidos (8, 9, 19, 20, 24, 38 y 39) y el resto sin errores. Corrida complementaria (11/11/2026): esos siete pasos, sin errores; PR #74, #88 y #91 | cumplido | Sin prueba con personas externas (recorte 3, sección 7) |
| RNF02 | Contraseñas guardadas con hash | E1 Cap. I | `auth.service.registrar` usa `bcrypt.hash`; columna `Usuario.PasswordHash` (`001_esquema.sql`); PR #32 | cumplido | |
| RNF03.a | Acceso restringido según el rol (API) | E1 Cap. I | Igual que RF14.a; `autenticar` rechaza a los usuarios inactivos | cumplido | |
| RNF03.b | Acceso restringido según el rol (frontend) | E1 Cap. I | Igual que RF14.b | cumplido | |
| RNF04 | Disponibilidad en menos de 3 s bajo uso normal | E1 Cap. I | `scripts/medir-disponibilidad.js` (PR #61) contra producción (`https://reservas-zacarias-guerra.onrender.com`, `main` en `fe9cf37`), 05/11/2026 23:00: 75 consultas, 0 con error; mínimo 353 ms, promedio 369 ms, mediana 363 ms, p95 395 ms, máximo 544 ms | cumplido | Diseño sin N+1, con tres consultas en total (PR #58). El arranque en frío de Render y Azure SQL queda fuera del criterio y se informa aparte (803 ms en esta corrida, con el servicio ya despierto) |
| RNF05.a | Frontend responsive: pantallas integradas | E1 Cap. I | `public/css/estilos.css` (una columna de base, dos desde 48rem; áreas táctiles de 44 px); revisión visual declarada en los PR #65, #68 y #70 a #73 | cumplido | Las pantallas de #40 se probaron también en un celular real (PR #65); las de #43, solo con emulación a 360 px (PR #68). Los PR #70 a #73 declaran revisión a 320 o 360 px y no mencionan un celular real |
| RNF05.b | Frontend responsive: pantallas de canchas, horarios y reservas | E1 Cap. I | `public/css/estilos.css`; sin desborde horizontal a 320, 360 y 1280 px, declarado en los PR #80 y #81 | cumplido | Revisión con Chromium y API simulada; los PR no mencionan un celular real |
| RNF06.a | Backend organizado en capas separadas | E1 Cap. I | `src/modules/<modulo>/` con `routes`, `controller`, `service` y `repository`; `src/routes.js` | cumplido | |
| RNF06.b | Frontend organizado en capas separadas | E1 Cap. I | `public/js/api.js` (llamadas a la API), `public/js/sesion.js` (token, acceso por rol y menú) y un script por página en `public/js/paginas/`; PR #65 | cumplido | `js/api.js`, `js/sesion.js` y un script por página (#35 dec. 1) |
| RNF07 | Desplegado en un entorno público para la defensa | E1 Cap. I | https://reservas-zacarias-guerra.onrender.com; job `Despliegue` en `.github/workflows/ci.yml`; `db/produccion/usuario-app.sql`; PR #67, #75, #83 y #86; comentario de cierre de #39 | cumplido | Render y Azure SQL Database (#35 dec. 4 y 5). `main` está en `81bca1b` (PR #86), con todas las pantallas (PR #83) |
| RNF08 | Agregar canchas o modalidades sin rediseño | E1 Cap. I | Tabla `TipoCancha` y `Cancha.TipoCanchaId` (`001_esquema.sql`, PR #30); `GET /api/tipos-cancha` y alta de canchas (PR #34) | cumplido | La disponibilidad hace tres consultas en total, sin N+1 (`disponibilidad.service.consultar`, PR #58) |
| RNF09.a | Dos reservas simultáneas no ocupan el mismo horario | E1 Cap. I | Índice `UX_Reserva_SlotActivo` (`002_indices.sql`, PR #30); `SELECT … WITH (UPDLOCK, HOLDLOCK)` en `reservas.repository.js` y traducción de 2601/2627 a `HORARIO_OCUPADO` en `reservas.service.js`; pruebas de "crear: transacción"; PR #53 | cumplido | |
| RNF09.b | Prueba de 10 solicitudes simultáneas | E1 Cap. I | `scripts/concurrencia-reservas.js`: 10 `POST /api/reservas` simultáneos, 1 × 201 y 9 × 409 `HORARIO_OCUPADO` en cada ronda, con verificación en la base; PR #56. Corrida complementaria del 11/11/2026 (`docs/guion-demo.md`, sección 8, paso 39): 5 rondas, 1 × 201 y 9 × 409 en cada una; PR #91 | cumplido | Requiere base local: no corre en `npm test` ni en CI |

### 3.3 Casos de uso

#### Diagrama general

| ID | Caso de uso | Fuente | Dónde se cumple (evidencia) | Estado | Justificación / nota |
| --- | --- | --- | --- | --- | --- |
| CU-GEN-01.a | Consultar disponibilidad (API) | E1 Cap. I | Ver RF02.a | cumplido | |
| CU-GEN-01.b | Consultar disponibilidad (pantalla) | E1 Cap. I | Ver RF02.b | cumplido | |
| CU-GEN-02.a | Reservar cancha (API) | E1 Cap. I | Ver RF03.a | cumplido | |
| CU-GEN-02.b | Reservar cancha (pantalla) | E1 Cap. I | Ver RF03.b | cumplido | |
| CU-GEN-03 | Simular pago, como `<<extend>>` (opcional) de Reservar cancha | E1 Cap. I | Ver RF06.a | modificado | El pago es obligatorio e inmediato: es `<<include>>`, como ya dicen la ficha y el diagrama de CU-01 (Guía §1, Pago). Corrección del diagrama en la sección 4 |
| CU-GEN-04.a | Iniciar sesión (API) | E1 Cap. I | Ver RF15.a | cumplido | |
| CU-GEN-04.b | Iniciar sesión (pantalla) | E1 Cap. I | Ver RF15.b | cumplido | |
| CU-GEN-05 | Cerrar sesión | E1 Cap. I | Ver RF16 | cumplido | |
| CU-GEN-06 | Ver historial de reservas | E1 Cap. I | Ver RF07 | cumplido | |
| CU-GEN-07.a | Registrar usuario (API) | E1 Cap. I | Ver RF01.a | cumplido | El diagrama asocia este caso también al Administrador; el registro público solo crea clientes (Guía §1). Corrección en la sección 4 |
| CU-GEN-07.b | Registrar usuario (pantalla) | E1 Cap. I | Ver RF01.b | cumplido | |
| CU-GEN-08.a | Gestionar usuarios (API) | E1 Cap. I | Ver RF17.a | cumplido | |
| CU-GEN-08.b | Gestionar usuarios (pantalla) | E1 Cap. I | Ver RF17.b | cumplido | |
| CU-GEN-09.a | Cancelar reserva (cliente y administrador), extiende Ver historial: API y pantalla del cliente | E1 Cap. I | Ver RF04 y RF11.b | cumplido | |
| CU-GEN-09.b | Cancelar reserva: pantalla del administrador | E1 Cap. I | Ver RF11.d | cumplido | |
| CU-GEN-10.a | Confirmar reserva (API) | E1 Cap. I | `PATCH /api/reservas/:id/confirmar`; PR #57 (ver RF11.a) | cumplido | |
| CU-GEN-10.b | Confirmar reserva (pantalla) | E1 Cap. I | Ver RF11.c | cumplido | |
| CU-GEN-11.a | Notificar cliente: al crear | E1 Cap. I | Ver RF12.a | cumplido | En el diagrama lo incluyen Reservar, Confirmar, Cancelar, Registrar asistencia y Marcar no-show |
| CU-GEN-11.b | Notificar cliente: al confirmar | E1 Cap. I | Ver RF12.b | cumplido | |
| CU-GEN-11.c | Notificar cliente: al cancelar, y su pantalla | E1 Cap. I | Ver RF12.d y RF12.c | cumplido | |
| CU-GEN-12.a | Gestionar canchas: registrar, editar y alta | E1 Cap. I | Ver RF08.a | cumplido | |
| CU-GEN-12.b | Gestionar canchas: baja | E1 Cap. I | Ver RF08.b | cumplido | |
| CU-GEN-12.c | Gestionar canchas: pantallas | E1 Cap. I | Ver RF08.c | cumplido | |
| CU-GEN-13.a | Definir horarios (API) | E1 Cap. I | Ver RF09.a | cumplido | |
| CU-GEN-13.b | Definir horarios (pantalla) | E1 Cap. I | Ver RF09.b | cumplido | |
| CU-GEN-14.a | Ver reservas del complejo (API) | E1 Cap. I | Ver RF10.a | cumplido | |
| CU-GEN-14.b | Ver reservas del complejo (pantalla) | E1 Cap. I | Ver RF10.b | cumplido | |

#### CU-01: Reservar cancha

| ID | Compromiso | Fuente | Dónde se cumple (evidencia) | Estado | Justificación / nota |
| --- | --- | --- | --- | --- | --- |
| CU-01.PRE1 | Solo un cliente con sesión iniciada reserva | E1 Cap. I | `POST /api/reservas` con `autenticar` y `requerirRol(ROLES.CLIENTE)`; PR #53 | cumplido | |
| CU-01.PRE2 | Solo se reservan canchas dadas de alta | E1 Cap. I | `canchas.service.obtenerActiva` responde 404 para una cancha inactiva; prueba "cancha inexistente o de baja → propaga NO_ENCONTRADO sin consultar Reserva"; PR #53 | cumplido | |
| CU-01.INC1.a | Incluye Consultar disponibilidad (obligatorio); paso FB2: la API ofrece la consulta | E1 Cap. I | Ver RF02.a | cumplido | |
| CU-01.INC1.b | Incluye Consultar disponibilidad (obligatorio); paso FB2: el flujo de reservar pasa por ella (pantalla) | E1 Cap. I | Bloques de `GET /api/disponibilidad` enlazados con `public/js/bloques.js`; `public/js/paginas/reserva.js` vuelve a consultar antes de ofrecer el bloque; PR #68 | cumplido | |
| CU-01.INC2 | Incluye Simular pago (obligatorio) | E1 Cap. I | Ver RF06.a | cumplido | El texto del punto de extensión lo contradice (CU-01.EXT) |
| CU-01.EXT | Punto de extensión: Simular pago solo "si el Cliente elige pagar en línea" | E1 Cap. I | Ver RF06.a | modificado | El pago es simulado, inmediato y siempre ocurre (Guía §1, Pago) |
| CU-01.FB4 | El sistema registra la reserva con estado "Reservado" | E1 Cap. I | `INSERT` con `Estado = PAGADA`; `CK_Reserva_Estado` en `001_esquema.sql`; prueba "inserta la reserva PAGADA…"; PR #53 | modificado | El estado inicial es `PAGADA`; no existen "Reservado" ni `PENDIENTE` (Guía §1, Estados) |
| CU-01.FB5.a | Se confirma la reserva al cliente (API) | E1 Cap. I | Respuesta 201 con la reserva y sus pagos; prueba "responde la reserva con sus pagos y fechas locales"; PR #53 | cumplido | |
| CU-01.FB5.b | Pantalla de confirmación | E1 Cap. I | `public/cliente/confirmacion.html`, `public/js/paginas/confirmacion.js`; PR #68 | cumplido | Con enlaces al catálogo y al historial |
| CU-01.A1.a | Sin disponibilidad: el sistema lo detecta | E1 Cap. I | 409 `HORARIO_OCUPADO`; prueba "bloque ocupado → 409 HORARIO_OCUPADO…"; PR #53 | cumplido | |
| CU-01.A1.b | Sin disponibilidad: se ofrecen horarios alternativos o se cancela la operación | E1 Cap. I | `public/js/paginas/reserva.js`: con `HORARIO_OCUPADO` vuelve a consultar y muestra los bloques libres de esa cancha ese día; "Volver al catálogo" desiste; PR #68 | cumplido | Si el `POST` se guarda pero la respuesta se pierde por un corte de red, reintentar da 409 y muestra alternativas aunque la reserva ya sea del cliente; no hay doble cobro (`UX_Reserva_SlotActivo`) y la reserva aparece en el historial. El caso sin ninguna alternativa ese día no se probó (PR #68, Pendientes) |
| CU-01.A2 | Sesión expirada: redirigir a Iniciar sesión y retomar el flujo | E1 Cap. I | `expirarSesion` y `consumirRetorno` en `public/js/sesion.js`, y `public/js/api.js`; pruebas "un 401 autenticado expira la sesión, guarda el retorno y va al login" y "consumirRetorno conserva la query del retorno"; PR #65 | cumplido | Enlaces A7 y A8 de `docs/modelos/navegacion.md` |
| CU-01.POST | La cancha deja de figurar como disponible en ese horario | E1 Cap. I | `reservas.service.ocupadosEnRango` (`Activa = 1`) usado por `disponibilidad.service.consultar`; prueba "quita el bloque ocupado solo en su cancha"; PR #58 | cumplido | |

#### CU-02: Cancelar reserva

| ID | Compromiso | Fuente | Dónde se cumple (evidencia) | Estado | Justificación / nota |
| --- | --- | --- | --- | --- | --- |
| CU-02.PRE | Sesión iniciada y reserva activa del cliente | E1 Cap. I | `POST /api/reservas/:id/cancelar` con `autenticar`; `verificarCancelable` en `reservas.service`: 403 con una reserva ajena y 409 si no está activa; PR #64 | cumplido | |
| CU-02.EXT | Extiende Ver historial (FB1: se cancela desde el historial) | E1 Cap. I | Botón Cancelar en `public/cliente/historial.html` (`esCancelable` en `public/js/reservas.js`); PR #63 y #70 | cumplido | |
| CU-02.FB2-4 | Calcular la anticipación: ≥ 24 h → 0 % y reembolso del 100 %; < 24 h → 50 % y reembolso del 50 % | E1 Cap. I | `reservas.service.cancelar` con `calcularCancelacion`; pruebas "exactamente 24 h antes → 0 % de penalización y reembolso total SIM-R-<id>" y "guarda la mitad como penalización e inserta el reembolso SIM-R-<id>"; PR #64 | cumplido | Exactamente 24 h cuenta como 0 % (Guía §1, Cancelación) |
| CU-02.FB5 | Estado "cancelada" y el horario queda libre | E1 Cap. I | `Estado = CANCELADA` y `Activa = 0` en el mismo `UPDATE` (`reservas.repository.js`); `CK_Reserva_Activa` y `UX_Reserva_SlotActivo`; PR #64 | cumplido | |
| CU-02.FB6 | Incluye Registrar auditoría | E1 Cap. I | Ver RF13.f | cumplido | |
| CU-02.FB7 | Incluye Notificar cliente | E1 Cap. I | Ver RF12.d | cumplido | |
| CU-02.A1 | No-show automático con el 100 % de penalización | E1 Cap. I | `reservas.service.barrerNoShow` al inicio de disponibilidad, asistencia, cancelar y las consultas de reservas; pruebas de "barrerNoShow"; PR #57, #58, #63 y #64 | cumplido | Barrido perezoso sin tareas programadas (Guía §1, No-show) |
| CU-02.A2.a | El administrador cancela en nombre del cliente, con su usuario en la auditoría (API) | E1 Cap. I | Ver RF11.b | cumplido | |
| CU-02.A2.b | El administrador cancela en nombre del cliente (pantalla) | E1 Cap. I | Ver RF11.d | cumplido | |
| CU-02.POST | Estado final, horario liberado y auditoría con motivo, monto penalizado y responsable | E1 Cap. I | `reservas.service.cancelar`: estado `CANCELADA`, `Activa = 0`, `MontoPenalizado` y auditoría `CANCELAR` con el usuario y un motivo con porcentaje y montos; prueba "con el monto máximo de DECIMAL(10,2) y un motivo de 150 caracteres, el motivo auditado cabe en 250"; PR #64 | cumplido | En un no-show (PR #57) quedan el estado final y `MontoPenalizado`, pero la auditoría no tiene responsable ni motivo y el bloque conserva `Activa = 1`; la postcondición describe la cancelación |

#### Casos de uso de negocio

| ID | Caso de uso | Fuente | Dónde se cumple (evidencia) | Estado | Justificación / nota |
| --- | --- | --- | --- | --- | --- |
| CU-NEG-1.a | Reservar y cobrar cancha (RF03, RF06, RF15) | E1 Cap. I | Ver RF03.a, RF06.a y RF15.a | cumplido | Con la modificación de RF06.a |
| CU-NEG-1.b | Reservar y cobrar cancha: disponibilidad (RF02) | E1 Cap. I | Ver RF02.a | cumplido | |
| CU-NEG-1.c | Reservar y cobrar cancha: pantallas | E1 Cap. I | Ver RF02.b, RF03.b y RF06.b | cumplido | |
| CU-NEG-2.a | Cancelar y penalizar reserva: penalización por no-show (RF05) | E1 Cap. I | Ver RF05.a | cumplido | |
| CU-NEG-2.b | Cancelar y penalizar reserva: cancelación y su penalización (RF04, RF05) | E1 Cap. I | Ver RF04 y RF05.b | cumplido | |
| CU-NEG-3.a | Gestionar disponibilidad de canchas: canchas y horarios (RF08, RF09) | E1 Cap. I | Ver RF08.a y RF09.a | cumplido | |
| CU-NEG-3.b | Gestionar disponibilidad de canchas: baja | E1 Cap. I | Ver RF08.b | cumplido | |
| CU-NEG-3.c | Gestionar disponibilidad de canchas: pantallas | E1 Cap. I | Ver RF08.c y RF09.b | cumplido | |

### 3.4 Modelos UWE

La columna "Corrección" remite a la sección 4: 4.1 son correcciones y 4.2 son ampliaciones.

| ID | Compromiso | Fuente | Dónde se cumple (evidencia) | Estado | Corrección | Justificación / nota |
| --- | --- | --- | --- | --- | --- | --- |
| MOD-CU-GEN | Diagrama general de casos de uso | E1 Cap. I | `docs/modelos/casos-de-uso.md` (sección 1), `casos-de-uso.puml` e `img/casos-de-uso.png` | cumplido | 4.1 y 4.2 | Con las correcciones de 4.1 y las ampliaciones 1 a 4 de 4.2 (#35, comentario del 12/11) |
| MOD-CU-01 | Ficha y diagrama de CU-01 | E1 Cap. I | `docs/modelos/casos-de-uso.md` (sección 2, con la ficha), `cu-01-reservar-cancha.puml` e `img/cu-01-reservar-cancha.png` | cumplido | 4.1 | |
| MOD-CU-02 | Ficha y diagrama de CU-02 | E1 Cap. I | `docs/modelos/casos-de-uso.md` (sección 3), `cu-02-cancelar-reserva.puml` e `img/cu-02-cancelar-reserva.png` | cumplido | 4.1 | La ficha no cambia |
| MOD-CON.a | Contenido: Usuario abstracto con Cliente y Administrador como subclases | E1 Cap. I | Tabla única `Usuario` con `Rol` (`CK_Usuario_Rol`) y `Telefono`; PR #30 | modificado | 4.1 | Herencia en una sola tabla (Guía §1, Usuarios). `Administrador.cargo` no figura en el esquema acordado (contrato técnico, Esquema) |
| MOD-CON.b | Contenido: Cancha con `modalidad`, `precioPorHora` y `estado` | E1 Cap. I | Tablas `TipoCancha` (código, precio) y `Cancha` (`TipoCanchaId`, `Activa`); PR #30 | modificado | 4.1 | El precio depende del tipo de cancha y se copia en la reserva (Guía §1, Precio) |
| MOD-CON.c | Contenido: Horario con `fecha`, `horaInicio`, `horaFin` y `disponible` | E1 Cap. I | `Horario(CanchaId, DiaSemana, HoraApertura, HoraCierre)`; PR #30 y #52 | modificado | 4.1 | Apertura y cierre por día de la semana; los bloques de 1 h se calculan (Guía §1, Bloques horarios). La disponibilidad no se guarda |
| MOD-CON.d | Contenido: Reserva "asignada a" Horario, con `montoTotal` y `penalizacionAplicada` | E1 Cap. I | `Reserva(ClienteId, CanchaId, Inicio, Monto, Estado, Activa, MontoPenalizado)`; PR #30 | modificado | 4.1 | La reserva apunta a la cancha y a la hora de inicio (contrato técnico, Esquema) |
| MOD-CON.e | Contenido: sin `Pago`, `Auditoria` ni `Notificacion` | E1 Cap. I | Tablas `Pago`, `Auditoria` y `Notificacion` (`001_esquema.sql`); PR #30 | modificado | 4.1 | Las exigen el pago simulado, RF13 y RF12 (Guía §1, Pago y Notificaciones; contrato técnico, Esquema) |
| MOD-CON.f | Contenido: métodos en las entidades (`simularPago()`, `cancelar()`, …) | E1 Cap. I | Lógica en los services de cada módulo (`src/modules/*/…service.js`) | modificado | 4.1 | Las reglas viven en la capa de servicio (contrato técnico, Estructura) |
| MOD-EST.a | Flujo de estados de la reserva (objetivo específico 3) | E1 objetivos e introducción | `ESTADOS` (`src/shared/constantes.js`); `CK_Reserva_Estado`; tabla de transiciones en `src/modules/reservas/reglas.js` con `reglas.test.js`; PR #29 y #30 | modificado | 4.1 | Estados `PAGADA`, `CONFIRMADA`, `COMPLETADA`, `CANCELADA` y `NO_SHOW`; sin "pendiente" (Guía §1, Estados) |
| MOD-EST.b | Diagrama de estados de la reserva | E1 objetivos | `docs/modelos/estados-reserva.md` (Mermaid) e `img/estados-reserva.png`; PR #92 | cumplido | 4.1 | El modelo de procesos entregado no lo tenía. Sale de la tabla de transiciones de `reglas.js` |
| MOD-NAV.a | Navegación: nodos N1 a N7 y enlaces E1 a E8 y E10 a E12 de E1 (Login, Registro, Catálogo «menu», Detalle y reserva, Historial, Confirmación, Panel administrador «menu») | E1 Cap. I | Tabla de nodos y rutas de `public/README.md`; `public/login.html`, `public/registro.html`, `public/cliente/`, `public/admin/panel.html`; PR #65, #68 y #70 | cumplido | | Una página por nodo (#35 dec. 1) |
| MOD-NAV.b | Navegación: nodo N8 Gestionar canchas y enlace E9 | E1 Cap. I | `public/admin/canchas.html`; opción Canchas de `MENUS` en `public/js/sesion.js`; PR #80 | cumplido | | Ver RF08.c |
| MOD-NAV.c | Ampliación del modelo navegacional documentada: 13 nodos y 20 enlaces (N9 a N13 y A1 a A8) | #35 dec. 1 y 2 | `docs/modelos/navegacion.md` (tablas de nodos y enlaces); PR #60 | cumplido | | |
| MOD-NAV.d | Ampliación integrada: nodos N11, N12 y N13; enlaces A1, A3, A4, A7 y A8 | #35 dec. 1 y 2 | `public/admin/usuarios.html`, PR #72; `public/admin/auditoria.html`, PR #73; `public/cliente/notificaciones.html`, PR #71; A7 y A8 en `public/js/sesion.js`, PR #65 | cumplido | | Ver RF17.b, RF13.g, RF12.c y CU-01.A2 |
| MOD-NAV.e | Ampliación integrada: nodos N9 y N10; enlaces A2, A5 y A6 | #35 dec. 1 y 2 | `public/admin/horario.html`, PR #80; `public/admin/reservas.html`, PR #81; A2 en `MENUS` (`public/js/sesion.js`); A5 en `public/js/paginas/canchas.js` y A6 en `public/admin/horario.html`, PR #80 | cumplido | | N10 incluye registrar asistencia (#42). Ver RF09.b y RF10.b |
| MOD-NAV.f | Diagrama del modelo navegacional | #35 dec. 1 y 2 | `docs/modelos/navegacion.md` (sección 5), `navegacion.puml` e `img/navegacion.png` | cumplido | | |
| MOD-PRE-1 | Presentación: catálogo con filtros de fecha y modalidad, estado y precio por cancha | E1 Cap. I | `public/cliente/catalogo.html`, `public/js/paginas/catalogo.js`: filtros de fecha y tipo, tipo y precio por cancha, bloques libres; PR #68 | modificado | | No hay un "estado" por cancha: se muestran sus bloques libres o "Sin horarios libres", porque la disponibilidad se calcula por bloque (Guía §1, Bloques horarios). Los precios del dibujo (C$ 500 y C$ 800) son ilustrativos; los reales salen de `TipoCancha` |
| MOD-PRE-2.a | Presentación: confirmar reserva con pago simulado | E1 Cap. I | `public/cliente/reserva.html`: aclaración de pago simulado y diálogo "Pagar y reservar"; PR #68 | cumplido | | El aviso de la regla de penalización al confirmar está en MOD-PRE-2.b |
| MOD-PRE-2.b | Presentación: aviso de la regla de penalización al confirmar la reserva | E1 Cap. I | — | omitido | | No se agrega a `public/cliente/reserva.html` ni a `confirmacion.html`. La regla se muestra al cancelar, en `public/cliente/historial.html`, con el porcentaje y el monto de la vista previa de la API (RF04). Lo confirma el responsable en la revisión de #49 |
| MOD-PRO-EST.a | Estructura del proceso: CrearReserva «processClass» | E1 Cap. I | `reservas.service.crear`; PR #53 | cumplido | 4.2 | |
| MOD-PRO-EST.b | Estructura del proceso: ConsultarDisponibilidad «query» | E1 Cap. I | `disponibilidad.service.consultar`; PR #58 | cumplido | 4.2 | |
| MOD-PRO-EST.c | Estructura del proceso: CancelarReserva «processClass» | E1 Cap. I | `reservas.service.cancelar`; PR #64 | cumplido | 4.2 | |
| MOD-PRO-F1.a | Flujo de reservar: "¿Horario aún libre?", simular pago, registrar "pagada" y notificar | E1 Cap. I | `reservas.service.crear`: bloqueo del bloque, cargo `SIM-C`, estado `PAGADA`, auditoría y notificación en una transacción; PR #53 | cumplido | 4.2 | |
| MOD-PRO-F1.b | Flujo de reservar: ver los horarios libres de una fecha | E1 Cap. I | Ver RF02.a | cumplido | | |
| MOD-PRO-F1.c | Flujo de reservar: elegir fecha y volver a los horarios libres si el bloque se ocupó | E1 Cap. I | Filtro de fecha en `public/cliente/catalogo.html`; `public/js/paginas/reserva.js` vuelve a consultar los bloques libres con `HORARIO_OCUPADO`; PR #68 | cumplido | | |
| MOD-PRO-F2.a | Flujo de baja de cancha: verificar reservas, alerta, "¿proceder de igual forma?", cancelar reservas notificando, actualizar estado y auditar (API) | E1 Cap. I | `canchas.service.darDeBaja` y `reservas.service.cancelarPorBajaDeCancha`, en una transacción; pruebas de "darDeBaja" y "cancelarPorBajaDeCancha"; PR #66 | cumplido | 4.1 | |
| MOD-PRO-F2.b | Flujo de baja de cancha: alerta y confirmación en pantalla | E1 Cap. I | Segunda confirmación ante `CANCHA_CON_RESERVAS` en `public/js/paginas/canchas.js`, con los textos de `public/js/canchas.js` y `canchas.test.js`; PR #80 | cumplido | | La cantidad se lee del mensaje del 409; si el texto cambia, la confirmación sale sin cifra (PR #80) |

### 3.5 Objetivos y caso de estudio

| ID | Compromiso | Fuente | Dónde se cumple (evidencia) | Estado | Justificación / nota |
| --- | --- | --- | --- | --- | --- |
| OBJ-1 | Modelar los requisitos con casos de uso y modelo de contenido | E1 objetivos | `docs/modelos/casos-de-uso.md` y `docs/modelos/contenido.md` (PR #92) | cumplido | Los modelos de E1, corregidos según la sección 4.1 |
| OBJ-2.a | Modelo navegacional diferenciado por rol | E1 objetivos | `docs/modelos/navegacion.md`, PR #60; pantallas integradas por rol (ver MOD-NAV.a y MOD-NAV.d) | cumplido | El modelo de presentación está en OBJ-2.b. El diagrama está en MOD-NAV.f |
| OBJ-2.b | Modelo de presentación de las demás pantallas | E1 objetivos; #35 dec. 2 | — | omitido | El modelo de presentación solo tiene catálogo y confirmar reserva (MOD-PRE-1 y MOD-PRE-2.a), y no se completa porque no da el tiempo (decisión del responsable, #35, comentario del 11/11). Las pantallas siguen el modelo navegacional (MOD-NAV) y se recorren en `docs/guion-demo.md` |
| OBJ-3 | Modelo de procesos con el flujo de estados y la penalización | E1 objetivos | `docs/modelos/estados-reserva.md` (PR #92), con la penalización de cada transición; `docs/modelos/flujo-baja-cancha.md` | cumplido | Ver MOD-EST y MOD-PRO |
| OBJ-4 | Seleccionar una arquitectura backend/frontend | E1 objetivos | E2 Cap. II, aplicada en `src/` (ARQ-01 a ARQ-03) | cumplido | |
| OBJ-5.a | Backend: reservas y pagos (creación) | E1 objetivos | PR #53 | cumplido | |
| OBJ-5.b | Backend: disponibilidad y no-show | E1 objetivos | PR #57 y #58 | cumplido | |
| OBJ-5.c | Backend: cancelación, consultas y baja de cancha | E1 objetivos | PR #64, #63 y #66 | cumplido | |
| OBJ-6.a | Frontend con interfaces diferenciadas por rol: base, cliente, usuarios y auditoría | E1 objetivos | `MENUS` en `public/js/sesion.js`; `public/cliente/` y `public/admin/`; PR #65, #68, #70, #71, #72 y #73 | cumplido | |
| OBJ-6.b | Frontend por rol: canchas, horarios y reservas del administrador | E1 objetivos | Ver RF08.c, RF09.b y RF10.b; PR #80, #81 y #83 | cumplido | |
| OBJ-7.a | Desplegar en un entorno accesible | E1 objetivos | Ver RNF07 | cumplido | |
| OBJ-7.b | Documentar el despliegue y el control de versiones | E1 objetivos | `docs/despliegue.md`; PR #82 (`Closes #50`) | cumplido | El rollback con la imagen de GHCR no está probado (PR #82, Pendientes) |
| DOM-01 | 7 canchas: 5 de fútbol sala y 2 de fútbol campo | E1 caso de estudio | `scripts/seed.js` (Sala 1–5 y Campo 1–2, tipos `SALA` y `CAMPO`); PR #30 | cumplido | |
| DOM-02 | Dos roles: cliente y administrador | E1 Cap. I | `CK_Usuario_Rol`; `ROLES` en `src/shared/constantes.js`; PR #30 | cumplido | |
| DOM-03.a | Penalización del 100 % por no-show | E1 caso de estudio y supuesto | Ver RF05.a | cumplido | |
| DOM-03.b | Penalización del 50 % por cancelar con menos de 24 h | E1 caso de estudio y supuesto | Ver RF05.b | cumplido | |
| DOM-04 | Estados de la reserva: pendiente, confirmada, pagada, completada, cancelada | E1 introducción | Igual que MOD-EST.a | modificado | Sin "pendiente" porque el pago es inmediato; se agrega `NO_SHOW` (Guía §1, Estados) |

### 3.6 Decisiones de arquitectura (E2 Cap. II)

| ID | Compromiso | Fuente | Dónde se cumple (evidencia) | Estado | Justificación / nota |
| --- | --- | --- | --- | --- | --- |
| ARQ-01 | Cliente-servidor con una API central (sin peer-to-peer) | E2 Cap. II | `src/app.js` monta la API bajo `/api` (`src/routes.js`) | cumplido | |
| ARQ-02 | Monolito: un proceso, un código y una base de datos (fase 1 de la migración) | E2 Cap. II | `src/server.js` único; una base (`src/config/db.js`); un `package.json` | cumplido | Las fases 2 a 4 están en la sección 6 |
| ARQ-03.a | Capa de lógica de negocio con Node.js y Express | E2 Cap. II | `src/modules/*/…service.js`; `package.json` (`express`) | cumplido | |
| ARQ-03.b | Capa de acceso a datos: "SQL Server mediante driver/ORM parametrizado" | E2 Cap. II | `mssql` con SQL escrito a mano y `request.input(...)` en cada `…repository.js` | modificado | SQL escrito a mano, sin ORM (contrato técnico, Stack); los bloqueos de RNF09 se expresan directamente en el SQL (contrato técnico, Esquema) |
| ARQ-03.c | Capa de presentación con HTML, CSS y JS | E2 Cap. II | `public/`, servido por `express.static` en `src/app.js`; PR #65 | cumplido | Sin framework, en `public/` (#35 dec. 1) |
| ARQ-04 | Dominio de seis entidades principales (Usuario, Cliente, Administrador, Cancha, Horario, Reserva) | E2 Cap. II | Ocho tablas en `001_esquema.sql`: Usuario, TipoCancha, Cancha, Horario, Reserva, Pago, Auditoria y Notificacion; PR #30 | modificado | Usuario en una sola tabla (Guía §1, Usuarios); TipoCancha, Pago y Notificacion por Guía §1; Auditoria por RF13 (contrato técnico, Esquema) |
| ARQ-05 | Integridad transaccional ACID sobre una sola base SQL Server (RNF09) | E2 Cap. II | `db.enTransaccion` con `READ COMMITTED` en `reservas.service.crear`; prueba "abre la transacción con READ COMMITTED"; PR #53 | cumplido | |
| ARQ-06 | Hosting gratuito de un único servicio (Render o Azure App Service) | E2 Cap. II | Ver RNF07; `Dockerfile` y `compose.yaml`, PR #54; imagen en GHCR, PR #85 y #82 | cumplido | Render ejecuta la imagen `latest` de GHCR, con Azure SQL Database (#35 dec. 4 y 5, y comentario del 06/11) |
| ARQ-07.a | Un único repositorio | E2 Cap. II | https://github.com/Mattmnz/reservas-zacarias-guerra | cumplido | |
| ARQ-07.b | Un solo proceso de despliegue e integración continua | E2 Cap. II | `.github/workflows/ci.yml`: Pruebas, Imagen Docker, Autoría de commits, Publicar imagen y Despliegue (estos dos, solo en push a `main`); PR #55, #67 y #85 | cumplido | |
| ARQ-08 | La lógica de negocio se prueba aislada, simulando la capa de datos | E2 Cap. II | `*.service.test.js` con `mock` de `node:test` sobre los repositorios y `db`; `npm test`: 710 pruebas | cumplido | |

### 3.7 Decisiones de desarrollo (E3 Cap. III)

| ID | Compromiso | Fuente | Dónde se cumple (evidencia) | Estado | Justificación / nota |
| --- | --- | --- | --- | --- | --- |
| DES-01 | Node.js 24 LTS con ejecutor de pruebas nativo | E3 §3.1 | `package.json`: `engines.node >=24`, `test: node --test`, `dev: node --watch` | cumplido | |
| DES-02 | Express 5 con errores async hacia un manejador central | E3 §3.1 | `package.json` (`express ^5`); `src/middlewares/manejarErrores.js`; `autenticar` lanza sin `try/catch` | cumplido | |
| DES-03.a | SQL Server Express en desarrollo | E3 §3.1 | `.env.example` (`DB_SERVER=localhost`); `scripts/migrar.js`; PR #30 | cumplido | |
| DES-03.b | Azure SQL Database en el despliegue | E3 §3.1 | `db/produccion/usuario-app.sql`; PR #67; comentario de cierre de #39 | cumplido | |
| DES-04 | Driver `mssql` con SQL escrito a mano y consultas parametrizadas | E3 §3.1 | `…repository.js` de cada módulo | cumplido | |
| DES-05 | bcryptjs para las contraseñas | E3 §3.1 | Igual que RNF02 | cumplido | |
| DES-06 | JWT sin estado y control de acceso por rol | E3 §3.1 | `auth.service` (`jwt.sign`/`jwt.verify` HS256); `autenticar.js`; `requerirRol.js`; PR #32 | cumplido | |
| DES-07 | Configuración por variables de entorno; las credenciales no se versionan | E3 §3.1 | `.env.example`; `.gitignore` excluye `.env`; `src/config/env.js` | cumplido | |
| DES-08 | API REST con respuestas JSON uniformes | E3 §3.1 | `{ data }` / `{ error: { codigo, mensaje } }`; `src/shared/AppError.js`; `manejarErrores.js` | cumplido | |
| DES-09 | El frontend consume la API "como un cliente independiente" | E3 §3.1 | `express.static` en `src/app.js`; todas las llamadas pasan por `public/js/api.js`; prueba "GET / responde 200 con HTML sin tocar la base" (`src/app.test.js`); PR #65 | modificado | Consume la API por HTTP, pero no es independiente: mismo origen, una imagen y un despliegue, servido por Express desde `public/` (#35 dec. 1) |
| DES-10.a | Capas por módulo: autenticación, usuarios, canchas, horarios, reservas, auditoría y notificaciones | E3 §3.2 | `src/modules/{auth,usuarios,canchas,horarios,reservas,auditoria,notificaciones}` | cumplido | |
| DES-10.b | Capas por módulo: disponibilidad | E3 §3.2 | `src/modules/disponibilidad/` (routes, controller y service, con sus pruebas); montado en `src/routes.js`; PR #58 | cumplido | No tiene repository propio: lee por los services de canchas, horarios y reservas (DES-11) |
| DES-11 | Cada capa usa solo la inferior; los módulos se comunican por su servicio, con firmas fijas | E3 §3.2 | `reservas.service` usa `canchasService`, `horariosService`, `auditoriaService` y `notificacionesService`; firmas en el contrato técnico (Funciones entre módulos) | cumplido | Las firmas nuevas se registran en #35 (por ejemplo `obtenerParaActualizar`) |
| DES-12 | Penalización y transiciones como funciones puras con pruebas de casos límite (24 h exactas) | E3 §3.2 y §3.3 | `src/modules/reservas/reglas.js` y `reglas.test.js`; PR #29 | cumplido | |
| DES-13.a | `develop` integra y cada tarea tiene su rama | E3 §3.3 | Historial de `develop`: solo merges de PR desde ramas `feature/`, `chore/`, `docs/`, `test/`, `fix/` y `ci/` (PR #85) | cumplido | |
| DES-13.b | `main` solo con versiones entregadas | E3 §3.3 | Release `v1.0 — Entrega final` con el tag `v1.0` sobre `main` en `bc86292` (PR #90, 07/11/2026); `v0.3-backend` como pre-release (PR #75); #23 cerrado. `v1.0.1` (13/11/2026) es una versión de documentación sobre `main`: modelos UWE, matriz sin pendientes e informe final, con el mismo código de `v1.0` | cumplido | |
| DES-14 | Todo cambio entra por PR aprobado por otro integrante | E3 §3.3 | PR #25–#34, #51–#75 y #77–#87: todos con aprobación de alguien distinto del autor. Fuera de los merges, `develop` solo tiene el commit inicial | cumplido | |
| DES-15 | Rotación fija de revisores | E3 §3.3 | PR #51 (B) y #52 (A) los aprobó C; PR #53 (C) lo aprobó A; PR #54 y #58 (A) los aprobó C; PR #57 (C) lo aprobó A. Desde el corte: PR #56, #59, #60 y #61 (B), #64, #65 y #68 a #70 (C) los aprobó A; PR #55, #62 y #67 (A) y #71 a #73 (C) los aprobó B; PR #63 (B) y #66 y #75 (A) los aprobó C. Desde #74: PR #74 y #82 (B) y #80, #81, #83 y #86 (A) los aprobó C; PR #78 y #79 (B) y #87 (C) los aprobó A; PR #77 (C) y #84 y #85 (A) los aprobó B | modificado | Durante la redistribución A y C se revisan entre sí y C revisa a B (#31); después revisa el primero disponible de los otros dos (#35, Revisión) |
| DES-16 | Ramas principales protegidas contra escritura directa, borrado y reescritura | E3 §3.3 | `gh api repos/Mattmnz/reservas-zacarias-guerra/rules/branches/{develop,main}`: ruleset 24905866 con `pull_request` (1 aprobación, solo merge commit), `non_fast_forward`, `deletion` y `required_status_checks` (Pruebas, Imagen Docker y Autoría de commits) en ambas ramas | cumplido | |
| DES-17 | Cada tarea es un issue y su PR lo cierra | E3 §3.3 | `Closes #N` en los PR #25–#34, #51–#58, #63–#66, #68, #70–#73, #79–#82 y #87 | cumplido | Los PR que no terminan su issue usan `Refs`: #59, #60 y #78 (#49), #61 (#48), #62 (#37), #67, #75 y #86 (#39), #69 (#40), #74 y #83 (#21), #77 (#47), #84 (#23), #85 (#38). #39 se cerró con un comentario, no con un PR |
| DES-18 | Doble defensa ante reservas simultáneas: bloqueo de rango e índice único filtrado | E3 §3.3 | Igual que RNF09.a | cumplido | |
| DES-19 | Base local por integrante con migraciones SQL versionadas | E3 §3.3 | `db/migrations/001_esquema.sql`, `002_indices.sql`; `scripts/migrar.js` (tabla `_Migraciones`); `scripts/seed.js`; PR #30 | cumplido | |
| DES-20 | Todas las fechas en hora de Nicaragua, calculadas en la aplicación | E3 §3.3 | `src/shared/tiempo.js` (`ahoraNicaragua`, `diaSemana`) y `tiempo.test.js`; PR #27 | cumplido | |
| DES-21.a | Pago simulado dentro de la transacción de la reserva | E3 §3.3 | Igual que RF06.a | cumplido | |
| DES-21.b | Reembolsos simulados dentro de la misma transacción | E3 §3.3 | `reservas.service.cancelar` inserta el pago `REEMBOLSO` `SIM-R-<id>` en la transacción de la cancelación; prueba "guarda la mitad como penalización e inserta el reembolso SIM-R-<id>"; PR #64 | cumplido | |
| DES-22.a | Auditoría y notificación en la misma transacción que el cambio: creación | E3 §3.3 | Prueba "audita y notifica dentro de la misma transacción"; PR #53 | cumplido | |
| DES-22.b | Auditoría y notificación en la misma transacción: confirmar, asistencia y no-show | E3 §3.3 | `reservas.service`: `aplicarTransicion` y el barrido de no-show dentro de `db.enTransaccion`; pruebas "audita con el admin y notifica al cliente dentro de la transacción" y "audita como sistema y notifica a cada cliente, sin reembolso"; PR #57 | cumplido | |
| DES-22.c | Auditoría y notificación en la misma transacción: cancelar y baja de cancha | E3 §3.3 | `reservas.service.cancelar` y `cancelarPorBajaDeCancha`, con el ejecutor de la transacción; pruebas "audita con el motivo recortado y notifica al cliente en la misma transacción" y "con confirmar: true cancela con la transacción y audita la cifra que devuelve cancelar"; PR #64 y #66 | cumplido | |
| DES-23 | Reparto: Álvaro con autenticación, usuarios, auditoría y notificaciones | E3 §3.4 | Autenticación, PR #32 de A; auditoría y notificaciones, PR #33 de C; usuarios, PR #51 de B | modificado | Redistribución por disponibilidad (#31); frentes del sprint final (#35, Reparto) |
| DES-24.a | Etapas 1–4: base, esquema y reglas, autenticación, auditoría, canchas, horarios y creación de reservas | E3 §3.4 | PR #27, #29, #30, #32, #33, #34, #52 y #53 | cumplido | |
| DES-24.b | Etapa 5: no-show, disponibilidad y usuarios | E3 §3.4 | No-show: PR #57; disponibilidad: PR #58; usuarios: PR #51 | cumplido | |
| DES-24.d | Etapa 5: cancelación y consultas administrativas | E3 §3.4 | Cancelación: PR #64; consultas: PR #63; baja de cancha: PR #66 | cumplido | |
| DES-24.c | Etapa 6: prueba de reservas simultáneas | E3 §3.4 | Ver RNF09.b | cumplido | |
| DES-24.e | Etapa 6: integración y versión del backend en `main` | E3 §3.4 | PR #90 integra `develop` en `main`, con el tag `v1.0`; prueba integral en `docs/guion-demo.md` (PR #74, #88 y #91); #21 y #23 cerrados | cumplido | |

## 4. Modelos: qué hay que corregir

Las correcciones de 4.1 están aplicadas en `docs/modelos/`: la columna "Resuelta en" indica el archivo de cada una. De las ampliaciones de 4.2 se aplican la 1 a la 4.

### 4.1 Correcciones

En estos puntos el diagrama contradice lo implementado o lo decidido.

| Modelo | Corrección | Base | Resuelta en |
| --- | --- | --- | --- |
| Casos de uso general | Simular pago pasa de `<<extend>>` a `<<include>>` de Reservar cancha | Ficha y diagrama de CU-01; Guía §1 (Pago); RF06.a | `docs/modelos/casos-de-uso.md`, sección 1 |
| Casos de uso general | Quitar la asociación de Registrar usuario con el Administrador | Guía §1 (Usuarios): el registro público solo crea clientes | `docs/modelos/casos-de-uso.md`, sección 1 |
| CU-01 (ficha) | Quitar el punto de extensión "si el Cliente elige pagar en línea": el pago es parte del flujo básico | Guía §1 (Pago) | `docs/modelos/casos-de-uso.md`, sección 2 |
| CU-01 (ficha) | Paso 4: la reserva se registra en `PAGADA`, no en "Reservado" | Guía §1 (Estados); `CK_Reserva_Estado` | `docs/modelos/casos-de-uso.md`, sección 2 |
| CU-01 (diagrama) | El actor está rotulado "Actor"; debe ser el Cliente | Ficha de CU-01 (actor principal: Cliente) | `docs/modelos/casos-de-uso.md`, sección 2 |
| CU-01 (diagrama) | El `<<include>>` de Simular pago va de Simular pago hacia Reservar cancha; debe ir de Reservar cancha hacia Simular pago, como el de Consultar disponibilidad | Notación de `<<include>>`: va del caso base al incluido | `docs/modelos/casos-de-uso.md`, sección 2 |
| CU-02 (diagrama) | El rótulo dice "CU-03: Cancelar reserva"; debe decir CU-02 | Ficha de CU-02 | `docs/modelos/casos-de-uso.md`, sección 3 |
| Contenido (clases) | Agregar `Pago`, `Auditoria` y `Notificacion`, con sus relaciones con Reserva y Usuario | `001_esquema.sql`; alcance de #49 | `docs/modelos/contenido.md`, sección 5 |
| Contenido (clases) | Agregar `TipoCancha` (código, nombre, precio por hora) y quitar `modalidad` y `precioPorHora` de Cancha; `estado` pasa a `activa` | `001_esquema.sql`; Guía §1 (Precio) | `docs/modelos/contenido.md`, sección 5 |
| Contenido (clases) | Horario: `diaSemana`, `horaApertura` y `horaCierre` en lugar de `fecha`, `horaInicio`, `horaFin` y `disponible` | `001_esquema.sql`; Guía §1 (Bloques horarios) | `docs/modelos/contenido.md`, sección 5 |
| Contenido (clases) | Reserva: `inicio`, `monto`, `estado`, `activa` y `montoPenalizado`; asociada a Cancha y a Cliente, no a Horario | `001_esquema.sql` | `docs/modelos/contenido.md`, sección 5 |
| Contenido (clases) | Usuario con `rol` y `telefono` como implementación en una sola tabla; quitar `Administrador.cargo` y llevar `telefono` a Usuario | Guía §1 (Usuarios); `001_esquema.sql` | `docs/modelos/contenido.md`, sección 5 |
| Procesos: flujo de baja de cancha | La rama "No" de "¿Reservas activas?" va hoy a "Cancelar reservas"; debe ir a "Actualizar estado". No se cambia el orden de las actividades | Lógica del propio flujo; RF08 | `docs/modelos/flujo-baja-cancha.md` |
| Procesos: estados de la reserva | Agregar un diagrama de estados derivado de la tabla de transiciones de `reglas.js`: `PAGADA` (inicial) → `CONFIRMADA` (confirmar); `PAGADA` o `CONFIRMADA` → `COMPLETADA` (registrar asistencia; `PAGADA` pasa directo, sin confirmar); desde `PAGADA` o `CONFIRMADA` → `CANCELADA` (cancelar) o `NO_SHOW` (marcar no-show); `COMPLETADA`, `CANCELADA` y `NO_SHOW` son finales. Corregir también la lista de estados de la introducción | Objetivo específico 3; Guía §1 (Estados); `src/modules/reservas/reglas.js` | `docs/modelos/estados-reserva.md`: diagrama y lista vigente de estados (sección 2). El texto de la introducción se corrige en el informe |

### 4.2 Ampliaciones

Agregan elementos que el modelo no tenía. El 06/11 se aprobaron la 1 a la 5 y la 6 quedó fuera. El 11/11 se descartaron todas para limitar #49 a las correcciones de 4.1, y el 12/11 se volvieron a incluir la 1 a la 4, porque sin ellas el diagrama general no muestra el registro de asistencia ni el no-show, que el sistema implementa (#35, comentario del 12/11).

| Modelo | Ampliación | Motivo | Resuelta en |
| --- | --- | --- | --- |
| Casos de uso general | Agregar Registrar asistencia (Administrador) | Estado `COMPLETADA` (Guía §1); #17 | `docs/modelos/casos-de-uso.md`, sección 1 |
| Casos de uso general | Agregar el no-show automático (Sistema) | CU-02 A1; Guía §1 (No-show); #17 | `docs/modelos/casos-de-uso.md`, sección 1: Marcar no-show, con el actor Sistema |
| Casos de uso general | Agregar Registrar auditoría, incluido por Cancelar reserva y los demás cambios de estado | Ficha de CU-02; RF13 | `docs/modelos/casos-de-uso.md`, sección 1 |
| Casos de uso general | Agregar Notificar cliente como inclusión de Reservar cancha | PR #53 notifica al crear; RF12 | `docs/modelos/casos-de-uso.md`, sección 1 |
| Procesos: estructura | Agregar las clases de proceso de confirmar, registrar asistencia y no-show | #17; tabla de transiciones de `reglas.js` | No se aplica: `docs/modelos/` no tiene un diagrama de estructura de procesos. Las tres transiciones están en `docs/modelos/estados-reserva.md` |
| Procesos: flujo de reservar | Indicar que pago, auditoría y notificación ocurren en una sola transacción | DES-21 y DES-22. Opcional | No se aplica (decisión del 06/11) |

## 5. Compromisos sin issue (huecos del plan)

No quedan huecos. Los dos que había (completar el modelo de presentación y el aviso de la regla de penalización al confirmar la reserva) pasaron a la matriz como OBJ-2.b y MOD-PRE-2.b, en estado `omitido`.

## 6. Enunciados que no son compromisos de implementación

| Enunciado | Fuente | Por qué no entra en la matriz |
| --- | --- | --- |
| Fases 2 a 4 de la migración a microservicios: extraer Reservas, luego Notificaciones y, si se justifica, Gestión de canchas | E2 Cap. II | Dependen de que el complejo crezca ("si … decidiera expandir sus operaciones"). La fase 1 sí entra (ARQ-02) |
| Avance a la fecha: repositorio creado y protegido, 24 tareas registradas como issues, documentación en revisión y entorno definido | E3 §3.4 | Describen el estado al 11/10, no algo por cumplir. El plan de etapas y el reparto sí entran (DES-23 y DES-24) |

## 7. Recortes aplicados (#35)

Se aplican los recortes 2 y 3 (#35, comentario del 06/11). Ninguno deja una fila en `omitido`: no eran filas de la matriz.

1. Vista de auditoría en el frontend (#47). No se aplicó: #47 se integró (PR #73; RF13.g).
2. Observación de #33 sobre `?entidadId` sin `entidad`. **Aplicado:** no se implementa. La pantalla de auditoría nombra la entidad en cada registro, y la mezcla afecta solo a la consulta, no a los datos guardados (RF13.g).
3. Prueba de usabilidad con personas externas. **Aplicado:** no se hace. RNF01 queda respaldado por `docs/guion-demo.md` y sus corridas contra producción: la del 06/11 (PR #88) y la complementaria del 11/11 (PR #91) (RNF01).

Fuera del orden de recorte, el responsable decidió el 11/11 (#35) omitir dos compromisos. Son las únicas filas en `omitido`:

- OBJ-2.b: el modelo de presentación de las demás pantallas no se completa, porque no da el tiempo.
- MOD-PRE-2.b: el aviso de la regla de penalización al confirmar no se agrega. La regla se muestra al cancelar, en `public/cliente/historial.html`. Lo confirma el responsable en la revisión.

## 8. Resumen

Corte: `develop` en `4579453` (13/11/2026); `npm test`: 710 pruebas, 710 en verde.

| Estado | Filas |
| --- | --- |
| cumplido | 182 |
| modificado | 18 |
| omitido | 2 |
| pendiente | 0 |
| **Total** | **202** |

Ninguna fila queda pendiente.
