const express = require('express');
const {
    getAllWithdrawals,
    updateWithdrawalStatus,
    getWithdrawalById,
    getDashboardStats,
    getAllRooms,
    provideRoomCode,
    declareWinner,
    getAllDisputes,
    getDisputeScreenshot,
    resolveDispute,
    addDepositFundsToUser,
    getAllUsers // Import the new function
} = require('../controllers/adminController');
const adminAuth = require('../middleware/adminAuth');

const router = express.Router();

// GET /api/admin/dashboard - Get admin dashboard stats
router.get('/dashboard', adminAuth, getDashboardStats);

// GET /api/admin/rooms - Get all rooms
router.get('/rooms', adminAuth, getAllRooms);

// POST /api/admin/provide-room-code - Provide Ludo room code
router.post('/provide-room-code', adminAuth, provideRoomCode);

// POST /api/admin/declare-winner - Declare game winner
router.post('/declare-winner', adminAuth, declareWinner);

// GET /api/admin/disputes - Get all room disputes
router.get('/disputes', adminAuth, getAllDisputes);

// GET /api/admin/disputes/:disputeId/screenshot - Get dispute screenshot
router.get('/disputes/:disputeId/screenshot', getDisputeScreenshot);

// POST /api/admin/resolve-dispute - Resolve room dispute
router.post('/resolve-dispute', adminAuth, resolveDispute);

// GET /api/admin/withdrawals - Get all withdrawal requests
router.get('/withdrawals', adminAuth, getAllWithdrawals);

// GET /api/admin/withdrawals/:transactionId - Get withdrawal details by ID
router.get('/withdrawals/:transactionId', adminAuth, getWithdrawalById);

// PUT /api/admin/withdrawals/:transactionId/status - Update withdrawal status
router.put('/withdrawals/:transactionId/status', adminAuth, updateWithdrawalStatus);

// POST /api/admin/add-deposit-funds - Admin adds funds to user's deposit wallet
router.post('/add-deposit-funds', adminAuth, addDepositFundsToUser);

// GET /api/admin/users - Get all users with selected fields
router.get('/users', adminAuth, getAllUsers); // New route

module.exports = router;
