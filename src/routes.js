const { Router } = require('express');

const router = Router();

router.use('/health', require('./modules/salud/salud.routes'));

module.exports = router;
