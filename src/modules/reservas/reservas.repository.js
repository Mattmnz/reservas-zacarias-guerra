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

// UPDLOCK: dos cambios de estado simultáneos sobre la misma reserva se serializan.
async function obtenerParaActualizar(ejecutor, id) {
  const resultado = await ejecutor
    .request()
    .input('id', sql.Int, id)
    .query(`
      SELECT Id, ClienteId, CanchaId, Inicio, Monto, Estado
      FROM Reserva WITH (UPDLOCK)
      WHERE Id = @id
    `);
  const fila = resultado.recordset[0];
  if (!fila) return null;
  return {
    id: fila.Id,
    clienteId: fila.ClienteId,
    canchaId: fila.CanchaId,
    inicio: fila.Inicio,
    monto: fila.Monto,
    estado: fila.Estado,
  };
}

// Solo para estados no cancelados: Activa no cambia, así que CK_Reserva_Activa se mantiene.
async function actualizarEstado(ejecutor, { id, estado, ahora }) {
  await ejecutor
    .request()
    .input('id', sql.Int, id)
    .input('estado', sql.VarChar(12), estado)
    .input('ahora', sql.DateTime2(0), ahora)
    .query('UPDATE Reserva SET Estado = @estado, ActualizadaEn = @ahora WHERE Id = @id');
}

async function listarPagos(ejecutor, reservaId) {
  const resultado = await ejecutor
    .request()
    .input('reservaId', sql.Int, reservaId)
    .query(`
      SELECT Tipo, Monto, Referencia, CreadoEn
      FROM Pago
      WHERE ReservaId = @reservaId
      ORDER BY Id
    `);
  return resultado.recordset.map((p) => ({
    tipo: p.Tipo,
    monto: p.Monto,
    referencia: p.Referencia,
    creadoEn: p.CreadoEn,
  }));
}

// OUTPUT devuelve solo las filas que cambió esta sentencia: un barrido simultáneo
// espera el bloqueo y, al filtrar por estado, ya no las vuelve a encontrar.
async function marcarNoShowVencidas(ejecutor, ahora) {
  const resultado = await ejecutor
    .request()
    .input('ahora', sql.DateTime2(0), ahora)
    .query(`
      UPDATE Reserva
      SET Estado = 'NO_SHOW', MontoPenalizado = Monto, ActualizadaEn = @ahora
      OUTPUT inserted.Id, inserted.ClienteId, inserted.Inicio, deleted.Estado
      WHERE Estado IN ('PAGADA', 'CONFIRMADA')
        AND Inicio <= DATEADD(HOUR, -1, @ahora)
    `);
  return resultado.recordset.map((f) => ({
    id: f.Id,
    clienteId: f.ClienteId,
    inicio: f.Inicio,
    estadoAnterior: f.Estado,
  }));
}

// Activa = 1 literal, igual que en bloquearSlot, para usar el índice filtrado.
async function ocupadosEnRango(ejecutor, desde, hasta) {
  const resultado = await ejecutor
    .request()
    .input('desde', sql.DateTime2(0), desde)
    .input('hasta', sql.DateTime2(0), hasta)
    .query(`
      SELECT CanchaId, Inicio FROM Reserva
      WHERE Activa = 1 AND Inicio >= @desde AND Inicio < @hasta
    `);
  return resultado.recordset.map((f) => ({ canchaId: f.CanchaId, inicio: f.Inicio }));
}

module.exports = {
  bloquearSlot,
  insertar,
  insertarPago,
  obtenerParaActualizar,
  actualizarEstado,
  listarPagos,
  marcarNoShowVencidas,
  ocupadosEnRango,
};
