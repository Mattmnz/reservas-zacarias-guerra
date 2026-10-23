const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const env = require('../../config/env');
const { obtenerPool } = require('../../config/db');
const AppError = require('../../shared/AppError');
const { ROLES } = require('../../shared/constantes');
const usuariosService = require('../usuarios/usuarios.service');

const COSTO_HASH = 10;
const PASSWORD_MIN = 8;
// bcrypt ignora lo que pasa de 72 bytes: dos contraseñas con ese prefijo valdrían igual.
const PASSWORD_MAX_BYTES = 72;
const FORMATO_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MENSAJE_CREDENCIALES = 'Correo o contraseña incorrectos';

// Se compara contra este hash cuando el correo no existe, para que el tiempo de respuesta no lo delate.
const HASH_FICTICIO = bcrypt.hashSync('sin-usuario-registrado', COSTO_HASH);

function validacion(mensaje) {
  return new AppError(400, 'VALIDACION', mensaje);
}

function noAutenticado(mensaje) {
  return new AppError(401, 'NO_AUTENTICADO', mensaje);
}

function textoRequerido(valor, campo) {
  if (typeof valor !== 'string' || !valor.trim()) {
    throw validacion(`${campo}: es obligatorio`);
  }
  return valor.trim();
}

// Recortado y en minúscula: así lo exige CK_Usuario_CorreoMinuscula y así se busca en el login.
function normalizarCorreo(valor) {
  return textoRequerido(valor, 'correo').toLowerCase();
}

function validarRegistro({ nombre, correo, password, telefono }) {
  const nombreLimpio = textoRequerido(nombre, 'nombre');
  if (nombreLimpio.length > 100) throw validacion('nombre: máximo 100 caracteres');

  const correoLimpio = normalizarCorreo(correo);
  if (correoLimpio.length > 254 || !FORMATO_CORREO.test(correoLimpio)) {
    throw validacion('correo: formato inválido');
  }

  if (typeof password !== 'string' || password.length < PASSWORD_MIN) {
    throw validacion(`password: mínimo ${PASSWORD_MIN} caracteres`);
  }
  if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) {
    throw validacion(`password: máximo ${PASSWORD_MAX_BYTES} bytes`);
  }

  let telefonoLimpio = null;
  if (telefono !== undefined && telefono !== null) {
    if (typeof telefono !== 'string') throw validacion('telefono: debe ser texto');
    telefonoLimpio = telefono.trim() || null;
    if (telefonoLimpio && telefonoLimpio.length > 20) {
      throw validacion('telefono: máximo 20 caracteres');
    }
  }

  return { nombre: nombreLimpio, correo: correoLimpio, password, telefono: telefonoLimpio };
}

async function registrar(datos) {
  const { nombre, correo, password, telefono } = validarRegistro(datos);
  const passwordHash = await bcrypt.hash(password, COSTO_HASH);
  const pool = await obtenerPool();
  // El registro público solo crea clientes, aunque el cuerpo traiga otro rol.
  return usuariosService.crear(pool, { nombre, correo, telefono, passwordHash, rol: ROLES.CLIENTE });
}

async function iniciarSesion({ correo, password }) {
  const correoLimpio = normalizarCorreo(correo);
  if (typeof password !== 'string' || !password) throw validacion('password: es obligatorio');

  const pool = await obtenerPool();
  const usuario = await usuariosService.obtenerPorCorreo(pool, correoLimpio);

  // Se compara siempre, y antes de mirar Activo, para que los tres casos de fallo tarden lo mismo.
  const coincide = await bcrypt.compare(password, usuario ? usuario.passwordHash : HASH_FICTICIO);
  if (!usuario || !coincide || !usuario.activo) throw noAutenticado(MENSAJE_CREDENCIALES);

  const token = jwt.sign({ sub: usuario.id, rol: usuario.rol }, env.jwt.secreto, {
    expiresIn: env.jwt.expira,
  });
  return {
    token,
    usuario: { id: usuario.id, nombre: usuario.nombre, correo: usuario.correo, rol: usuario.rol },
  };
}

// El rol sale de la base y no del token: un cambio de rol o una baja rigen en el acto.
async function usuarioDelToken(token) {
  let payload;
  try {
    payload = jwt.verify(token, env.jwt.secreto, { algorithms: ['HS256'] });
  } catch {
    throw noAutenticado('Token inválido o expirado');
  }
  if (!Number.isInteger(payload.sub)) throw noAutenticado('Token inválido o expirado');

  const pool = await obtenerPool();
  const usuario = await usuariosService.obtenerPorId(pool, payload.sub);
  if (!usuario || !usuario.activo) throw noAutenticado('Usuario inexistente o inactivo');

  return { id: usuario.id, rol: usuario.rol, nombre: usuario.nombre };
}

async function obtenerPerfil(id) {
  const pool = await obtenerPool();
  const usuario = await usuariosService.obtenerPorId(pool, id);
  if (!usuario) throw noAutenticado('Usuario inexistente o inactivo');
  return {
    id: usuario.id,
    nombre: usuario.nombre,
    correo: usuario.correo,
    telefono: usuario.telefono,
    rol: usuario.rol,
  };
}

module.exports = { registrar, iniciarSesion, usuarioDelToken, obtenerPerfil };
