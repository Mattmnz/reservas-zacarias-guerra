const sql = require('mssql');
const env = require('./env');

const configuracion = {
  server: env.db.servidor,
  port: env.db.puerto,
  database: env.db.nombre,
  user: env.db.usuario,
  password: env.db.password,
  options: {
    encrypt: true,
    trustServerCertificate: env.db.confiarCertificado,
  },
};

// Se guarda la promesa, no el pool, para que llamadas simultáneas compartan una sola conexión.
let promesaPool = null;

function obtenerPool() {
  if (!promesaPool) {
    promesaPool = new sql.ConnectionPool(configuracion).connect().catch((err) => {
      promesaPool = null;
      throw err;
    });
  }
  return promesaPool;
}

async function enTransaccion(fn, nivelAislamiento = sql.ISOLATION_LEVEL.READ_COMMITTED) {
  const pool = await obtenerPool();
  const tx = new sql.Transaction(pool);
  await tx.begin(nivelAislamiento);
  try {
    const resultado = await fn(tx);
    await tx.commit();
    return resultado;
  } catch (err) {
    try {
      await tx.rollback();
    } catch (errRollback) {
      // SQL Server puede haber abortado ya la transacción; importa el error original.
      console.error('Rollback fallido:', errRollback.message);
    }
    throw err;
  }
}

async function cerrarPool() {
  if (!promesaPool) return;
  const pool = await promesaPool.catch(() => null);
  promesaPool = null;
  if (pool) await pool.close();
}

module.exports = { sql, obtenerPool, enTransaccion, cerrarPool };
