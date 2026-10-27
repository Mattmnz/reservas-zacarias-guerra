const db = require('../../config/db');
const AppError = require('../../shared/AppError');
const { ROLES } = require('../../shared/constantes');
const { ahoraNicaragua } = require('../../shared/tiempo');
const auditoriaService = require('../auditoria/auditoria.service');
const canchasRepository = require('./canchas.repository');

const INT_MAX = 2147483647;
const NOMBRE_MAX = 50;
const MOTIVO_MAX = 250;
const TIPO_MAX = 10;
// DECIMAL(10,2) llega hasta 99 999 999,99; por encima, desbordamiento y 500.
const CENTAVOS_MAX = 9999999999;
// Violación de índice único (2601) o de restricción UNIQUE (2627).
const ERRORES_UNICOS = [2601, 2627];

const ACCIONES = Object.freeze({
  CREAR: 'CREAR',
  EDITAR: 'EDITAR',
  ALTA: 'ALTA',
});

const ESTADOS_CANCHA = Object.freeze({
  ACTIVA: 'ACTIVA',
  INACTIVA: 'INACTIVA',
});

function validacion(mensaje) {
  return new AppError(400, 'VALIDACION', mensaje);
}

function noEncontrada() {
  return new AppError(404, 'NO_ENCONTRADO', 'La cancha no existe');
}

function esIdValido(valor) {
  return Number.isInteger(valor) && valor > 0 && valor <= INT_MAX;
}

// idTexto viene de la ruta (:id), siempre como texto; sin esto, "abc" llegaría a sql.Int y sería un 500.
function idDeRuta(idTexto) {
  const id = Number(idTexto);
  if (typeof idTexto !== 'string' || !/^\d+$/.test(idTexto) || !esIdValido(id)) {
    throw validacion('id: debe ser un entero positivo');
  }
  return id;
}

function nombreValido(valor) {
  if (typeof valor !== 'string' || !valor.trim()) {
    throw validacion('nombre: es obligatorio');
  }
  const nombre = valor.trim();
  if (nombre.length > NOMBRE_MAX) {
    throw validacion(`nombre: máximo ${NOMBRE_MAX} caracteres`);
  }
  return nombre;
}

// Viene en el cuerpo JSON: un "2" como texto se rechaza.
function tipoCanchaIdValido(valor) {
  if (!esIdValido(valor)) {
    throw validacion('tipoCanchaId: debe ser un entero positivo');
  }
  return valor;
}

function precioValido(valor) {
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor <= 0) {
    throw validacion('precioHora: debe ser un número mayor que 0');
  }
  const centavos = Math.round(valor * 100);
  // Comparación exacta: centavos / 100 es el mismo double que produce JSON.parse con dos decimales.
  if (centavos / 100 !== valor) {
    throw validacion('precioHora: máximo dos decimales');
  }
  if (centavos > CENTAVOS_MAX) {
    throw validacion('precioHora: máximo 99999999.99');
  }
  return centavos;
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
function filtrosDeListado(rol, { tipo, incluirInactivas } = {}) {
  let tipoCodigo = null;
  if (tipo !== undefined && tipo !== '') {
    if (typeof tipo !== 'string' || tipo.length > TIPO_MAX) {
      throw validacion(`tipo: debe ser un código de hasta ${TIPO_MAX} caracteres`);
    }
    tipoCodigo = tipo;
  }
  // A un cliente se le ignora el parámetro en vez de rechazarlo.
  return { tipoCodigo, incluirInactivas: rol === ROLES.ADMIN && incluirInactivas === 'true' };
}

function traducirDuplicado(err) {
  if (ERRORES_UNICOS.includes(err.number)) {
    return validacion('nombre: ya existe una cancha con ese nombre');
  }
  return err;
}

async function listar(rol, consulta) {
  const filtros = filtrosDeListado(rol, consulta);
  const pool = await db.obtenerPool();
  return canchasRepository.listar(pool, filtros);
}

async function obtener(rol, idTexto) {
  const id = idDeRuta(idTexto);
  const pool = await db.obtenerPool();
  const cancha = await canchasRepository.obtenerPorId(pool, id);
  // Inactiva para un cliente: el mismo 404, para no revelar que existe.
  if (!cancha || (!cancha.activa && rol !== ROLES.ADMIN)) throw noEncontrada();
  return cancha;
}

// Se consulta en vez de atrapar el error 547: ese número también lo produce un CHECK.
async function exigirTipo(tx, tipoCanchaId) {
  const tipo = await canchasRepository.obtenerTipo(tx, tipoCanchaId);
  if (!tipo) throw validacion('tipoCanchaId: el tipo de cancha no existe');
  return tipo;
}

async function crear(usuarioId, { nombre, tipoCanchaId } = {}) {
  const nombreLimpio = nombreValido(nombre);
  const tipoId = tipoCanchaIdValido(tipoCanchaId);

  return db.enTransaccion(async (tx) => {
    const tipo = await exigirTipo(tx, tipoId);

    let id;
    try {
      id = await canchasRepository.insertar(tx, {
        nombre: nombreLimpio,
        tipoCanchaId: tipoId,
        creadaEn: ahoraNicaragua(),
      });
    } catch (err) {
      throw traducirDuplicado(err);
    }

    await auditoriaService.registrar(tx, {
      entidad: auditoriaService.ENTIDADES.CANCHA,
      entidadId: id,
      accion: ACCIONES.CREAR,
      estadoAnterior: null,
      estadoNuevo: ESTADOS_CANCHA.ACTIVA,
      usuarioId,
      motivo: `Nombre: ${nombreLimpio}; tipo: ${tipo.codigo}`,
    });

    return {
      id,
      nombre: nombreLimpio,
      activa: true,
      tipoCanchaId: tipo.id,
      tipoCodigo: tipo.codigo,
      tipoNombre: tipo.nombre,
      precioHora: tipo.precioHora,
    };
  });
}

async function editar(usuarioId, idTexto, { nombre, tipoCanchaId } = {}) {
  const id = idDeRuta(idTexto);
  const nombreLimpio = nombreValido(nombre);
  const tipoId = tipoCanchaIdValido(tipoCanchaId);

  return db.enTransaccion(async (tx) => {
    const actual = await canchasRepository.obtenerPorIdParaActualizar(tx, id);
    if (!actual) throw noEncontrada();

    const cambiaNombre = nombreLimpio !== actual.nombre;
    const cambiaTipo = tipoId !== actual.tipoCanchaId;
    if (!cambiaNombre && !cambiaTipo) return actual;

    // Si el tipo no cambia, la FK ya garantiza que existe.
    const tipo = cambiaTipo
      ? await exigirTipo(tx, tipoId)
      : { id: actual.tipoCanchaId, codigo: actual.tipoCodigo, nombre: actual.tipoNombre, precioHora: actual.precioHora };

    try {
      await canchasRepository.actualizar(tx, { id, nombre: nombreLimpio, tipoCanchaId: tipoId });
    } catch (err) {
      throw traducirDuplicado(err);
    }

    const cambios = [];
    if (cambiaNombre) cambios.push(`Nombre: ${actual.nombre} → ${nombreLimpio}`);
    if (cambiaTipo) cambios.push(`tipo: ${actual.tipoCodigo} → ${tipo.codigo}`);

    await auditoriaService.registrar(tx, {
      entidad: auditoriaService.ENTIDADES.CANCHA,
      entidadId: id,
      accion: ACCIONES.EDITAR,
      estadoAnterior: null,
      estadoNuevo: null,
      usuarioId,
      motivo: cambios.join('; '),
    });

    return {
      ...actual,
      nombre: nombreLimpio,
      tipoCanchaId: tipo.id,
      tipoCodigo: tipo.codigo,
      tipoNombre: tipo.nombre,
      precioHora: tipo.precioHora,
    };
  });
}

async function darDeAlta(usuarioId, idTexto, { motivo } = {}) {
  const id = idDeRuta(idTexto);
  const motivoLimpio = motivoValido(motivo);

  return db.enTransaccion(async (tx) => {
    const actual = await canchasRepository.obtenerPorIdParaActualizar(tx, id);
    if (!actual) throw noEncontrada();
    if (actual.activa) {
      throw new AppError(409, 'TRANSICION_INVALIDA', 'La cancha ya está activa');
    }

    await canchasRepository.activar(tx, id);

    await auditoriaService.registrar(tx, {
      entidad: auditoriaService.ENTIDADES.CANCHA,
      entidadId: id,
      accion: ACCIONES.ALTA,
      estadoAnterior: ESTADOS_CANCHA.INACTIVA,
      estadoNuevo: ESTADOS_CANCHA.ACTIVA,
      usuarioId,
      motivo: motivoLimpio,
    });

    return { ...actual, activa: true };
  });
}

async function listarTipos() {
  const pool = await db.obtenerPool();
  return canchasRepository.listarTipos(pool);
}

// No se audita: Auditoria.Entidad no admite tipos de cancha. Solo afecta reservas nuevas (Monto es copia).
async function cambiarPrecio(idTexto, { precioHora } = {}) {
  const id = idDeRuta(idTexto);
  const centavos = precioValido(precioHora);

  const pool = await db.obtenerPool();
  const tipo = await canchasRepository.actualizarPrecio(pool, id, centavos / 100);
  if (!tipo) throw new AppError(404, 'NO_ENCONTRADO', 'El tipo de cancha no existe');
  return tipo;
}

function aCanchaReducida({ id, nombre, tipoCodigo, precioHora }) {
  return { id, nombre, tipoCodigo, precioHora };
}

// Para otros módulos: usa el ejecutor recibido. Con la transacción de una reserva, el HOLDLOCK
// impide que una baja simultánea desactive la cancha antes del commit.
async function obtenerActiva(ejecutor, canchaId) {
  // Invariante interna: quien llama es otro service y valida la entrada del cliente.
  if (!esIdValido(canchaId)) throw new TypeError('canchaId: se espera un entero positivo');

  const cancha = await canchasRepository.obtenerActiva(ejecutor, canchaId);
  if (!cancha) throw new AppError(404, 'NO_ENCONTRADO', 'La cancha no existe o no está activa');
  return aCanchaReducida(cancha);
}

async function listarActivas(ejecutor, tipoCodigo = null) {
  const canchas = await canchasRepository.listar(ejecutor, { tipoCodigo, incluirInactivas: false });
  return canchas.map(aCanchaReducida);
}

module.exports = {
  ACCIONES,
  listar,
  obtener,
  crear,
  editar,
  darDeAlta,
  listarTipos,
  cambiarPrecio,
  obtenerActiva,
  listarActivas,
};
