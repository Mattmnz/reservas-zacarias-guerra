const saludService = require('./salud.service');

// Express 5 envía los rechazos de funciones async al manejador de errores.
async function obtener(req, res) {
  res.json({ data: await saludService.verificar() });
}

module.exports = { obtener };
