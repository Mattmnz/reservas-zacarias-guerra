const AppError = require('../../shared/AppError');
const { ahoraNicaragua } = require('../../shared/tiempo');
const usuariosRepository = require('./usuarios.repository');

// Violación de índice único (2601) o de restricción UNIQUE (2627).
const ERRORES_UNICOS = [2601, 2627];

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

module.exports = { obtenerPorId, obtenerPorCorreo, crear };
