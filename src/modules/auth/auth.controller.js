const authService = require('./auth.service');

// Sin cuerpo JSON, Express 5 deja req.body en undefined.
async function registro(req, res) {
  res.status(201).json({ data: await authService.registrar(req.body ?? {}) });
}

async function login(req, res) {
  res.json({ data: await authService.iniciarSesion(req.body ?? {}) });
}

async function yo(req, res) {
  res.json({ data: await authService.obtenerPerfil(req.usuario.id) });
}

module.exports = { registro, login, yo };
