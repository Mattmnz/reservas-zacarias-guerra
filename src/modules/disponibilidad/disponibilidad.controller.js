const disponibilidadService = require('./disponibilidad.service');

async function consultar(req, res) {
  res.json({ data: await disponibilidadService.consultar(req.query) });
}

module.exports = { consultar };
