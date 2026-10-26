const { sql } = require('../../config/db');

const COLUMNAS = `
  c.Id, c.Nombre, c.Activa, c.TipoCanchaId,
  t.Codigo AS TipoCodigo, t.Nombre AS TipoNombre, t.PrecioHora`;

function mapear(fila) {
  if (!fila) return null;
  return {
    id: fila.Id,
    nombre: fila.Nombre,
    activa: fila.Activa,
    tipoCanchaId: fila.TipoCanchaId,
    tipoCodigo: fila.TipoCodigo,
    tipoNombre: fila.TipoNombre,
    precioHora: fila.PrecioHora,
  };
}

function mapearTipo(fila) {
  if (!fila) return null;
  return {
    id: fila.Id,
    codigo: fila.Codigo,
    nombre: fila.Nombre,
    precioHora: fila.PrecioHora,
  };
}

// Filtros opcionales con condiciones fijas: un null desactiva el filtro de tipo.
async function listar(ejecutor, { tipoCodigo, incluirInactivas }) {
  const resultado = await ejecutor
    .request()
    .input('tipo', sql.VarChar(10), tipoCodigo)
    .input('incluirInactivas', sql.Bit, incluirInactivas)
    .query(`
      SELECT ${COLUMNAS}
      FROM Cancha c
      JOIN TipoCancha t ON t.Id = c.TipoCanchaId
      WHERE (@incluirInactivas = 1 OR c.Activa = 1)
        AND (@tipo IS NULL OR t.Codigo = @tipo)
      ORDER BY c.Id
    `);
  return resultado.recordset.map(mapear);
}

async function obtenerPorId(ejecutor, id) {
  const resultado = await ejecutor
    .request()
    .input('id', sql.Int, id)
    .query(`
      SELECT ${COLUMNAS}
      FROM Cancha c
      JOIN TipoCancha t ON t.Id = c.TipoCanchaId
      WHERE c.Id = @id
    `);
  return mapear(resultado.recordset[0]);
}

// UPDLOCK: dos admins sobre la misma cancha se serializan y el segundo lee el estado ya cambiado.
async function obtenerPorIdParaActualizar(ejecutor, id) {
  const resultado = await ejecutor
    .request()
    .input('id', sql.Int, id)
    .query(`
      SELECT ${COLUMNAS}
      FROM Cancha c WITH (UPDLOCK)
      JOIN TipoCancha t ON t.Id = c.TipoCanchaId
      WHERE c.Id = @id
    `);
  return mapear(resultado.recordset[0]);
}

// HOLDLOCK: dentro de la transacción de una reserva, la baja de la cancha espera hasta el commit.
async function obtenerActiva(ejecutor, id) {
  const resultado = await ejecutor
    .request()
    .input('id', sql.Int, id)
    .query(`
      SELECT ${COLUMNAS}
      FROM Cancha c WITH (HOLDLOCK)
      JOIN TipoCancha t ON t.Id = c.TipoCanchaId
      WHERE c.Id = @id AND c.Activa = 1
    `);
  return mapear(resultado.recordset[0]);
}

async function obtenerTipo(ejecutor, id) {
  const resultado = await ejecutor
    .request()
    .input('id', sql.Int, id)
    .query('SELECT Id, Codigo, Nombre, PrecioHora FROM TipoCancha WHERE Id = @id');
  return mapearTipo(resultado.recordset[0]);
}

async function insertar(ejecutor, { nombre, tipoCanchaId, creadaEn }) {
  const resultado = await ejecutor
    .request()
    .input('nombre', sql.NVarChar(50), nombre)
    .input('tipoCanchaId', sql.Int, tipoCanchaId)
    .input('creadaEn', sql.DateTime2(0), creadaEn)
    .query(`
      INSERT INTO Cancha (Nombre, TipoCanchaId, Activa, CreadaEn)
      OUTPUT INSERTED.Id
      VALUES (@nombre, @tipoCanchaId, 1, @creadaEn)
    `);
  return resultado.recordset[0].Id;
}

async function actualizar(ejecutor, { id, nombre, tipoCanchaId }) {
  await ejecutor
    .request()
    .input('id', sql.Int, id)
    .input('nombre', sql.NVarChar(50), nombre)
    .input('tipoCanchaId', sql.Int, tipoCanchaId)
    .query('UPDATE Cancha SET Nombre = @nombre, TipoCanchaId = @tipoCanchaId WHERE Id = @id');
}

async function activar(ejecutor, id) {
  await ejecutor
    .request()
    .input('id', sql.Int, id)
    .query('UPDATE Cancha SET Activa = 1 WHERE Id = @id');
}

async function listarTipos(ejecutor) {
  const resultado = await ejecutor
    .request()
    .query('SELECT Id, Codigo, Nombre, PrecioHora FROM TipoCancha ORDER BY Id');
  return resultado.recordset.map(mapearTipo);
}

// Una sola sentencia: actualiza y devuelve el tipo sin una lectura aparte.
async function actualizarPrecio(ejecutor, id, precioHora) {
  const resultado = await ejecutor
    .request()
    .input('id', sql.Int, id)
    .input('precio', sql.Decimal(10, 2), precioHora)
    .query(`
      UPDATE TipoCancha SET PrecioHora = @precio
      OUTPUT INSERTED.Id, INSERTED.Codigo, INSERTED.Nombre, INSERTED.PrecioHora
      WHERE Id = @id
    `);
  return mapearTipo(resultado.recordset[0]);
}

module.exports = {
  listar,
  obtenerPorId,
  obtenerPorIdParaActualizar,
  obtenerActiva,
  obtenerTipo,
  insertar,
  actualizar,
  activar,
  listarTipos,
  actualizarPrecio,
};
