const { Router } = require('express');
const autenticar = require('../../middlewares/autenticar');
const requerirRol = require('../../middlewares/requerirRol');
const auditoriaController = require('./auditoria.controller');

const router = Router();

router.get('/', autenticar, requerirRol('ADMIN'), auditoriaController.listar);

module.exports = router;
