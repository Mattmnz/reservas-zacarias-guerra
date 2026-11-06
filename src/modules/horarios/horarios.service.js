const db = require('../../config/db');
const AppError = require('../../shared/AppError');
const auditoriaService = require('../auditoria/auditoria.service');
const canchasService = require('../canchas/canchas.service');
const horariosRepository = require('./horarios.repository');

const INT_MAX = 2147483647;
// TIME no admite 24:00: la última hora de cierre posible es 23:00.
const HORA_EN_PUNTO = /^([01]\d|2[0-3]):00$/;
const ACCION_CAMBIAR_HORARIO = 'CAMBIAR_HORARIO';
const NOMBRES_DIA = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function validacion(mensaje) {
  return new AppError(400, 'VALIDACION', mensaje);
}

function esIdValido(valor) {
  return Number.isInteger(valor) && valor > 0 && valor <= INT_MAX;
}

function esDiaValido(valor) {
  return Number.isInteger(valor) && valor >= 1 && valor <= 7;
}

// idTexto viene de la ruta (:id), siempre como texto; sin esto, "abc" llegaría a sql.Int y sería un 500.
function idDeRuta(idTexto) {
  const id = Number(idTexto);
  if (typeof idTexto !== 'string' || !/^\d+$/.test(idTexto) || !esIdValido(id)) {
    throw validacion('id: debe ser un entero positivo');
  }
  return id;
}

function horaValida(valor, campo) {
  if (typeof valor !== 'string' || !HORA_EN_PUNTO.test(valor)) {
    throw validacion(`${campo}: se espera HH:00, entre 00:00 y 23:00`);
  }
  return Number(valor.slice(0, 2));
}

function horaATexto(hora) {
  return `${String(hora).padStart(2, '0')}:00`;
}

function aDiaPublico({ diaSemana, apertura, cierre }) {
  return { diaSemana, apertura: horaATexto(apertura), cierre: horaATexto(cierre) };
}

function rango(dia) {
  return dia ? `${horaATexto(dia.apertura)}-${horaATexto(dia.cierre)}` : 'cerrado';
}

// Solo los días que cambian: "Lun 07:00-22:00 → 08:00-20:00; Dom cerrado → 07:00-22:00".
// Con los 7 días cambiados son 215 caracteres: cabe en los 250 del motivo de auditoría.
function describirCambios(anterior, nueva) {
  const antes = new Map(anterior.map((d) => [d.diaSemana, d]));
  const despues = new Map(nueva.map((d) => [d.diaSemana, d]));
  const cambios = [];
  for (let dia = 1; dia <= 7; dia++) {
    const a = rango(antes.get(dia));
    const b = rango(despues.get(dia));
    if (a !== b) cambios.push(`${NOMBRES_DIA[dia]} ${a} → ${b}`);
  }
  return cambios.join('; ');
}

// Devuelve la semana con horas enteras, ordenada por día. Un arreglo vacío deja la cancha cerrada.
function semanaValida(dias) {
  if (!Array.isArray(dias)) throw validacion('dias: debe ser un arreglo');

  const vistos = new Set();
  const semana = dias.map((dia, i) => {
    const campo = `dias[${i}]`;
    if (typeof dia !== 'object' || dia === null || Array.isArray(dia)) {
      throw validacion(`${campo}: debe ser un objeto`);
    }
    // Viene en el cuerpo JSON: un "1" como texto se rechaza.
    if (!esDiaValido(dia.diaSemana)) {
      throw validacion(`${campo}.diaSemana: debe ser un entero entre 1 (lunes) y 7 (domingo)`);
    }
    if (vistos.has(dia.diaSemana)) {
      throw validacion(`${campo}.diaSemana: el día ${dia.diaSemana} está repetido`);
    }
    vistos.add(dia.diaSemana);

    const apertura = horaValida(dia.apertura, `${campo}.apertura`);
    const cierre = horaValida(dia.cierre, `${campo}.cierre`);
    if (apertura >= cierre) throw validacion(`${campo}: la apertura debe ser anterior al cierre`);

    return { diaSemana: dia.diaSemana, apertura, cierre };
  });

  return semana.sort((a, b) => a.diaSemana - b.diaSemana);
}

async function listar(rol, idTexto) {
  // Valida el id y aplica la visibilidad de canchas: inactiva para un cliente → el mismo 404.
  const cancha = await canchasService.obtener(rol, idTexto);
  const pool = await db.obtenerPool();
  const dias = await horariosRepository.listarPorCancha(pool, cancha.id);
  return dias.map(aDiaPublico);
}

// Reemplaza la semana completa. Vale también sobre una cancha inactiva: si se reactiva, rige.
// Las reservas ya hechas no se tocan; el horario nuevo solo limita las reservas futuras.
async function reemplazar(usuarioId, idTexto, { dias } = {}) {
  const id = idDeRuta(idTexto);
  const semana = semanaValida(dias);

  return db.enTransaccion(async (tx) => {
    // Bloquea la fila de la cancha: dos reemplazos simultáneos se serializan y el segundo
    // no choca con UQ_Horario_CanchaDia al insertar.
    await canchasService.obtenerParaActualizar(tx, id);

    // Se lee dentro de la transacción, después del bloqueo: es la semana que se va a reemplazar.
    const anterior = await horariosRepository.listarPorCancha(tx, id);
    const motivo = describirCambios(anterior, semana);
    // Sin cambios: ni escritura ni auditoría, igual que el PUT de canchas.
    if (!motivo) return semana.map(aDiaPublico);

    await horariosRepository.eliminarPorCancha(tx, id);
    for (const dia of semana) {
      await horariosRepository.insertar(tx, { canchaId: id, ...dia });
    }

    await auditoriaService.registrar(tx, {
      entidad: auditoriaService.ENTIDADES.CANCHA,
      entidadId: id,
      accion: ACCION_CAMBIAR_HORARIO,
      estadoAnterior: null,
      estadoNuevo: null,
      usuarioId,
      motivo,
    });

    return semana.map(aDiaPublico);
  });
}

// Para otros módulos: usa el ejecutor recibido, sin transacción propia.
async function obtenerDelDia(ejecutor, canchaId, diaSemana) {
  // Invariantes internas: quien llama es otro service y valida la entrada del cliente.
  if (!esIdValido(canchaId)) throw new TypeError('canchaId: se espera un entero positivo');
  if (!esDiaValido(diaSemana)) throw new TypeError('diaSemana: se espera un entero entre 1 y 7');

  return horariosRepository.obtenerDelDia(ejecutor, canchaId, diaSemana);
}

async function listarDelDia(ejecutor, diaSemana) {
  if (!esDiaValido(diaSemana)) throw new TypeError('diaSemana: se espera un entero entre 1 y 7');

  return horariosRepository.listarDelDia(ejecutor, diaSemana);
}

module.exports = { listar, reemplazar, obtenerDelDia, listarDelDia };
