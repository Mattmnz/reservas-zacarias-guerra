const { sql } = require('../../config/db');

function mapear(fila) {
  return {
    // BIGINT llega como texto desde mssql; los Id no se acercan a 2^53.
    id: Number(fila.Id),
    entidad: fila.Entidad,
    entidadId: fila.EntidadId,
    accion: fila.Accion,
    estadoAnterior: fila.EstadoAnterior,
    estadoNuevo: fila.EstadoNuevo,
    usuarioId: fila.UsuarioId,
    motivo: fila.Motivo,
    fecha: fila.Fecha,
  };
}

async function insertar(
  ejecutor,
  { entidad, entidadId, accion, estadoAnterior, estadoNuevo, usuarioId, motivo, fecha },
) {
  await ejecutor
    .request()
    .input('entidad', sql.VarChar(10), entidad)
    .input('entidadId', sql.Int, entidadId)
    .input('accion', sql.VarChar(30), accion)
    .input('estadoAnterior', sql.VarChar(20), estadoAnterior)
    .input('estadoNuevo', sql.VarChar(20), estadoNuevo)
    .input('usuarioId', sql.Int, usuarioId)
    .input('motivo', sql.NVarChar(250), motivo)
    .input('fecha', sql.DateTime2(0), fecha)
    .query(`
      INSERT INTO Auditoria (Entidad, EntidadId, Accion, EstadoAnterior, EstadoNuevo, UsuarioId, Motivo, Fecha)
      VALUES (@entidad, @entidadId, @accion, @estadoAnterior, @estadoNuevo, @usuarioId, @motivo, @fecha)
    `);
}

// Filtros opcionales con condiciones fijas: un null desactiva el filtro.
async function listar(ejecutor, { entidad, entidadId }) {
  const resultado = await ejecutor
    .request()
    .input('entidad', sql.VarChar(10), entidad)
    .input('entidadId', sql.Int, entidadId)
    .query(`
      SELECT Id, Entidad, EntidadId, Accion, EstadoAnterior, EstadoNuevo, UsuarioId, Motivo, Fecha
      FROM Auditoria
      WHERE (@entidad IS NULL OR Entidad = @entidad)
        AND (@entidadId IS NULL OR EntidadId = @entidadId)
      ORDER BY Fecha DESC, Id DESC
    `);
  return resultado.recordset.map(mapear);
}

module.exports = { insertar, listar };
