const { Router } = require('express');

const router = Router();

router.use('/health', require('./modules/salud/salud.routes'));
router.use('/auth', require('./modules/auth/auth.routes'));
router.use('/auditoria', require('./modules/auditoria/auditoria.routes'));
router.use('/notificaciones', require('./modules/notificaciones/notificaciones.routes'));

module.exports = router;
