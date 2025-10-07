
const express = require('express');
const router = express.Router();
const { zapupiWebhook } = require('../controllers/webhookController');

// Webhook route (no authentication middleware needed for external services)
router.post('/zapupi', zapupiWebhook);

module.exports = router;