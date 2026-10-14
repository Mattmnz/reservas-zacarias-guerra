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
