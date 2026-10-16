// Reglas puras de reservas: sin base de datos ni reloj; el "ahora" llega por parámetro.
const { ESTADOS } = require('../../shared/constantes');

const ACCIONES = Object.freeze({
  CONFIRMAR: 'CONFIRMAR',
  CANCELAR: 'CANCELAR',
  REGISTRAR_ASISTENCIA: 'REGISTRAR_ASISTENCIA',
  MARCAR_NO_SHOW: 'MARCAR_NO_SHOW',
});

// Estados finales sin acciones: cualquier intento sobre ellos es inválido.
const TRANSICIONES = Object.freeze({
  [ESTADOS.PAGADA]: Object.freeze({
    [ACCIONES.CONFIRMAR]: ESTADOS.CONFIRMADA,
    [ACCIONES.CANCELAR]: ESTADOS.CANCELADA,
    [ACCIONES.REGISTRAR_ASISTENCIA]: ESTADOS.COMPLETADA,
    [ACCIONES.MARCAR_NO_SHOW]: ESTADOS.NO_SHOW,
  }),
  [ESTADOS.CONFIRMADA]: Object.freeze({
    [ACCIONES.CANCELAR]: ESTADOS.CANCELADA,
    [ACCIONES.REGISTRAR_ASISTENCIA]: ESTADOS.COMPLETADA,
    [ACCIONES.MARCAR_NO_SHOW]: ESTADOS.NO_SHOW,
  }),
  [ESTADOS.COMPLETADA]: Object.freeze({}),
  [ESTADOS.CANCELADA]: Object.freeze({}),
  [ESTADOS.NO_SHOW]: Object.freeze({}),
});

const MS_24H = 24 * 3600 * 1000;

function puedeTransicionar(estado, accion) {
  // hasOwn evita que claves heredadas como 'toString' cuenten como estado o acción.
  return Object.hasOwn(TRANSICIONES, estado) && Object.hasOwn(TRANSICIONES[estado], accion);
}

function estadoResultante(estado, accion) {
  if (!puedeTransicionar(estado, accion)) {
    throw new RangeError(`Transición inválida: ${String(estado)} → ${String(accion)}`);
  }
  return TRANSICIONES[estado][accion];
}

function validarMonto(montoCentavos) {
  if (!Number.isSafeInteger(montoCentavos) || montoCentavos <= 0) {
    throw new TypeError('montoCentavos debe ser un entero mayor que 0');
  }
}

function validarFecha(d, campo) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) {
    throw new TypeError(`${campo} debe ser una fecha válida`);
  }
}

function calcularCancelacion(montoCentavos, inicio, ahora) {
  validarMonto(montoCentavos);
  validarFecha(inicio, 'inicio');
  validarFecha(ahora, 'ahora');

  const ms = inicio.getTime() - ahora.getTime();
  if (ms <= 0) throw new RangeError('La reserva ya empezó: no se puede cancelar');

  // Exactamente 24 h de anticipación todavía cuenta como cancelación sin penalización.
  const porcentajePenalizacion = ms >= MS_24H ? 0 : 50;
  const penalizacionCentavos = Math.round((montoCentavos * porcentajePenalizacion) / 100);

  // El reembolso se obtiene por resta para que la suma siempre cuadre con el monto.
  return {
    porcentajePenalizacion,
    penalizacionCentavos,
    reembolsoCentavos: montoCentavos - penalizacionCentavos,
  };
}

function calcularNoShow(montoCentavos) {
  validarMonto(montoCentavos);
  return { porcentajePenalizacion: 100, penalizacionCentavos: montoCentavos, reembolsoCentavos: 0 };
}

module.exports = { ACCIONES, puedeTransicionar, estadoResultante, calcularCancelacion, calcularNoShow };
