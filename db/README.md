# Base de datos

Esquema de SQL Server del backend. Se crea con migraciones en SQL escrito a mano y se completa con un seed idempotente.

## Requisitos

- SQL Server Express (local) o Azure SQL, con la base indicada en `DB_NAME`.
- El login de `DB_USER` necesita permiso para crear tablas e índices en esa base (por ejemplo, rol `db_owner` en local).
- `.env` completo (ver `.env.example`). El seed además exige `SEED_ADMIN_CORREO` y `SEED_ADMIN_PASSWORD`.

## Aplicar migraciones

```bash
npm run db:migrar
```

- Crea la tabla `_Migraciones` si no existe.
- Aplica en orden alfabético los archivos `db/migrations/NNN_nombre.sql` que no figuran en `_Migraciones`.
- Cada archivo se aplica en su propia transacción junto con su fila en `_Migraciones`: si falla, no queda nada a medias y el comando termina con código 1.
- Ejecutarlo de nuevo no hace nada: muestra `Sin migraciones pendientes.`

| Archivo | Contenido |
| --- | --- |
| `001_esquema.sql` | Tablas `Usuario`, `TipoCancha`, `Cancha`, `Horario`, `Reserva`, `Pago`, `Auditoria` y `Notificacion`, con sus restricciones |
| `002_indices.sql` | `UX_Reserva_SlotActivo` (único filtrado `WHERE Activa = 1`) e índices de consulta |

### Agregar una migración

1. Crear `db/migrations/NNN_descripcion.sql` con el número siguiente (`003_...`).
2. Separar los lotes con una línea `GO` (por ejemplo, entre `CREATE TABLE` y `CREATE INDEX` sobre esa tabla).
3. No usar `GETDATE()`: las fechas las envía Node en hora de Nicaragua.
4. **No editar una migración ya aplicada:** los cambios van en una nueva.

## Cargar datos iniciales

```bash
npm run db:seed
```

Inserta cada fila solo si su clave natural no existe, así que puede ejecutarse varias veces sin duplicar nada. Un usuario que ya existe no se modifica (tampoco su contraseña). Al terminar muestra las filas creadas y el total por tabla.

| Tabla | Datos | Clave natural |
| --- | --- | --- |
| `TipoCancha` | `SALA` C$ 600/h, `CAMPO` C$ 1,200/h | `Codigo` |
| `Cancha` | Sala 1 a Sala 5, Campo 1 y Campo 2 | `Nombre` |
| `Horario` | 07:00 a 22:00, los 7 días, en las 7 canchas (49 filas) | `(CanchaId, DiaSemana)` |
| `Usuario` | Administrador (de `SEED_ADMIN_*`) y dos clientes de prueba | `Correo` |

### Usuarios de prueba

| Correo | Contraseña | Rol |
| --- | --- | --- |
| valor de `SEED_ADMIN_CORREO` | valor de `SEED_ADMIN_PASSWORD` | ADMIN |
| `cliente1@prueba.local` | `Cliente123!` | CLIENTE |
| `cliente2@prueba.local` | `Cliente123!` | CLIENTE |

Son credenciales de desarrollo: el sistema es simulado y no deben reutilizarse en ningún otro lugar.

## Reiniciar la base en local

Para empezar de cero, borrar las tablas en orden inverso de dependencias y volver a migrar:

```sql
DROP TABLE IF EXISTS Notificacion, Auditoria, Pago, Reserva, Horario, Cancha, TipoCancha, Usuario, _Migraciones;
```

```bash
npm run db:migrar
npm run db:seed
```

## Opciones de sesión

El índice filtrado `UX_Reserva_SlotActivo` exige `ANSI_NULLS` y `QUOTED_IDENTIFIER` en `ON` (además de `ANSI_PADDING`, `ANSI_WARNINGS`, `ARITHABORT` y `CONCAT_NULL_YIELDS_NULL` en `ON` y `NUMERIC_ROUNDABORT` en `OFF`) para insertar o actualizar `Reserva`. El driver de `mssql` ya los usa por defecto; no hay que configurarlos. Un cliente externo con otra configuración recibiría un error al escribir en `Reserva`.
