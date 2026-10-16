const AppError = require('../shared/AppError');

function rutaNoEncontrada(req, res) {
  res.status(404).json({ error: { codigo: 'NO_ENCONTRADO', mensaje: 'Ruta no encontrada' } });
}

// Express reconoce el manejador de errores por sus 4 parámetros; next queda aunque no se use.
function manejarErrores(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { codigo: err.codigo, mensaje: err.message } });
  }

  // express.json() con un cuerpo mal formado: es un error del cliente, no del servidor.
  if (err.type === 'entity.parse.failed') {
    return res
      .status(400)
      .json({ error: { codigo: 'VALIDACION', mensaje: 'El cuerpo no es un JSON válido' } });
  }

  console.error(err);
  res.status(500).json({ error: { codigo: 'ERROR_INTERNO', mensaje: 'Ocurrió un error interno' } });
}

module.exports = { manejarErrores, rutaNoEncontrada };
