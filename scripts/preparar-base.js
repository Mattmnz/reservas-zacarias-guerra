// Solo para Docker Compose: crea la base DB_NAME y el login DB_USER en el SQL Server del
// contenedor, para que después migrar.js y seed.js corran igual que en una instalación local.
// Entra como sa, que no existe en Azure SQL: contra Azure falla sin crear nada.
const sql = require('mssql');
const env = require('../src/config/env');

const { MSSQL_SA_PASSWORD } = env.exigir(['MSSQL_SA_PASSWORD']);

// En el primer arranque SQL Server tarda en aceptar conexiones (hasta 1-2 min con la imagen nueva).
const INTENTOS = 60;
const ESPERA_MS = 2000;
// QUOTENAME devuelve NULL con más de 128 caracteres y el EXEC no haría nada.
const MAX_NOMBRE = 128;

// Los nombres de objeto no admiten parámetros: se arma SQL dinámico escapado con QUOTENAME.
const SQL_SERVIDOR = `
  IF DB_ID(@base) IS NULL
  BEGIN
    DECLARE @crearBase NVARCHAR(400) = N'CREATE DATABASE ' + QUOTENAME(@base);
    EXEC (@crearBase);
  END;

  -- Express crea las bases con AUTO_CLOSE ON: la base se cierra al soltarse la última conexión
  -- y cada reapertura cuesta tiempo. Se apaga para que se comporte como un servidor normal.
  IF DATABASEPROPERTYEX(@base, 'IsAutoClose') = 1
  BEGIN
    DECLARE @autoClose NVARCHAR(400) = N'ALTER DATABASE ' + QUOTENAME(@base) + N' SET AUTO_CLOSE OFF';
    EXEC (@autoClose);
  END;

  -- Si el login ya existe se le reasigna la contraseña: .env manda.
  DECLARE @login NVARCHAR(MAX) =
    CASE WHEN SUSER_ID(@usuario) IS NULL THEN N'CREATE' ELSE N'ALTER' END
    + N' LOGIN ' + QUOTENAME(@usuario) + N' WITH PASSWORD = ' + QUOTENAME(@password, '''');
  EXEC (@login);
`;

// db_owner como en la instalación local: las migraciones crean tablas e índices.
const SQL_BASE = `
  IF DATABASE_PRINCIPAL_ID(@usuario) IS NULL
  BEGIN
    DECLARE @crearUsuario NVARCHAR(MAX) =
      N'CREATE USER ' + QUOTENAME(@usuario) + N' FOR LOGIN ' + QUOTENAME(@usuario);
    EXEC (@crearUsuario);
  END;

  IF IS_ROLEMEMBER(N'db_owner', @usuario) = 0
  BEGIN
    DECLARE @agregarRol NVARCHAR(MAX) = N'ALTER ROLE db_owner ADD MEMBER ' + QUOTENAME(@usuario);
    EXEC (@agregarRol);
  END;
`;

function validar() {
  const { nombre, usuario, password } = env.db;
  if (usuario.toLowerCase() === 'sa') {
    throw new Error('DB_USER no puede ser sa: la aplicación usa su propio login');
  }
  for (const [variable, valor] of [['DB_NAME', nombre], ['DB_USER', usuario], ['DB_PASSWORD', password]]) {
    if (valor.length > MAX_NOMBRE) throw new Error(`${variable} admite hasta ${MAX_NOMBRE} caracteres`);
  }
}

function configuracion(database) {
  return {
    server: env.db.servidor,
    port: env.db.puerto,
    database,
    user: 'sa',
    password: MSSQL_SA_PASSWORD,
    options: { encrypt: true, trustServerCertificate: env.db.confiarCertificado },
  };
}

const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

async function conectar(database) {
  for (let intento = 1; ; intento++) {
    try {
      return await new sql.ConnectionPool(configuracion(database)).connect();
    } catch (err) {
      if (intento === INTENTOS) throw err;
      console.log(`SQL Server todavía no responde (intento ${intento}/${INTENTOS}): ${err.message}`);
      await esperar(ESPERA_MS);
    }
  }
}

async function ejecutar(database, texto) {
  const pool = await conectar(database);
  try {
    await pool
      .request()
      .input('base', sql.NVarChar(MAX_NOMBRE), env.db.nombre)
      .input('usuario', sql.NVarChar(MAX_NOMBRE), env.db.usuario)
      .input('password', sql.NVarChar(MAX_NOMBRE), env.db.password)
      .query(texto);
  } finally {
    await pool.close();
  }
}

async function main() {
  validar();
  await ejecutar('master', SQL_SERVIDOR);
  await ejecutar(env.db.nombre, SQL_BASE);
  console.log(`Base ${env.db.nombre} y login ${env.db.usuario} listos.`);
}

main().catch((err) => {
  console.error(`Error al preparar la base: ${err.message}`);
  process.exitCode = 1;
});
