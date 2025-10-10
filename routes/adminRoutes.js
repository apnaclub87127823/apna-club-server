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
    getAllUsers,
    getAllUsersWithWallet,
    updateUserBalance,
    adminCancelRoom,
    updateRoomStatus
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

// GET /api/admin/users - Get all users with wallet info
router.get('/users', adminAuth, getAllUsers);

// GET /api/admin/users-with-wallet - Get all users with wallet info (paginated)
router.get('/users-with-wallet', adminAuth, getAllUsersWithWallet);

// POST /api/admin/update-user-balance - Admin deducts or sets user balance to zero
router.post('/update-user-balance', adminAuth, updateUserBalance);

// NEW: DELETE /api/admin/rooms/:roomId - Admin cancels a room
router.delete('/rooms/:roomId', adminAuth, adminCancelRoom);

// NEW: PUT /api/admin/rooms/:roomId/status - Admin updates room status
router.put('/rooms/:roomId/status', adminAuth, updateRoomStatus);



module.exports = router;
