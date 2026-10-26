const { Router } = require('express');
const autenticar = require('../../middlewares/autenticar');
const requerirRol = require('../../middlewares/requerirRol');
const { ROLES } = require('../../shared/constantes');
const canchasController = require('./canchas.controller');

const router = Router();

router.get('/', autenticar, canchasController.listar);
router.get('/:id', autenticar, canchasController.obtener);
router.post('/', autenticar, requerirRol(ROLES.ADMIN), canchasController.crear);
router.put('/:id', autenticar, requerirRol(ROLES.ADMIN), canchasController.editar);
router.patch('/:id/alta', autenticar, requerirRol(ROLES.ADMIN), canchasController.darDeAlta);

module.exports = router;
