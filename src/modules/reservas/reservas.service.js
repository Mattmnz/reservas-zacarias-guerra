const db = require('../../config/db');
const AppError = require('../../shared/AppError');
const { ESTADOS, TIPOS_PAGO } = require('../../shared/constantes');
const { ahoraNicaragua, parsearFechaLocal, formatearFechaLocal, diaSemana } = require('../../shared/tiempo');
const auditoriaService = require('../auditoria/auditoria.service');
const notificacionesService = require('../notificaciones/notificaciones.service');
const canchasService = require('../canchas/canchas.service');
const horariosService = require('../horarios/horarios.service');
const reservasRepository = require('./reservas.repository');

const INT_MAX = 2147483647;
const MAX_ANTICIPACION_MS = 30 * 24 * 3600 * 1000;
// Violación de índice único (2601) o de restricción UNIQUE (2627).
const ERRORES_UNICOS = [2601, 2627];
const ACCION_CREAR = 'CREAR';

function validacion(mensaje) {
  return new AppError(400, 'VALIDACION', mensaje);
}

function horarioOcupado() {
  return new AppError(409, 'HORARIO_OCUPADO', 'El bloque ya está reservado');
}

// "20/10/2026 19:00": se arma desde el texto local, sin métodos de hora del Date.
function fechaParaMensaje(fecha) {
  const [dia, hora] = formatearFechaLocal(fecha).split('T');
  const [anio, mes, d] = dia.split('-');
  return `${d}/${mes}/${anio} ${hora.slice(0, 5)}`;
}

// El bloque de una hora tiene que caber entero entre la apertura y el cierre de ese día.
async function validarHorario(ejecutor, canchaId, inicio) {
  const h = await horariosService.obtenerDelDia(ejecutor, canchaId, diaSemana(inicio));
  if (!h) throw validacion('inicio: la cancha está cerrada ese día');
  const hora = inicio.getUTCHours();
  if (!(h.apertura <= hora && hora + 1 <= h.cierre)) {
    throw validacion('inicio: fuera del horario de la cancha');
  }
}

async function crear(clienteId, { canchaId, inicio } = {}) {
  const fechaInicio = parsearFechaLocal(inicio, 'inicio');
  if (fechaInicio.getUTCMinutes() !== 0 || fechaInicio.getUTCSeconds() !== 0) {
    throw validacion('inicio: debe ser una hora en punto');
  }
  // Viene en el cuerpo JSON: un "3" como texto se rechaza.
  if (!Number.isInteger(canchaId) || canchaId <= 0 || canchaId > INT_MAX) {
    throw validacion('canchaId: debe ser un entero positivo');
  }

  const ahora = ahoraNicaragua();
  const anticipacion = fechaInicio.getTime() - ahora.getTime();
  if (anticipacion <= 0) throw validacion('inicio: debe ser una fecha futura');
  if (anticipacion > MAX_ANTICIPACION_MS) {
    throw validacion('inicio: se puede reservar hasta 30 días a futuro');
  }

  try {
    return await db.enTransaccion(async (tx) => {
      // Primera sentencia con tx: el HOLDLOCK de obtenerActiva dura hasta el commit,
      // así una baja simultánea de la cancha espera en vez de dejar esta reserva huérfana.
      const cancha = await canchasService.obtenerActiva(tx, canchaId);
      await validarHorario(tx, canchaId, fechaInicio);

      if (await reservasRepository.bloquearSlot(tx, canchaId, fechaInicio)) throw horarioOcupado();

      const monto = Math.round(cancha.precioHora * 100) / 100;
      const id = await reservasRepository.insertar(tx, {
        clienteId,
        canchaId,
        inicio: fechaInicio,
        monto,
        estado: ESTADOS.PAGADA,
        ahora,
      });

      const pago = { tipo: TIPOS_PAGO.CARGO, monto, referencia: `SIM-C-${id}` };
      await reservasRepository.insertarPago(tx, { reservaId: id, ...pago, creadoEn: ahora });

      await auditoriaService.registrar(tx, {
        entidad: auditoriaService.ENTIDADES.RESERVA,
        entidadId: id,
        accion: ACCION_CREAR,
        estadoAnterior: null,
        estadoNuevo: ESTADOS.PAGADA,
        usuarioId: clienteId,
        motivo: null,
      });
      await notificacionesService.crear(tx, {
        usuarioId: clienteId,
        reservaId: id,
        mensaje: `Reserva #${id} pagada: ${fechaParaMensaje(fechaInicio)}, C$ ${monto.toFixed(2)}`,
      });

      return {
        id,
        canchaId,
        inicio: formatearFechaLocal(fechaInicio),
        monto,
        estado: ESTADOS.PAGADA,
        pagos: [{ ...pago, creadoEn: formatearFechaLocal(ahora) }],
      };
    }, db.sql.ISOLATION_LEVEL.READ_COMMITTED);
  } catch (err) {
    // Red de seguridad: si el bloqueo no alcanzó, el índice único rechaza el duplicado.
    if (ERRORES_UNICOS.includes(err.number)) throw horarioOcupado();
    throw err;
  }
}

module.exports = { crear };
