# Guion de demo y prueba integral

Recorrido completo del sistema para ejecutarlo contra producción y presentarlo en la defensa. Responde al issue #21. La ejecución completa corresponde al hito H5 (#35).

## 1. Propósito, alcance y corte

El recorrido cubre los requisitos funcionales demostrables: registro, reserva con pago simulado, cancelación con 0 % y con 50 %, no-show, gestión administrativa de reservas, baja de cancha con alerta, gestión de usuarios, auditoría y acceso denegado por rol. La sección 7 cruza cada requisito con sus pasos.

Cada paso sale de algo que existe en `develop`: la pantalla si ya está; si no, la petición del `.http` correspondiente, marcada «pantalla pendiente (#N)».

**Corte:** `develop` en `2fec740`, al 05/11/2026.

| Pantalla | Ruta | Estado al corte |
| --- | --- | --- |
| Login y registro (#40) | `/login.html`, `/registro.html` | En `develop` |
| Panel administrador (#40) | `/admin/panel.html` | En `develop` |
| Catálogo, reserva y confirmación (#43) | `/cliente/catalogo.html`, `/cliente/reserva.html`, `/cliente/confirmacion.html` | En `develop` |
| Historial y cancelación (#44) | `/cliente/historial.html` | En `develop` |
| Canchas y horarios (#41) | `/admin/canchas.html`, `/admin/horario.html` | Pendiente |
| Reservas del complejo (#42) | `/admin/reservas.html` | Pendiente |
| Notificaciones (#45) | `/cliente/notificaciones.html` | Pendiente (PR #71) |
| Usuarios (#46) | `/admin/usuarios.html` | Pendiente (PR #72) |
| Auditoría (#47) | `/admin/auditoria.html` | Pendiente (PR #73) |

Cuando una pantalla pendiente entra en `develop`, su paso se actualiza para usarla y se actualiza este corte. Hasta entonces, los enlaces del menú a esas rutas responden un 404 en JSON: durante la demo no se usan.

## 2. Roles y convenciones

### Actores

| Actor | Quién es | Cuándo se crea |
| --- | --- | --- |
| Cliente Demo (CD) | Cliente nuevo de cada corrida | En vivo, en el paso 1, con un correo que no se haya usado (si se repite, responde `CORREO_DUPLICADO`) |
| Cliente Preparación (CP) | Dueño de las reservas que no se pueden crear en vivo | Antes de la demo, desde `/registro.html` (sección 3) |
| Administrador | Cuenta creada por el seed de producción | Ya existe |

Producción no tiene clientes de prueba (#35, decisión 9). **Las credenciales de la cuenta de preparación y del administrador las guarda quien presenta, fuera de este documento.** Tampoco se escribe aquí la contraseña de CD.

### Reservas

| Id | Dueño | Cancha | Inicio | Para qué |
| --- | --- | --- | --- | --- |
| `Rns` | CP | Sala 1 | Sección 3 | No-show |
| `Ra1`, `Ra2` | CP | Sala 2 | Sección 3 | Asistencia y su respaldo |
| `R1` | CD | Sala 3 | Pasado mañana, 19:00 | Cancelación con 0 % |
| `R2` | CD | Sala 3 | Primer bloque de hoy a 2 h o más de `T`; si no hay, mañana a las 07:00 | Cancelación con 50 % |
| `R3` | CD | Sala 4 | Pasado mañana, 20:00 | Bloque ocupado, confirmar y cancelación del administrador |
| `R4` | CD | Cancha Demo | Pasado mañana, 19:00 | Baja de cancha |

Los montos esperados suponen los precios del seed: SALA C$ 600 y CAMPO C$ 1,200.

### Peticiones

«(#N)» en la tabla significa «pantalla pendiente (#N)». Las peticiones se citan por el título que tienen en `docs/http/`. Esos archivos están escritos para una base local, así que contra producción:

1. Se trabaja con una copia fuera del repositorio; los archivos versionados no se editan.
2. `@base` pasa a `<URL-de-produccion>/api`.
3. Los correos del seed se reemplazan por los de CD y CP, y las credenciales del administrador van en el entorno de REST Client, como explica `auth.http`.
4. Los ids (`canchaId: 1`, ids de reserva y de usuario) se reemplazan por los de la corrida.
5. Las instrucciones de SQL de esos archivos no se ejecutan: son solo para la base local.

`<URL-de-produccion>` se completa en el registro de ejecución cuando #39 esté terminado.

## 3. Preparación previa

### Por qué estas reservas no se crean en vivo

`POST /api/reservas` solo acepta `0 < inicio − ahora ≤ 30 días`, y en producción no se mueven reservas con SQL. Por eso:

- **No-show:** el barrido marca las reservas con `Inicio <= ahora − 1 h`, es decir, cuando el bloque ya terminó. Esa reserva tuvo que crearse antes de su inicio, más de una hora antes de la demo.
- **Asistencia:** se registra desde 15 min antes del inicio hasta el fin del bloque (`inicio − 15 min ≤ ahora < inicio + 1 h`). Un bloque ya empezado no se puede crear. Solo se podría crear en vivo si el paso cayera en los últimos 15 min de una hora, y eso depende del reloj; por eso se prepara.

### Cálculo de horarios

Todas las horas son de Nicaragua (UTC−6).

- `T`: inicio de la demo.
- `Δ`: tiempo desde `T` hasta el paso de asistencia (paso 21). Provisional: 25 min; se reemplaza por lo medido en el primer ensayo.
- `t_a = T + Δ`.

| Reserva | Regla |
| --- | --- |
| `Rns` | Hora en punto anterior o igual a `T`, menos 1 h. Si queda fuera del horario (07:00 a 21:00 como inicio), el último bloque anterior dentro del horario |
| `Ra1` | Si los minutos de `t_a` son menos de 45: la hora en punto de `t_a`. Si son 45 o más: la hora siguiente. Así quedan al menos 15 min de margen antes de que cierre la ventana |
| `Ra2` | `Ra1` + 1 h, por si la demo se atrasa |

| `T` | `t_a` (`Δ` = 25 min) | `Rns` | `Ra1` | `Ra2` |
| --- | --- | --- | --- | --- |
| 09:00 | 09:25 | 08:00 | 09:00 | 10:00 |
| 14:40 | 15:05 | 13:00 | 15:00 | 16:00 |
| 15:25 | 15:50 | 14:00 | 16:00 | 17:00 |
| 07:30 | 07:55 | 21:00 del día anterior | 08:00 | 09:00 |

**Límite:** `t_a` entre 06:45 y 20:44, para que existan los dos bloques; el último bloque del día empieza a las 21:00.

### Creación

1. Registrar a CP en `/registro.html`, una sola vez; la cuenta sirve para las corridas siguientes.
2. Iniciar sesión como CP y crear `Rns`, `Ra1` y `Ra2` desde el catálogo. **Toda la preparación termina antes del inicio de `Rns`**; lo recomendado es hacerla el día anterior.
3. Si un bloque ya está ocupado por una corrida anterior, usar otra sala y anotarla en el registro. Una reserva `NO_SHOW` o `COMPLETADA` sigue ocupando su bloque.
4. Si `T` se mueve, recalcular y crear de nuevo `Ra1` y `Ra2`. `Rns` sirve mientras ya esté vencida a la hora de la demo.

### Qué reserva usar en el paso de asistencia

| Hora real `t` del paso | Qué hacer |
| --- | --- |
| `t < Ra1 − 15 min` | La ventana no abrió: seguir con el recorrido y volver a este paso cuando abra |
| `Ra1 − 15 min ≤ t < Ra1 + 1 h` | Usar `Ra1` |
| `t ≥ Ra1 + 1 h` | `Ra1` ya venció y el barrido la marca `NO_SHOW`: usar `Ra2` |

### No-show: se muestra el resultado, no la transición

El barrido es perezoso: se ejecuta al consultar disponibilidad, `reservas/mias`, el listado y el detalle de reservas, y al cancelar o registrar asistencia. `Rns` puede llegar ya en `NO_SHOW` si alguien consultó antes, por ejemplo con la medición de RNF04, y ninguna lectura la muestra vencida como `PAGADA`. Por eso el guion no depende de ver el cambio: muestra el estado `NO_SHOW`, la penalización del 100 %, la auditoría sin usuario y la notificación.

### Lista de comprobación antes de `T`

- [ ] `T`, `Δ` y las horas de `Rns`, `Ra1` y `Ra2` anotadas en el registro.
- [ ] CP tiene sus tres reservas.
- [ ] `GET <URL-de-produccion>/api/health` responde `{"data":{"db":"ok"}}` 5 min antes: Render tarda en despertar y Azure SQL puede estar en pausa.
- [ ] Salidas de RNF04 y RNF09 guardadas (sección 5).
- [ ] Dos ventanas de navegador independientes, abiertas escribiendo la URL. La sesión vive en `sessionStorage`, por ventana, así que permite tener un cliente y otra cuenta a la vez.
- [ ] Copia de los `.http` lista (sección 2).

## 4. Recorrido

| # | Actor | Dónde | Acción | Resultado esperado | Requisito |
| --- | --- | --- | --- | --- | --- |
| **A** | | **Cliente** | | | |
| 1 | CD | `/registro.html` | Crear la cuenta | Va a `/login.html?registrado=1` con aviso de cuenta creada | RF01, RNF01 |
| 2 | CD | `/login.html` | Iniciar sesión | Catálogo, con menú de cliente, su nombre y «Cerrar sesión» | RF15, RF14 |
| 3 | CD | Escribir la URL `/admin/panel.html` | Intentar entrar a la administración | Vuelve al catálogo | RF14, RNF03 |
| 4 | CD | `usuarios.http`: «Cliente lista usuarios» | Ejecutar con su token | 403 `SIN_PERMISO` | RF14, RNF03 |
| 5 | CD | `/cliente/catalogo.html` | Filtrar por fecha y por tipo | Canchas del tipo elegido, con precio por hora y bloques libres | RF02 |
| 6 | CD | Catálogo → `/cliente/reserva.html` → `/cliente/confirmacion.html` | Reservar `R1` y aceptar el diálogo del pago simulado | Estado «Pagada»; pago CARGO `SIM-C-<id>` por C$ 600 | RF03, RF06 |
| 7 | CD | Igual que el paso 6 | Reservar `R2` | Igual que el paso 6 | RF03, RF06 |
| 8 | CD y CP | `/cliente/reserva.html`, una ventana por cliente | Los dos abren el bloque de `R3`; CD reserva primero y después CP | CD: confirmación. CP: el bloque ya no está y ve «Otros horarios libres en Sala 4» | RF03, RNF09 |
| 9 | CD | Catálogo | Repetir la consulta de esa fecha | Sala 4 ya no ofrece ese bloque | RF02 |
| 10 | CD | `/cliente/historial.html` | Revisar la lista | `R1`, `R2` y `R3`, con estado, total y pagos | RF07 |
| 11 | CD y CP | `/cliente/confirmacion.html?id=<R1>`; `reservas.http`: «Detalle de una reserva ajena» | CD ve el detalle de `R1`; CP lo pide con su token | CD: datos y pagos de la reserva. CP: 403 `SIN_PERMISO` | RF07, RNF03 |
| 12 | CD | Historial | Cancelar `R1` | Diálogo: 0 %, penalizado C$ 0, reembolso C$ 600. Después: mismo resultado, estado «Cancelada», pagos CARGO y REEMBOLSO `SIM-R-<id>` | RF04, RF05 |
| 13 | CD | Historial | Cancelar `R2` con un motivo | Diálogo: 50 %, penalizado C$ 300, reembolso C$ 300. Después: mismo resultado y REEMBOLSO por C$ 300 | RF04, RF05 |
| 14 | CD | Pantalla pendiente (#45). `notificaciones.http`: «Mis notificaciones», «Marcar leída» | Consultar y marcar una como leída | Las reservas pagadas y las cancelaciones con sus montos; 204 | RF12 |
| 15 | CD | Menú: «Cerrar sesión» | Salir y pulsar «atrás» en el navegador | Queda en el login; no vuelve a la página anterior | RF16 |
| **B** | | **Administración de reservas** | | | |
| 16 | Administrador | `/login.html` | Iniciar sesión | `/admin/panel.html`, con menú de administrador | RF15, RF14 |
| 17 | Administrador | Escribir la URL `/cliente/catalogo.html`; `reservas.http`: «Mis reservas como admin» | Intentar entrar a lo de cliente | Vuelve al panel; 403 `SIN_PERMISO` | RF14, RNF03 |
| 18 | Administrador | Pantalla pendiente (#42). `reservas.http`: «Listado admin sin filtros», «Listado admin de mañana», «Listado admin por cancha y estado» | Filtrar; en la de fecha, usar `desde` = `hasta` = pasado mañana | Orden de agenda, con `clienteNombre`; solo las reservas que cumplen los filtros | RF10 |
| 19 | Administrador | Pantalla pendiente (#42). `reservas.http`: «Confirmar la reserva creada (admin)», «Confirmarla otra vez» | Ejecutar con `R3` | 200 `CONFIRMADA`; 409 `TRANSICION_INVALIDA` | RF11 |
| 20 | Administrador | Pantalla pendiente (#42). `reservas.http`: «Asistencia antes de la ventana» | Ejecutar con `R3` | 409 `TRANSICION_INVALIDA` | Regla de asistencia (#17) |
| 21 | Administrador | Pantalla pendiente (#42). `reservas.http`: «Registrar asistencia» | Ejecutar con `Ra1` o `Ra2`, según la sección 3 | 200 `COMPLETADA` | Regla de asistencia (#17), RF12 |
| 22 | Administrador | Pantalla pendiente (#42). `reservas.http`: «Listado admin por cancha y estado» | Filtrar por Sala 1 y `estado=NO_SHOW` | `Rns` con `montoPenalizado` igual al monto y solo el pago CARGO | RF05, RF10 |
| 23 | CP | Historial; pantalla pendiente (#45), `notificaciones.http`: «Mis notificaciones» | Revisar `Rns` y la reserva completada | `Rns`: «No se presentó», penalizado C$ 600, reembolso C$ 0, aviso «Sin reembolso». La otra: «Completada» | RF05, RF12 |
| 24 | Administrador | Pantalla pendiente (#42). `reservas.http`: «El admin cancela la reserva de cliente1» | Cancelar `R3` con motivo | 200 `CANCELADA`, `montoPenalizado` 0, REEMBOLSO por C$ 600 | RF11 |
| **C** | | **Canchas** | | | |
| 25 | Administrador | Pantalla pendiente (#41). `canchas.http`: «Tipos de cancha», «Crear Prueba 1 (SALA)» | Crear la cancha `Demo DDMM-HHMM`, con la fecha y hora de la corrida | 201, activa | RF08, RNF08 |
| 26 | Administrador | Pantalla pendiente (#41). `canchas.http`: «Editar Prueba 2: pasa a CAMPO» | Ejecutar con la cancha Demo | 200, tipo CAMPO | RF08 |
| 27 | Administrador | Pantalla pendiente (#41). `horarios.http`: «Cancha nueva sin horarios»; `canchas.http`: «Horario de Prueba 1: toda la semana de 07:00 a 22:00» | Consultar y definir el horario de la cancha Demo | `[]`; después, los 7 días | RF09 |
| 28 | CD | Login → catálogo → reserva | Filtrar por CAMPO y reservar `R4` | La cancha Demo aparece a C$ 1,200; confirmación con CARGO por C$ 1,200 | RF02, RF03, RNF08 |
| 29 | Administrador | Pantalla pendiente (#41). `canchas.http`: «Baja sin confirmar», «Detalle de Prueba 1» | Pedir la baja de la cancha Demo | 409 `CANCHA_CON_RESERVAS`, «La cancha tiene 1 reserva activa»; la cancha sigue `activa: true` | RF08 |
| 30 | Administrador | Pantalla pendiente (#41). `canchas.http`: «Baja con confirmar» | Confirmar, con motivo | 200, `activa: false`, `reservasCanceladas: 1` | RF08, RF13 |
| 31 | CD | Historial; pantalla pendiente (#45), `notificaciones.http`: «Mis notificaciones»; catálogo | Revisar `R4` y consultar de nuevo la fecha | `R4` «Cancelada», penalizado C$ 0, reembolso C$ 1,200 `SIM-R-<id>`; aviso «cancelada por baja de la cancha»; la cancha ya no aparece | RF08, RF12 |
| **D** | | **Usuarios y auditoría** | | | |
| 32 | Administrador | Pantalla pendiente (#46). `usuarios.http`: «Solo administradores», «Clientes activos» | Filtrar | Listas filtradas, sin `passwordHash` | RF17, RNF02 |
| 33 | Administrador | Pantalla pendiente (#46). `usuarios.http`: «Prueba Usuarios pasa a ADMIN», «Con su token emitido como CLIENTE, ya lista usuarios», «Vuelve a CLIENTE», «Con el mismo token pierde el acceso en el acto» | Ejecutar con CD | 200; 200 (el rol se lee de la base); 200; 403 | RF17, RNF03 |
| 34 | Administrador | Pantalla pendiente (#46). `usuarios.http`: «Desactivar a Prueba Usuarios», «Su token deja de funcionar en el acto», «Activar a Prueba Usuarios» | Ejecutar con CD | 200; 401 `NO_AUTENTICADO`; 200 | RF17 |
| 35 | Administrador | Pantalla pendiente (#46). `usuarios.http`: «El admin se desactiva a sí mismo» | Ejecutar con su propio id | 400 `VALIDACION` | RF17 |
| 36 | Administrador | Pantalla pendiente (#47). `auditoria.http`: «Filtrar por entidad e id», «Con token de cliente» | Consultar `R2`, `Rns`, `R3`, la cancha Demo y CD; después, con el token de CD | Las filas de la lista siguiente; el cliente recibe 403 | RF13, RF14 |
| **E** | | **No funcionales** | | | |
| 37 | Quien presenta | Catálogo e historial, en un celular o en vista móvil del navegador | Recorrer las dos pantallas | Se usan sin scroll horizontal de la página | RNF05, RNF01 |
| 38 | Quien presenta | Salida de `scripts/medir-disponibilidad.js` | Mostrar el resultado | Sección 5 | RNF04 |
| 39 | Quien presenta | Salida de `scripts/concurrencia-reservas.js` | Mostrar el resultado | Sección 5 | RNF09 |

**Filas de auditoría del paso 36:**

| Entidad | Acciones esperadas |
| --- | --- |
| `R2` | `CREAR` y `CANCELAR`, con «Penalización 50 %» y el motivo |
| `Rns` | `CREAR` y `MARCAR_NO_SHOW`, con usuario nulo |
| `R3` | `CREAR`, `CONFIRMAR` y `CANCELAR`, estas dos con el id del administrador |
| Cancha Demo | `CREAR`, `EDITAR`, `CAMBIAR_HORARIO` y `BAJA`, con «Reservas canceladas: 1» |
| CD | `CAMBIAR_ROL` (dos veces), `DESACTIVAR` y `ACTIVAR` |

## 5. Evidencia de RNF04 y RNF09

| RNF | Qué se muestra | Dónde | Nota |
| --- | --- | --- | --- |
| RNF04 (disponibilidad en menos de 3 s) | Salida de `node scripts/medir-disponibilidad.js <URL-de-produccion> --rondas 5`: mínimo, promedio, mediana, p95, máximo y resultado. Cumple si todas las consultas responden 200 y en menos de 3000 ms; el arranque y el login no cuentan | Se mide **contra producción**. La salida se guarda en el registro de ejecución y en la matriz de trazabilidad. En vivo es opcional, con `--rondas 1` (15 consultas) | Credenciales en `MEDIR_CORREO` y `MEDIR_PASSWORD`, fuera de este documento. Depende de #39 y cierra #48. La medición local del PR #61 no vale como evidencia de producción |
| RNF09 (sin doble reserva del mismo bloque) | Salida de `node scripts/concurrencia-reservas.js --rondas 5`: por ronda, 1 respuesta 201 y 9 respuestas 409 `HORARIO_OCUPADO`, más la verificación en la base de lo que quedó | Se ejecuta **solo contra una base local**: el script se niega a correr si `DB_SERVER` no es `localhost` o `127.0.0.1`, porque borra lo que crea y necesita los clientes de prueba del seed. La salida se guarda con fecha y commit, y se muestra en la defensa | En producción, el paso 8 muestra el efecto para un usuario, pero no es una prueba de carga. El respaldo de diseño es el índice `UX_Reserva_SlotActivo` y el bloqueo `UPDLOCK, HOLDLOCK` |

## 6. Cierre

1. La cancha Demo queda inactiva y fuera del catálogo. No se toca ninguna cancha del seed, así que no hay nada que restaurar.
2. **Opcional, reactivación:** `canchas.http`, «Alta de Prueba 1», con la cancha Demo → 200, `activa: true`; la cancha vuelve al catálogo y `R4` sigue cancelada. Si se ejecuta, se repite la baja, ahora sin reservas ni alerta, para no dejarla en el catálogo.
3. Comprobar que `R1`, `R2`, `R3` y `R4` están canceladas, y que CD sigue activo y con rol CLIENTE.
4. Reserva de asistencia que no se usó: si todavía no empezó, CP la cancela desde el historial; si ya empezó, ya no se puede cancelar y queda `NO_SHOW` con el siguiente barrido. Se anota en el registro.
5. Cerrar las dos sesiones y completar el registro de ejecución.

## 7. Cobertura

### Requisitos funcionales

| RF | Qué cubre | Pasos |
| --- | --- | --- |
| RF01 | Registro de clientes | 1 |
| RF02 | Disponibilidad | 5, 9, 28 |
| RF03 | Crear reserva | 6, 7, 8, 28 |
| RF04 | El cliente cancela | 12, 13 |
| RF05 | Penalización automática | 12, 13, 22, 23 |
| RF06 | Pago simulado | 6, 7 |
| RF07 | Historial y detalle | 10, 11 |
| RF08 | Alta, edición y baja de canchas | 25, 26, 29, 30, 31 |
| RF09 | Horarios | 27 |
| RF10 | Listado administrativo con filtros | 18, 22 |
| RF11 | Confirmar y cancelar como administrador | 19, 24 |
| RF12 | Notificaciones | 14, 21, 23, 31 |
| RF13 | Auditoría | 30, 36 |
| RF14 | Acceso según el rol | 2, 3, 4, 16, 17, 36 |
| RF15 | Inicio de sesión | 2, 16 |
| RF16 | Cierre de sesión | 15 |
| RF17 | Gestión de usuarios | 32, 33, 34, 35 |

La asistencia (pasos 20 y 21) es una regla del dominio sin RF propio (#17).

### Requisitos no funcionales

| RNF | Evidencia |
| --- | --- |
| RNF01 Usabilidad | El recorrido por las pantallas, sin instrucciones de uso |
| RNF02 Contraseñas con hash | Paso 32 (no expone el hash); `auth.service.registrar` y la columna `Usuario.PasswordHash` |
| RNF03 Acceso restringido | Pasos 3, 4, 11, 17 y 33 |
| RNF04 Tiempo de respuesta | Paso 38 y sección 5 |
| RNF05 Responsive | Paso 37 |
| RNF06 Capas separadas | Estructura de `src/modules/` y `public/js/`; se muestra en el repositorio, no en el recorrido |
| RNF07 Entorno público | Toda la corrida en `<URL-de-produccion>` (#39) |
| RNF08 Agregar canchas sin rediseño | Pasos 25 y 28 |
| RNF09 Concurrencia | Pasos 8 y 39, y sección 5 |

### Fuera del recorrido

- **Cambio de precio** (`PUT /api/tipos-cancha/:id/precio`): alteraría datos de producción. Está en `canchas.http`.
- **Borde de 24 h exactas:** no se puede reproducir a mano; lo cubre `reglas.test.js`.

## 8. Registro de ejecución

Se copia esta plantilla por cada corrida y se completa al ejecutarla. No se anotan contraseñas ni tokens.

### Corrida

| Dato | Valor |
| --- | --- |
| Fecha | |
| Entorno y URL | |
| Commit desplegado | |
| Quién presenta | |
| `T` y `Δ` real | |
| Inicio de `Rns` | |
| Inicio de `Ra1` y `Ra2`; cuál se usó | |
| Salas distintas de las previstas | |

### Resultado por paso

Resultado: `OK`, `FALLA` u `Omitido`.

| Paso | Resultado | Hora | Observaciones | Issue |
| --- | --- | --- | --- | --- |
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |
| 5 | | | | |
| 6 | | | | |
| 7 | | | | |
| 8 | | | | |
| 9 | | | | |
| 10 | | | | |
| 11 | | | | |
| 12 | | | | |
| 13 | | | | |
| 14 | | | | |
| 15 | | | | |
| 16 | | | | |
| 17 | | | | |
| 18 | | | | |
| 19 | | | | |
| 20 | | | | |
| 21 | | | | |
| 22 | | | | |
| 23 | | | | |
| 24 | | | | |
| 25 | | | | |
| 26 | | | | |
| 27 | | | | |
| 28 | | | | |
| 29 | | | | |
| 30 | | | | |
| 31 | | | | |
| 32 | | | | |
| 33 | | | | |
| 34 | | | | |
| 35 | | | | |
| 36 | | | | |
| 37 | | | | |
| 38 | | | | |
| 39 | | | | |
| Cierre | | | | |

### Evidencia de RNF

| RNF | Resultado | Fecha | Entorno | Dónde está la salida |
| --- | --- | --- | --- | --- |
| RNF04 | | | Producción | |
| RNF09 | | | Base local | |

## 9. Reporte de fallas

Toda falla se reporta como issue `bug`, asignado al dueño del módulo.

1. Anotar la falla en el registro. Seguir con el recorrido si los pasos siguientes no dependen de ese paso.
2. Crear el issue, con la etiqueta `bug` y la del rol del dueño:

   ```bash
   gh issue create --repo Mattmnz/reservas-zacarias-guerra --label bug --label <A|B|C> --assignee <dueño> --title "Demo, paso <N>: <síntoma>"
   ```

3. Completar el cuerpo con: paso, entorno y commit, fecha y hora de Nicaragua, resultado esperado, resultado obtenido (status y `codigo`), ids involucrados y pasos para reproducirlo. No incluir credenciales ni tokens.
4. Poner el número del issue en el registro. Cuando el arreglo esté desplegado, repetir el paso y actualizar su resultado. H5 exige que no queden errores abiertos.

| Módulo | Rol | Dueño |
| --- | --- | --- |
| Autenticación, canchas, horarios, disponibilidad, base de datos y despliegue; pantallas #41 y #42 | A | `Mattmnz` |
| Usuarios (API); scripts de medición y de concurrencia; este guion | B | `AlvaroGaray` |
| Reservas, auditoría y notificaciones (API); pantallas #40, #43, #44, #45, #46 y #47 | C | `Kepalcast1` |
