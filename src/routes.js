const { Router } = require('express');

const router = Router();

router.use('/health', require('./modules/salud/salud.routes'));
router.use('/auth', require('./modules/auth/auth.routes'));
router.use('/auditoria', require('./modules/auditoria/auditoria.routes'));
router.use('/notificaciones', require('./modules/notificaciones/notificaciones.routes'));
router.use('/canchas', require('./modules/canchas/canchas.routes'));
router.use('/tipos-cancha', require('./modules/canchas/tiposCancha.routes'));
router.use('/usuarios', require('./modules/usuarios/usuarios.routes'));
    
module.exports = router;
