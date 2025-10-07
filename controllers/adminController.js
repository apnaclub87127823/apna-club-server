const Transaction = require('../models/Transaction');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Room = require('../models/Room');
const RoomDispute = require('../models/RoomDispute');
// .05
// Get all withdrawal requests
const getAllWithdrawals = async (req, res) => {
    try {
        const { status, page = 1, limit = 10 } = req.query;

        const query = { type: 'withdraw' };
        if (status && ['pending', 'success', 'cancelled'].includes(status)) {
            query.status = status;
        }

        const withdrawals = await Transaction.find(query)
            .populate('userId', 'fullName username mobileNumber')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const total = await Transaction.countDocuments(query);

        res.status(200).json({
            success: true,
            data: {
                withdrawals: withdrawals.map(withdrawal => ({
                    transactionId: withdrawal._id,
                    user: {
                        id: withdrawal.userId._id,
                        fullName: withdrawal.userId.fullName,
                        username: withdrawal.userId.username,
                        mobileNumber: withdrawal.userId.mobileNumber
                    },
                    amount: withdrawal.amount,
                    status: withdrawal.status,
                    withdrawMethod: withdrawal.withdrawMethod,
                    upiId: withdrawal.upiId,
                    bankAccountNumber: withdrawal.bankAccountNumber,
                    description: withdrawal.description,
                    createdAt: withdrawal.createdAt,
                    updatedAt: withdrawal.updatedAt
                })),
                totalPages: Math.ceil(total / limit),
                currentPage: parseInt(page),
                totalWithdrawals: total
            }
        });

    } catch (error) {
        console.error('Get all withdrawals error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// Update withdrawal status
const updateWithdrawalStatus = async (req, res) => {
    try {
        const { transactionId } = req.params;
        const { status } = req.body;

        if (!status || !['pending', 'success', 'cancelled'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status. Must be pending, success, or cancelled'
            });
        }

        const transaction = await Transaction.findById(transactionId).populate('userId');
        if (!transaction) {
            return res.status(404).json({
                success: false,
                message: 'Transaction not found'
            });
        }

        if (transaction.type !== 'withdraw') {
            return res.status(400).json({
                success: false,
                message: 'This is not a withdrawal transaction'
            });
        }

        const oldStatus = transaction.status;

        // If changing from pending to cancelled, refund the money
        if (oldStatus === 'pending' && status === 'cancelled') {
            const wallet = await Wallet.findOne({ userId: transaction.userId._id });
            if (wallet) {
                wallet.winningBalance += transaction.amount;
                wallet.totalBalance += transaction.amount;
                await wallet.save();
            }
        }

        // If changing from cancelled back to pending, deduct the money again
        if (oldStatus === 'cancelled' && status === 'pending') {
            const wallet = await Wallet.findOne({ userId: transaction.userId._id });
            if (wallet) {
                if (wallet.winningBalance < transaction.amount) {
                    return res.status(400).json({
                        success: false,
                        message: 'User has insufficient winning balance to reprocess withdrawal'
                    });
                }
                wallet.winningBalance -= transaction.amount;
                wallet.totalBalance -= transaction.amount;
                await wallet.save();
            }
        }

        // Update transaction status
        transaction.status = status;
        await transaction.save();

        res.status(200).json({
            success: true,
            message: `Withdrawal status updated to ${status}`,
            data: {
                transactionId: transaction._id,
                oldStatus,
                newStatus: status,
                amount: transaction.amount,
                user: {
                    fullName: transaction.userId.fullName,
                    mobileNumber: transaction.userId.mobileNumber
                }
            }
        });

    } catch (error) {
        console.error('Update withdrawal status error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// Get withdrawal details by ID
const getWithdrawalById = async (req, res) => {
    try {
        const { transactionId } = req.params;

        const withdrawal = await Transaction.findById(transactionId)
            .populate('userId', 'fullName username mobileNumber');

        if (!withdrawal) {
            return res.status(404).json({
                success: false,
                message: 'Transaction not found'
            });
        }

        if (withdrawal.type !== 'withdraw') {
            return res.status(400).json({
                success: false,
                message: 'This is not a withdrawal transaction'
            });
        }

        res.status(200).json({
            success: true,
            data: {
                transactionId: withdrawal._id,
                user: {
                    id: withdrawal.userId._id,
                    fullName: withdrawal.userId.fullName,
                    username: withdrawal.userId.username,
                    mobileNumber: withdrawal.userId.mobileNumber
                },
                amount: withdrawal.amount,
                status: withdrawal.status,
                withdrawMethod: withdrawal.withdrawMethod,
                upiId: withdrawal.upiId,
                bankAccountNumber: withdrawal.bankAccountNumber,
                description: withdrawal.description,
                createdAt: withdrawal.createdAt,
                updatedAt: withdrawal.updatedAt
            }
        });

    } catch (error) {
        console.error('Get withdrawal by ID error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// Get admin dashboard stats
const getDashboardStats = async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const totalPendingWithdrawals = await Transaction.countDocuments({
            type: 'withdraw',
            status: 'pending'
        });
        const totalSuccessWithdrawals = await Transaction.countDocuments({
            type: 'withdraw',
            status: 'success'
        });
        const totalCancelledWithdrawals = await Transaction.countDocuments({
            type: 'withdraw',
            status: 'cancelled'
        });

        // Calculate total pending withdrawal amount
        const pendingWithdrawals = await Transaction.find({
            type: 'withdraw',
            status: 'pending'
        });
        const totalPendingAmount = pendingWithdrawals.reduce((sum, transaction) => sum + transaction.amount, 0);

        res.status(200).json({
            success: true,
            data: {
                totalUsers,
                withdrawals: {
                    pending: {
                        count: totalPendingWithdrawals,
                        amount: totalPendingAmount
                    },
                    success: totalSuccessWithdrawals,
                    cancelled: totalCancelledWithdrawals
                }
            }
        });

    } catch (error) {
        console.error('Get dashboard stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// Get all rooms
const getAllRooms = async (req, res) => {
    try {
        const { status, page = 1, limit = 10 } = req.query;

        const query = {};
        if (status && ['pending', 'live', 'ended', 'finished'].includes(status)) {
            query.status = status;
        }

        const rooms = await Room.find(query)
            .populate('createdBy', 'fullName username mobileNumber')
            .populate('players.userId', 'fullName username mobileNumber')
            .populate('winner.userId', 'fullName username mobileNumber')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const total = await Room.countDocuments(query);

        res.status(200).json({
            success: true,
            data: {
                rooms: rooms.map(room => ({
                    roomId: room.roomId,
                    betAmount: room.betAmount,
                    status: room.status,
                    playersCount: room.players.length,
                    createdBy: {
                        id: room.createdBy._id,
                        fullName: room.createdBy.fullName,
                        username: room.createdBy.username,
                        mobileNumber: room.createdBy.mobileNumber
                    },
                    players: room.players.map(p => ({
                        id: p.userId._id,
                        fullName: p.userId.fullName,
                        username: p.userId.username,
                        mobileNumber: p.userId.mobileNumber,
                        ludoUsername: p.ludoUsername,
                        joinedAt: p.joinedAt
                    })),
                    ludoRoomCode: room.ludoRoomCode,
                    gameStartedAt: room.gameStartedAt,
                    gameEndedAt: room.gameEndedAt,
                    winner: room.winner ? {
                        id: room.winner.userId._id,
                        fullName: room.winner.userId.fullName,
                        ludoUsername: room.winner.ludoUsername,
                        amountWon: room.winner.amountWon,
                        netAmount: room.winner.netAmount
                    } : null,
                    totalPrizePool: room.totalPrizePool,
                    serviceCharge: room.serviceCharge,
                    createdAt: room.createdAt
                })),
                totalPages: Math.ceil(total / limit),
                currentPage: parseInt(page),
                totalRooms: total
            }
        });

    } catch (error) {
        console.error('Get all rooms error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// Provide Ludo room code
const provideRoomCode = async (req, res) => {
    try {
        const { roomId, ludoRoomCode } = req.body;

        if (!roomId || !ludoRoomCode) {
            return res.status(400).json({
                success: false,
                message: 'Room ID and Ludo room code are required'
            });
        }

        const room = await Room.findOne({ roomId });
        if (!room) {
            return res.status(404).json({
                success: false,
                message: 'Room not found'
            });
        }

        if (room.status !== 'live') {
            return res.status(400).json({
                success: false,
                message: 'Room is not live. Cannot provide room code.'
            });
        }

        if (room.ludoRoomCode) {
            return res.status(400).json({
                success: false,
                message: 'Room code already provided for this room'
            });
        }

        // Update room with Ludo room code
        await Room.findByIdAndUpdate(room._id, {
            ludoRoomCode: ludoRoomCode
        });

        res.status(200).json({
            success: true,
            message: 'Ludo room code provided successfully',
            data: {
                roomId: room.roomId,
                ludoRoomCode: ludoRoomCode
            }
        });

    } catch (error) {
        console.error('Provide room code error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// Declare game winner
// const declareWinner = async (req, res) => {
//     try {
//         const { roomId, winnerUserId } = req.body;

//         if (!roomId || !winnerUserId) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'Room ID and winner user ID are required'
//             });
//         }

//         const room = await Room.findOne({ roomId }).populate('players.userId');
//         if (!room) {
//             return res.status(404).json({
//                 success: false,
//                 message: 'Room not found'
//             });
//         }

//         if (room.status !== 'live') {
//             return res.status(400).json({
//                 success: false,
//                 message: 'Room is not live. Cannot declare winner.'
//             });
//         }

//         if (room.winner) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'Winner already declared for this room'
//             });
//         }

//         // Find winner in room players
//         const winnerPlayer = room.players.find(player =>
//             player.userId._id.toString() === winnerUserId
//         );

//         if (!winnerPlayer) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'Winner must be one of the room players'
//             });
//         }

//         // Calculate service charge (5%)
//         const serviceCharge = Math.floor(room.totalPrizePool * 0.05); // Changed from 0.03 to 0.05
//         const netWinning = room.totalPrizePool - serviceCharge;

//         // Update room with winner
//         await Room.findByIdAndUpdate(room._id, {
//             winner: {
//                 userId: winnerPlayer.userId._id,
//                 ludoUsername: winnerPlayer.ludoUsername,
//                 amountWon: room.totalPrizePool,
//                 netAmount: netWinning
//             },
//             status: 'finished',
//             gameEndedAt: new Date(),
//             serviceCharge: serviceCharge,
//             resultCheckedAt: new Date()
//         });

//         // Add winning amount to winner's wallet
//         const winnerWallet = await Wallet.findOne({ userId: winnerPlayer.userId._id });
//         if (winnerWallet) {
//             winnerWallet.winningBalance += netWinning;
//             winnerWallet.totalBalance += netWinning;
//             await winnerWallet.save();

//             // Create winning transaction
//             const winningTransaction = new Transaction({
//                 userId: winnerPlayer.userId._id,
//                 type: 'winning',
//                 amount: netWinning,
//                 status: 'success',
//                 description: `Won room ${roomId} - ₹${netWinning} (after 5% service charge)`,
//                 walletType: 'winning'
//             });
//             await winningTransaction.save();
//         }

//         res.status(200).json({
//             success: true,
//             message: 'Winner declared successfully and money added to wallet',
//             data: {
//                 roomId: room.roomId,
//                 winner: {
//                     userId: winnerPlayer.userId._id,
//                     fullName: winnerPlayer.userId.fullName,
//                     ludoUsername: winnerPlayer.ludoUsername,
//                     amountWon: room.totalPrizePool,
//                     netAmount: netWinning
//                 },
//                 serviceCharge: serviceCharge,
//                 status: 'finished'
//             }
//         });

//     } catch (error) {
//         console.error('Declare winner error:', error);
//         res.status(500).json({
//             success: false,
//             message: 'Internal server error'
//         });
//     }
// };

// Get all room disputes
const getAllDisputes = async (req, res) => {
    try {
        const { status, page = 1, limit = 10 } = req.query;

        // Only show disputes where both players claimed win (disputeStatus = 'disputed')
        const disputedRooms = await Room.find({ disputeStatus: 'disputed' }).select('roomId');
        const disputedRoomIds = disputedRooms.map(room => room.roomId);

        if (disputedRoomIds.length === 0) {
            return res.status(200).json({
                success: true,
                data: {
                    disputes: [],
                    totalPages: 0,
                    currentPage: parseInt(page),
                    totalDisputes: 0
                }
            });
        }

        const query = {
            roomId: { $in: disputedRoomIds },
            claimType: 'win' // Only show win claims in disputes
        };

        if (status && ['pending', 'verified', 'rejected'].includes(status)) {
            query.status = status;
        } else {
            // Default to pending disputes only
            query.status = 'pending';
        }

        const disputes = await RoomDispute.find(query)
            .populate('claimedBy', 'fullName username mobileNumber')
            .populate('verifiedBy', 'fullName username')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const total = await RoomDispute.countDocuments(query);

        res.status(200).json({
            success: true,
            data: {
                disputes: disputes.map(dispute => ({
                    disputeId: dispute._id,
                    roomId: dispute.roomId,
                    claimedBy: {
                        id: dispute.claimedBy._id,
                        fullName: dispute.claimedBy.fullName,
                        username: dispute.claimedBy.username,
                        mobileNumber: dispute.claimedBy.mobileNumber
                    },
                    ludoUsername: dispute.ludoUsername,
                    claimType: dispute.claimType,
                    status: dispute.status,
                    adminNotes: dispute.adminNotes,
                    verifiedBy: dispute.verifiedBy ? {
                        fullName: dispute.verifiedBy.fullName,
                        username: dispute.verifiedBy.username
                    } : null,
                    createdAt: dispute.createdAt,
                    verifiedAt: dispute.verifiedAt
                })),
                totalPages: Math.ceil(total / limit),
                currentPage: parseInt(page),
                totalDisputes: total
            }
        });

    } catch (error) {
        console.error('Get all disputes error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// Get dispute screenshot
const getDisputeScreenshot = async (req, res) => {
    try {
        const { disputeId } = req.params;

        const dispute = await RoomDispute.findById(disputeId);
        if (!dispute) {
            return res.status(404).json({
                success: false,
                message: 'Dispute not found'
            });
        }

        if (!dispute.screenshot || !dispute.screenshot.data) {
            return res.status(404).json({
                success: false,
                message: 'Screenshot not found'
            });
        }

        res.set('Content-Type', dispute.screenshot.contentType);
        res.send(dispute.screenshot.data);

    } catch (error) {
        console.error('Get dispute screenshot error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// Resolve room dispute
// const resolveDispute = async (req, res) => {
//     try {
//         const { roomId, winnerUserId, adminNotes } = req.body;

//         if (!roomId || !winnerUserId) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'Room ID and winner user ID are required'
//             });
//         }

//         const room = await Room.findOne({ roomId }).populate('players.userId');
//         if (!room) {
//             return res.status(404).json({
//                 success: false,
//                 message: 'Room not found'
//             });
//         }

//         if (room.disputeStatus !== 'disputed') {
//             return res.status(400).json({
//                 success: false,
//                 message: 'This room is not in dispute status'
//             });
//         }

//         // Find winner in room players
//         const winnerPlayer = room.players.find(player =>
//             player.userId._id.toString() === winnerUserId
//         );

//         if (!winnerPlayer) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'Winner must be one of the room players'
//             });
//         }

//         // Get all win claims for this room
//         const disputes = await RoomDispute.find({
//             roomId: roomId,
//             claimType: 'win'
//         });

//         // Find winner's dispute
//         const winnerDispute = disputes.find(dispute =>
//             dispute.claimedBy.toString() === winnerUserId
//         );

//         if (!winnerDispute) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'Selected winner must have claimed win for this room'
//             });
//         }

//         // Calculate service charge (5%)
//         const serviceCharge = Math.floor(room.totalPrizePool * 0.05); // Changed from 0.03 to 0.05
//         const netWinning = room.totalPrizePool - serviceCharge;

//         // Add winning amount to winner's wallet
//         const winnerWallet = await Wallet.findOne({ userId: winnerUserId });
//         if (winnerWallet) {
//             winnerWallet.winningBalance += netWinning;
//             winnerWallet.totalBalance += netWinning;
//             await winnerWallet.save();

//             // Create winning transaction
//             const winningTransaction = new Transaction({
//                 userId: winnerUserId,
//                 type: 'winning',
//                 amount: netWinning,
//                 status: 'success',
//                 description: `Won room ${roomId} (admin verified) - ₹${netWinning}`,
//                 walletType: 'winning'
//             });
//             await winningTransaction.save();
//         }

//         // Update room with final winner
//         await Room.findOneAndUpdate({ roomId: roomId }, {
//             winner: {
//                 userId: winnerUserId,
//                 ludoUsername: winnerPlayer.ludoUsername,
//                 amountWon: room.totalPrizePool,
//                 netAmount: netWinning
//             },
//             status: 'finished',
//             disputeStatus: 'resolved',
//             gameEndedAt: new Date(),
//             serviceCharge: serviceCharge,
//             resultCheckedAt: new Date()
//         });

//         // Update all win claims for this room
//         for (const dispute of disputes) {
//             if (dispute.claimedBy.toString() === winnerUserId) {
//                 // Mark winner's dispute as verified
//                 dispute.status = 'verified';
//                 dispute.verifiedBy = req.user.id;
//                 dispute.verifiedAt = new Date();
//                 dispute.adminNotes = adminNotes || 'Verified as winner';
//             } else {
//                 // Mark other disputes as rejected
//                 dispute.status = 'rejected';
//                 dispute.verifiedBy = req.user.id;
//                 dispute.verifiedAt = new Date();
//                 dispute.adminNotes = adminNotes || 'Not the winner';
//             }
//             await dispute.save();
//         }

//         res.status(200).json({
//             success: true,
//             message: 'Dispute resolved successfully and money added to winner wallet',
//             data: {
//                 roomId: roomId,
//                 winner: {
//                     userId: winnerUserId,
//                     fullName: winnerPlayer.userId.fullName,
//                     ludoUsername: winnerPlayer.ludoUsername,
//                     amountWon: room.totalPrizePool,
//                     netAmount: netWinning
//                 },
//                 serviceCharge: serviceCharge,
//                 status: 'finished'
//             }
//         });

//     } catch (error) {
//         console.error('Resolve dispute error:', error);
//         res.status(500).json({
//             success: false,
//             message: 'Internal server error'
//         });
//     }
// };

// Admin adds funds to user's deposit wallet
const addDepositFundsToUser = async (req, res) => {
    try {
        const { userId, amount } = req.body;

        if (!userId || !amount || amount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'User ID and a positive amount are required'
            });
        }

        // Find the user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Find the user's wallet
        const wallet = await Wallet.findOne({ userId });
        if (!wallet) {
            return res.status(404).json({
                success: false,
                message: 'Wallet not found for this user'
            });
        }

        // Update wallet balances
        wallet.depositBalance += amount;
        wallet.totalBalance += amount;
        await wallet.save();

        // Create a transaction record for the manual deposit
        const transaction = new Transaction({
            userId: userId,
            type: 'deposit',
            amount: amount,
            status: 'success',
            description: `Admin manual deposit of ₹${amount}`,
            walletType: 'deposit'
        });
        await transaction.save();

        res.status(200).json({
            success: true,
            message: `₹${amount} successfully added to ${user.fullName}'s deposit wallet.`,
            data: {
                userId: user._id,
                newDepositBalance: wallet.depositBalance,
                newTotalBalance: wallet.totalBalance
            }
        });
    } catch (error) {
        console.error('Admin add deposit funds error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// Get all users with selected fields
const getAllUsers = async (req, res) => {
    try {
        const users = await User.find({})
            .select('fullName username mobileNumber') // Select only these fields
            .sort({ createdAt: -1 }); // Optional: sort by creation date

        res.status(200).json({
            success: true,
            data: users
        });

    } catch (error) {
        console.error('Get all users error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};






// Declare game winner
const declareWinner = async (req, res) => {
    try {
        const { roomId, winnerUserId } = req.body;

        if (!roomId || !winnerUserId) {
            return res.status(400).json({
                success: false,
                message: 'Room ID and winner user ID are required'
            });
        }

        const room = await Room.findOne({ roomId }).populate('players.userId');
        if (!room) {
            return res.status(404).json({
                success: false,
                message: 'Room not found'
            });
        }

        if (room.status !== 'live') {
            return res.status(400).json({
                success: false,
                message: 'Room is not live. Cannot declare winner.'
            });
        }

        if (room.winner) {
            return res.status(400).json({
                success: false,
                message: 'Winner already declared for this room'
            });
        }

        // Find winner in room players
        const winnerPlayer = room.players.find(player =>
            player.userId._id.toString() === winnerUserId
        );

        if (!winnerPlayer) {
            return res.status(400).json({
                success: false,
                message: 'Winner must be one of the room players'
            });
        }

        const totalPrizePool = room.totalPrizePool;
        const netWinningForWinner = Math.floor(totalPrizePool * 0.95); // Winner always gets 95%

        let adminServiceCharge = 0;
        let referralBonusAmount = 0;
        let referrerUser = null;

        // Check if the winner was referred
        if (winnerPlayer.userId.referredBy) {
            referralBonusAmount = Math.floor(totalPrizePool * 0.02); // 2% for referrer
            adminServiceCharge = totalPrizePool - netWinningForWinner - referralBonusAmount; // Remaining of the 5% for admin
            referrerUser = await User.findOne({ referCode: winnerPlayer.userId.referredBy });
        } else {
            adminServiceCharge = totalPrizePool - netWinningForWinner; // All 5% for admin
        }

        // Update room with winner
        await Room.findByIdAndUpdate(room._id, {
            winner: {
                userId: winnerPlayer.userId._id,
                ludoUsername: winnerPlayer.ludoUsername,
                amountWon: totalPrizePool, // Gross amount
                netAmount: netWinningForWinner
            },
            status: 'finished',
            gameEndedAt: new Date(),
            serviceCharge: adminServiceCharge,
            resultCheckedAt: new Date()
        });

        // Add winning amount to winner's wallet
        const winnerWallet = await Wallet.findOne({ userId: winnerPlayer.userId._id });
        if (winnerWallet) {
            winnerWallet.winningBalance += netWinningForWinner;
            winnerWallet.totalBalance += netWinningForWinner;
            await winnerWallet.save();

            // Create winning transaction
            const winningTransaction = new Transaction({
                userId: winnerPlayer.userId._id,
                type: 'winning',
                amount: netWinningForWinner,
                status: 'success',
                description: `Won room ${roomId} - ₹${netWinningForWinner} (after service charge)`,
                walletType: 'winning'
            });
            await winningTransaction.save();
        }

        // Distribute referral bonus if applicable
        if (referrerUser) {
            const referrerWallet = await Wallet.findOne({ userId: referrerUser._id });
            if (referrerWallet) {
                referrerWallet.winningBalance += referralBonusAmount;
                referrerWallet.totalBalance += referralBonusAmount;
                await referrerWallet.save();

                const referralTransaction = new Transaction({
                    userId: referrerUser._id,
                    type: 'referral',
                    amount: referralBonusAmount,
                    status: 'success',
                    description: `Referral bonus for ${winnerPlayer.userId.fullName} winning room ${roomId}`,
                    walletType: 'winning'
                });
                await referralTransaction.save();
            }
        }

        res.status(200).json({
            success: true,
            message: 'Winner declared successfully and money added to wallet',
            data: {
                roomId: room.roomId,
                winner: {
                    userId: winnerPlayer.userId._id,
                    fullName: winnerPlayer.userId.fullName,
                    ludoUsername: winnerPlayer.ludoUsername,
                    amountWon: totalPrizePool,
                    netAmount: netWinningForWinner
                },
                serviceCharge: adminServiceCharge,
                status: 'finished'
            }
        });

    } catch (error) {
        console.error('Declare winner error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// Resolve room dispute
const resolveDispute = async (req, res) => {
    try {
        const { roomId, winnerUserId, adminNotes } = req.body;

        if (!roomId || !winnerUserId) {
            return res.status(400).json({
                success: false,
                message: 'Room ID and winner user ID are required'
            });
        }

        const room = await Room.findOne({ roomId }).populate('players.userId');
        if (!room) {
            return res.status(404).json({
                success: false,
                message: 'Room not found'
            });
        }

        if (room.disputeStatus !== 'disputed') {
            return res.status(400).json({
                success: false,
                message: 'This room is not in dispute status'
            });
        }

        // Find winner in room players
        const winnerPlayer = room.players.find(player =>
            player.userId._id.toString() === winnerUserId
        );

        if (!winnerPlayer) {
            return res.status(400).json({
                success: false,
                message: 'Winner must be one of the room players'
            });
        }

        // Get all win claims for this room
        const disputes = await RoomDispute.find({
            roomId: roomId,
            claimType: 'win'
        });

        // Find winner's dispute
        const winnerDispute = disputes.find(dispute =>
            dispute.claimedBy.toString() === winnerUserId
        );

        if (!winnerDispute) {
            return res.status(400).json({
                success: false,
                message: 'Selected winner must have claimed win for this room'
            });
        }

        const totalPrizePool = room.totalPrizePool;
        const netWinningForWinner = Math.floor(totalPrizePool * 0.95); // Winner always gets 95%

        let adminServiceCharge = 0;
        let referralBonusAmount = 0;
        let referrerUser = null;

        // Check if the winner was referred
        if (winnerPlayer.userId.referredBy) {
            referralBonusAmount = Math.floor(totalPrizePool * 0.02); // 2% for referrer
            adminServiceCharge = totalPrizePool - netWinningForWinner - referralBonusAmount; // Remaining of the 5% for admin
            referrerUser = await User.findOne({ referCode: winnerPlayer.userId.referredBy });
        } else {
            adminServiceCharge = totalPrizePool - netWinningForWinner; // All 5% for admin
        }

        // Add winning amount to winner's wallet
        const winnerWallet = await Wallet.findOne({ userId: winnerUserId });
        if (winnerWallet) {
            winnerWallet.winningBalance += netWinningForWinner;
            winnerWallet.totalBalance += netWinningForWinner;
            await winnerWallet.save();

            // Create winning transaction
            const winningTransaction = new Transaction({
                userId: winnerUserId,
                type: 'winning',
                amount: netWinningForWinner,
                status: 'success',
                description: `Won room ${roomId} (admin verified) - ₹${netWinningForWinner}`,
                walletType: 'winning'
            });
            await winningTransaction.save();
        }

        // Distribute referral bonus if applicable
        if (referrerUser) {
            const referrerWallet = await Wallet.findOne({ userId: referrerUser._id });
            if (referrerWallet) {
                referrerWallet.winningBalance += referralBonusAmount;
                referrerWallet.totalBalance += referralBonusAmount;
                await referrerWallet.save();

                const referralTransaction = new Transaction({
                    userId: referrerUser._id,
                    type: 'referral',
                    amount: referralBonusAmount,
                    status: 'success',
                    description: `Referral bonus for ${winnerPlayer.userId.fullName} winning room ${roomId}`,
                    walletType: 'winning'
                });
                await referralTransaction.save();
            }
        }

        // Update room with final winner
        await Room.findOneAndUpdate({ roomId: roomId }, {
            winner: {
                userId: winnerUserId,
                ludoUsername: winnerPlayer.ludoUsername,
                amountWon: totalPrizePool, // Gross amount
                netAmount: netWinningForWinner
            },
            status: 'finished',
            disputeStatus: 'resolved',
            gameEndedAt: new Date(),
            serviceCharge: adminServiceCharge,
            resultCheckedAt: new Date()
        });

        // Update all win claims for this room
        for (const dispute of disputes) {
            if (dispute.claimedBy.toString() === winnerUserId) {
                // Mark winner's dispute as verified
                dispute.status = 'verified';
                dispute.verifiedBy = req.user.id;
                dispute.verifiedAt = new Date();
                dispute.adminNotes = adminNotes || 'Verified as winner';
            } else {
                // Mark other disputes as rejected
                dispute.status = 'rejected';
                dispute.verifiedBy = req.user.id;
                dispute.verifiedAt = new Date();
                dispute.adminNotes = adminNotes || 'Not the winner';
            }
            await dispute.save();
        }

        res.status(200).json({
            success: true,
            message: 'Dispute resolved successfully and money added to winner wallet',
            data: {
                roomId: roomId,
                winner: {
                    userId: winnerUserId,
                    fullName: winnerPlayer.userId.fullName,
                    ludoUsername: winnerPlayer.ludoUsername,
                    amountWon: totalPrizePool,
                    netAmount: netWinningForWinner
                },
                serviceCharge: adminServiceCharge,
                status: 'finished'
            }
        });

    } catch (error) {
        console.error('Resolve dispute error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};


module.exports = {
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
    getAllUsers // Export the new function
};
