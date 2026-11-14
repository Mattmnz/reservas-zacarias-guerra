# Guion de demo y prueba integral

Recorrido completo del sistema para ejecutarlo contra producción y presentarlo en la defensa. Responde al issue #21. La ejecución completa corresponde al hito H5 (#35).

## 1. Propósito, alcance y corte

El recorrido cubre los requisitos funcionales demostrables: registro, reserva con pago simulado, cancelación con 0 % y con 50 %, no-show, gestión administrativa de reservas, baja de cancha con alerta, gestión de usuarios, auditoría y acceso denegado por rol. La sección 7 cruza cada requisito con sus pasos.

Cada paso se hace por pantalla. La petición del `.http` queda como alternativa solo donde el paso comprueba una respuesta de la API que la pantalla no muestra.

**Corte:** `develop` en `eb84a04`, al 06/11/2026.

| Pantalla | Ruta | Estado al corte |
| --- | --- | --- |
| Login y registro (#40) | `/login.html`, `/registro.html` | En `develop` y en producción |
| Panel administrador (#40) | `/admin/panel.html` | En `develop` y en producción |
| Catálogo, reserva y confirmación (#43) | `/cliente/catalogo.html`, `/cliente/reserva.html`, `/cliente/confirmacion.html` | En `develop` y en producción |
| Historial y cancelación (#44) | `/cliente/historial.html` | En `develop` y en producción |
| Canchas y horarios (#41) | `/admin/canchas.html`, `/admin/horario.html` | En `develop` y en producción |
| Reservas del complejo (#42) | `/admin/reservas.html` | En `develop` y en producción |
| Notificaciones (#45) | `/cliente/notificaciones.html` | En `develop` y en producción |
| Usuarios (#46) | `/admin/usuarios.html` | En `develop` y en producción |
| Auditoría (#47) | `/admin/auditoria.html` | En `develop` y en producción |

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

Las peticiones alternativas se citan por el título que tienen en `docs/http/`. **Son opcionales:** el recorrido se completa por pantalla, y la copia de los `.http` hace falta solo para usarlas. Esos archivos están escritos para una base local, así que contra producción:

1. Se trabaja con una copia fuera del repositorio; los archivos versionados no se editan.
2. `@base` pasa a `https://reservas-zacarias-guerra.onrender.com/api`.
3. Los correos del seed se reemplazan por los de CD y CP, y las credenciales del administrador van en el entorno de REST Client, como explica `auth.http`.
4. Los ids (`canchaId: 1`, ids de reserva y de usuario) se reemplazan por los de la corrida.
5. Las instrucciones de SQL de esos archivos no se ejecutan: son solo para la base local.

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
| 21:00 | 21:25 | 20:00 | 21:00 | No existe: caería a las 22:00 |

**Límite:** `t_a` entre 06:45 y 20:44, para que existan los dos bloques; el último bloque del día empieza a las 21:00.

La fila de las 21:00 queda fuera de ese límite. Esa corrida usó solo `Ra1`.

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
- [ ] `GET https://reservas-zacarias-guerra.onrender.com/api/health` responde `{"data":{"db":"ok"}}` 5 min antes: Render tarda en despertar y Azure SQL puede estar en pausa.
- [ ] Salidas de RNF04 y RNF09 guardadas (sección 5).
- [ ] Dos ventanas de navegador independientes, abiertas escribiendo la URL. La sesión vive en `sessionStorage`, por ventana, así que permite tener un cliente y otra cuenta a la vez.
- [ ] Opcional: copia de los `.http` lista, si se van a usar las alternativas (sección 2).

## 4. Recorrido

| # | Actor | Dónde | Acción | Resultado esperado | Requisito |
| --- | --- | --- | --- | --- | --- |
| **A** | | **Cliente** | | | |
| 1 | CD | `/registro.html` | Crear la cuenta | Va a `/login.html?registrado=1` con aviso de cuenta creada | RF01, RNF01 |
| 2 | CD | `/login.html` | Iniciar sesión | Catálogo, con menú de cliente, su nombre y «Cerrar sesión» | RF15, RF14 |
| 3 | CD | Escribir la URL `/admin/panel.html` | Intentar entrar a la administración | Vuelve al catálogo | RF14, RNF03 |
| 4 | CD | Escribir la URL `/admin/usuarios.html` | Intentar entrar a la gestión de usuarios | Vuelve al catálogo. Alternativa: `usuarios.http`, «Cliente lista usuarios», con su token: 403 `SIN_PERMISO` | RF14, RNF03 |
| 5 | CD | `/cliente/catalogo.html` | Filtrar por fecha y por tipo | Canchas del tipo elegido, con precio por hora y bloques libres | RF02 |
| 6 | CD | Catálogo → `/cliente/reserva.html` → `/cliente/confirmacion.html` | Reservar `R1` y aceptar el diálogo del pago simulado | Estado «Pagada»; pago CARGO `SIM-C-<id>` por C$ 600 | RF03, RF06 |
| 7 | CD | Igual que el paso 6 | Reservar `R2` | Igual que el paso 6 | RF03, RF06 |
| 8 | CD y CP | `/cliente/reserva.html`, una ventana por cliente | Los dos abren el bloque de `R3`; CD reserva primero y después CP | CD: confirmación. CP: el bloque ya no está y ve «Otros horarios libres en Sala 4» | RF03, RNF09 |
| 9 | CD | Catálogo | Repetir la consulta de esa fecha | Sala 4 ya no ofrece ese bloque | RF02 |
| 10 | CD | `/cliente/historial.html` | Revisar la lista | `R1`, `R2` y `R3`, con estado, total y pagos | RF07 |
| 11 | CD y CP | `/cliente/confirmacion.html?id=<R1>`, una ventana por cliente | Los dos abren la misma URL | CD: datos y pagos de la reserva. CP: error de permisos, «Solo podés ver tus propias reservas». Alternativa: `reservas.http`, «Detalle de una reserva ajena», con el token de CP: 403 `SIN_PERMISO` | RF07, RNF03 |
| 12 | CD | Historial | Cancelar `R1` | Diálogo: 0 %, penalizado C$ 0, reembolso C$ 600. Después: mismo resultado, estado «Cancelada», pagos CARGO y REEMBOLSO `SIM-R-<id>` | RF04, RF05 |
| 13 | CD | Historial | Cancelar `R2` con un motivo | Diálogo: 50 %, penalizado C$ 300, reembolso C$ 300. Después: mismo resultado y REEMBOLSO por C$ 300 | RF04, RF05 |
| 14 | CD | `/cliente/notificaciones.html` | Consultar y pulsar «Marcar como leída» en una | Las reservas pagadas y las cancelaciones con sus montos; la tarjeta pierde «Sin leer» y baja el indicador del menú | RF12 |
| 15 | CD | Menú: «Cerrar sesión» | Salir y pulsar «atrás» en el navegador | Queda en el login; no vuelve a la página anterior | RF16 |
| **B** | | **Administración de reservas** | | | |
| 16 | Administrador | `/login.html` | Iniciar sesión | `/admin/panel.html`, con menú de administrador | RF15, RF14 |
| 17 | Administrador | Escribir la URL `/cliente/catalogo.html` | Intentar entrar a lo de cliente | Vuelve al panel. Alternativa: `reservas.http`, «Mis reservas como admin»: 403 `SIN_PERMISO` | RF14, RNF03 |
| 18 | Administrador | `/admin/reservas.html` | Filtrar con «Desde» y «Hasta» en pasado mañana; después, por cancha y estado; por último, sin filtros | Orden de agenda, con el cliente en cada tarjeta y el total de reservas; solo las que cumplen los filtros | RF10 |
| 19 | Administrador | `/admin/reservas.html` | En `R3`, pulsar «Confirmar» y aceptar el diálogo | Aviso «Reserva #<id> confirmada.», estado «Confirmada», y la tarjeta ya no ofrece «Confirmar». Alternativa, para ver el rechazo de repetirla: `reservas.http`, «Confirmarla otra vez», con `R3`: 409 `TRANSICION_INVALIDA` | RF11 |
| 20 | Administrador | `/admin/reservas.html` | Buscar «Registrar asistencia» en `R3` | La tarjeta no ofrece el botón, porque la ventana no abrió. Alternativa, para ver el rechazo de la API: `reservas.http`, «Asistencia antes de la ventana», con `R3`: 409 `TRANSICION_INVALIDA` | Regla de asistencia (#17) |
| 21 | Administrador | `/admin/reservas.html` | En `Ra1` o `Ra2`, según la sección 3, pulsar «Registrar asistencia» y aceptar el diálogo | Aviso «Asistencia registrada en la reserva #<id>.» y estado «Completada» | Regla de asistencia (#17), RF12 |
| 22 | Administrador | `/admin/reservas.html` | Filtrar por Sala 1 y estado «No se presentó», sin fechas | `Rns` con estado «No se presentó», monto penalizado C$ 600, reembolso C$ 0 y solo el pago Cargo | RF05, RF10 |
| 23 | CP | `/cliente/historial.html`; `/cliente/notificaciones.html` | Revisar `Rns` y la reserva completada | `Rns`: «No se presentó», penalizado C$ 600, reembolso C$ 0, aviso «Sin reembolso». La otra: «Completada». En notificaciones, los avisos de las dos | RF05, RF12 |
| 24 | Administrador | `/admin/reservas.html` | En `R3`, pulsar «Cancelar», escribir el motivo y pulsar «Cancelar reserva» | Diálogo: 0 %, penalizado C$ 0, reembolso C$ 600. Después: aviso con esos montos, estado «Cancelada» y pago Reembolso por C$ 600 | RF11 |
| **C** | | **Canchas** | | | |
| 25 | Administrador | `/admin/canchas.html` | En «Nueva cancha», crear `Demo DDMM-HHMM`, con la fecha y hora de la corrida y tipo sala | Aviso «Se creó la cancha…» y tarjeta nueva con estado «Activa» y C$ 600 por hora | RF08, RNF08 |
| 26 | Administrador | `/admin/canchas.html` | En la cancha Demo, pulsar «Editar», cambiar al tipo campo y pulsar «Guardar cambios» | Aviso «Se guardaron los cambios…» y la tarjeta muestra el tipo campo, a C$ 1,200 por hora | RF08 |
| 27 | Administrador | «Horario» de la cancha Demo → `/admin/horario.html?canchaId=<id>` | Revisar la semana, marcar los 7 días de 07:00 a 22:00 y pulsar «Guardar horario» | Al abrir, ningún día marcado. El diálogo lista cada cambio («Lunes: cerrado → 07:00 a 22:00»). Después: aviso «Se guardó el horario…» | RF09 |
| 28 | CD | Login → catálogo → reserva | Filtrar por CAMPO y reservar `R4` | La cancha Demo aparece a C$ 1,200; confirmación con CARGO por C$ 1,200 | RF02, RF03, RNF08 |
| 29 | Administrador | `/admin/canchas.html` | En la cancha Demo, pulsar «Dar de baja», aceptar el diálogo y, en la alerta, pulsar «Volver» | Alerta «La cancha tiene una reserva activa», con «Tiene 1 reserva activa, futura o en curso». Al volver, la tarjeta sigue «Activa» | RF08 |
| 30 | Administrador | `/admin/canchas.html` | Pulsar otra vez «Dar de baja» y, en la alerta, escribir el motivo y pulsar «Dar de baja y cancelar 1 reserva» | Aviso «Se dio de baja la cancha… Reservas canceladas con reembolso total: 1.» y estado «Inactiva» | RF08, RF13 |
| 31 | CD | `/cliente/historial.html`; `/cliente/notificaciones.html`; catálogo | Revisar `R4` y consultar de nuevo la fecha | `R4` «Cancelada», penalizado C$ 0, reembolso C$ 1,200 `SIM-R-<id>`; aviso «cancelada por baja de la cancha»; la cancha ya no aparece | RF08, RF12 |
| **D** | | **Usuarios y auditoría** | | | |
| 32 | Administrador | `/admin/usuarios.html` | Filtrar por rol Administrador; después, por rol Cliente y estado Activos | Listas filtradas; las tarjetas no muestran contraseña ni hash. Alternativa, para ver la respuesta completa: `usuarios.http`, «Solo administradores», «Clientes activos»: sin `passwordHash` | RF17, RNF02 |
| 33 | Administrador y CD | `/admin/usuarios.html`; ventana de CD | En la tarjeta de CD, pulsar «Hacer administrador» y aceptar; recargar la ventana de CD. Después, «Hacer cliente» y aceptar; recargar otra vez | Aviso «Se cambió el rol…» en cada cambio. La ventana de CD, con la misma sesión, pasa a `/admin/panel.html` (el rol se lee de la base) y después vuelve al catálogo | RF17, RNF03 |
| 34 | Administrador y CD | `/admin/usuarios.html`; ventana de CD | En la tarjeta de CD, pulsar «Desactivar» y aceptar; recargar la ventana de CD e intentar iniciar sesión. Después, «Activar» y aceptar | Aviso «Se desactivó a…». La ventana de CD va al login y el intento responde «Correo o contraseña incorrectos». Al final, aviso «Se activó a…» | RF17 |
| 35 | Administrador | `/admin/usuarios.html` | En su propia tarjeta, marcada «(usted)», pulsar «Desactivar» y aceptar | Aviso de error «No se puede cambiar el rol ni el estado del propio usuario»; sigue activo | RF17 |
| 36 | Administrador y CD | `/admin/auditoria.html` | Filtrar por entidad e id: `R2`, `Rns`, `R3`, la cancha Demo y CD. Después, CD inicia sesión y escribe esa URL | Las filas de la lista siguiente. CD vuelve al catálogo. Alternativa: `auditoria.http`, «Con token de cliente»: 403 `SIN_PERMISO` | RF13, RF14 |
| **E** | | **No funcionales** | | | |
| 37 | Quien presenta | Catálogo e historial, en un celular o en vista móvil del navegador | Recorrer las dos pantallas | Se usan sin scroll horizontal de la página | RNF05, RNF01 |
| 38 | Quien presenta | Salida de `scripts/medir-disponibilidad.js` | Mostrar el resultado | Sección 5 | RNF04 |
| 39 | Quien presenta | Salida de `scripts/concurrencia-reservas.js` | Mostrar el resultado | Sección 5 | RNF09 |

**Filas de auditoría del paso 36:**

| Entidad | Acciones esperadas en pantalla |
| --- | --- |
| `R2` | «Creación» y «Cancelación», con «Penalización 50 %» y el motivo en «Detalle» |
| `Rns` | «Creación», con CP como autor, y «Marcada como no-show», con autor «Sistema» |
| `R3` | «Creación», «Confirmación» y «Cancelación», estas dos con el administrador como autor |
| Cancha Demo | «Creación», «Edición», «Cambio de horario» y «Baja», con «Reservas canceladas: 1» en «Detalle» |
| CD | «Cambio de rol» (dos veces), «Desactivación» y «Activación» |

## 5. Evidencia de RNF04 y RNF09

| RNF | Qué se muestra | Dónde | Nota |
| --- | --- | --- | --- |
| RNF04 (disponibilidad en menos de 3 s) | Salida de `node scripts/medir-disponibilidad.js https://reservas-zacarias-guerra.onrender.com --rondas 5`: mínimo, promedio, mediana, p95, máximo y resultado. Cumple si todas las consultas responden 200 y en menos de 3000 ms; el arranque y el login no cuentan | Se mide **contra producción**. La salida se guarda en el registro de ejecución y en la matriz de trazabilidad. En vivo es opcional, con `--rondas 1` (15 consultas) | Credenciales en `MEDIR_CORREO` y `MEDIR_PASSWORD`, fuera de este documento. Depende de #39 y cierra #48. La medición local del PR #61 no vale como evidencia de producción |
| RNF09 (sin doble reserva del mismo bloque) | Salida de `node scripts/concurrencia-reservas.js --rondas 5`: por ronda, 1 respuesta 201 y 9 respuestas 409 `HORARIO_OCUPADO`, más la verificación en la base de lo que quedó | Se ejecuta **solo contra una base local**: el script se niega a correr si `DB_SERVER` no es `localhost` o `127.0.0.1`, porque borra lo que crea y necesita los clientes de prueba del seed. La salida se guarda con fecha y commit, y se muestra en la defensa | En producción, el paso 8 muestra el efecto para un usuario, pero no es una prueba de carga. El respaldo de diseño es el índice `UX_Reserva_SlotActivo` y el bloqueo `UPDLOCK, HOLDLOCK` |

## 6. Cierre

1. La cancha Demo queda inactiva y fuera del catálogo. No se toca ninguna cancha del seed, así que no hay nada que restaurar.
2. **Opcional, reactivación:** en `/admin/canchas.html`, pulsar «Reactivar» en la cancha Demo y aceptar → aviso «Se reactivó la cancha…»; la cancha vuelve al catálogo y `R4` sigue cancelada. Si se ejecuta, se repite la baja, ahora sin reservas ni alerta, para no dejarla en el catálogo.
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
| RNF07 Entorno público | Toda la corrida en <https://reservas-zacarias-guerra.onrender.com> (#39) |
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

### Corrida 1: 06/11/2026

| Dato | Valor |
| --- | --- |
| Fecha | 06/11/2026 |
| Entorno y URL | Producción, https://reservas-zacarias-guerra.onrender.com |
| Commit desplegado | `81bca1b` (`main`, PR #86, integrado a las 20:31) |
| Quién presenta | Álvaro Garay |
| `T` y `Δ` real | `T` = 21:00. Primera acción auditada a las 21:16 (paso 6). Paso 21 a las 21:27: `Δ` real de 27 min |
| Inicio de `Rns` | 20:00, Sala 1 (reserva #1, creada a las 19:51) |
| Inicio de `Ra1` y `Ra2`; cuál se usó | `Ra1` 21:00, Sala 2 (reserva #2, creada a las 19:53), usada en el paso 21. `Ra2` no se creó: caería a las 22:00, fuera de horario |
| Salas distintas de las previstas | `R1` se reservó para el 08/11 a las 07:00, no a las 19:00. `R2`, para el 07/11 a las 07:00: con `T` = 21:00 no hay bloques ese día a 2 h o más de `T`. `R3` no se creó |

Los ids, las horas y los datos de las reservas se tomaron el 11/11/2026 de las pantallas Reservas y Auditoría de producción. Este registro reemplaza al anterior, que daba por ejecutados los pasos 8, 9, 19, 20, 24, 38 y 39: no se ejecutaron en esta corrida y están en la corrida complementaria. Los pasos 4, 11 y 17 se verificaron por pantalla.

#### Resultado por paso

| Paso | Resultado | Hora | Observaciones | Issue |
| --- | --- | --- | --- | --- |
| 1 | OK | | CD: Cliente Demo0611, `cliente.demo.0611@demo.local` (usuario #3) | |
| 2 | OK | | | |
| 3 | OK | | | |
| 4 | OK | | Por pantalla: `/admin/usuarios.html` como cliente vuelve al catálogo | |
| 5 | OK | | | |
| 6 | OK | 21:16 | `R1` #3: Sala 3, 08/11 07:00, CARGO `SIM-C-3` por C$ 600 | |
| 7 | OK | 21:17 | `R2` #4: Sala 3, 07/11 07:00, CARGO `SIM-C-4` por C$ 600 | |
| 8 | Omitido | | `R3` no se creó. Ver la corrida complementaria | |
| 9 | Omitido | | Depende del paso 8. Ver la corrida complementaria | |
| 10 | OK | | Historial con `R1` y `R2` | |
| 11 | OK | | Por pantalla: CP abre la confirmación de `R1` y recibe un error de permisos | |
| 12 | OK | 21:22 | `R1`: 0 %, reembolso C$ 600 (`SIM-R-3`) | |
| 13 | OK | 21:23 | `R2`: 50 %, penalizado C$ 300, reembolso C$ 300 (`SIM-R-4`), con motivo | |
| 14 | OK | | | |
| 15 | OK | | | |
| 16 | OK | | | |
| 17 | OK | | Por pantalla: `/cliente/catalogo.html` como administrador vuelve al panel | |
| 18 | OK | | | |
| 19 | Omitido | | `R3` no se creó. Ver la corrida complementaria | |
| 20 | Omitido | | `R3` no se creó. Ver la corrida complementaria | |
| 21 | OK | 21:27 | Asistencia de `Ra1` (#2): Pagada → Completada | |
| 22 | OK | | `Rns` (#1) en No-show desde las 21:01, marcada por el sistema; penalizado C$ 600, solo CARGO `SIM-C-1` | |
| 23 | OK | | | |
| 24 | Omitido | | `R3` no se creó. Ver la corrida complementaria | |
| 25 | OK | 21:32 | Cancha `Demo 0611` (#8), creada como Sala | |
| 26 | OK | 21:33 | Tipo: Sala → Campo | |
| 27 | OK | 21:34 | Los 7 días de 07:00 a 22:00 | |
| 28 | OK | 21:35 | `R4` #5: `Demo 0611`, 08/11 19:00, CARGO `SIM-C-5` por C$ 1,200 | |
| 29 | OK | | Alerta con 1 reserva activa; la cancha sigue activa | |
| 30 | OK | 21:37 | Baja con motivo; 1 reserva cancelada | |
| 31 | OK | | `R4` cancelada con reembolso de C$ 1,200 (`SIM-R-5`) | |
| 32 | OK | | | |
| 33 | OK | 21:38 y 21:43 | CD pasa a administrador y vuelve a cliente. La vuelta a cliente se hizo después del paso 34 | |
| 34 | OK | 21:39 y 21:40 | Desactivación y activación de CD. Fuera del guion: con CD como administrador se desactivó y reactivó la cuenta Administrador (usuario #1), de 21:40 a 21:41 | |
| 35 | OK | | Error: no se puede cambiar el rol ni el estado del propio usuario | |
| 36 | OK | | Sin `R3` | |
| 37 | OK | | Vista móvil del navegador | |
| 38 | Omitido | | No se mostró en esta corrida. Ver la corrida complementaria | |
| 39 | Omitido | | No se ejecutó en esta corrida. Ver la corrida complementaria | |
| Cierre | OK | | Cancha `Demo 0611` inactiva; `R1`, `R2` y `R4` canceladas; CD activo y como cliente; `Ra1` completada | |

### Corrida complementaria: 11/11/2026

| Dato | Valor |
| --- | --- |
| Fecha | 11/11/2026 |
| Entorno y URL | Producción, https://reservas-zacarias-guerra.onrender.com |
| Commit desplegado | `bc86292` (`main`, PR #90) |
| Quién presenta | Álvaro Garay |
| Alcance | Pasos 8, 9, 19, 20, 24, 38 y 39, que no se ejecutaron en la corrida 1 |
| `R3` | Sala 4, 13/11 a las 20:00 (reserva #6) |

#### Resultado por paso

| Paso | Resultado | Hora | Observaciones | Issue |
| --- | --- | --- | --- | --- |
| 8 | OK | | `R3` #6 de CD: Sala 4, 13/11 20:00, CARGO `SIM-C-6` por C$ 600. CP abrió el mismo bloque y recibió los otros horarios libres de Sala 4 | |
| 9 | OK | | Sala 4 dejó de ofrecer las 20:00 del 13/11 | |
| 19 | OK | | `R3` pasó a Confirmada y la tarjeta dejó de ofrecer «Confirmar» | |
| 20 | OK | | La tarjeta de `R3` no ofrece registrar la asistencia antes de su ventana | |
| 24 | OK | 00:54 | El administrador cancela `R3`: Confirmada → Cancelada, 0 %, reembolso C$ 600 (`SIM-R-6`), con motivo | |
| 38 | OK | | Salida guardada de la medición del 05/11: RNF04 cumple | |
| 39 | OK | | 5 rondas contra la base local: 1 × 201 y 9 × 409 en cada una | |
| Cierre | OK | | `R3` cancelada | |

### Evidencia de RNF

| RNF | Resultado | Fecha | Entorno | Dónde está la salida |
| --- | --- | --- | --- | --- |
| RNF04 | Cumple: 75 consultas, 0 con error, promedio 369 ms, máximo 544 ms | 05/11/2026 23:00 | Producción (`main` en `fe9cf37`) | PR #79 y fila RNF04 de `docs/trazabilidad.md` |
| RNF09 | OK (5/5 rondas): 1 × 201 y 9 × 409 `HORARIO_OCUPADO` por ronda | 11/11/2026 | Base local (`develop` en `607eb26`) | Salida guardada fuera del repositorio |
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
