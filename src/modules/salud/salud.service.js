const { obtenerPool } = require('../../config/db');
const saludRepository = require('./salud.repository');

// Si la base no responde, el error sigue hasta manejarErrores (500, detalle en consola).
async function verificar() {
  const pool = await obtenerPool();
  await saludRepository.probarConexion(pool);
  return { db: 'ok' };
}

module.exports = { verificar };
