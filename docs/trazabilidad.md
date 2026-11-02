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

**Corte de la evidencia:** `develop` en el commit `dad695e` (merge del PR #53), al 01/11/2026. Ese día `npm test` da 374 pruebas, 374 en verde.

**Cómo se mantiene:**
- Cuando un PR se integra a `develop`, sus filas pasan de `pendiente (#N)` a `cumplido` o `modificado`, con la evidencia nueva, y se actualiza el corte.
- El issue #49 se cierra cuando ninguna fila queda en `pendiente` y los modelos corregidos están listos.

## 2. Convenciones

### Estados

| Estado | Significado |
| --- | --- |
| `cumplido` | Está en `develop` tal como se comprometió. Cita evidencia: archivo, endpoint, prueba o PR integrado |
| `modificado` | Está en `develop`, pero distinto de lo comprometido. Cita la evidencia y la justificación (Guía §1, contrato técnico, #31 o #35) |
| `omitido` | Se recortó según el orden de recorte de #35. Hoy no hay ninguno (sección 7) |
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
| RF01.b | Pantalla de registro | E1 Cap. I | — | pendiente (#40) | |
| RF02 | Consultar disponibilidad por fecha y horario | E1 Cap. I | — | pendiente (#15, #43) | |
| RF03.a | Crear una reserva sobre un horario disponible (API) | E1 Cap. I | `POST /api/reservas` (`reservas.routes.js`); `reservas.service.crear` valida el horario de la cancha (`obtenerDelDia`) y la ventana de 30 días; `reservas.service.test.js`; PR #53 | cumplido | Ventana `0 < inicio − ahora ≤ 30 días` (#35, comentario del 01/11) |
| RF03.b | Pantalla de reserva | E1 Cap. I | — | pendiente (#43) | |
| RF04 | El cliente cancela una reserva propia | E1 Cap. I | — | pendiente (#18, #44) | |
| RF05 | Aplicar automáticamente la penalización por cancelación tardía o no-show | E1 Cap. I | — | pendiente (#17, #18) | Hoy ningún endpoint aplica la penalización. Las funciones puras del cálculo son evidencia de DES-12, no de este requisito |
| RF06.a | Simular el pago y actualizar el estado a "pagada" | E1 Cap. I | `reservas.service.crear` inserta la reserva en `PAGADA` y el cargo `SIM-C-<id>` en la misma transacción; prueba "inserta el cargo simulado por el mismo monto con referencia SIM-C-<id>"; PR #53 | modificado | No hay un paso de actualización: la reserva nace `PAGADA`, porque el pago es simulado e inmediato dentro de la transacción de creación y no existe `PENDIENTE` (Guía §1, Pago y Estados) |
| RF06.b | Mostrar el pago simulado al cliente | E1 Cap. I | — | pendiente (#43) | |
| RF07 | El cliente ve el historial de sus reservas | E1 Cap. I | — | pendiente (#19, #44) | |
| RF08.a | El administrador registra y edita canchas | E1 Cap. I | `POST /api/canchas`, `PUT /api/canchas/:id`, `PATCH /api/canchas/:id/alta`, `PUT /api/tipos-cancha/:id/precio`; `canchas.service.test.js`; `docs/http/canchas.http`; PR #34 | cumplido | |
| RF08.b | Baja lógica con alerta y confirmación ("proceder de igual forma") si hay reservas activas | E1 Cap. I | — | pendiente (#20) | Según el contrato técnico (Dominio), la alerta se da con reservas futuras `PAGADA`/`CONFIRMADA` |
| RF08.c | Pantallas de canchas | E1 Cap. I | — | pendiente (#41) | |
| RF09.a | El administrador define los horarios de cada cancha | E1 Cap. I | `GET` y `PUT /api/canchas/:id/horarios`; `horarios.service.test.js`, `horarios.controller.test.js`; `docs/http/horarios.http`; PR #52 | cumplido | Horario semanal por día; reemplazarlo no modifica las reservas ya hechas (#35, comentario de #14) |
| RF09.b | Pantalla de horarios | E1 Cap. I | — | pendiente (#41) | |
| RF10 | El administrador ve todas las reservas, con filtros por fecha, cancha o estado | E1 Cap. I | — | pendiente (#19, #42) | |
| RF11.a | El administrador confirma una reserva | E1 Cap. I | — | pendiente (#17, #42) | |
| RF11.b | El administrador cancela manualmente una reserva | E1 Cap. I | — | pendiente (#18, #42) | |
| RF12.a | Notificar al cliente: al crear la reserva | E1 Cap. I | `notificaciones.service.crear` llamado en la transacción de `reservas.service.crear` (PR #53); `GET /api/notificaciones` y `PATCH /api/notificaciones/:id/leida` (PR #33) | cumplido | Las notificaciones se guardan en una tabla y no se envían correos (Guía §1, Notificaciones) |
| RF12.b | Notificar al cliente: al confirmar, cancelar, registrar asistencia y marcar no-show | E1 Cap. I | — | pendiente (#17, #18) | |
| RF12.c | Pantalla de notificaciones | E1 Cap. I | — | pendiente (#45) | |
| RF13.a | Auditar los cambios de cada reserva: creación | E1 Cap. I | `auditoria.service.registrar` con `CREAR` en la transacción de creación; prueba "audita y notifica dentro de la misma transacción"; PR #53 | cumplido | |
| RF13.b | Auditar los cambios de cada reserva: confirmar, cancelar, asistencia y no-show | E1 Cap. I | — | pendiente (#17, #18) | |
| RF13.c | Auditar los cambios de cada cancha: creación, edición, alta y horario | E1 Cap. I | `canchas.service` (`CREAR`, `EDITAR`, `ALTA`), PR #34; `horarios.service` (`CAMBIAR_HORARIO`), PR #52 | cumplido | `CAMBIAR_HORARIO` se agregó en #35 (comentario de #14) |
| RF13.d | Auditar los cambios de cada cancha: baja | E1 Cap. I | — | pendiente (#20) | |
| RF13.e | Consultar la auditoría | E1 Cap. I | `GET /api/auditoria` (ADMIN), `auditoria.service.test.js`, PR #33 | cumplido | La vista en el frontend es el primer recorte de #35 y queda en #47 |
| RF14.a | Solo el rol Administrador accede a la administración (API) | E1 Cap. I | `src/middlewares/requerirRol.js` y `requerirRol.test.js`; rutas de administración con `requerirRol(ROLES.ADMIN)`; `autenticar` lee el rol de la base (`auth.service.usuarioDelToken`); PR #32 | cumplido | |
| RF14.b | Menú y acceso por rol en el frontend | E1 Cap. I | — | pendiente (#40) | |
| RF15.a | Iniciar sesión con credenciales (API) | E1 Cap. I | `POST /api/auth/login`, `GET /api/auth/yo`; `docs/http/auth.http`; PR #32 | cumplido | |
| RF15.b | Pantalla de inicio de sesión | E1 Cap. I | — | pendiente (#40) | |
| RF16 | Cerrar sesión desde el menú principal del rol | E1 Cap. I | — | pendiente (#40) | Con JWT el cierre de sesión consiste en que el frontend descarta el token (contrato técnico, Autenticación; #35 dec. 3) |
| RF17.a | El administrador gestiona usuarios (API) | E1 Cap. I | `GET /api/usuarios`, `PATCH /api/usuarios/:id`; `usuarios.service.test.js`; `docs/http/usuarios.http`; PR #51 | cumplido | Auditoría `CAMBIAR_ROL`/`ACTIVAR`/`DESACTIVAR` (#35 dec. 8) |
| RF17.b | Pantalla de usuarios | E1 Cap. I | — | pendiente (#46) | |

### 3.2 Requisitos no funcionales

| ID | Compromiso | Fuente | Dónde se cumple (evidencia) | Estado | Justificación / nota |
| --- | --- | --- | --- | --- | --- |
| RNF01 | Interfaz clara y usable sin capacitación | E1 Cap. I | — | pendiente (#40, #21) | La prueba con personas externas no tiene issue (sección 5) |
| RNF02 | Contraseñas guardadas con hash | E1 Cap. I | `auth.service.registrar` usa `bcrypt.hash`; columna `Usuario.PasswordHash` (`001_esquema.sql`); PR #32 | cumplido | |
| RNF03.a | Acceso restringido según el rol (API) | E1 Cap. I | Igual que RF14.a; `autenticar` rechaza a los usuarios inactivos | cumplido | |
| RNF03.b | Acceso restringido según el rol (frontend) | E1 Cap. I | — | pendiente (#40) | |
| RNF04 | Disponibilidad en menos de 3 s bajo uso normal | E1 Cap. I | — | pendiente (#15, #48) | |
| RNF05 | Frontend responsive | E1 Cap. I | — | pendiente (#40) | |
| RNF06.a | Backend organizado en capas separadas | E1 Cap. I | `src/modules/<modulo>/` con `routes`, `controller`, `service` y `repository`; `src/routes.js` | cumplido | |
| RNF06.b | Frontend organizado en capas separadas | E1 Cap. I | — | pendiente (#40) | `js/api.js`, `js/sesion.js` y un script por página (#35 dec. 1) |
| RNF07 | Desplegado en un entorno público para la defensa | E1 Cap. I | — | pendiente (#39) | Render y Azure SQL Database (#35 dec. 4 y 5) |
| RNF08 | Agregar canchas o modalidades sin rediseño | E1 Cap. I | Tabla `TipoCancha` y `Cancha.TipoCanchaId` (`001_esquema.sql`, PR #30); `GET /api/tipos-cancha` y alta de canchas (PR #34) | cumplido | Disponibilidad sin consultas N+1, en #15 |
| RNF09.a | Dos reservas simultáneas no ocupan el mismo horario | E1 Cap. I | Índice `UX_Reserva_SlotActivo` (`002_indices.sql`, PR #30); `SELECT … WITH (UPDLOCK, HOLDLOCK)` en `reservas.repository.js` y traducción de 2601/2627 a `HORARIO_OCUPADO` en `reservas.service.js`; pruebas de "crear: transacción"; PR #53 | cumplido | |
| RNF09.b | Prueba de 10 solicitudes simultáneas | E1 Cap. I | — | pendiente (#22) | PR #56 abierto |

### 3.3 Casos de uso

#### Diagrama general

| ID | Caso de uso | Fuente | Dónde se cumple (evidencia) | Estado | Justificación / nota |
| --- | --- | --- | --- | --- | --- |
| CU-GEN-01 | Consultar disponibilidad | E1 Cap. I | — | pendiente (#15, #43) | |
| CU-GEN-02.a | Reservar cancha (API) | E1 Cap. I | Ver RF03.a | cumplido | |
| CU-GEN-02.b | Reservar cancha (pantalla) | E1 Cap. I | — | pendiente (#43) | |
| CU-GEN-03 | Simular pago, como `<<extend>>` (opcional) de Reservar cancha | E1 Cap. I | Ver RF06.a | modificado | El pago es obligatorio e inmediato: es `<<include>>`, como ya dicen la ficha y el diagrama de CU-01 (Guía §1, Pago). Corrección del diagrama en la sección 4 |
| CU-GEN-04.a | Iniciar sesión (API) | E1 Cap. I | Ver RF15.a | cumplido | |
| CU-GEN-04.b | Iniciar sesión (pantalla) | E1 Cap. I | — | pendiente (#40) | |
| CU-GEN-05 | Cerrar sesión | E1 Cap. I | — | pendiente (#40) | Ver RF16 |
| CU-GEN-06 | Ver historial de reservas | E1 Cap. I | — | pendiente (#19, #44) | |
| CU-GEN-07.a | Registrar usuario (API) | E1 Cap. I | Ver RF01.a | cumplido | El diagrama asocia este caso también al Administrador; el registro público solo crea clientes (Guía §1). Corrección en la sección 4 |
| CU-GEN-07.b | Registrar usuario (pantalla) | E1 Cap. I | — | pendiente (#40) | |
| CU-GEN-08.a | Gestionar usuarios (API) | E1 Cap. I | Ver RF17.a | cumplido | |
| CU-GEN-08.b | Gestionar usuarios (pantalla) | E1 Cap. I | — | pendiente (#46) | |
| CU-GEN-09 | Cancelar reserva (cliente y administrador), extiende Ver historial | E1 Cap. I | — | pendiente (#18, #42, #44) | |
| CU-GEN-10 | Confirmar reserva | E1 Cap. I | — | pendiente (#17, #42) | |
| CU-GEN-11.a | Notificar cliente: al crear | E1 Cap. I | Ver RF12.a | cumplido | En el diagrama lo incluyen Cancelar y Confirmar |
| CU-GEN-11.b | Notificar cliente: al confirmar y al cancelar, y su pantalla | E1 Cap. I | — | pendiente (#17, #18, #45) | |
| CU-GEN-12.a | Gestionar canchas: registrar, editar y alta | E1 Cap. I | Ver RF08.a | cumplido | |
| CU-GEN-12.b | Gestionar canchas: baja y pantallas | E1 Cap. I | — | pendiente (#20, #41) | |
| CU-GEN-13.a | Definir horarios (API) | E1 Cap. I | Ver RF09.a | cumplido | |
| CU-GEN-13.b | Definir horarios (pantalla) | E1 Cap. I | — | pendiente (#41) | |
| CU-GEN-14 | Ver reservas del complejo | E1 Cap. I | — | pendiente (#19, #42) | |

#### CU-01: Reservar cancha

| ID | Compromiso | Fuente | Dónde se cumple (evidencia) | Estado | Justificación / nota |
| --- | --- | --- | --- | --- | --- |
| CU-01.PRE1 | Solo un cliente con sesión iniciada reserva | E1 Cap. I | `POST /api/reservas` con `autenticar` y `requerirRol(ROLES.CLIENTE)`; PR #53 | cumplido | |
| CU-01.PRE2 | Solo se reservan canchas dadas de alta | E1 Cap. I | `canchas.service.obtenerActiva` responde 404 para una cancha inactiva; prueba "cancha inexistente o de baja → propaga NO_ENCONTRADO sin consultar Reserva"; PR #53 | cumplido | |
| CU-01.INC1 | Incluye Consultar disponibilidad (obligatorio); paso FB2 | E1 Cap. I | — | pendiente (#15, #43) | |
| CU-01.INC2 | Incluye Simular pago (obligatorio) | E1 Cap. I | Ver RF06.a | cumplido | El texto del punto de extensión lo contradice (CU-01.EXT) |
| CU-01.EXT | Punto de extensión: Simular pago solo "si el Cliente elige pagar en línea" | E1 Cap. I | Ver RF06.a | modificado | El pago es simulado, inmediato y siempre ocurre (Guía §1, Pago) |
| CU-01.FB4 | El sistema registra la reserva con estado "Reservado" | E1 Cap. I | `INSERT` con `Estado = PAGADA`; `CK_Reserva_Estado` en `001_esquema.sql`; prueba "inserta la reserva PAGADA…"; PR #53 | modificado | El estado inicial es `PAGADA`; no existen "Reservado" ni `PENDIENTE` (Guía §1, Estados) |
| CU-01.FB5.a | Se confirma la reserva al cliente (API) | E1 Cap. I | Respuesta 201 con la reserva y sus pagos; prueba "responde la reserva con sus pagos y fechas locales"; PR #53 | cumplido | |
| CU-01.FB5.b | Pantalla de confirmación | E1 Cap. I | — | pendiente (#43) | Con enlaces al catálogo y al historial |
| CU-01.A1.a | Sin disponibilidad: el sistema lo detecta | E1 Cap. I | 409 `HORARIO_OCUPADO`; prueba "bloque ocupado → 409 HORARIO_OCUPADO…"; PR #53 | cumplido | |
| CU-01.A1.b | Sin disponibilidad: se ofrecen horarios alternativos o se cancela la operación | E1 Cap. I | — | pendiente (#43) | |
| CU-01.A2 | Sesión expirada: redirigir a Iniciar sesión y retomar el flujo | E1 Cap. I | — | pendiente (#40) | La API ya responde 401 `NO_AUTENTICADO` con un token vencido (PR #32) |
| CU-01.POST | La cancha deja de figurar como disponible en ese horario | E1 Cap. I | — | pendiente (#15) | La reserva ya ocupa el bloque en la base (`UX_Reserva_SlotActivo`) |

#### CU-02: Cancelar reserva

| ID | Compromiso | Fuente | Dónde se cumple (evidencia) | Estado | Justificación / nota |
| --- | --- | --- | --- | --- | --- |
| CU-02.PRE | Sesión iniciada y reserva activa del cliente | E1 Cap. I | — | pendiente (#18) | |
| CU-02.EXT | Extiende Ver historial (FB1: se cancela desde el historial) | E1 Cap. I | — | pendiente (#19, #44) | |
| CU-02.FB2-4 | Calcular la anticipación: ≥ 24 h → 0 % y reembolso del 100 %; < 24 h → 50 % y reembolso del 50 % | E1 Cap. I | — | pendiente (#18) | El cálculo puro ya existe (DES-12); falta aplicarlo |
| CU-02.FB5 | Estado "cancelada" y el horario queda libre | E1 Cap. I | — | pendiente (#18) | El esquema ya libera el bloque cuando `Activa = 0` (`CK_Reserva_Activa`, `UX_Reserva_SlotActivo`) |
| CU-02.FB6 | Incluye Registrar auditoría | E1 Cap. I | — | pendiente (#18) | |
| CU-02.FB7 | Incluye Notificar cliente | E1 Cap. I | — | pendiente (#18) | |
| CU-02.A1 | No-show automático con el 100 % de penalización | E1 Cap. I | — | pendiente (#17) | Barrido perezoso sin tareas programadas (Guía §1, No-show) |
| CU-02.A2 | El administrador cancela en nombre del cliente, con su usuario en la auditoría | E1 Cap. I | — | pendiente (#18, #42) | |
| CU-02.POST | Estado final, horario liberado y auditoría con motivo, monto penalizado y responsable | E1 Cap. I | — | pendiente (#17, #18) | `Reserva.MontoPenalizado` y `Auditoria.Motivo` ya existen (`001_esquema.sql`) |

#### Casos de uso de negocio

| ID | Caso de uso | Fuente | Dónde se cumple (evidencia) | Estado | Justificación / nota |
| --- | --- | --- | --- | --- | --- |
| CU-NEG-1.a | Reservar y cobrar cancha (RF03, RF06, RF15) | E1 Cap. I | Ver RF03.a, RF06.a y RF15.a | cumplido | Con la modificación de RF06.a |
| CU-NEG-1.b | Reservar y cobrar cancha: disponibilidad (RF02) y pantallas | E1 Cap. I | — | pendiente (#15, #43) | |
| CU-NEG-2 | Cancelar y penalizar reserva (RF04, RF05) | E1 Cap. I | — | pendiente (#17, #18) | |
| CU-NEG-3.a | Gestionar disponibilidad de canchas: canchas y horarios (RF08, RF09) | E1 Cap. I | Ver RF08.a y RF09.a | cumplido | |
| CU-NEG-3.b | Gestionar disponibilidad de canchas: baja y pantallas | E1 Cap. I | — | pendiente (#20, #41) | |

### 3.4 Modelos UWE

La columna "Corrección" remite a la sección 4: 4.1 son correcciones y 4.2 son ampliaciones.

| ID | Compromiso | Fuente | Dónde se cumple (evidencia) | Estado | Corrección | Justificación / nota |
| --- | --- | --- | --- | --- | --- | --- |
| MOD-CU-GEN | Diagrama general de casos de uso | E1 Cap. I | — | pendiente (#49) | 4.1 y 4.2 | |
| MOD-CU-01 | Ficha y diagrama de CU-01 | E1 Cap. I | — | pendiente (#49) | 4.1 | |
| MOD-CU-02 | Ficha y diagrama de CU-02 | E1 Cap. I | — | pendiente (#49) | 4.1 | |
| MOD-CON.a | Contenido: Usuario abstracto con Cliente y Administrador como subclases | E1 Cap. I | Tabla única `Usuario` con `Rol` (`CK_Usuario_Rol`) y `Telefono`; PR #30 | modificado | 4.1 | Herencia en una sola tabla (Guía §1, Usuarios). `Administrador.cargo` no figura en el esquema acordado (contrato técnico, Esquema) |
| MOD-CON.b | Contenido: Cancha con `modalidad`, `precioPorHora` y `estado` | E1 Cap. I | Tablas `TipoCancha` (código, precio) y `Cancha` (`TipoCanchaId`, `Activa`); PR #30 | modificado | 4.1 | El precio depende del tipo de cancha y se copia en la reserva (Guía §1, Precio) |
| MOD-CON.c | Contenido: Horario con `fecha`, `horaInicio`, `horaFin` y `disponible` | E1 Cap. I | `Horario(CanchaId, DiaSemana, HoraApertura, HoraCierre)`; PR #30 y #52 | modificado | 4.1 | Apertura y cierre por día de la semana; los bloques de 1 h se calculan (Guía §1, Bloques horarios). La disponibilidad no se guarda |
| MOD-CON.d | Contenido: Reserva "asignada a" Horario, con `montoTotal` y `penalizacionAplicada` | E1 Cap. I | `Reserva(ClienteId, CanchaId, Inicio, Monto, Estado, Activa, MontoPenalizado)`; PR #30 | modificado | 4.1 | La reserva apunta a la cancha y a la hora de inicio (contrato técnico, Esquema) |
| MOD-CON.e | Contenido: sin `Pago`, `Auditoria` ni `Notificacion` | E1 Cap. I | Tablas `Pago`, `Auditoria` y `Notificacion` (`001_esquema.sql`); PR #30 | modificado | 4.1 | Las exigen el pago simulado, RF13 y RF12 (Guía §1, Pago y Notificaciones; contrato técnico, Esquema) |
| MOD-CON.f | Contenido: métodos en las entidades (`simularPago()`, `cancelar()`, …) | E1 Cap. I | Lógica en los services de cada módulo (`src/modules/*/…service.js`) | modificado | 4.1 | Las reglas viven en la capa de servicio (contrato técnico, Estructura) |
| MOD-EST.a | Flujo de estados de la reserva (objetivo específico 3) | E1 objetivos e introducción | `ESTADOS` (`src/shared/constantes.js`); `CK_Reserva_Estado`; tabla de transiciones en `src/modules/reservas/reglas.js` con `reglas.test.js`; PR #29 y #30 | modificado | 4.1 | Estados `PAGADA`, `CONFIRMADA`, `COMPLETADA`, `CANCELADA` y `NO_SHOW`; sin "pendiente" (Guía §1, Estados) |
| MOD-EST.b | Diagrama de estados de la reserva | E1 objetivos | — | pendiente (#49) | 4.1 | El modelo de procesos entregado no lo tiene |
| MOD-NAV | Navegación: 8 nodos y 12 conexiones (Login, Registro, Catálogo «menu», Detalle y reserva, Historial, Confirmación, Panel administrador «menu», Gestionar canchas) | E1 Cap. I | — | pendiente (#40, #41, #43, #44) | Sección 5 | Una página por nodo (#35 dec. 1). Faltan nodos para las pantallas de #42, #45, #46 y #47 |
| MOD-PRE-1 | Presentación: catálogo con filtros de fecha y modalidad, estado y precio por cancha | E1 Cap. I | — | pendiente (#43) | Sección 5 | Los precios del dibujo (C$ 500 y C$ 800) son ilustrativos; los reales salen de `TipoCancha` |
| MOD-PRE-2 | Presentación: confirmar reserva con pago simulado y aviso de la regla de penalización | E1 Cap. I | — | pendiente (#43) | Sección 5 | |
| MOD-PRO-EST.a | Estructura del proceso: CrearReserva «processClass» | E1 Cap. I | `reservas.service.crear`; PR #53 | cumplido | 4.2 | |
| MOD-PRO-EST.b | Estructura del proceso: CancelarReserva «processClass» y ConsultarDisponibilidad «query» | E1 Cap. I | — | pendiente (#15, #18) | 4.2 | |
| MOD-PRO-F1.a | Flujo de reservar: "¿Horario aún libre?", simular pago, registrar "pagada" y notificar | E1 Cap. I | `reservas.service.crear`: bloqueo del bloque, cargo `SIM-C`, estado `PAGADA`, auditoría y notificación en una transacción; PR #53 | cumplido | 4.2 | |
| MOD-PRO-F1.b | Flujo de reservar: elegir fecha, ver horarios libres y volver a ellos si el bloque se ocupó | E1 Cap. I | — | pendiente (#15, #43) | | |
| MOD-PRO-F2 | Flujo de baja de cancha: verificar reservas, alerta, "¿proceder de igual forma?", cancelar reservas notificando, actualizar estado y auditar | E1 Cap. I | — | pendiente (#20, #41) | 4.1 | |

### 3.5 Objetivos y caso de estudio

| ID | Compromiso | Fuente | Dónde se cumple (evidencia) | Estado | Justificación / nota |
| --- | --- | --- | --- | --- | --- |
| OBJ-1 | Modelar los requisitos con casos de uso y modelo de contenido | E1 objetivos | — | pendiente (#49) | Los modelos se entregaron en E1; falta corregirlos según la sección 4 |
| OBJ-2 | Modelos navegacional y de presentación diferenciados por rol | E1 objetivos | — | pendiente (#40) | La ampliación de esos modelos no tiene issue (sección 5) |
| OBJ-3 | Modelo de procesos con el flujo de estados y la penalización | E1 objetivos | — | pendiente (#49) | Ver MOD-EST |
| OBJ-4 | Seleccionar una arquitectura backend/frontend | E1 objetivos | E2 Cap. II, aplicada en `src/` (ARQ-01 a ARQ-03) | cumplido | |
| OBJ-5.a | Backend: reservas y pagos (creación) | E1 objetivos | PR #53 | cumplido | |
| OBJ-5.b | Backend: disponibilidad, cancelación, no-show, consultas y baja de cancha | E1 objetivos | — | pendiente (#15, #17, #18, #19, #20) | |
| OBJ-6 | Frontend con interfaces diferenciadas por rol | E1 objetivos | — | pendiente (#40–#47) | |
| OBJ-7 | Desplegar en un entorno accesible y documentar el despliegue y el control de versiones | E1 objetivos | — | pendiente (#39, #50) | |
| DOM-01 | 7 canchas: 5 de fútbol sala y 2 de fútbol campo | E1 caso de estudio | `scripts/seed.js` (Sala 1–5 y Campo 1–2, tipos `SALA` y `CAMPO`); PR #30 | cumplido | |
| DOM-02 | Dos roles: cliente y administrador | E1 Cap. I | `CK_Usuario_Rol`; `ROLES` en `src/shared/constantes.js`; PR #30 | cumplido | |
| DOM-03 | Penalización del 50 % por cancelar con menos de 24 h y del 100 % por no-show | E1 caso de estudio y supuesto | — | pendiente (#17, #18) | Igual que RF05 |
| DOM-04 | Estados de la reserva: pendiente, confirmada, pagada, completada, cancelada | E1 introducción | Igual que MOD-EST.a | modificado | Sin "pendiente" porque el pago es inmediato; se agrega `NO_SHOW` (Guía §1, Estados) |

### 3.6 Decisiones de arquitectura (E2 Cap. II)

| ID | Compromiso | Fuente | Dónde se cumple (evidencia) | Estado | Justificación / nota |
| --- | --- | --- | --- | --- | --- |
| ARQ-01 | Cliente-servidor con una API central (sin peer-to-peer) | E2 Cap. II | `src/app.js` monta la API bajo `/api` (`src/routes.js`) | cumplido | |
| ARQ-02 | Monolito: un proceso, un código y una base de datos (fase 1 de la migración) | E2 Cap. II | `src/server.js` único; una base (`src/config/db.js`); un `package.json` | cumplido | Las fases 2 a 4 están en la sección 6 |
| ARQ-03.a | Capa de lógica de negocio con Node.js y Express | E2 Cap. II | `src/modules/*/…service.js`; `package.json` (`express`) | cumplido | |
| ARQ-03.b | Capa de acceso a datos: "SQL Server mediante driver/ORM parametrizado" | E2 Cap. II | `mssql` con SQL escrito a mano y `request.input(...)` en cada `…repository.js` | modificado | SQL escrito a mano, sin ORM (contrato técnico, Stack); los bloqueos de RNF09 se expresan directamente en el SQL (contrato técnico, Esquema) |
| ARQ-03.c | Capa de presentación con HTML, CSS y JS | E2 Cap. II | — | pendiente (#40) | Sin framework, en `public/` (#35 dec. 1) |
| ARQ-04 | Dominio de seis entidades principales (Usuario, Cliente, Administrador, Cancha, Horario, Reserva) | E2 Cap. II | Ocho tablas en `001_esquema.sql`: Usuario, TipoCancha, Cancha, Horario, Reserva, Pago, Auditoria y Notificacion; PR #30 | modificado | Usuario en una sola tabla (Guía §1, Usuarios); TipoCancha, Pago y Notificacion por Guía §1; Auditoria por RF13 (contrato técnico, Esquema) |
| ARQ-05 | Integridad transaccional ACID sobre una sola base SQL Server (RNF09) | E2 Cap. II | `db.enTransaccion` con `READ COMMITTED` en `reservas.service.crear`; prueba "abre la transacción con READ COMMITTED"; PR #53 | cumplido | |
| ARQ-06 | Hosting gratuito de un único servicio (Render o Azure App Service) | E2 Cap. II | — | pendiente (#37, #39) | Render con Docker y Azure SQL Database (#35 dec. 4 y 5) |
| ARQ-07.a | Un único repositorio | E2 Cap. II | https://github.com/Mattmnz/reservas-zacarias-guerra | cumplido | |
| ARQ-07.b | Un solo proceso de despliegue e integración continua | E2 Cap. II | — | pendiente (#38, #39) | |
| ARQ-08 | La lógica de negocio se prueba aislada, simulando la capa de datos | E2 Cap. II | `*.service.test.js` con `mock` de `node:test` sobre los repositorios y `db`; `npm test`: 374 pruebas | cumplido | |

### 3.7 Decisiones de desarrollo (E3 Cap. III)

| ID | Compromiso | Fuente | Dónde se cumple (evidencia) | Estado | Justificación / nota |
| --- | --- | --- | --- | --- | --- |
| DES-01 | Node.js 24 LTS con ejecutor de pruebas nativo | E3 §3.1 | `package.json`: `engines.node >=24`, `test: node --test`, `dev: node --watch` | cumplido | |
| DES-02 | Express 5 con errores async hacia un manejador central | E3 §3.1 | `package.json` (`express ^5`); `src/middlewares/manejarErrores.js`; `autenticar` lanza sin `try/catch` | cumplido | |
| DES-03.a | SQL Server Express en desarrollo | E3 §3.1 | `.env.example` (`DB_SERVER=localhost`); `scripts/migrar.js`; PR #30 | cumplido | |
| DES-03.b | Azure SQL Database en el despliegue | E3 §3.1 | — | pendiente (#39) | |
| DES-04 | Driver `mssql` con SQL escrito a mano y consultas parametrizadas | E3 §3.1 | `…repository.js` de cada módulo | cumplido | |
| DES-05 | bcryptjs para las contraseñas | E3 §3.1 | Igual que RNF02 | cumplido | |
| DES-06 | JWT sin estado y control de acceso por rol | E3 §3.1 | `auth.service` (`jwt.sign`/`jwt.verify` HS256); `autenticar.js`; `requerirRol.js`; PR #32 | cumplido | |
| DES-07 | Configuración por variables de entorno; las credenciales no se versionan | E3 §3.1 | `.env.example`; `.gitignore` excluye `.env`; `src/config/env.js` | cumplido | |
| DES-08 | API REST con respuestas JSON uniformes | E3 §3.1 | `{ data }` / `{ error: { codigo, mensaje } }`; `src/shared/AppError.js`; `manejarErrores.js` | cumplido | |
| DES-09 | El frontend consume la API "como un cliente independiente" | E3 §3.1 | — | pendiente (#40) | Se implementa modificado: mismo origen, servido por Express desde `public/` (#35 dec. 1) |
| DES-10.a | Capas por módulo: autenticación, usuarios, canchas, horarios, reservas, auditoría y notificaciones | E3 §3.2 | `src/modules/{auth,usuarios,canchas,horarios,reservas,auditoria,notificaciones}` | cumplido | |
| DES-10.b | Capas por módulo: disponibilidad | E3 §3.2 | — | pendiente (#15) | |
| DES-11 | Cada capa usa solo la inferior; los módulos se comunican por su servicio, con firmas fijas | E3 §3.2 | `reservas.service` usa `canchasService`, `horariosService`, `auditoriaService` y `notificacionesService`; firmas en el contrato técnico (Funciones entre módulos) | cumplido | Las firmas nuevas se registran en #35 (por ejemplo `obtenerParaActualizar`) |
| DES-12 | Penalización y transiciones como funciones puras con pruebas de casos límite (24 h exactas) | E3 §3.2 y §3.3 | `src/modules/reservas/reglas.js` y `reglas.test.js`; PR #29 | cumplido | |
| DES-13.a | `develop` integra y cada tarea tiene su rama | E3 §3.3 | Historial de `develop`: solo merges de PR desde ramas `feature/`, `chore/` y `docs/` | cumplido | |
| DES-13.b | `main` solo con versiones entregadas | E3 §3.3 | — | pendiente (#23) | Release `v0.3-backend` |
| DES-14 | Todo cambio entra por PR aprobado por otro integrante | E3 §3.3 | PR #25–#34 y #51–#53: todos con aprobación de alguien distinto del autor. Fuera de los merges, `develop` solo tiene el commit inicial | cumplido | |
| DES-15 | Rotación fija de revisores | E3 §3.3 | PR #51 (B) y #52 (A) los aprobó C; PR #53 (C) lo aprobó A | modificado | Durante la redistribución A y C se revisan entre sí y C revisa a B (#31); después revisa el primero disponible de los otros dos (#35, Revisión) |
| DES-16 | Ramas principales protegidas contra escritura directa, borrado y reescritura | E3 §3.3 | `gh api repos/Mattmnz/reservas-zacarias-guerra/rules/branches/{develop,main}`: ruleset 24905866 con `pull_request` (1 aprobación, solo merge commit), `non_fast_forward` y `deletion` en ambas ramas | cumplido | El check obligatorio de CI que agrega #38 no lo compromete E3 |
| DES-17 | Cada tarea es un issue y su PR lo cierra | E3 §3.3 | `Closes #N` en los PR #25–#34 y #51–#53 | cumplido | |
| DES-18 | Doble defensa ante reservas simultáneas: bloqueo de rango e índice único filtrado | E3 §3.3 | Igual que RNF09.a | cumplido | |
| DES-19 | Base local por integrante con migraciones SQL versionadas | E3 §3.3 | `db/migrations/001_esquema.sql`, `002_indices.sql`; `scripts/migrar.js` (tabla `_Migraciones`); `scripts/seed.js`; PR #30 | cumplido | |
| DES-20 | Todas las fechas en hora de Nicaragua, calculadas en la aplicación | E3 §3.3 | `src/shared/tiempo.js` (`ahoraNicaragua`, `diaSemana`) y `tiempo.test.js`; PR #27 | cumplido | |
| DES-21.a | Pago simulado dentro de la transacción de la reserva | E3 §3.3 | Igual que RF06.a | cumplido | |
| DES-21.b | Reembolsos simulados dentro de la misma transacción | E3 §3.3 | — | pendiente (#18) | |
| DES-22.a | Auditoría y notificación en la misma transacción que el cambio: creación | E3 §3.3 | Prueba "audita y notifica dentro de la misma transacción"; PR #53 | cumplido | |
| DES-22.b | Auditoría y notificación en la misma transacción: demás cambios de estado | E3 §3.3 | — | pendiente (#17, #18, #20) | |
| DES-23 | Reparto: Álvaro con autenticación, usuarios, auditoría y notificaciones | E3 §3.4 | Autenticación, PR #32 de A; auditoría y notificaciones, PR #33 de C; usuarios, PR #51 de B | modificado | Redistribución por disponibilidad (#31); frentes del sprint final (#35, Reparto) |
| DES-24.a | Etapas 1–4: base, esquema y reglas, autenticación, auditoría, canchas, horarios y creación de reservas | E3 §3.4 | PR #27, #29, #30, #32, #33, #34, #52 y #53 | cumplido | |
| DES-24.b | Etapa 5: cancelación, no-show, disponibilidad, usuarios y consultas administrativas | E3 §3.4 | Usuarios: PR #51 | pendiente (#15, #17, #18, #19, #20) | |
| DES-24.c | Etapa 6: prueba de reservas simultáneas, integración y versión del backend en `main` | E3 §3.4 | — | pendiente (#21, #22, #23) | |

## 4. Modelos: qué hay que corregir

Todo lo de esta sección es `pendiente (#49)` y se resuelve en el PR de `docs/modelos/`.

### 4.1 Correcciones

En estos puntos el diagrama contradice lo implementado o lo decidido.

| Modelo | Corrección | Base |
| --- | --- | --- |
| Casos de uso general | Simular pago pasa de `<<extend>>` a `<<include>>` de Reservar cancha | Ficha y diagrama de CU-01; Guía §1 (Pago); RF06.a |
| Casos de uso general | Quitar la asociación de Registrar usuario con el Administrador | Guía §1 (Usuarios): el registro público solo crea clientes |
| CU-01 (ficha) | Quitar el punto de extensión "si el Cliente elige pagar en línea": el pago es parte del flujo básico | Guía §1 (Pago) |
| CU-01 (ficha) | Paso 4: la reserva se registra en `PAGADA`, no en "Reservado" | Guía §1 (Estados); `CK_Reserva_Estado` |
| CU-02 (diagrama) | El rótulo dice "CU-03: Cancelar reserva"; debe decir CU-02 | Ficha de CU-02 |
| Contenido (clases) | Agregar `Pago`, `Auditoria` y `Notificacion`, con sus relaciones con Reserva y Usuario | `001_esquema.sql`; alcance de #49 |
| Contenido (clases) | Agregar `TipoCancha` (código, nombre, precio por hora) y quitar `modalidad` y `precioPorHora` de Cancha; `estado` pasa a `activa` | `001_esquema.sql`; Guía §1 (Precio) |
| Contenido (clases) | Horario: `diaSemana`, `horaApertura` y `horaCierre` en lugar de `fecha`, `horaInicio`, `horaFin` y `disponible` | `001_esquema.sql`; Guía §1 (Bloques horarios) |
| Contenido (clases) | Reserva: `inicio`, `monto`, `estado`, `activa` y `montoPenalizado`; asociada a Cancha y a Cliente, no a Horario | `001_esquema.sql` |
| Contenido (clases) | Usuario con `rol` y `telefono` como implementación en una sola tabla; quitar `Administrador.cargo` y llevar `telefono` a Usuario | Guía §1 (Usuarios); `001_esquema.sql` |
| Procesos: flujo de baja de cancha | La rama "No" de "¿Reservas activas?" va hoy a "Cancelar reservas"; debe ir a "Actualizar estado". No se cambia el orden de las actividades | Lógica del propio flujo; RF08 |
| Procesos: estados de la reserva | Agregar un diagrama de estados derivado de la tabla de transiciones de `reglas.js`: `PAGADA` (inicial) → `CONFIRMADA` (confirmar) → `COMPLETADA` (registrar asistencia); desde `PAGADA` o `CONFIRMADA` → `CANCELADA` (cancelar) o `NO_SHOW` (marcar no-show); `COMPLETADA`, `CANCELADA` y `NO_SHOW` son finales. Corregir también la lista de estados de la introducción | Objetivo específico 3; Guía §1 (Estados); `src/modules/reservas/reglas.js` |

### 4.2 Ampliaciones

Agregan elementos que el modelo no tenía. Las decide el responsable de #49.

| Modelo | Ampliación | Motivo |
| --- | --- | --- |
| Casos de uso general | Agregar Registrar asistencia (Administrador) | Estado `COMPLETADA` (Guía §1); #17 |
| Casos de uso general | Agregar el no-show automático (Sistema) | CU-02 A1; Guía §1 (No-show); #17 |
| Casos de uso general | Agregar Registrar auditoría, incluido por Cancelar reserva y los demás cambios de estado | Ficha de CU-02; RF13 |
| Casos de uso general | Agregar Notificar cliente como inclusión de Reservar cancha | PR #53 notifica al crear; RF12 |
| Procesos: estructura | Agregar las clases de proceso de confirmar, registrar asistencia y no-show | #17; tabla de transiciones de `reglas.js` |
| Procesos: flujo de reservar | Indicar que pago, auditoría y notificación ocurren en una sola transacción | DES-21 y DES-22. Opcional |

## 5. Compromisos sin issue (huecos del plan)

Estos compromisos no tienen un issue que los resuelva, así que no llevan estado. Los decide el responsable.

| Compromiso | Fuente | Detalle |
| --- | --- | --- |
| Corregir y ampliar el modelo navegacional | E1 Cap. I; #35 dec. 1 y 2 | Tiene 8 nodos. Faltan notificaciones, cancelación desde el historial y, en el administrador, reservas, horarios, usuarios y auditoría, que son pantallas de #41, #42, #45, #46 y #47. #35 pide una página por nodo, pero ningún issue actualiza el modelo |
| Completar el modelo de presentación | E1 Cap. I; #35 dec. 2 | Solo tiene catálogo y confirmar reserva. #35 valida cada pantalla contra su modelo de presentación, y las demás pantallas no tienen uno |
| Prueba de usabilidad con personas externas | #35, orden de recorte (3) | #35 la nombra como tercer recorte, pero ningún issue la crea. RNF01 queda cubierto por #40 y #21 |

## 6. Enunciados que no son compromisos de implementación

| Enunciado | Fuente | Por qué no entra en la matriz |
| --- | --- | --- |
| Fases 2 a 4 de la migración a microservicios: extraer Reservas, luego Notificaciones y, si se justifica, Gestión de canchas | E2 Cap. II | Dependen de que el complejo crezca ("si … decidiera expandir sus operaciones"). La fase 1 sí entra (ARQ-02) |
| Avance a la fecha: repositorio creado y protegido, 24 tareas registradas como issues, documentación en revisión y entorno definido | E3 §3.4 | Describen el estado al 11/10, no algo por cumplir. El plan de etapas y el reparto sí entran (DES-23 y DES-24) |

## 7. Recortes aplicados (#35)

Ninguno. Si se aplica alguno, se registra aquí con su justificación, en el orden de #35:

1. Vista de auditoría en el frontend (#47).
2. Observación de #33 sobre `?entidadId` sin `entidad`.
3. Prueba de usabilidad con personas externas.

## 8. Resumen

Corte: `develop` en `dad695e` (01/11/2026).

| Estado | Filas |
| --- | --- |
| cumplido | 63 |
| modificado | 16 |
| omitido | 0 |
| pendiente | 86 |
| **Total** | **165** |

Issues con filas pendientes: #15, #17, #18, #19, #20, #21, #22, #23, #37, #38, #39, #40, #41, #42, #43, #44, #45, #46, #47, #48, #49 y #50.
