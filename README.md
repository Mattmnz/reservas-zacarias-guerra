# reservas-zacarias-guerra

Backend del sistema web de reservas de canchas del Complejo Deportivo Zacarías Guerra (Managua). API REST en Node.js con Express 5 y SQL Server.

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

2. Copiar `.env.example` a `.env` y completar los valores (`DB_PASSWORD`, `JWT_SECRETO` y, para el seed, `SEED_ADMIN_CORREO` y `SEED_ADMIN_PASSWORD`). Si falta una variable obligatoria, el servidor no arranca y dice cuál falta.

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

### Pruebas

```bash
npm test
```

## Con Docker

Levanta SQL Server, prepara la base y arranca la API sin instalar Node ni SQL Server. Sirve como entorno local reproducible y como respaldo de la demo.

### Requisitos

- Docker Desktop con el motor en marcha (WSL 2) y unos 2 GB de RAM libres para SQL Server.
- `.env` completo, como en la instalación local, más `MSSQL_SA_PASSWORD`.
- `MSSQL_SA_PASSWORD` y `DB_PASSWORD` cumplen la política de SQL Server: mínimo 8 caracteres con 3 de estos 4: mayúsculas, minúsculas, dígitos y símbolos. Con `DB_PASSWORD` se crea el login de la aplicación dentro del contenedor.
- Si una contraseña tiene `$`, va entre comillas simples en `.env` (`DB_PASSWORD='...'`): Compose interpreta `$` como variable.

### Levantar

```bash
docker compose up --build
```

| Servicio | Qué hace |
| --- | --- |
| `db` | SQL Server 2022 Express. La primera vez descarga la imagen (alrededor de 1,5 GB). |
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

## Integración continua

Cada pull request y cada push a `develop` y `main` ejecutan el workflow `.github/workflows/ci.yml` en GitHub Actions. Las reglas de protección de `develop` y `main` exigen que sus tres jobs pasen antes del merge.

| Job | Qué comprueba |
| --- | --- |
| Pruebas | `npm ci` y `npm test` con Node 24 y variables de entorno ficticias. Las pruebas no usan base de datos |
| Imagen Docker | Que `compose.yaml` sea válido y que la imagen se construya |
| Autoría de commits | Que ningún mensaje de commit declare coautoría o generación automática |

El resultado aparece al pie de cada pull request y en la pestaña *Actions*.
