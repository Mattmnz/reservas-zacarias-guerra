const AppError = require('../shared/AppError');
const authService = require('../modules/auth/auth.service');

// Async: Express 5 envía el rechazo (AppError 401) al manejador de errores.
async function autenticar(req, res, next) {
  const [esquema, token] = (req.get('Authorization') || '').split(' ');
  if (esquema !== 'Bearer' || !token) {
    throw new AppError(401, 'NO_AUTENTICADO', 'Token requerido');
  }
  req.usuario = await authService.usuarioDelToken(token);
  next();
}

module.exports = autenticar;
