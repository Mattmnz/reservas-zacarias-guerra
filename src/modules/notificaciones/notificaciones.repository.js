const { sql } = require('../../config/db');

function mapear(fila) {
  return {
    id: fila.Id,
    reservaId: fila.ReservaId,
    mensaje: fila.Mensaje,
    leida: fila.Leida,
    creadaEn: fila.CreadaEn,
  };
}

async function insertar(ejecutor, { usuarioId, reservaId, mensaje, creadaEn }) {
  await ejecutor
    .request()
    .input('usuarioId', sql.Int, usuarioId)
    .input('reservaId', sql.Int, reservaId)
    .input('mensaje', sql.NVarChar(500), mensaje)
    .input('creadaEn', sql.DateTime2(0), creadaEn)
    .query(`
      INSERT INTO Notificacion (UsuarioId, ReservaId, Mensaje, Leida, CreadaEn)
      VALUES (@usuarioId, @reservaId, @mensaje, 0, @creadaEn)
    `);
}

async function listarPorUsuario(ejecutor, usuarioId) {
  const resultado = await ejecutor
    .request()
    .input('usuarioId', sql.Int, usuarioId)
    .query(`
      SELECT Id, ReservaId, Mensaje, Leida, CreadaEn
      FROM Notificacion
      WHERE UsuarioId = @usuarioId
      ORDER BY CreadaEn DESC, Id DESC
    `);
  return resultado.recordset.map(mapear);
}

async function obtenerPorId(ejecutor, id) {
  const resultado = await ejecutor
    .request()
    .input('id', sql.Int, id)
    .query('SELECT Id, UsuarioId FROM Notificacion WHERE Id = @id');
  const fila = resultado.recordset[0];
  return fila ? { id: fila.Id, usuarioId: fila.UsuarioId } : null;
}

async function marcarLeida(ejecutor, id) {
  await ejecutor
    .request()
    .input('id', sql.Int, id)
    .query('UPDATE Notificacion SET Leida = 1 WHERE Id = @id');
}

module.exports = { insertar, listarPorUsuario, obtenerPorId, marcarLeida };
