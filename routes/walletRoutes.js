const express = require('express');
const {
  getWallet,
  deposit,
  withdraw,
  getTransactionHistory,
  checkZapupiStatus
} = require('../controllers/walletController');
const auth = require('../middleware/auth');

const router = express.Router();

// GET /api/wallet - Get wallet balance
router.get('/', auth, getWallet);

// POST /api/wallet/deposit - Deposit money
router.post('/deposit', auth, deposit);

// POST /api/wallet/withdraw - Withdraw money
router.post('/withdraw', auth, withdraw);

// GET /api/wallet/history - Get transaction history
router.get('/history', auth, getTransactionHistory);


// POST /api/wallet/check-zapupi-status - Check Zapupi payment status
router.post('/check-zapupi-status', auth, checkZapupiStatus);

module.exports = router;