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

const COLUMNAS_RESERVA = 'Id, ClienteId, CanchaId, Inicio, Monto, Estado, MontoPenalizado';

function mapearReserva(fila) {
  return {
    id: fila.Id,
    clienteId: fila.ClienteId,
    canchaId: fila.CanchaId,
    inicio: fila.Inicio,
    monto: fila.Monto,
    estado: fila.Estado,
    montoPenalizado: fila.MontoPenalizado,
  };
}

// UPDLOCK: dos cambios de estado simultáneos sobre la misma reserva se serializan.
async function obtenerParaActualizar(ejecutor, id) {
  const resultado = await ejecutor
    .request()
    .input('id', sql.Int, id)
    .query(`
      SELECT ${COLUMNAS_RESERVA}
      FROM Reserva WITH (UPDLOCK)
      WHERE Id = @id
    `);
  const fila = resultado.recordset[0];
  return fila ? mapearReserva(fila) : null;
}

// Sin bloqueo: para lecturas que no cambian la reserva.
async function obtenerPorId(ejecutor, id) {
  const resultado = await ejecutor
    .request()
    .input('id', sql.Int, id)
    .query(`
      SELECT ${COLUMNAS_RESERVA}
      FROM Reserva
      WHERE Id = @id
    `);
  const fila = resultado.recordset[0];
  return fila ? mapearReserva(fila) : null;
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

// Estado y Activa en la misma sentencia: CK_Reserva_Activa exige que cambien juntos.
async function cancelar(ejecutor, { id, montoPenalizado, ahora }) {
  await ejecutor
    .request()
    .input('id', sql.Int, id)
    .input('montoPenalizado', sql.Decimal(10, 2), montoPenalizado)
    .input('ahora', sql.DateTime2(0), ahora)
    .query(`
      UPDATE Reserva
      SET Estado = 'CANCELADA', Activa = 0, MontoPenalizado = @montoPenalizado, ActualizadaEn = @ahora
      WHERE Id = @id
    `);
}

// Activa = 1 literal, igual que en bloquearSlot, para usar el índice filtrado.
async function contarFuturasActivas(ejecutor, canchaId, ahora) {
  const resultado = await ejecutor
    .request()
    .input('canchaId', sql.Int, canchaId)
    .input('ahora', sql.DateTime2(0), ahora)
    .query(`
      SELECT COUNT(*) AS Cantidad FROM Reserva
      WHERE Activa = 1 AND CanchaId = @canchaId
        AND Estado IN ('PAGADA', 'CONFIRMADA') AND Inicio > @ahora
    `);
  return resultado.recordset[0].Cantidad;
}

// Mismo filtro que contarFuturasActivas; OUTPUT devuelve lo necesario para reembolsar, auditar y notificar.
async function cancelarFuturasDeCancha(ejecutor, canchaId, ahora) {
  const resultado = await ejecutor
    .request()
    .input('canchaId', sql.Int, canchaId)
    .input('ahora', sql.DateTime2(0), ahora)
    .query(`
      UPDATE Reserva
      SET Estado = 'CANCELADA', Activa = 0, MontoPenalizado = 0, ActualizadaEn = @ahora
      OUTPUT inserted.Id, inserted.ClienteId, inserted.Inicio, inserted.Monto, deleted.Estado
      WHERE Activa = 1 AND CanchaId = @canchaId
        AND Estado IN ('PAGADA', 'CONFIRMADA') AND Inicio > @ahora
    `);
  return resultado.recordset.map((f) => ({
    id: f.Id,
    clienteId: f.ClienteId,
    inicio: f.Inicio,
    monto: f.Monto,
    estadoAnterior: f.Estado,
  }));
}

// Consultas de lectura (#19): solo Reserva y Pago; canchas y usuarios se piden a sus services.



// IX_Reserva_Cliente (ClienteId, Inicio) lleva Id en la clave: se recorre hacia atrás sin ordenar aparte.
async function listarDeCliente(ejecutor, clienteId) {
  const resultado = await ejecutor
    .request()
    .input('clienteId', sql.Int, clienteId)
    .query(`
      SELECT ${COLUMNAS_RESERVA} FROM Reserva
      WHERE ClienteId = @clienteId
      ORDER BY Inicio DESC, Id DESC
    `);
  return resultado.recordset.map(mapearReserva);
}


// Un null desactiva cada filtro. RECOMPILE: con filtros opcionales, un plan en caché no usaría
// IX_Reserva_Estado_Inicio cuando sí viene el estado.
async function listar(ejecutor, { desde, hasta, canchaId, estado }) {
  const resultado = await ejecutor
    .request()
    .input('desde', sql.DateTime2(0), desde)
    .input('hasta', sql.DateTime2(0), hasta)
    .input('canchaId', sql.Int, canchaId)
    .input('estado', sql.VarChar(12), estado)
    .query(`
      SELECT ${COLUMNAS_RESERVA} FROM Reserva
      WHERE (@desde IS NULL OR Inicio >= @desde)
        AND (@hasta IS NULL OR Inicio < @hasta)
        AND (@canchaId IS NULL OR CanchaId = @canchaId)
        AND (@estado IS NULL OR Estado = @estado)
      ORDER BY Inicio, Id
      OPTION (RECOMPILE)
    `);
  return resultado.recordset.map(mapearReserva);
}

// Una sola consulta para todo el listado. Un solo parámetro JSON con los ids:
// sin SQL dinámico ni el límite de 2100 parámetros.
async function listarPagosDeReservas(ejecutor, reservaIds) {
  const resultado = await ejecutor
    .request()
    .input('ids', sql.NVarChar(sql.MAX), JSON.stringify(reservaIds))
    .query(`
      SELECT ReservaId, Tipo, Monto, Referencia, CreadoEn FROM Pago
      WHERE ReservaId IN (SELECT CAST(value AS INT) FROM OPENJSON(@ids))
      ORDER BY Id
    `);
  return resultado.recordset.map((p) => ({
    reservaId: p.ReservaId,
    tipo: p.Tipo,
    monto: p.Monto,
    referencia: p.Referencia,
    creadoEn: p.CreadoEn,
  }));
}

module.exports = {
  bloquearSlot,
  insertar,
  insertarPago,
  obtenerParaActualizar,
  obtenerPorId,
  actualizarEstado,
  listarPagos,
  marcarNoShowVencidas,
  ocupadosEnRango,
  cancelar,
  contarFuturasActivas,
  cancelarFuturasDeCancha,
  listarDeCliente,
  listar,
  listarPagosDeReservas,
};
