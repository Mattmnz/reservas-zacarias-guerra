# reservas-zacarias-guerra

Sistema web de reservas de canchas del Complejo Deportivo Zacarías Guerra (Managua): 5 canchas de fútbol sala y 2 de campo. Una sola aplicación en Node.js sirve la API REST y el frontend, con SQL Server como base de datos.

Proyecto de la asignatura Diseño de Sistemas de Internet (UNI, 2026), con metodología UWE. Los pagos, los reembolsos y las notificaciones son simulados: no hay pasarela de pago ni envío de correos.

**Producción:** https://reservas-zacarias-guerra.onrender.com

## Qué hace

| Rol | Funciones |
| --- | --- |
| Cliente | Registrarse e iniciar sesión; consultar la disponibilidad por fecha y tipo de cancha; reservar con pago simulado; ver el historial con sus pagos; cancelar con la penalización según la anticipación (0 % con 24 h o más, 50 % con menos); ver sus notificaciones |
| Administrador | Gestionar canchas (alta, edición, baja con alerta si tiene reservas activas) y sus horarios semanales; ver todas las reservas con filtros; confirmar, registrar la asistencia y cancelar; gestionar usuarios (rol y estado); consultar la auditoría |
| Sistema | Marcar como no-show, con penalización total, las reservas sin asistencia una hora después del inicio; auditar cada cambio de reservas, canchas y usuarios; notificar al cliente cada cambio de sus reservas; impedir dos reservas activas en la misma cancha y hora |

La correspondencia de cada requisito de los entregables con su implementación está en `docs/trazabilidad.md`.

## Tecnología y arquitectura

Monolito en capas organizado por módulo funcional (rutas, controlador, servicio y repositorio), según el Capítulo II. Cada módulo se comunica con otro solo a través de su servicio.

| Componente | Elección |
| --- | --- |
| Entorno de ejecución | Node.js 24 LTS |
| Framework HTTP | Express 5 |
| Base de datos | SQL Server: Express en desarrollo, Azure SQL Database en producción |
| Acceso a datos | Driver `mssql` con SQL parametrizado escrito a mano y migraciones versionadas |
| Contraseñas y sesión | `bcryptjs` y JSON Web Tokens, con control de acceso por rol |
| Frontend | HTML, CSS y JavaScript sin framework, en `public/`: una página por nodo del modelo navegacional |
| Pruebas | Ejecutor nativo de Node (`node --test`) |
| Contenedores | Docker (imagen única de la aplicación) y Docker Compose (aplicación más SQL Server) |
| CI/CD | GitHub Actions, GitHub Container Registry (GHCR) y Render |

## Estructura

```text
src/
  app.js, server.js, routes.js
  config/            variables de entorno y conexión a la base
  middlewares/       autenticación, rol y manejo de errores
  modules/           auth, usuarios, canchas, horarios, disponibilidad, reservas,
                     auditoria, notificaciones, salud (rutas, controlador, servicio, repositorio)
  shared/            utilidades comunes
public/              frontend (convenciones en public/README.md)
db/                  migraciones, scripts de producción y documentación de la base
scripts/             migración, seed, preparación de la base en Compose, prueba de concurrencia
                     y medición de RNF04
docs/                trazabilidad, modelos, guion de demo, peticiones .http e integrantes
.github/             workflow de CI/CD, prueba de humo y plantilla de pull request
Dockerfile, compose.yaml
```

## Instalación

### Requisitos

- Node.js 24 LTS
- SQL Server Express con TCP habilitado en el puerto 1433, una base `ZacariasGuerra` y un login `zg_app` con acceso a ella
- Git

### Pasos

1. Clonar el repositorio e instalar dependencias:

   ```bash
   git clone https://github.com/Mattmnz/reservas-zacarias-guerra.git
   cd reservas-zacarias-guerra
   npm install
   ```

2. Copiar `.env.example` a `.env` y completar los valores (`DB_PASSWORD`, `JWT_SECRETO` y, para el seed, `SEED_ADMIN_CORREO`, `SEED_ADMIN_PASSWORD` y `SEED_CLIENTES_PRUEBA`, que va en `true` en local). Si falta una variable obligatoria, el servidor no arranca y dice cuál falta.

3. Crear las tablas y cargar los datos iniciales:

   ```bash
   npm run db:migrar
   npm run db:seed
   ```

4. Levantar el servidor en modo desarrollo (se reinicia al guardar cambios):

   ```bash
   npm run dev
   ```

5. Comprobar que responde y que llega a la base de datos:

   ```bash
   curl http://localhost:3000/api/health
   # {"data":{"db":"ok"}}
   ```

   La interfaz se abre en `http://localhost:3000`. Las cuentas de prueba locales están en `db/README.md`.

### Pruebas

```bash
npm test
```

Corre las pruebas del backend y las de `public/js` con el ejecutor nativo de Node. No usan base de datos.

## Con Docker

Levanta SQL Server, prepara la base y arranca la API sin instalar Node ni SQL Server. Sirve como entorno local reproducible y como respaldo de la demo.

### Requisitos

- Docker Desktop con el motor en marcha (WSL 2) y unos 2 GB de RAM libres para SQL Server.
- `.env` completo, como en la instalación local, más `MSSQL_SA_PASSWORD`.
- `MSSQL_SA_PASSWORD` y `DB_PASSWORD` cumplen la política de SQL Server: mínimo 8 caracteres con 3 de estos 4: mayúsculas, minúsculas, dígitos y símbolos. Con `DB_PASSWORD` se crea el login de la aplicación dentro del contenedor.
- Si cambiás `DB_PASSWORD` para que cumpla la política, el SQL Server local conserva la anterior y `npm run dev` deja de conectar. Cambiala también ahí, en SSMS contra la instancia local: `ALTER LOGIN zg_app WITH PASSWORD = '...';` (con tu `DB_USER` si no es `zg_app`).
- Si una contraseña tiene `$`, va entre comillas simples en `.env` (`DB_PASSWORD='...'`): Compose interpreta `$` como variable.

### Levantar

```bash
docker compose up --build
```

| Servicio | Qué hace |
| --- | --- |
| `db` | SQL Server 2022 Express, en la versión fijada en `compose.yaml` (`2022-CU27-GDR1-ubuntu-22.04`). La primera vez descarga la imagen (alrededor de 1,5 GB). |
| `preparar` | Crea la base y el login de `DB_USER`, aplica las migraciones y el seed. Termina con código 0; es idempotente. |
| `api` | Arranca cuando `preparar` terminó bien. Escucha en `http://localhost:3000`. |

Comprobar:

```bash
curl http://localhost:3000/api/health
# {"data":{"db":"ok"}}
```

### Notas

- `compose.yaml` fija `DB_SERVER=db` (el nombre del servicio): el `.env` de la instalación local no cambia.
- La API del contenedor y `npm run dev` usan el puerto 3000: no corren a la vez.
- SSMS se conecta al SQL Server del contenedor en `localhost,14330`, usuario `sa`.
- `docker compose down` detiene los contenedores y conserva los datos; `docker compose down -v` borra también la base.

## Integración y despliegue continuos

Cada pull request y cada push a `develop` y `main` ejecutan el workflow `.github/workflows/ci.yml` en GitHub Actions. Las reglas de protección de `develop` y `main` exigen que `Pruebas`, `Imagen Docker` y `Autoría de commits` pasen antes del merge.

| Job | Qué comprueba o hace |
| --- | --- |
| Pruebas | `npm ci` y `npm test` con Node 24 y variables de entorno ficticias. Las pruebas no usan base de datos |
| Imagen Docker | Que `compose.yaml` sea válido, que la imagen se construya y que el contenedor arranque y responda: prueba de humo sin base de datos (`.github/scripts/prueba-humo.sh`) |
| Autoría de commits | Que ningún mensaje de commit declare coautoría o generación automática |
| Publicar imagen | Solo en un push a `main` y con los tres anteriores en verde: construye la imagen, le corre la prueba de humo y sube esa misma imagen a GHCR con las etiquetas `latest` y `sha-<commit>` |
| Despliegue | Después de `Publicar imagen`: dispara el deploy hook de Render, que descarga la imagen `latest` |

`Publicar imagen` y `Despliegue` aparecen omitidos en los pull requests y no son checks obligatorios.

El resultado aparece al pie de cada pull request y en la pestaña *Actions*.

## Producción

| Pieza | Servicio |
| --- | --- |
| Imagen | GHCR: `ghcr.io/mattmnz/reservas-zacarias-guerra`, pública, con `latest` y una etiqueta `sha-<commit>` por cada merge en `main` |
| Aplicación | Render, servicio web del plan gratuito que ejecuta la imagen `latest` de GHCR |
| Base de datos | Azure SQL Database con la oferta gratuita (serverless, con pausa automática) |
| Usuario de la aplicación | Usuario contenido con permisos solo de lectura y escritura de filas (`db/produccion/usuario-app.sql`) |

### Cómo llega un cambio a producción

1. El cambio entra en `develop` por pull request, con la aprobación de otro integrante y los checks en verde.
2. Un pull request de `develop` a `main`, aprobado y mergeado con merge commit (nunca *squash* ni *rebase*: `main` y `develop` divergirían).
3. El job `Publicar imagen` construye la imagen, le corre la prueba de humo y la sube a GHCR. La imagen que se despliega es la misma que pasó la prueba.
4. El job `Despliegue` dispara el deploy hook de Render, guardado como secreto del repositorio, y Render descarga la imagen `latest`.
5. La verificación es manual: los jobs en verde en *Actions*, el deploy en *Live* en *Events* de Render y `GET /api/health` con `{"data":{"db":"ok"}}`.

Las migraciones nuevas se aplican a mano contra Azure antes del merge a `main`, como indica `db/README.md`: la imagen no las ejecuta al arrancar.

Para volver a una versión anterior se usa *Rollback* en *Events* de Render, y la corrección entra después por el mismo flujo. Cada versión queda además en GHCR con su etiqueta `sha-<commit>`: si hiciera falta, el servicio de Render puede apuntar a esa etiqueta en lugar de `latest`. El rollback no deshace migraciones. El procedimiento completo está en `docs/despliegue.md`.

### Plan gratuito

- Render apaga el servicio después de 15 minutos sin tráfico y tarda cerca de un minuto en volver.
- La base se pausa sin uso. La primera petición después de una pausa puede fallar mientras arranca; la siguiente reintenta la conexión.
- El chequeo de salud de Render apunta a `/`, que no consulta la base, para no consumir el cupo gratuito.

## Documentación

| Documento | Contenido |
| --- | --- |
| `docs/trazabilidad.md` | Matriz de trazabilidad de requisitos y modelos UWE |
| `docs/modelos/` | Modelos UWE corregidos: casos de uso, contenido, estados de la reserva, flujo de baja de cancha y navegacional |
| `docs/guion-demo.md` | Guion de demo y prueba integral contra producción |
| `docs/despliegue.md` | Despliegue y control de versiones |
| `docs/http/` | Peticiones de prueba por módulo para REST Client |
| `db/README.md` | Esquema, migraciones, seed y preparación de la base de producción |
| `public/README.md` | Rutas de cada pantalla y convenciones del frontend |
| `docs/integrantes/` | Fichas de los integrantes |

## Control de versiones

- `main` contiene solo versiones entregadas y es lo que está en producción; `develop` integra el trabajo terminado.
- Cada tarea es un issue y se desarrolla en su propia rama (`feature/…`, `fix/…`, `docs/…`, `chore/…`, `ci/…`, `test/…`). Nadie trabaja directo sobre `main` ni `develop`.
- Todo cambio entra por pull request, con la plantilla del repositorio (qué cambia, requisitos, cómo se probó y pendientes) y la aprobación de otro integrante.
- Las reglas de protección de `develop` y `main` exigen pull request y checks en verde, e impiden el borrado de las ramas y el force-push.
- El plan del sprint final y sus decisiones están en el issue fijado #35.
- Versiones publicadas: `v0.3-backend` (backend completo y primer despliegue) y `v1.0` (entrega final).

## Equipo

| Integrante | Rol | Frentes principales |
| --- | --- | --- |
| Matthew Muñoz | A | Estructura del proyecto, base de datos, autenticación, canchas, horarios, disponibilidad y baja de cancha; Docker, CI/CD y despliegue; pantallas de administración de canchas, horarios y reservas |
| Álvaro Garay | B | Usuarios, consultas de reservas y prueba de concurrencia; guion de demo, medición de RNF04, matriz de trazabilidad y documentación del despliegue |
| Keneth Palacios | C | Reservas (creación con pago simulado, estados, cancelación y no-show), auditoría y notificaciones; frontend base, pantallas de cliente y pantallas de usuarios y auditoría |

El aporte de cada integrante puede seguirse en los commits y pull requests del repositorio.
