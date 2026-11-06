const { Router } = require('express');
const saludController = require('./salud.controller');

const router = Router();

router.get('/', saludController.obtener);

module.exports = router;
