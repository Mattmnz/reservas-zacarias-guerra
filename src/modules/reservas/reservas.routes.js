const { Router } = require('express');
const autenticar = require('../../middlewares/autenticar');
const requerirRol = require('../../middlewares/requerirRol');
const { ROLES } = require('../../shared/constantes');
const reservasController = require('./reservas.controller');

const router = Router();

router.post('/', autenticar, requerirRol(ROLES.CLIENTE), reservasController.crear);

module.exports = router;
