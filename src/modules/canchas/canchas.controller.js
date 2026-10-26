const canchasService = require('./canchas.service');

async function listar(req, res) {
  res.json({ data: await canchasService.listar(req.usuario.rol, req.query) });
}

async function obtener(req, res) {
  res.json({ data: await canchasService.obtener(req.usuario.rol, req.params.id) });
}

async function crear(req, res) {
  res.status(201).json({ data: await canchasService.crear(req.usuario.id, req.body) });
}

async function editar(req, res) {
  res.json({ data: await canchasService.editar(req.usuario.id, req.params.id, req.body) });
}

async function darDeAlta(req, res) {
  res.json({ data: await canchasService.darDeAlta(req.usuario.id, req.params.id, req.body) });
}

async function listarTipos(req, res) {
  res.json({ data: await canchasService.listarTipos() });
}

async function cambiarPrecio(req, res) {
  res.json({ data: await canchasService.cambiarPrecio(req.params.id, req.body) });
}

module.exports = { listar, obtener, crear, editar, darDeAlta, listarTipos, cambiarPrecio };
