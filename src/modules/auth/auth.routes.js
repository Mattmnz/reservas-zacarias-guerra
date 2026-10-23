const { Router } = require('express');
const autenticar = require('../../middlewares/autenticar');
const authController = require('./auth.controller');

const router = Router();

router.post('/registro', authController.registro);
router.post('/login', authController.login);
router.get('/yo', autenticar, authController.yo);

module.exports = router;
