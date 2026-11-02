const { Router } = require('express');
const autenticar = require('../../middlewares/autenticar');
const disponibilidadController = require('./disponibilidad.controller');

const router = Router();

router.get('/', autenticar, disponibilidadController.consultar);

module.exports = router;
