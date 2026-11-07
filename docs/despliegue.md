# Despliegue y control de versiones

Cómo está desplegado el sistema de reservas del Complejo Deportivo Zacarías Guerra, cómo reproducir ese despliegue y cómo se integran y publican los cambios. Está pensado para quien no participó en el despliegue original.

Cada paso indica qué hacer y, en «Se comprueba», cómo saber que salió bien.

Este documento nunca lleva secretos: las variables van por nombre y función, y los valores entre `<...>` los pone quien ejecuta el paso.

**Hace falta:**

- Git, Node.js 24 y la CLI `gh`, con sesión iniciada.
- SQL Server Management Studio (SSMS).
- Acceso a los recursos de Azure y de Render, y permisos en el repositorio.

Docker no es necesario para desplegar, porque la imagen no se construye en la máquina de quien despliega (sección 3.1). Para el entorno local con Docker, ver la sección «Con Docker» del `README.md`.

En Windows PowerShell, `curl` es un alias de otro comando: usar `curl.exe`, como en este documento.

## 1. Arquitectura de producción

```text
Merge a main
    |
    v
GitHub Actions (ci.yml): Pruebas + Imagen Docker + Autoría de commits
    |  los tres en verde
    v
GitHub Actions: Publicar imagen (GHCR), y después Despliegue hace POST al deploy hook
    |
    v
Render: arranca la API y el frontend (de dónde sale la imagen: sección 3.1)
    |  SQL con el usuario zg_app (solo lectura y escritura de filas)
    v
Azure SQL Database: servidor zg-reservas-mnz, base ZacariasGuerra
```

| Pieza | Región | Plan | Motivo |
| --- | --- | --- | --- |
| GitHub Actions | No aplica | No aplica | Impide integrar cambios con pruebas o imagen rotas, y despliega solo lo que llega a `main` con esos controles en verde |
| GitHub Container Registry (GHCR) | No aplica | No aplica | Guarda la imagen de cada merge en `main`, con las etiquetas `latest` y `sha-<commit>` |
| Render, servicio Docker | Ohio | Gratuito | Ejecuta una sola imagen con la API y el frontend (`public/`, servido por Express). Sale del mismo `Dockerfile` que se usa en Compose y en CI |
| Azure SQL Database | Central US | Oferta gratuita | El hosting gratuito no ofrece disco persistente ni la memoria que SQL Server requiere, así que la base no puede vivir junto a la aplicación |

Las regiones no son arbitrarias: Central US porque East US no aceptaba servidores nuevos en esa suscripción, y Ohio porque es la región de Render más cercana a Central US.

URL pública: <https://reservas-zacarias-guerra.onrender.com>

Tanto el servicio como la base se pausan cuando nadie los usa. Antes de una demo hay que despertarlos (sección 6.2).

## 2. Base de producción en Azure SQL

### 2.1 Crear el servidor y la base

Tiene que quedar:

- Servidor `zg-reservas-mnz.database.windows.net` y base `ZacariasGuerra`, en el grupo de recursos `rg-zacarias-guerra`, en la región Central US. Las migraciones no crean la base: debe existir antes. La región de la primera base gratuita queda fija para las demás de la suscripción.
- Oferta gratuita aplicada: serverless, Gen5, 2 vCores, 32 GB.
- Intercalación `SQL_Latin1_General_CP1_CI_AS`, TLS mínimo 1.2 y *Advanced data security* en *Not now*.
- Solo autenticación SQL, sin Entra.
- *Overage billing* desactivado: la base **se pausa al agotar el cupo** y no cobra. Activarlo cobra, así que no se hace al crear la base (qué hacer si el cupo se agota: sección 7).

Se comprueba: en la base, **Compute + storage**, la opción de qué hacer al agotar la oferta está en **Auto-pause the database until next month**.

El cupo es de 100.000 vCore-segundos, 32 GB de datos y 32 GB de respaldos por base y por mes, y se renueva al inicio de cada mes. El consumo se ve en el **Overview** de la base, en *Free monthly vCore amount remaining*.

### 2.2 Abrir el firewall

Las reglas se agregan desde **Networking** del servidor. Tiene que haber:

| Regla | Origen | Para qué |
| --- | --- | --- |
| `render-ohio-1` | `74.220.50.0` a `74.220.50.255` | Salida de Render en Ohio |
| `render-ohio-2` | `74.220.58.0` a `74.220.58.255` | Salida de Render en Ohio |
| La que crea el portal al agregar la IP del cliente | La IP pública de la máquina que ejecuta las migraciones | Migraciones, seed y SSMS |

*Allow Azure services* queda en **No**, y no hace falta ninguna otra regla.

La regla de la máquina que migra se conserva después de migrar. Si esa IP cambia, se agrega otra regla en la misma página.

Los rangos de Render son por región y compartidos, y se consultan en la página del servicio, en **Connect → Outbound**, no en la de un deploy. Render no avisa si cambian: el síntoma está en la sección 7.

Se comprueba: la máquina conecta si `npm run db:migrar` (paso 2.4) no da error de conexión. Render conecta si `GET /api/health` responde `{"data":{"db":"ok"}}` (sección 6.1).

### 2.3 Preparar las variables para migrar

Las migraciones y el seed se ejecutan **como administrador del servidor**, desde un clon actualizado de `main`:

```powershell
git fetch origin
git switch main
git pull --ff-only
npm ci
```

Se comprueba: `git log -1 --oneline` muestra el mismo commit que `origin/main`.

Definir las variables en una terminal nueva de PowerShell. Tienen prioridad sobre `.env`, que no se modifica. `Read-Host` evita que las contraseñas queden en el historial de la terminal.

```powershell
$env:DB_SERVER = 'zg-reservas-mnz.database.windows.net'
$env:DB_PORT = '1433'
$env:DB_NAME = 'ZacariasGuerra'
$env:DB_USER = '<login-administrador>'
$env:DB_PASSWORD = Read-Host 'Contraseña del administrador del servidor'
$env:DB_CONFIAR_CERTIFICADO = 'false'
$env:SEED_ADMIN_CORREO = '<correo-del-administrador-de-la-aplicacion>'
$env:SEED_ADMIN_PASSWORD = Read-Host 'Contraseña del administrador de la aplicación'
$env:SEED_CLIENTES_PRUEBA = 'false'
# Las exige la configuración al cargar, pero migrar y sembrar no las usan.
$env:PORT = '3000'
$env:JWT_SECRETO = 'no-se-usa-al-migrar'
$env:JWT_EXPIRA = '8h'
```

El administrador entra con autenticación SQL. `<login-administrador>` es solo el login, sin el nombre del servidor. Lo conoce el responsable del despliegue y no se publica en este documento.

Las variables `SEED_*` existen solo en esta terminal: no van en Render (sección 3.2).

Se comprueba: `$env:DB_CONFIAR_CERTIFICADO` responde `false` y `$env:SEED_CLIENTES_PRUEBA` responde `false`.

**Al terminar la sección 2, cerrar esta terminal.** Mientras siga abierta, cualquier comando de la aplicación que se ejecute en ella apunta a producción.

### 2.4 Aplicar las migraciones

```powershell
npm run db:migrar
```

Se comprueba: en una base vacía muestra `Aplicada: 001_esquema.sql` y `Aplicada: 002_indices.sql`. Repetirlo muestra `Sin migraciones pendientes.` Cada archivo se aplica en su propia transacción: si uno falla, no queda a medias y el comando termina con código 1.

No ejecutar `scripts/preparar-base.js`: es solo para Docker Compose.

### 2.5 Cargar los datos iniciales

```powershell
npm run db:seed
```

Se comprueba: la salida incluye `Clientes de prueba: no`. En una base recién creada, los totales son `TipoCancha` 2, `Cancha` 7, `Horario` 49 y `Usuario` 1, y el resto de las tablas tiene 0 filas.

Se puede repetir sin duplicar nada. Un usuario que ya existe no se modifica, tampoco su contraseña. Los clientes de la demo se registran en vivo.

### 2.6 Crear el usuario de la aplicación

1. Conectar SSMS con *Server name* `zg-reservas-mnz.database.windows.net`, *Authentication* `SQL Server Authentication` y *Login* `<login-administrador>`, el que conoce el responsable del despliegue. En *Options → Connect to database*, elegir `ZacariasGuerra`: desde `master`, el usuario queda en el lugar equivocado.
2. Abrir `db/produccion/usuario-app.sql` en esa conexión.
3. Escribir la contraseña en `@password`, solo en esa ventana.
4. Ejecutar el script.
5. Cerrar la ventana sin guardar y desconectarse: una conexión abierta, incluido el Explorador de objetos, consume cupo e impide la pausa de la base.

El script crea el usuario contenido `zg_app`, que vive en la base y no en `master`. Si el usuario ya existe, le cambia la contraseña y no duplica nada. Esa misma contraseña va después en `DB_PASSWORD` de Render.

Se comprueba:

- La consulta final lista `db_datareader` y `db_datawriter`, y nada más.
- `git status` no muestra cambios en el archivo.

### 2.7 Migraciones de versiones posteriores

El despliegue no migra: el contenedor solo arranca el servidor y `ci.yml` no tiene un paso de migración. Además, `zg_app` no puede crear tablas. Por eso, una migración nueva se aplica a mano contra Azure, **antes del merge a `main`**, con los pasos 2.3 y 2.4.

No hace falta repetir `usuario-app.sql`, porque los roles de `zg_app` abarcan también las tablas nuevas.

La última migración aplicada en producción es `002_indices.sql`: no hay nuevas desde entonces.

## 3. Servicio en Render

### 3.1 Crear el servicio

Tiene que quedar:

| Ajuste | Valor |
| --- | --- |
| Nombre | `reservas-zacarias-guerra`, en el espacio de trabajo «UNI» |
| Tipo | Servicio web Docker, con el `Dockerfile` de la raíz |
| Rama | `main` |
| Repositorio | Conectado con la integración de GitHub. La app de Render tiene acceso solo a este repositorio |
| Región | Ohio |
| Plan | Gratuito |
| Puerto | `PORT=3000`, que coincide con el `EXPOSE` del `Dockerfile`. El valor por defecto de Render es 10000 |
| Chequeo de salud | `/`, a propósito: no consulta la base. `/api/health` hace `SELECT 1` y despertaría la base en cada chequeo, consumiendo el cupo gratuito |
| Auto-deploy | Apagado |

`.dockerignore` deja fuera `.env*`: la imagen no lleva secretos y los valores se configuran en el servicio.

**Origen de la imagen.** Hoy Render construye la imagen con el `Dockerfile` de la rama `main`. El job `Publicar imagen` sube otra imagen a GHCR, pero producción todavía no la ejecuta.

**Aviso de transición.** Las secciones «Integración y despliegue continuos» y «Producción» del `README.md` describen a Render ejecutando la imagen `latest` de GHCR. Ese es el estado posterior a dos pasos pendientes: la primera corrida de `Publicar imagen` en `main` y el cambio del servicio a la imagen de GHCR. Cuando se hagan, hay que actualizar lo que depende del origen de la imagen: esta sección, la comprobación de versión de la sección 6.1, el paso de GHCR de la sección 6.3 y la fila `Publicar imagen` de la sección 7.

Pasos para crear el servicio. Están **reconstruidos a partir de la configuración que quedó, no recordados**: la secuencia exacta del portal puede variar. Lo que vale es la tabla de arriba.

1. En el dashboard de Render: **New → Web Service**, y elegir el repositorio `reservas-zacarias-guerra`.
2. Nombre `reservas-zacarias-guerra`, región **Ohio**, rama `main`, entorno **Docker**, plan **Free**.
3. Cargar las variables de entorno (sección 3.2).
4. En las opciones avanzadas: **Health Check Path** en `/` y **Auto-Deploy** en No.
5. Crear el servicio.

### 3.2 Variables de entorno

Son las nueve que exige `src/config/env.js`. Si falta una, el servidor no arranca e informa cuál es.

| Variable | Para qué sirve |
| --- | --- |
| `PORT` | Puerto en el que escucha el servidor. Tiene que coincidir con el `EXPOSE` del `Dockerfile` |
| `DB_SERVER` | Nombre completo del servidor de Azure SQL |
| `DB_PORT` | Puerto del servidor de base de datos |
| `DB_NAME` | Base a la que se conecta la aplicación |
| `DB_USER` | Usuario de la aplicación creado en el paso 2.6 (`zg_app`), nunca el administrador |
| `DB_PASSWORD` | Contraseña de ese usuario. Es secreta |
| `DB_CONFIAR_CERTIFICADO` | Indica si se acepta el certificado del servidor sin validarlo. En Azure va en `false` |
| `JWT_SECRETO` | Firma los tokens de sesión. Es secreta, y cambiarla invalida las sesiones abiertas |
| `JWT_EXPIRA` | Duración de los tokens de sesión |

No van en Render, porque el servidor no las usa y `env.js` no las exige: `SEED_ADMIN_CORREO`, `SEED_ADMIN_PASSWORD`, `SEED_CLIENTES_PRUEBA` y `MSSQL_SA_PASSWORD`.

Se comprueba: el registro del servicio muestra `Servidor escuchando en http://localhost:3000` y `GET /api/health` responde `{"data":{"db":"ok"}}` (sección 6.1).

### 3.3 Auto-deploy y deploy hook

Con el auto-deploy apagado, un cambio en `main` no se despliega por sí solo: lo dispara el job `Despliegue` del CI, y solo con los otros cuatro jobs en verde.

El auto-deploy se apaga, y el deploy hook se obtiene o se regenera, en el servicio: **Settings**, sección **Deploy**.

La URL del deploy hook permite desplegar a cualquiera que la tenga. Se guarda únicamente en el secreto `RENDER_DEPLOY_HOOK` (sección 4.2) y no se escribe en issues, PRs, documentos ni registros. Si se regenera el hook, el secreto queda inválido y hay que actualizarlo.

## 4. CI y CD

El workflow es `.github/workflows/ci.yml` y tiene permiso de lectura sobre el repositorio. Solo el job `Publicar imagen` suma `packages: write`, para subir la imagen a GHCR.

### 4.1 Jobs

| Job | Qué ejecuta | Qué protege |
| --- | --- | --- |
| `Pruebas` | `npm ci` y `npm test` con Node 24 y variables ficticias | La lógica y los contratos cubiertos por pruebas. No usa una base real, así que **no detecta SQL roto**: eso se prueba con los `.http` y SSMS |
| `Imagen Docker` | `docker compose config --quiet`, `docker build` y la prueba de humo (`.github/scripts/prueba-humo.sh`) | Que `compose.yaml` sea válido, que la imagen se construya y que el contenedor arranque y responda sin base de datos: `/` con la página de entrada, `/api/auth/yo` sin token con 401 y una ruta inexistente con 404 |
| `Autoría de commits` | Revisa los mensajes de los commits del cambio | Que cada commit tenga un solo autor: rechaza líneas `Co-authored-by:` y el texto `generated with` |
| `Publicar imagen` | Solo en un push a `main` y con los tres anteriores en verde: construye la imagen, le corre la prueba de humo y sube esa misma imagen a `ghcr.io/mattmnz/reservas-zacarias-guerra` con las etiquetas `latest` y `sha-<commit>` (los 7 primeros caracteres del commit) | Que al registro llegue solo una imagen probada. La etiqueta del commit sube primero: `latest` se mueve solo si esa subió bien |
| `Despliegue` | `POST` al deploy hook, después de `Publicar imagen`. Requiere los otros cuatro en verde | Que a producción llegue solo lo integrado en `main` con los controles aprobados |

### 4.2 Secreto `RENDER_DEPLOY_HOOK`

Guarda la URL del deploy hook. Se crea en *Settings > Secrets and variables > Actions > New repository secret*, y lo hace el dueño del repositorio: en un repositorio de cuenta personal, los secretos los administra el dueño. Si falta, el job `Despliegue` falla con `Falta el secreto RENDER_DEPLOY_HOOK`.

Se comprueba, sin ver el valor:

```powershell
gh secret list --repo Mattmnz/reservas-zacarias-guerra
```

La lista tiene que incluir `RENDER_DEPLOY_HOOK`.

### 4.3 Qué pasa en cada caso

| Evento | `Pruebas`, `Imagen Docker`, `Autoría de commits` | `Publicar imagen` | `Despliegue` | Resultado |
| --- | --- | --- | --- | --- |
| Pull request | Corren. Son obligatorios para integrar en `develop` o `main` | Omitido | Omitido | Nada se publica ni se despliega |
| Push a `develop` | Corren | Omitido | Omitido | Nada se publica ni se despliega |
| Push a `main` (merge de un PR) | Corren | Corre si los tres pasan | Corre si los tres y `Publicar imagen` pasan | GHCR recibe la imagen y Render, el pedido de despliegue |

- Un push nuevo al mismo PR o rama cancela la ejecución anterior. Con dos merges seguidos a `main`, el segundo reemplaza al primero.
- `Publicar imagen` y `Despliegue` no son checks obligatorios: corren después del merge, cuando el cambio ya está en `main`.
- **`Despliegue` en verde significa que Render recibió el pedido, no que la versión esté en línea.** La verificación es manual a propósito (sección 6.1), y es obligatoria después de cada despliegue. No va al CI por dos motivos: el despliegue en el plan gratuito tarda varios minutos y el job tendría que esperarlo, y consultar `/api/health` gasta cupo de la base.

Se comprueba el resultado de la última ejecución en `main`:

```powershell
gh run list --repo Mattmnz/reservas-zacarias-guerra --branch main --limit 1
gh run view <id-de-la-ejecucion> --repo Mattmnz/reservas-zacarias-guerra --json jobs --jq '.jobs[] | {name,conclusion}'
```

Los cinco jobs tienen que figurar con `success`.

## 5. Control de versiones

### 5.1 Ramas

| Rama | Uso |
| --- | --- |
| `main` | Solo entregas, con tag. Cada integración despliega a producción |
| `develop` | Integración y rama por defecto |
| `feature/`, `fix/`, `test/`, `docs/`, `chore/` | Trabajo de un issue. Salen de `develop` |

Ramas apiladas: si un issue depende de un PR abierto, su rama nace de la rama de ese PR, con un solo nivel, y se actualiza con `develop` cuando ese PR se integra. Nunca se usa `rebase`.

Los mensajes de commit siguen el formato `tipo(modulo): descripción`, con los tipos `feat`, `fix`, `test`, `refactor`, `docs` y `chore`.

### 5.2 Pull requests

1. Abrir el PR con la plantilla del repositorio: Qué cambia, Requisitos, Cómo se probó y Pendientes.
2. Enlazar el issue. `Closes #N` lo cierra al integrarse; `Refs #N` lo menciona sin cerrarlo.
3. Con el CI en verde, pedir revisión al primero disponible de los otros dos integrantes. El plazo es de 3 horas: si vence, el autor avisa y revisa el otro.
4. Quien aprueba hace el merge, siempre como merge commit.

La profundidad de la revisión depende del riesgo y está definida en #35.

### 5.3 Protección de `develop` y `main`

El ruleset `proteccion` se aplica a las dos ramas:

- No se pueden borrar ni recibir force push.
- Todo entra por PR, con 1 aprobación como mínimo.
- Un push nuevo descarta las aprobaciones anteriores.
- El único método de merge permitido es el merge commit.
- Son obligatorios los checks `Pruebas`, `Imagen Docker` y `Autoría de commits`.
- No se exige que la rama esté actualizada con su base.

Se comprueba:

```powershell
gh api repos/Mattmnz/reservas-zacarias-guerra/rules/branches/main
gh api repos/Mattmnz/reservas-zacarias-guerra/rules/branches/develop
```

### 5.4 Publicar una versión

1. Si la versión trae una migración nueva, aplicarla antes (sección 2.7).
2. Abrir un PR de `develop` a `main`. Se comprueba: los tres checks en verde y la aprobación registrada.
3. Integrarlo como merge commit. Se comprueba: los cinco jobs en `success` (sección 4.3).
4. Verificar producción (sección 6.1).
5. Crear el release desde la web, en **Releases → Draft a new release**, con un tag nuevo sobre el merge commit de `main`. Se comprueba: `git ls-remote --tags origin` lista el tag sobre ese commit.

Versión publicada hasta ahora: `v0.3-backend`, marcada como pre-release, sobre `fe9cf37`. Se comprueba con `gh release list --repo Mattmnz/reservas-zacarias-guerra`. La versión `v1.0` corresponde a la entrega final y va igual, como release normal.

El ruleset exige 1 aprobación, también en una entrega. Para el PR de entrega de `v1.0` se piden las de los otros dos integrantes, como acuerdo del equipo (#23): el ruleset no lo impone.

## 6. Operación

### 6.1 Verificar después de desplegar

```powershell
curl.exe -i https://reservas-zacarias-guerra.onrender.com/
curl.exe -i https://reservas-zacarias-guerra.onrender.com/api/health
```

| Resultado | Significado |
| --- | --- |
| `/` da 200 y `/api/health` da 200 con `{"data":{"db":"ok"}}` | La aplicación está en línea y llega a la base |
| `/` da 200 y `/api/health` da 500 con `ERROR_INTERNO` | La aplicación está en línea, pero no llega a la base (sección 7) |
| `/` no responde | El servicio está despertando o falló al arrancar (sección 7) |

Esto confirma que el sistema funciona, pero no qué versión está en línea. Para eso, en el servicio de Render:

- **Events** lista cada deploy y su commit.
- **Logs** muestra los registros.

Se comprueba: el commit del último evento *Deploy live* es igual al de `main`.

```powershell
git ls-remote origin refs/heads/main
```

Esta comprobación vale mientras Render construya desde `main` (sección 3.1).

### 6.2 Despertar el servicio y la base antes de una demo

Render se duerme a los 15 minutos sin tráfico y tarda cerca de un minuto en volver. El plan da 750 horas gratuitas por mes por espacio de trabajo. Azure SQL puede estar en pausa, y reanudarla también tarda cerca de un minuto. Por eso, al menos 5 minutos antes:

```powershell
curl.exe --max-time 90 https://reservas-zacarias-guerra.onrender.com/api/health
```

Repetir hasta recibir `{"data":{"db":"ok"}}`. Un 500 durante este tiempo es normal, porque la aplicación vuelve a intentar la conexión en cada pedido. Si no responde bien después de 3 minutos, ir a la sección 7.

Pedir solo `/` no alcanza, porque despierta el servicio pero no la base.

Cuánto tarda la base en pausarse no está confirmado: con la oferta aplicada, el portal no muestra *Auto-pause delay* y el valor real no se consultó. Por eso conviene despertarla siempre antes de la demo.

Docker Compose es el respaldo de la demo si producción no está disponible (`README.md`, sección «Con Docker»).

### 6.3 Volver a una versión anterior

1. En Render: *Events* → el último deploy bueno → **Rollback** → **Rollback to this deploy**. Reutiliza la imagen anterior sin compilar.
2. La corrección entra por el flujo normal (rama → `develop` → `main`), y el deploy hook despliega la versión corregida.

Cada merge en `main` deja además en GHCR una imagen con la etiqueta `sha-<commit>`. Si hiciera falta, y una vez que el servicio ejecute la imagen de GHCR (sección 3.1), puede apuntar a esa etiqueta en lugar de `latest`.

Se comprueba con la sección 6.1. Hasta que entre la corrección, lo que está en línea no coincide con `main`: el commit se compara con el del deploy elegido.

**Límites:**

- **No fue probado:** el procedimiento sale de la documentación de Render.
- Render guarda pocos deploys según el plan.
- El rollback no deshace migraciones ni cambia las variables del servicio. Una versión con una migración nueva no se puede volver atrás así: las migraciones no tienen reversa, y los cambios de esquema van siempre en una migración nueva.
- La oferta gratuita incluye respaldos de la base, pero nunca se usó ni se probó una restauración: no es un procedimiento probado.

## 7. Problemas frecuentes

| Síntoma | Causa | Qué hacer |
| --- | --- | --- |
| `Faltan variables de entorno: ...` al arrancar | Falta una variable obligatoria o está vacía | Definir las que nombra el mensaje (sección 3.2). El mensaje menciona `.env`, pero en Render se configuran en el servicio |
| `DB_CONFIAR_CERTIFICADO debe ser true o false` | Valor distinto de esos dos | Corregirlo. En Azure va en `false` |
| `SEED_CLIENTES_PRUEBA debe ser true o false` | Valor distinto de esos dos | Corregirlo. En producción va en `false` |
| El servicio no responde con el puerto por defecto de Render | `PORT` no coincide con el `EXPOSE` | Fijar `PORT=3000` |
| `/` responde y `/api/health` da 500 | La base está en pausa, el firewall no incluye los rangos de Render o las credenciales de `zg_app` están mal | Reintentar durante 3 minutos (sección 6.2). Si sigue, revisar los rangos (sección 2.2), `DB_SERVER`, `DB_USER` y `DB_PASSWORD` |
| `Failed to connect … in 15000ms` desde Node, o error 40613 desde SSMS | La base está reanudándose, lo que tarda cerca de un minuto | Reintentar |
| `/api/health` da 500 con error de firewall en **Logs** | Cambiaron los rangos de salida de Render | Revisar **Connect → Outbound** en el servicio y actualizar las reglas (sección 2.2) |
| `/api/health` da 500 después de mucho uso | La base pudo pausarse por llegar al límite de la oferta gratuita | Ver el consumo en el **Overview** de la base, *Free monthly vCore amount remaining*. Si se agotó, queda en pausa hasta el mes siguiente. La salida sería activar *Overage billing*, que cobra: se decide en el momento. Para una demo, el respaldo es Docker Compose (sección 6.2) |
| `npm run db:migrar` falla por permisos | Se ejecutó con `zg_app`, que no puede crear tablas | Repetir con el administrador (pasos 2.3 y 2.4) |
| `Error al preparar la base` contra Azure | `preparar-base.js` entra como `sa`, que no existe en Azure SQL | No usarlo en producción: es solo para Compose |
| `usuario-app.sql` responde `Escribí la contraseña en @password` | `@password` está vacía; el script no hizo nada | Escribirla solo en la ventana de SSMS y ejecutar de nuevo |
| El script falla al usar otro nombre de usuario | `zg_app` está fijo en las líneas `ALTER ROLE` | Usar `zg_app` |
| Repetir el seed no cambia la contraseña del administrador | El seed no modifica usuarios que ya existen | Es el comportamiento esperado: el seed no sirve para cambiarla |
| Job `Despliegue` con `Falta el secreto RENDER_DEPLOY_HOOK` | El secreto no existe en el repositorio | Crearlo (sección 4.2) y volver a ejecutar el job |
| Job `Publicar imagen` en rojo y `Despliegue` sin correr | `Despliegue` espera a `Publicar imagen` | Corregir la causa. Mientras Render construya desde `main` (sección 3.1), el despliegue manual desde su panel queda como respaldo |
| `Despliegue` en verde y sin versión nueva | El job solo confirma que Render recibió el pedido | Ver el estado del despliegue en Render (sección 6.1) |
| Ejecución del CI cancelada | Un push posterior a la misma rama la reemplazó | Revisar la ejecución más reciente |
| `Autoría de commits` en rojo | Un mensaje declara coautoría o generación automática | Corregir el mensaje del commit que nombra el error. Si es el último de la rama del PR: `git commit --amend` y `git push --force-with-lease` |
| Compose rechaza una contraseña | No cumple la política de SQL Server: mínimo 8 caracteres con 3 de estos 4: mayúsculas, minúsculas, dígitos y símbolos | Cambiar `MSSQL_SA_PASSWORD` o `DB_PASSWORD`. Si cambia `DB_PASSWORD`, actualizarla también en el SQL Server local (`README.md`) |
| Compose interpreta mal una contraseña con `$` | Toma `$` como variable | Ponerla entre comillas simples en `.env` |
| La API de Compose y `npm run dev` chocan | Las dos usan el puerto 3000 | No correrlas a la vez. SSMS llega al contenedor en `localhost,14330` |
