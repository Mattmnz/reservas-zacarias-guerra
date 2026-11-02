const { Router } = require('express');
const autenticar = require('../../middlewares/autenticar');
const requerirRol = require('../../middlewares/requerirRol');
const { ROLES } = require('../../shared/constantes');
const reservasController = require('./reservas.controller');

const router = Router();

router.post('/', autenticar, requerirRol(ROLES.CLIENTE), reservasController.crear);
router.patch('/:id/confirmar', autenticar, requerirRol(ROLES.ADMIN), reservasController.confirmar);
router.patch('/:id/asistencia', autenticar, requerirRol(ROLES.ADMIN), reservasController.registrarAsistencia);

module.exports = router;
