const reservasService = require('./reservas.service');

async function crear(req, res) {
  res.status(201).json({ data: await reservasService.crear(req.usuario.id, req.body) });
}

module.exports = { crear };
