const usuariosService = require('./usuarios.service');

async function listar(req, res) {
  res.json({ data: await usuariosService.listar(req.query) });
}

async function actualizar(req, res) {
  res.json({ data: await usuariosService.actualizar(req.usuario.id, req.params.id, req.body) });
}

module.exports = { listar, actualizar };