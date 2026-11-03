const reservasService = require('./reservas.service');

async function crear(req, res) {
  res.status(201).json({ data: await reservasService.crear(req.usuario.id, req.body) });
}

async function confirmar(req, res) {
  res.json({ data: await reservasService.confirmar(req.params.id, req.usuario.id) });
}

async function registrarAsistencia(req, res) {
  res.json({ data: await reservasService.registrarAsistencia(req.params.id, req.usuario.id) });
}

async function cancelar(req, res) {
  res.json({ data: await reservasService.cancelar(req.params.id, req.usuario, req.body) });
}

module.exports = { crear, confirmar, registrarAsistencia, cancelar };
