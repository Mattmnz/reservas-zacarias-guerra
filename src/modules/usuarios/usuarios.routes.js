const { Router } = require('express');
const autenticar = require('../../middlewares/autenticar');
const requerirRol = require('../../middlewares/requerirRol');
const { ROLES } = require('../../shared/constantes');
const usuariosController = require('./usuarios.controller');

const router = Router();

router.get('/', autenticar, requerirRol(ROLES.ADMIN), usuariosController.listar);
router.patch('/:id', autenticar, requerirRol(ROLES.ADMIN), usuariosController.actualizar);

module.exports = router;