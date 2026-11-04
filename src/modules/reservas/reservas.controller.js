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

async function consultarCancelacion(req, res) {
  res.json({ data: await reservasService.consultarCancelacion(req.params.id, req.usuario) });
}

async function listarMias(req, res) {
  res.json({ data: await reservasService.listarMias(req.usuario.id) });
}

async function obtener(req, res) {
  res.json({ data: await reservasService.obtener(req.params.id, req.usuario) });
}

async function listar(req, res) {
  res.json({ data: await reservasService.listar(req.query) });
}

module.exports = { crear, confirmar, registrarAsistencia, cancelar, consultarCancelacion, listarMias, obtener, listar };