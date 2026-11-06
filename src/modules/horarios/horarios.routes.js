const { Router } = require('express');
const autenticar = require('../../middlewares/autenticar');
const requerirRol = require('../../middlewares/requerirRol');
const { ROLES } = require('../../shared/constantes');
const horariosController = require('./horarios.controller');

// Se monta en /canchas/:id/horarios; mergeParams deja req.params.id visible en este router.
const router = Router({ mergeParams: true });

router.get('/', autenticar, horariosController.listar);
router.put('/', autenticar, requerirRol(ROLES.ADMIN), horariosController.reemplazar);

module.exports = router;
