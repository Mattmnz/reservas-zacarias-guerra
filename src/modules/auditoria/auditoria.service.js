const db = require('../../config/db');
const AppError = require('../../shared/AppError');
const { ahoraNicaragua, formatearFechaLocal } = require('../../shared/tiempo');
const auditoriaRepository = require('./auditoria.repository');

const ENTIDADES = Object.freeze({
  RESERVA: 'RESERVA',
  CANCHA: 'CANCHA',
  USUARIO: 'USUARIO',
});

const INT_MAX = 2147483647;

// Invariantes internas: quien llama es otro service, no el cliente; por eso errores nativos.
function exigirEntero(valor, campo, { opcional = false } = {}) {
  if (valor === null && opcional) return;
  if (!Number.isInteger(valor) || valor <= 0 || valor > INT_MAX) {
    throw new TypeError(`${campo}: se espera un entero positivo${opcional ? ' o null' : ''}`);
  }
}

// Se lanza en vez de truncar: un motivo cortado en silencio perdería información de auditoría.
function exigirTexto(valor, campo, maximo, { opcional = false } = {}) {
  if (valor === null && opcional) return;
  if (typeof valor !== 'string' || !valor.trim()) {
    throw new TypeError(`${campo}: se espera texto no vacío${opcional ? ' o null' : ''}`);
  }
  if (valor.length > maximo) {
    throw new RangeError(`${campo}: máximo ${maximo} caracteres`);
  }
}

// No abre transacción: usa el ejecutor recibido para que un fallo revierta también el cambio de estado.
async function registrar(
  ejecutor,
  { entidad, entidadId, accion, estadoAnterior = null, estadoNuevo = null, usuarioId = null, motivo = null },
) {
  if (!Object.values(ENTIDADES).includes(entidad)) {
    throw new RangeError(`entidad: valor desconocido (${entidad})`);
  }
  exigirEntero(entidadId, 'entidadId');
  exigirTexto(accion, 'accion', 30);
  exigirTexto(estadoAnterior, 'estadoAnterior', 20, { opcional: true });
  exigirTexto(estadoNuevo, 'estadoNuevo', 20, { opcional: true });
  // null = acción del sistema (barrido de no-show).
  exigirEntero(usuarioId, 'usuarioId', { opcional: true });
  exigirTexto(motivo, 'motivo', 250, { opcional: true });

  await auditoriaRepository.insertar(ejecutor, {
    entidad,
    entidadId,
    accion,
    estadoAnterior,
    estadoNuevo,
    usuarioId,
    motivo,
    fecha: ahoraNicaragua(),
  });
}

function validacion(mensaje) {
  return new AppError(400, 'VALIDACION', mensaje);
}

// Entrada del query string: llega como texto, o como arreglo si el parámetro se repite.
function filtrosDeListado({ entidad, entidadId } = {}) {
  const filtros = { entidad: null, entidadId: null };

  if (entidad !== undefined) {
    if (typeof entidad !== 'string' || !Object.values(ENTIDADES).includes(entidad)) {
      throw validacion(`entidad: debe ser ${Object.values(ENTIDADES).join(', ')}`);
    }
    filtros.entidad = entidad;
  }

  if (entidadId !== undefined) {
    const numero = Number(entidadId);
    if (typeof entidadId !== 'string' || !/^\d+$/.test(entidadId) || numero <= 0 || numero > INT_MAX) {
      throw validacion('entidadId: debe ser un entero positivo');
    }
    filtros.entidadId = numero;
  }

  return filtros;
}

async function listar(consulta) {
  const filtros = filtrosDeListado(consulta);
  const pool = await db.obtenerPool();
  const registros = await auditoriaRepository.listar(pool, filtros);
  return registros.map((r) => ({ ...r, fecha: formatearFechaLocal(r.fecha) }));
}

module.exports = { ENTIDADES, registrar, listar };
