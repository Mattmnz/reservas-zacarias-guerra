const { sql } = require('../../config/db');

// Activa = 1 va literal: con un parámetro el optimizador no usa el índice filtrado
// UX_Reserva_SlotActivo y el bloqueo de rango no cae sobre él.
// UPDLOCK, HOLDLOCK: bloquea el bloque aunque la fila no exista, y una segunda creación espera.
async function bloquearSlot(ejecutor, canchaId, inicio) {
  const resultado = await ejecutor
    .request()
    .input('canchaId', sql.Int, canchaId)
    .input('inicio', sql.DateTime2(0), inicio)
    .query(`
      SELECT Id FROM Reserva WITH (UPDLOCK, HOLDLOCK)
      WHERE CanchaId = @canchaId AND Inicio = @inicio AND Activa = 1
    `);
  return resultado.recordset[0]?.Id ?? null;
}

async function insertar(ejecutor, { clienteId, canchaId, inicio, monto, estado, ahora }) {
  const resultado = await ejecutor
    .request()
    .input('clienteId', sql.Int, clienteId)
    .input('canchaId', sql.Int, canchaId)
    .input('inicio', sql.DateTime2(0), inicio)
    .input('monto', sql.Decimal(10, 2), monto)
    .input('estado', sql.VarChar(12), estado)
    .input('ahora', sql.DateTime2(0), ahora)
    .query(`
      INSERT INTO Reserva (ClienteId, CanchaId, Inicio, Monto, Estado, Activa, CreadaEn, ActualizadaEn)
      OUTPUT INSERTED.Id
      VALUES (@clienteId, @canchaId, @inicio, @monto, @estado, 1, @ahora, @ahora)
    `);
  return resultado.recordset[0].Id;
}

async function insertarPago(ejecutor, { reservaId, tipo, monto, referencia, creadoEn }) {
  await ejecutor
    .request()
    .input('reservaId', sql.Int, reservaId)
    .input('tipo', sql.VarChar(10), tipo)
    .input('monto', sql.Decimal(10, 2), monto)
    .input('referencia', sql.VarChar(30), referencia)
    .input('creadoEn', sql.DateTime2(0), creadoEn)
    .query(`
      INSERT INTO Pago (ReservaId, Tipo, Monto, Referencia, CreadoEn)
      VALUES (@reservaId, @tipo, @monto, @referencia, @creadoEn)
    `);
}

module.exports = { bloquearSlot, insertar, insertarPago };
