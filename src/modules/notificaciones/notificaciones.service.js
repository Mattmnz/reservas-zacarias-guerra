const db = require('../../config/db');
const AppError = require('../../shared/AppError');
const { ahoraNicaragua, formatearFechaLocal } = require('../../shared/tiempo');
const notificacionesRepository = require('./notificaciones.repository');

const INT_MAX = 2147483647;
const MENSAJE_MAX = 500;

function esIdValido(valor) {
  return Number.isInteger(valor) && valor > 0 && valor <= INT_MAX;
}

// No abre transacción: usa el ejecutor recibido para que un fallo revierta también el cambio de estado.
async function crear(ejecutor, { usuarioId, reservaId = null, mensaje }) {
  // Invariantes internas: quien llama es otro service, no el cliente; por eso errores nativos.
  if (!esIdValido(usuarioId)) throw new TypeError('usuarioId: se espera un entero positivo');
  if (reservaId !== null && !esIdValido(reservaId)) {
    throw new TypeError('reservaId: se espera un entero positivo o null');
  }
  if (typeof mensaje !== 'string' || !mensaje.trim()) {
    throw new TypeError('mensaje: se espera texto no vacío');
  }
  // Se lanza en vez de truncar, igual que en auditoría.
  if (mensaje.length > MENSAJE_MAX) throw new RangeError(`mensaje: máximo ${MENSAJE_MAX} caracteres`);

  await notificacionesRepository.insertar(ejecutor, {
    usuarioId,
    reservaId,
    mensaje,
    creadaEn: ahoraNicaragua(),
  });
}

async function listarMias(usuarioId) {
  const pool = await db.obtenerPool();
  const notificaciones = await notificacionesRepository.listarPorUsuario(pool, usuarioId);
  return notificaciones.map((n) => ({ ...n, creadaEn: formatearFechaLocal(n.creadaEn) }));
}

// idTexto viene de la ruta (:id), siempre como texto.
async function marcarLeida(usuarioId, idTexto) {
  const id = Number(idTexto);
  if (typeof idTexto !== 'string' || !/^\d+$/.test(idTexto) || !esIdValido(id)) {
    throw new AppError(400, 'VALIDACION', 'id: debe ser un entero positivo');
  }

  const pool = await db.obtenerPool();
  const notificacion = await notificacionesRepository.obtenerPorId(pool, id);
  if (!notificacion) {
    throw new AppError(404, 'NO_ENCONTRADO', 'La notificación no existe');
  }
  if (notificacion.usuarioId !== usuarioId) {
    throw new AppError(403, 'SIN_PERMISO', 'La notificación pertenece a otro usuario');
  }

  // Idempotente: marcar una ya leída no es error.
  await notificacionesRepository.marcarLeida(pool, id);
}

module.exports = { crear, listarMias, marcarLeida };
