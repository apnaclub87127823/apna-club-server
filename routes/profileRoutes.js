const express = require('express');
const {
  getProfile,
  getProfileById,
  updateProfile,
  deleteProfile
} = require('../controllers/profileController');
const auth = require('../middleware/auth');

const router = express.Router();

// GET /api/profile - Get current user profile
router.get('/', auth, getProfile);

// GET /api/profile/:id - Get user profile by ID
router.get('/:id', auth, getProfileById);

// PUT /api/profile - Update current user profile
router.put('/', auth, updateProfile);

// DELETE /api/profile - Delete current user profile
router.delete('/', auth, deleteProfile);

module.exports = router;