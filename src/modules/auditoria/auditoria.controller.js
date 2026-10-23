const auditoriaService = require('./auditoria.service');

async function listar(req, res) {
  res.json({ data: await auditoriaService.listar(req.query) });
}

module.exports = { listar };
