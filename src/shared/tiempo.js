// Convención: hora de pared de Nicaragua (UTC−6, sin horario de verano) cargada en los campos UTC del Date.
const AppError = require('./AppError');

const DESFASE_NICARAGUA_MS = 6 * 3600 * 1000;
const FORMATO_LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

function ahoraNicaragua() {
  return new Date(Date.now() - DESFASE_NICARAGUA_MS);
}

function formatearFechaLocal(d) {
  return d.toISOString().slice(0, 19);
}

function parsearFechaLocal(t, campo = 'fecha') {
  const invalida = () =>
    new AppError(400, 'VALIDACION', `${campo}: formato inválido, se espera YYYY-MM-DDTHH:mm:ss`);

  if (typeof t !== 'string' || !FORMATO_LOCAL.test(t)) throw invalida();

  const d = new Date(t + 'Z');
  // Date normaliza fechas imposibles (2026-02-30 → 2026-03-02); si no vuelve igual, no existía.
  if (Number.isNaN(d.getTime()) || formatearFechaLocal(d) !== t) throw invalida();

  return d;
}

// 1 = lunes … 7 = domingo.
function diaSemana(d) {
  return ((d.getUTCDay() + 6) % 7) + 1;
}

module.exports = { ahoraNicaragua, parsearFechaLocal, formatearFechaLocal, diaSemana };
