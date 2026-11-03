const db = require('../../config/db');
const AppError = require('../../shared/AppError');
const { ESTADOS, ROLES, TIPOS_PAGO } = require('../../shared/constantes');
const { ahoraNicaragua, parsearFechaLocal, formatearFechaLocal, diaSemana } = require('../../shared/tiempo');
const auditoriaService = require('../auditoria/auditoria.service');
const notificacionesService = require('../notificaciones/notificaciones.service');
const canchasService = require('../canchas/canchas.service');
const horariosService = require('../horarios/horarios.service');
const usuariosService = require('../usuarios/usuarios.service');
const reservasRepository = require('./reservas.repository');
const { ACCIONES, puedeTransicionar, estadoResultante, calcularCancelacion } = require('./reglas');

const INT_MAX = 2147483647;
const MAX_ANTICIPACION_MS = 30 * 24 * 3600 * 1000;
const MS_15_MIN = 15 * 60 * 1000;
const MS_1_HORA = 3600 * 1000;
// Violación de índice único (2601) o de restricción UNIQUE (2627).
const ERRORES_UNICOS = [2601, 2627];
const ACCION_CREAR = 'CREAR';
// 150 deja lugar al prefijo de penalización dentro de los 250 de Auditoria.Motivo.
const MOTIVO_MAX = 150;

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
function aRespuesta({ id, canchaId, inicio, monto, estado, montoPenalizado }, pagos) {
  return {
    id,
    canchaId,
    inicio: formatearFechaLocal(inicio),
    monto,
    estado,
    montoPenalizado,
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
        { id, canchaId, inicio: fechaInicio, monto, estado: ESTADOS.PAGADA, montoPenalizado: null },
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

function motivoValido(valor) {
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== 'string' || !valor.trim()) {
    throw validacion('motivo: si se envía, debe ser texto no vacío');
  }
  const motivo = valor.trim();
  if (motivo.length > MOTIVO_MAX) {
    throw validacion(`motivo: máximo ${MOTIVO_MAX} caracteres`);
  }
  return motivo;
}

function textoPenalizacion({ porcentajePenalizacion, penalizacionCentavos, reembolsoCentavos }) {
  const penalizacion = (penalizacionCentavos / 100).toFixed(2);
  const reembolso = (reembolsoCentavos / 100).toFixed(2);
  return `Penalización ${porcentajePenalizacion} %: C$ ${penalizacion}; reembolso: C$ ${reembolso}.`;
}

function motivoAuditoria(calculo, motivo) {
  const prefijo = textoPenalizacion(calculo);
  return motivo ? `${prefijo} Motivo: ${motivo}` : prefijo;
}

async function cancelar(idTexto, usuario, { motivo } = {}) {
  const id = parsearId(idTexto);
  const motivoLimpio = motivoValido(motivo);
  await barrerNoShow(await db.obtenerPool());

  return db.enTransaccion(async (tx) => {
    const reserva = await reservasRepository.obtenerParaActualizar(tx, id);
    if (!reserva) throw new AppError(404, 'NO_ENCONTRADO', 'La reserva no existe');
    // El dueño se verifica antes que el estado: una reserva ajena no revela cómo está.
    if (usuario.rol !== ROLES.ADMIN && reserva.clienteId !== usuario.id) {
      throw new AppError(403, 'SIN_PERMISO', 'Solo podés cancelar tus propias reservas');
    }
    // El "ahora" se toma después de obtener el bloqueo, que puede haber esperado a otra transacción.
    const ahora = ahoraNicaragua();
    if (!puedeTransicionar(reserva.estado, ACCIONES.CANCELAR)) {
      throw transicionInvalida(`No se puede cancelar una reserva ${reserva.estado}`);
    }
    if (reserva.inicio <= ahora) throw transicionInvalida('La reserva ya empezó: no se puede cancelar');

    const calculo = calcularCancelacion(Math.round(reserva.monto * 100), reserva.inicio, ahora);
    const montoPenalizado = calculo.penalizacionCentavos / 100;
    await reservasRepository.cancelar(tx, { id, montoPenalizado, ahora });
    if (calculo.reembolsoCentavos > 0) {
      await reservasRepository.insertarPago(tx, {
        reservaId: id,
        tipo: TIPOS_PAGO.REEMBOLSO,
        monto: calculo.reembolsoCentavos / 100,
        referencia: `SIM-R-${id}`,
        creadoEn: ahora,
      });
    }

    await auditoriaService.registrar(tx, {
      entidad: auditoriaService.ENTIDADES.RESERVA,
      entidadId: id,
      accion: ACCIONES.CANCELAR,
      estadoAnterior: reserva.estado,
      estadoNuevo: ESTADOS.CANCELADA,
      usuarioId: usuario.id,
      motivo: motivoAuditoria(calculo, motivoLimpio),
    });
    await notificacionesService.crear(tx, {
      usuarioId: reserva.clienteId,
      reservaId: id,
      mensaje: `Reserva #${id} cancelada: ${fechaParaMensaje(reserva.inicio)}. ${textoPenalizacion(calculo)}`,
    });

    const pagos = await reservasRepository.listarPagos(tx, id);
    return aRespuesta({ ...reserva, estado: ESTADOS.CANCELADA, montoPenalizado }, pagos);
  });
}

function exigirId(valor, campo) {
  // Invariante interna: quien llama es otro service, no el cliente.
  if (!Number.isInteger(valor) || valor <= 0 || valor > INT_MAX) {
    throw new TypeError(`${campo}: se espera un entero positivo`);
  }
}

async function contarFuturasActivas(ejecutor, canchaId) {
  exigirId(canchaId, 'canchaId');
  return reservasRepository.contarFuturasActivas(ejecutor, canchaId, ahoraNicaragua());
}

// Baja de cancha (#20): reembolso del 100 % de las reservas futuras, dentro de la transacción de la baja.
async function cancelarPorBajaDeCancha(tx, canchaId, adminId) {
  if (!(tx instanceof db.sql.Transaction)) {
    throw new TypeError('tx: se espera la transacción de la baja de cancha');
  }
  exigirId(canchaId, 'canchaId');
  exigirId(adminId, 'adminId');

  const ahora = ahoraNicaragua();
  const canceladas = await reservasRepository.cancelarFuturasDeCancha(tx, canchaId, ahora);
  for (const r of canceladas) {
    const montoCentavos = Math.round(r.monto * 100);
    const calculo = { porcentajePenalizacion: 0, penalizacionCentavos: 0, reembolsoCentavos: montoCentavos };
    await reservasRepository.insertarPago(tx, {
      reservaId: r.id,
      tipo: TIPOS_PAGO.REEMBOLSO,
      monto: montoCentavos / 100,
      referencia: `SIM-R-${r.id}`,
      creadoEn: ahora,
    });
    await auditoriaService.registrar(tx, {
      entidad: auditoriaService.ENTIDADES.RESERVA,
      entidadId: r.id,
      accion: ACCIONES.CANCELAR,
      estadoAnterior: r.estadoAnterior,
      estadoNuevo: ESTADOS.CANCELADA,
      usuarioId: adminId,
      motivo: motivoAuditoria(calculo, 'baja de la cancha'),
    });
    await notificacionesService.crear(tx, {
      usuarioId: r.clienteId,
      reservaId: r.id,
      mensaje: `Reserva #${r.id} cancelada por baja de la cancha: ${fechaParaMensaje(r.inicio)}. Reembolso total: C$ ${(montoCentavos / 100).toFixed(2)}`,
    });
  }
  return canceladas.length;
}

const MS_DIA = 24 * MS_1_HORA;
const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const ESTADOS_VALIDOS = Object.values(ESTADOS);

// Un filtro vacío (?desde=) se toma como ausente: un formulario manda todos sus campos.
function filtroAusente(valor) {
  return valor === undefined || valor === '';
}

// Entrada del query string: llega como texto, o como arreglo si el parámetro se repite.
function fechaDeFiltro(valor, campo) {
  if (filtroAusente(valor)) return null;
  if (typeof valor !== 'string' || !FORMATO_FECHA.test(valor)) {
    throw validacion(`${campo}: se espera YYYY-MM-DD`);
  }
  try {
    return parsearFechaLocal(`${valor}T00:00:00`, campo);
  } catch {
    // Con el formato ya validado, solo falla una fecha que no existe (2026-02-30, mes 13).
    throw validacion(`${campo}: no es una fecha del calendario`);
  }
}

function canchaIdDeFiltro(valor) {
  if (filtroAusente(valor)) return null;
  const id = Number(valor);
  if (typeof valor !== 'string' || !/^\d+$/.test(valor) || id <= 0 || id > INT_MAX) {
    throw validacion('canchaId: debe ser un entero positivo');
  }
  return id;
}

function estadoDeFiltro(valor) {
  if (filtroAusente(valor)) return null;
  if (typeof valor !== 'string' || !ESTADOS_VALIDOS.includes(valor)) {
    throw validacion(`estado: debe ser ${ESTADOS_VALIDOS.join(', ')}`);
  }
  return valor;
}

// desde y hasta son días completos e inclusivos: hasta se pasa a la base como el día siguiente, exclusivo.
function filtrosDeListado({ desde, hasta, canchaId, estado } = {}) {
  const fechaDesde = fechaDeFiltro(desde, 'desde');
  const fechaHasta = fechaDeFiltro(hasta, 'hasta');
  if (fechaDesde && fechaHasta && fechaDesde > fechaHasta) {
    throw validacion('desde: no puede ser posterior a hasta');
  }
  return {
    desde: fechaDesde,
    hasta: fechaHasta && new Date(fechaHasta.getTime() + MS_DIA),
    canchaId: canchaIdDeFiltro(canchaId),
    estado: estadoDeFiltro(estado),
  };
}

function idsUnicos(reservas, campo) {
  return [...new Set(reservas.map((r) => r[campo]))];
}

// Agrega a cada reserva sus pagos, su cancha y, para el admin, su cliente. Una consulta por fuente,
// sin importar cuántas reservas haya (sin N+1); son independientes y van en paralelo.
async function completar(pool, reservas, { conCliente }) {
  if (reservas.length === 0) return [];

  const [pagos, canchas, clientes] = await Promise.all([
    reservasRepository.listarPagosDeReservas(pool, reservas.map((r) => r.id)),
    canchasService.listarPorIds(pool, idsUnicos(reservas, 'canchaId')),
    conCliente ? usuariosService.listarNombresPorIds(pool, idsUnicos(reservas, 'clienteId')) : [],
  ]);

  const pagosPorReserva = new Map(reservas.map((r) => [r.id, []]));
  for (const pago of pagos) pagosPorReserva.get(pago.reservaId).push(pago);
  const canchaPorId = new Map(canchas.map((c) => [c.id, c]));
  const nombrePorCliente = new Map(clientes.map((u) => [u.id, u.nombre]));

  return reservas.map((r) => {
    const cancha = canchaPorId.get(r.canchaId);
    const respuesta = {
      ...aRespuesta(r, pagosPorReserva.get(r.id)),
      canchaNombre: cancha.nombre,
      tipoCodigo: cancha.tipoCodigo,
    };
    if (!conCliente) return respuesta;
    return { ...respuesta, clienteId: r.clienteId, clienteNombre: nombrePorCliente.get(r.clienteId) };
  });
}

async function listarMias(clienteId) {
  const pool = await db.obtenerPool();
  // Antes de leer: deja en NO_SHOW lo vencido, para no mostrar como vigente una reserva perdida.
  await barrerNoShow(pool);
  const reservas = await reservasRepository.listarDeCliente(pool, clienteId);
  return completar(pool, reservas, { conCliente: false });
}

async function obtener(idTexto, usuario) {
  const id = parsearId(idTexto);
  const pool = await db.obtenerPool();
  await barrerNoShow(pool);

  const reserva = await reservasRepository.obtenerPorId(pool, id);
  if (!reserva) throw new AppError(404, 'NO_ENCONTRADO', 'La reserva no existe');
  const esAdmin = usuario.rol === ROLES.ADMIN;
  // Como en cancelar: primero la existencia y después el dueño.
  if (!esAdmin && reserva.clienteId !== usuario.id) {
    throw new AppError(403, 'SIN_PERMISO', 'Solo podés ver tus propias reservas');
  }

  const [respuesta] = await completar(pool, [reserva], { conCliente: esAdmin });
  return respuesta;
}

async function listar(consulta) {
  const filtros = filtrosDeListado(consulta);
  const pool = await db.obtenerPool();
  await barrerNoShow(pool);
  const reservas = await reservasRepository.listar(pool, filtros);
  return completar(pool, reservas, { conCliente: true });
}

module.exports = {
  crear,
  confirmar,
  registrarAsistencia,
  cancelar,
  barrerNoShow,
  ocupadosEnRango,
  contarFuturasActivas,
  cancelarPorBajaDeCancha,
  listarMias,
  obtener,
  listar,
};
