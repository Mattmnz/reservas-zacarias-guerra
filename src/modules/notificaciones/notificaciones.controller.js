const notificacionesService = require('./notificaciones.service');

async function listar(req, res) {
  res.json({ data: await notificacionesService.listarMias(req.usuario.id) });
}

async function marcarLeida(req, res) {
  await notificacionesService.marcarLeida(req.usuario.id, req.params.id);
  res.status(204).end();
}

module.exports = { listar, marcarLeida };
