async function probarConexion(ejecutor) {
  await ejecutor.request().query('SELECT 1 AS ok');
}

module.exports = { probarConexion };
