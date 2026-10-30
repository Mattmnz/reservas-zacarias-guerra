const { sql } = require('../../config/db');

// DATEPART devuelve la hora como entero: el resultado no depende de cómo el driver convierte TIME a Date.
const HORAS = 'DATEPART(HOUR, HoraApertura) AS Apertura, DATEPART(HOUR, HoraCierre) AS Cierre';

async function listarPorCancha(ejecutor, canchaId) {
  const resultado = await ejecutor
    .request()
    .input('canchaId', sql.Int, canchaId)
    .query(`
      SELECT DiaSemana, ${HORAS}
      FROM Horario
      WHERE CanchaId = @canchaId
      ORDER BY DiaSemana
    `);
  return resultado.recordset.map((f) => ({ diaSemana: f.DiaSemana, apertura: f.Apertura, cierre: f.Cierre }));
}

async function obtenerDelDia(ejecutor, canchaId, diaSemana) {
  const resultado = await ejecutor
    .request()
    .input('canchaId', sql.Int, canchaId)
    .input('dia', sql.TinyInt, diaSemana)
    .query(`
      SELECT ${HORAS}
      FROM Horario
      WHERE CanchaId = @canchaId AND DiaSemana = @dia
    `);
  const fila = resultado.recordset[0];
  return fila ? { apertura: fila.Apertura, cierre: fila.Cierre } : null;
}

async function listarDelDia(ejecutor, diaSemana) {
  const resultado = await ejecutor
    .request()
    .input('dia', sql.TinyInt, diaSemana)
    .query(`
      SELECT CanchaId, ${HORAS}
      FROM Horario
      WHERE DiaSemana = @dia
      ORDER BY CanchaId
    `);
  return resultado.recordset.map((f) => ({ canchaId: f.CanchaId, apertura: f.Apertura, cierre: f.Cierre }));
}

async function eliminarPorCancha(ejecutor, canchaId) {
  await ejecutor
    .request()
    .input('canchaId', sql.Int, canchaId)
    .query('DELETE FROM Horario WHERE CanchaId = @canchaId');
}

// TIMEFROMPARTS arma el TIME(0) en SQL a partir de la hora entera, sin pasar por un Date.
async function insertar(ejecutor, { canchaId, diaSemana, apertura, cierre }) {
  await ejecutor
    .request()
    .input('canchaId', sql.Int, canchaId)
    .input('dia', sql.TinyInt, diaSemana)
    .input('apertura', sql.TinyInt, apertura)
    .input('cierre', sql.TinyInt, cierre)
    .query(`
      INSERT INTO Horario (CanchaId, DiaSemana, HoraApertura, HoraCierre)
      VALUES (@canchaId, @dia, TIMEFROMPARTS(@apertura, 0, 0, 0, 0), TIMEFROMPARTS(@cierre, 0, 0, 0, 0))
    `);
}

module.exports = { listarPorCancha, obtenerDelDia, listarDelDia, eliminarPorCancha, insertar };
