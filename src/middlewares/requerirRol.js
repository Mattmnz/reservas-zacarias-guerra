const AppError = require('../shared/AppError');

// Variádico: requerirRol('ADMIN') o requerirRol('CLIENTE', 'ADMIN'). Va siempre después de autenticar.
function requerirRol(...roles) {
  return function verificarRol(req, res, next) {
    if (!req.usuario) {
      return next(new AppError(401, 'NO_AUTENTICADO', 'Token requerido'));
    }
    if (!roles.includes(req.usuario.rol)) {
      return next(new AppError(403, 'SIN_PERMISO', 'Sin permiso para esta acción'));
    }
    next();
  };
}

module.exports = requerirRol;
