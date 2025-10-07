const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['deposit', 'withdraw', 'winning', 'penalty', 'referral'],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'success', 'failed'],
    default: 'pending'
  },
  description: {
    type: String,
    required: true
  },
  walletType: {
    type: String,
    enum: ['deposit', 'winning'],
    default: 'deposit'
  },
  withdrawMethod: {
    type: String,
    enum: ['upi', 'bank'],
    required: function () {
      return this.type === 'withdraw';
    }
  },
  upiId: {
    type: String,
    required: function () {
      return this.type === 'withdraw' && this.withdrawMethod === 'upi';
    }
  },
  bankAccountNumber: {
    type: String,
    required: function () {
      return this.type === 'withdraw' && this.withdrawMethod === 'bank';
    }
  },
  // New fields for Zapupi integration
  zapupiOrderId: {
    type: String,
    default: null
  },
  zapupiTxnId: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Transaction', transactionSchema);
