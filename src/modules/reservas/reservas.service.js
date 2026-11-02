const db = require('../../config/db');
const AppError = require('../../shared/AppError');
const { ESTADOS, TIPOS_PAGO } = require('../../shared/constantes');
const { ahoraNicaragua, parsearFechaLocal, formatearFechaLocal, diaSemana } = require('../../shared/tiempo');
const auditoriaService = require('../auditoria/auditoria.service');
const notificacionesService = require('../notificaciones/notificaciones.service');
const canchasService = require('../canchas/canchas.service');
const horariosService = require('../horarios/horarios.service');
const reservasRepository = require('./reservas.repository');
const { ACCIONES, puedeTransicionar, estadoResultante } = require('./reglas');

const INT_MAX = 2147483647;
const MAX_ANTICIPACION_MS = 30 * 24 * 3600 * 1000;
const MS_15_MIN = 15 * 60 * 1000;
const MS_1_HORA = 3600 * 1000;
// Violación de índice único (2601) o de restricción UNIQUE (2627).
const ERRORES_UNICOS = [2601, 2627];
const ACCION_CREAR = 'CREAR';

function validacion(mensaje) {
  return new AppError(400, 'VALIDACION', mensaje);
}

function horarioOcupado() {
  return new AppError(409, 'HORARIO_OCUPADO', 'El bloque ya está reservado');
}

function transicionInvalida(mensaje) {
  return new AppError(409, 'TRANSICION_INVALIDA', mensaje);
}

// "20/10/2026 19:00": se arma desde el texto local, sin métodos de hora del Date.
function fechaParaMensaje(fecha) {
  const [dia, hora] = formatearFechaLocal(fecha).split('T');
  const [anio, mes, d] = dia.split('-');
  return `${d}/${mes}/${anio} ${hora.slice(0, 5)}`;
}

// Formato común de la reserva en las respuestas de crear, confirmar, asistencia y cancelar.
function aRespuesta({ id, canchaId, inicio, monto, estado }, pagos) {
  return {
    id,
    canchaId,
    inicio: formatearFechaLocal(inicio),
    monto,
    estado,
    pagos: pagos.map(({ tipo, monto: montoPago, referencia, creadoEn }) => ({
      tipo,
      monto: montoPago,
      referencia,
      creadoEn: formatearFechaLocal(creadoEn),
    })),
  };
}

// idTexto viene de la ruta (:id), siempre como texto.
function parsearId(idTexto) {
  const id = Number(idTexto);
  if (typeof idTexto !== 'string' || !/^\d+$/.test(idTexto) || id <= 0 || id > INT_MAX) {
    throw validacion('id: debe ser un entero positivo');
  }
  return id;
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

      return aRespuesta(
        { id, canchaId, inicio: fechaInicio, monto, estado: ESTADOS.PAGADA },
        [{ ...pago, creadoEn: ahora }],
      );
    }, db.sql.ISOLATION_LEVEL.READ_COMMITTED);
  } catch (err) {
    // Red de seguridad: si el bloqueo no alcanzó, el índice único rechaza el duplicado.
    if (ERRORES_UNICOS.includes(err.number)) throw horarioOcupado();
    throw err;
  }
}

async function barrerEnTransaccion(tx) {
  const marcadas = await reservasRepository.marcarNoShowVencidas(tx, ahoraNicaragua());
  for (const r of marcadas) {
    await auditoriaService.registrar(tx, {
      entidad: auditoriaService.ENTIDADES.RESERVA,
      entidadId: r.id,
      accion: ACCIONES.MARCAR_NO_SHOW,
      estadoAnterior: r.estadoAnterior,
      estadoNuevo: ESTADOS.NO_SHOW,
      usuarioId: null,
      motivo: null,
    });
    await notificacionesService.crear(tx, {
      usuarioId: r.clienteId,
      reservaId: r.id,
      mensaje: `Reserva #${r.id} marcada como no-show: ${fechaParaMensaje(r.inicio)}. Sin reembolso.`,
    });
  }
  return marcadas.length;
}

// Barrido perezoso: se llama al inicio de las lecturas y acciones que dependen del estado.
// Con el pool abre su propia transacción; con una transacción, la usa.
async function barrerNoShow(ejecutor) {
  if (ejecutor instanceof db.sql.Transaction) return barrerEnTransaccion(ejecutor);
  return db.enTransaccion((tx) => barrerEnTransaccion(tx));
}

function exigirFecha(d, campo) {
  // Invariante interna: quien llama es otro service, no el cliente.
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) {
    throw new TypeError(`${campo}: se espera una fecha válida`);
  }
}

async function ocupadosEnRango(ejecutor, desde, hasta) {
  exigirFecha(desde, 'desde');
  exigirFecha(hasta, 'hasta');
  return reservasRepository.ocupadosEnRango(ejecutor, desde, hasta);
}

// Cambio de estado del admin: lee con UPDLOCK, valida con reglas.js y audita y notifica en la misma transacción.
async function aplicarTransicion(id, adminId, accion, momentoValido, mensaje) {
  return db.enTransaccion(async (tx) => {
    const reserva = await reservasRepository.obtenerParaActualizar(tx, id);
    if (!reserva) throw new AppError(404, 'NO_ENCONTRADO', 'La reserva no existe');
    // El "ahora" se toma después de obtener el bloqueo, que puede haber esperado a otra transacción.
    const ahora = ahoraNicaragua();
    if (!puedeTransicionar(reserva.estado, accion)) {
      throw transicionInvalida(`No se puede ${mensaje.verbo} una reserva ${reserva.estado}`);
    }
    if (!momentoValido(reserva.inicio, ahora)) {
      throw transicionInvalida(`No se puede ${mensaje.verbo} la reserva en este momento`);
    }

    const estadoNuevo = estadoResultante(reserva.estado, accion);
    await reservasRepository.actualizarEstado(tx, { id, estado: estadoNuevo, ahora });
    await auditoriaService.registrar(tx, {
      entidad: auditoriaService.ENTIDADES.RESERVA,
      entidadId: id,
      accion,
      estadoAnterior: reserva.estado,
      estadoNuevo,
      usuarioId: adminId,
      motivo: null,
    });
    await notificacionesService.crear(tx, {
      usuarioId: reserva.clienteId,
      reservaId: id,
      mensaje: mensaje.notificacion(id, fechaParaMensaje(reserva.inicio)),
    });

    const pagos = await reservasRepository.listarPagos(tx, id);
    return aRespuesta({ ...reserva, estado: estadoNuevo }, pagos);
  });
}

async function confirmar(idTexto, adminId) {
  const id = parsearId(idTexto);
  return aplicarTransicion(id, adminId, ACCIONES.CONFIRMAR, (inicio, ahora) => inicio > ahora, {
    verbo: 'confirmar',
    notificacion: (reservaId, fecha) => `Reserva #${reservaId} confirmada: ${fecha}`,
  });
}

// Ventana de asistencia: desde 15 min antes del inicio hasta el fin del bloque (exclusivo),
// que es justo cuando el barrido la marcaría como no-show.
function dentroDeVentanaAsistencia(inicio, ahora) {
  const ms = ahora.getTime() - inicio.getTime();
  return ms >= -MS_15_MIN && ms < MS_1_HORA;
}

async function registrarAsistencia(idTexto, adminId) {
  const id = parsearId(idTexto);
  await barrerNoShow(await db.obtenerPool());
  return aplicarTransicion(id, adminId, ACCIONES.REGISTRAR_ASISTENCIA, dentroDeVentanaAsistencia, {
    verbo: 'registrar la asistencia de',
    notificacion: (reservaId, fecha) => `Asistencia registrada en la reserva #${reservaId}: ${fecha}`,
  });
}

module.exports = { crear, confirmar, registrarAsistencia, barrerNoShow, ocupadosEnRango };
