const { Router } = require('express');
const autenticar = require('../../middlewares/autenticar');
const notificacionesController = require('./notificaciones.controller');

const router = Router();

router.get('/', autenticar, notificacionesController.listar);
router.patch('/:id/leida', autenticar, notificacionesController.marcarLeida);

module.exports = router;
