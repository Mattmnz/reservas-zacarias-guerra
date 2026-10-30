const horariosService = require('./horarios.service');

async function listar(req, res) {
  res.json({ data: await horariosService.listar(req.usuario.rol, req.params.id) });
}

async function reemplazar(req, res) {
  res.json({ data: await horariosService.reemplazar(req.usuario.id, req.params.id, req.body) });
}

module.exports = { listar, reemplazar };
