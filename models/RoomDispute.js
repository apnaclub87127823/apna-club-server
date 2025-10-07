const mongoose = require('mongoose');

const roomDisputeSchema = new mongoose.Schema({
    roomId: {
        type: String,
        required: true,
        ref: 'Room'
    },
    claimedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    claimType: {
        type: String,
        enum: ['win', 'loss'],
        required: true
    },
    ludoUsername: {
        type: String,
        required: true
    },
    screenshot: {
        data: Buffer,
        contentType: String,
        // required: function () {
        //     return this.claimType === 'win';
        // }
    },
    status: {
        type: String,
        enum: ['pending', 'verified', 'rejected'],
        default: 'pending'
    },
    adminNotes: {
        type: String,
        default: ''
    },
    verifiedAt: {
        type: Date,
        default: null
    },
    verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('RoomDispute', roomDisputeSchema);