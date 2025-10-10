const express = require('express');
const {
  createRoom,
  joinRoom,
  getRoomCode,
  getLudoRoomCode,
  saveLudoRoomCode,
  getUserRooms,
  getUserFinishedGames,
  getAllRooms,
  checkRoomResultManual,
  claimRoomResult,
  handleJoinRequest,
  getPendingRequests,
  cancelRoom,
  requestMutualRoomCancellation
} = require('../controllers/gameController');
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');

const router = express.Router();

// POST /api/game/create-room - Create a new room
router.post('/create-room', auth, createRoom);

// POST /api/game/join-room - Join a room
router.post('/join-room', auth, joinRoom);

// GET /api/game/room-code/:roomId - Get room code for joined room (only when live)
router.get('/room-code/:roomId', auth, getRoomCode);

// GET /api/game/ludo-room-code/:roomId - Get ludo room code for any player
router.get('/ludo-room-code/:roomId', auth, getLudoRoomCode);

// POST /api/game/save-ludo-room-code - Save or update ludo room code (creator only)
router.post('/save-ludo-room-code', auth, saveLudoRoomCode);

// GET /api/game/my-rooms - Get user's rooms (can be filtered by status)
router.get('/my-rooms', auth, getUserRooms);

// GET /api/game/finished-games - Get user's finished games
router.get('/finished-games', auth, getUserFinishedGames);

// GET /api/game/rooms - Get all rooms with optional status filter
router.get('/rooms', auth, getAllRooms);

// POST /api/game/check-result - Manually check room result
router.post('/check-result', auth, checkRoomResultManual);

// POST /api/game/claim-result - Claim room result (win with screenshot or loss without)
router.post('/claim-result', auth, upload, claimRoomResult);

// POST /api/game/handle-join-request - Approve/reject join requests (room creator only)
router.post('/handle-join-request', auth, handleJoinRequest);

// GET /api/game/pending-requests - Get pending join requests for room creator
router.get('/pending-requests', auth, getPendingRequests);

// DELETE /api/game/cancel-room/:roomId - Cancel a room (existing logic)
router.delete('/cancel-room/:roomId', auth, cancelRoom);

// POST /api/game/request-mutual-cancellation - Request mutapiual cancellation of a room (NEW ROUTE)
router.post('/request-mutual-cancellation', auth, requestMutualRoomCancellation);

module.exports = router;
