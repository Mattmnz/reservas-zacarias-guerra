const { Router } = require('express');

const router = Router();

router.use('/health', require('./modules/salud/salud.routes'));
router.use('/auth', require('./modules/auth/auth.routes'));

module.exports = router;
