const express = require('express');
const {
  signup,
  verifySignupOTP,
  login,
  verifyLoginOTP
} = require('../controllers/authController');

const router = express.Router();

// POST /api/auth/signup
router.post('/signup', signup);

// POST /api/auth/verify-signup
router.post('/verify-signup', verifySignupOTP);

// POST /api/auth/login
router.post('/login', login);

// POST /api/auth/verify-login
router.post('/verify-login', verifyLoginOTP);

module.exports = router;