const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  roomId: {
    type: String,
    unique: true,
    // required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  players: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    ludoUsername: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ['approved', 'pending', 'rejected'],
      default: 'approved' // Creator is auto-approved
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    cancelRequested: { // NEW FIELD: To track if this player has requested cancellation
      type: Boolean,
      default: false
    }
  }],
  betAmount: {
    type: Number,
    required: true,
    min: 10
  },
  status: {
    type: String,
    enum: ['pending', 'live', 'ended', 'finished', 'cancelled'],
    default: 'pending'
  },
  ludoRoomCode: {
    type: String,
    default: null
  },
  winner: {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    ludoUsername: String,
    amountWon: Number,
    netAmount: Number // After 3% service charge deduction
  },
  resultCheckedAt: {
    type: Date,
    default: null
  },
  gameStartedAt: {
    type: Date,
    default: null
  },
  gameEndedAt: {
    type: Date,
    default: null
  },
  serviceCharge: {
    type: Number,
    default: 0
  },
  totalPrizePool: {
    type: Number,
    default: 0
  },
  disputeStatus: {
    type: String,
    enum: ['none', 'single_claim', 'disputed', 'resolved'],
    default: 'none'
  },
  disputeCount: {
    type: Number,
    default: 0
  },
  tempWinnerRefunded: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Generate unique room ID
roomSchema.pre('save', async function (next) {
  if (!this.roomId) {
    let isUnique = false;
    while (!isUnique) {
      const roomId = 'ROOM' + Math.random().toString(36).substr(2, 8).toUpperCase();
      const existingRoom = await mongoose.model('Room').findOne({ roomId });
      if (!existingRoom) {
        this.roomId = roomId;
        isUnique = true;
      }
    }
  }
  next();
});

module.exports = mongoose.model('Room', roomSchema);
