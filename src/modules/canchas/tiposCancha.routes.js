const { Router } = require('express');
const autenticar = require('../../middlewares/autenticar');
const requerirRol = require('../../middlewares/requerirRol');
const { ROLES } = require('../../shared/constantes');
const canchasController = require('./canchas.controller');

// Router propio para que quede bajo /tipos-cancha y no intercepte el resto de /api.
const router = Router();

router.get('/', autenticar, canchasController.listarTipos);
router.put('/:id/precio', autenticar, requerirRol(ROLES.ADMIN), canchasController.cambiarPrecio);

module.exports = router;
