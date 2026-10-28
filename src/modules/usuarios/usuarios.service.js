const db = require('../../config/db');
const AppError = require('../../shared/AppError');
const { ROLES } = require('../../shared/constantes');
const { ahoraNicaragua, formatearFechaLocal } = require('../../shared/tiempo');
const auditoriaService = require('../auditoria/auditoria.service');
const usuariosRepository = require('./usuarios.repository');

// Violación de índice único (2601) o de restricción UNIQUE (2627).
const ERRORES_UNICOS = [2601, 2627];

const INT_MAX = 2147483647;
const MOTIVO_MAX = 250;
const ROLES_VALIDOS = Object.values(ROLES);

const ACCIONES = Object.freeze({
  CAMBIAR_ROL: 'CAMBIAR_ROL',
  ACTIVAR: 'ACTIVAR',
  DESACTIVAR: 'DESACTIVAR',
});

const ESTADOS_USUARIO = Object.freeze({
  ACTIVO: 'ACTIVO',
  INACTIVO: 'INACTIVO',
});

function sinHash(usuario) {
  if (!usuario) return null;
  const { passwordHash, ...resto } = usuario;
  return resto;
}

async function obtenerPorId(ejecutor, id) {
  return sinHash(await usuariosRepository.obtenerPorId(ejecutor, id));
}

// Única función que expone el hash: solo la usa el login.
async function obtenerPorCorreo(ejecutor, correo) {
  return usuariosRepository.obtenerPorCorreo(ejecutor, correo);
}

async function crear(ejecutor, { nombre, correo, telefono, passwordHash, rol }) {
  try {
    const id = await usuariosRepository.crear(ejecutor, {
      nombre,
      correo,
      telefono,
      passwordHash,
      rol,
      creadoEn: ahoraNicaragua(),
    });
    return { id, nombre, correo, rol };
  } catch (err) {
    if (ERRORES_UNICOS.includes(err.number)) {
      throw new AppError(409, 'CORREO_DUPLICADO', 'El correo ya está registrado');
    }
    throw err;
  }
}

function validacion(mensaje) {
  return new AppError(400, 'VALIDACION', mensaje);
}

function noEncontrado() {
  return new AppError(404, 'NO_ENCONTRADO', 'El usuario no existe');
}

// idTexto viene de la ruta (:id), siempre como texto; sin esto, "abc" llegaría a sql.Int y sería un 500.
function idDeRuta(idTexto) {
  const id = Number(idTexto);
  if (typeof idTexto !== 'string' || !/^\d+$/.test(idTexto) || id <= 0 || id > INT_MAX) {
    throw validacion('id: debe ser un entero positivo');
  }
  return id;
}

// El registrar de auditoría lanza RangeError con más de 250: se valida antes para que sea 400 y no 500.
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

// Entrada del query string: llega como texto, o como arreglo si el parámetro se repite.
function filtrosDeListado({ rol, activo } = {}) {
  const filtros = { rol: null, activo: null };

  if (rol !== undefined) {
    if (typeof rol !== 'string' || !ROLES_VALIDOS.includes(rol)) {
      throw validacion(`rol: debe ser ${ROLES_VALIDOS.join(' o ')}`);
    }
    filtros.rol = rol;
  }

  if (activo !== undefined) {
    if (activo !== 'true' && activo !== 'false') {
      throw validacion('activo: debe ser true o false');
    }
    filtros.activo = activo === 'true';
  }

  return filtros;
}

// Viene en el cuerpo JSON: exactamente uno de los dos campos; un "true" como texto se rechaza.
function cambioPedido({ rol, activo, motivo } = {}) {
  const traeRol = rol !== undefined;
  const traeActivo = activo !== undefined;
  if (traeRol === traeActivo) {
    throw validacion('Se debe enviar uno solo de estos campos: rol o activo');
  }
  if (traeRol && (typeof rol !== 'string' || !ROLES_VALIDOS.includes(rol))) {
    throw validacion(`rol: debe ser ${ROLES_VALIDOS.join(' o ')}`);
  }
  if (traeActivo && typeof activo !== 'boolean') {
    throw validacion('activo: debe ser true o false');
  }
  return {
    campo: traeRol ? 'rol' : 'activo',
    valor: traeRol ? rol : activo,
    motivo: motivoValido(motivo),
  };
}

function estadoDe(activo) {
  return activo ? ESTADOS_USUARIO.ACTIVO : ESTADOS_USUARIO.INACTIVO;
}

function datosDeAuditoria(campo, anterior, nuevo) {
  if (campo === 'rol') {
    return { accion: ACCIONES.CAMBIAR_ROL, estadoAnterior: anterior, estadoNuevo: nuevo };
  }
  return {
    accion: nuevo ? ACCIONES.ACTIVAR : ACCIONES.DESACTIVAR,
    estadoAnterior: estadoDe(anterior),
    estadoNuevo: estadoDe(nuevo),
  };
}

function aRespuesta(usuario) {
  return { ...usuario, creadoEn: formatearFechaLocal(usuario.creadoEn) };
}

async function listar(consulta) {
  const filtros = filtrosDeListado(consulta);
  const pool = await db.obtenerPool();
  const usuarios = await usuariosRepository.listar(pool, filtros);
  return usuarios.map(aRespuesta);
}

async function actualizar(adminId, idTexto, cuerpo) {
  const id = idDeRuta(idTexto);
  const { campo, valor, motivo } = cambioPedido(cuerpo);
  // Como nadie puede tocarse a sí mismo, siempre queda al menos un ADMIN activo: el que hace el cambio.
  if (id === adminId) {
    throw validacion('No se puede cambiar el rol ni el estado del propio usuario');
  }

  return db.enTransaccion(async (tx) => {
    const actual = await usuariosRepository.obtenerPorIdParaActualizar(tx, id);
    if (!actual) throw noEncontrado();
    if (actual[campo] === valor) return aRespuesta(actual);

    if (campo === 'rol') {
      await usuariosRepository.actualizarRol(tx, id, valor);
    } else {
      await usuariosRepository.actualizarActivo(tx, id, valor);
    }

    await auditoriaService.registrar(tx, {
      entidad: auditoriaService.ENTIDADES.USUARIO,
      entidadId: id,
      ...datosDeAuditoria(campo, actual[campo], valor),
      usuarioId: adminId,
      motivo,
    });

    return aRespuesta({ ...actual, [campo]: valor });
  });
}

module.exports = { ACCIONES, obtenerPorId, obtenerPorCorreo, crear, listar, actualizar };