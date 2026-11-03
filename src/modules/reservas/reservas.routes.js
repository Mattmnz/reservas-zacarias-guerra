const { Router } = require('express');
const autenticar = require('../../middlewares/autenticar');
const requerirRol = require('../../middlewares/requerirRol');
const { ROLES } = require('../../shared/constantes');
const reservasController = require('./reservas.controller');

const router = Router();

router.post('/', autenticar, requerirRol(ROLES.CLIENTE), reservasController.crear);
router.patch('/:id/confirmar', autenticar, requerirRol(ROLES.ADMIN), reservasController.confirmar);
router.patch('/:id/asistencia', autenticar, requerirRol(ROLES.ADMIN), reservasController.registrarAsistencia);
// Cualquier rol: el service limita al cliente a sus propias reservas.
router.post('/:id/cancelar', autenticar, reservasController.cancelar);

// /mias antes de /:id: si no, "mias" se tomaría como id y daría 400.
router.get('/mias', autenticar, requerirRol(ROLES.CLIENTE), reservasController.listarMias);
router.get('/', autenticar, requerirRol(ROLES.ADMIN), reservasController.listar);
// Cualquier rol: el service limita al cliente a sus propias reservas.
router.get('/:id', autenticar, reservasController.obtener);

module.exports = router;
