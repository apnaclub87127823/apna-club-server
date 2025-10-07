const Room = require('../models/Room');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const RoomDispute = require('../models/RoomDispute');
const fs = require('fs'); // Ensure fs is imported for file operations


// Create a new room
const createRoom = async (req, res) => {
  try {
    const { betAmount, ludoUsername, ludoRoomCode } = req.body;

    if (!betAmount || betAmount < 10) {
      return res.status(400).json({
        success: false,
        message: 'Bet amount must be at least ₹10'
      });
    }

    if (!ludoUsername) {
      return res.status(400).json({
        success: false,
        message: 'Ludo King username is required'
      });
    }

    // Check if user has sufficient balance
    const wallet = await Wallet.findOne({ userId: req.user.id });
    if (!wallet || wallet.totalBalance < betAmount) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient balance to create room'
      });
    }

    // Deduct bet amount from user's wallet
    wallet.depositBalance -= betAmount;
    wallet.totalBalance -= betAmount;
    await wallet.save();

    // Create transaction record
    const transaction = new Transaction({
      userId: req.user.id,
      type: 'penalty',
      amount: betAmount,
      status: 'success',
      description: `Room creation bet - ₹${betAmount}`,
      walletType: 'deposit'
    });
    await transaction.save();

    // Create room
    const room = new Room({
      createdBy: req.user.id,
      betAmount,
      ludoRoomCode,
      players: [{
        userId: req.user.id,
        ludoUsername,
        status: 'approved' // Creator is auto-approved
      }],
      totalPrizePool: betAmount
    });

    await room.save();
    await room.populate('createdBy', 'fullName username');

    // Increment games played for the user
    await User.findByIdAndUpdate(req.user.id, { $inc: { gamesPlayed: 1 } });

    res.status(201).json({
      success: true,
      message: 'Room created successfully',
      data: {
        roomId: room.roomId,
        betAmount: room.betAmount,
        ludoRoomCode: room.ludoRoomCode,
        status: room.status,
        playersCount: room.players.length,
        maxPlayers: 2,
        createdBy: room.createdBy.fullName
      }
    });

  } catch (error) {
    console.error('Create room error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Join a room
const joinRoom = async (req, res) => {
  try {
    const { roomId, ludoUsername } = req.body;

    if (!roomId || !ludoUsername) {
      return res.status(400).json({
        success: false,
        message: 'Room ID and Ludo King username are required'
      });
    }

    const room = await Room.findOne({ roomId }).populate('players.userId', 'fullName');
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Room not found'
      });
    }

    // Check if room is full
    if (room.players.length >= 2) {
      return res.status(400).json({
        success: false,
        message: 'Room is full'
      });
    }

    // Check if user already joined
    const alreadyJoined = room.players.some(player =>
      player.userId._id.toString() === req.user.id
    );
    if (alreadyJoined) {
      return res.status(400).json({
        success: false,
        message: 'You have already joined this room'
      });
    }

    // Check if user has sufficient balance
    const wallet = await Wallet.findOne({ userId: req.user.id });
    if (!wallet || wallet.totalBalance < room.betAmount) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient balance to join room'
      });
    }

    // Deduct bet amount from user's wallet
    wallet.depositBalance -= room.betAmount;
    wallet.totalBalance -= room.betAmount;
    await wallet.save();

    // Create transaction record
    const transaction = new Transaction({
      userId: req.user.id,
      type: 'penalty',
      amount: room.betAmount,
      status: 'success',
      description: `Joined room ${roomId} - ₹${room.betAmount}`,
      walletType: 'deposit'
    });
    await transaction.save();

    // Add player to room
    room.players.push({
      userId: req.user.id,
      ludoUsername,
      status: 'pending' // New players start as pending
    });

    room.totalPrizePool += room.betAmount;

    // Room stays pending until creator approves the player
    // Status will only change to 'live' when creator approves

    await room.save();

    // Increment games played for the user
    await User.findByIdAndUpdate(req.user.id, { $inc: { gamesPlayed: 1 } });

    res.status(200).json({
      success: true,
      message: 'Join request sent to room creator. Waiting for approval.',
      data: {
        roomId: room.roomId,
        status: room.status,
        playersCount: room.players.length,
        playerStatus: 'pending'
      }
    });

  } catch (error) {
    console.error('Join room error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};


// Get room code (only for joined players)
const getRoomCode = async (req, res) => {
  try {
    const { roomId } = req.params;

    const room = await Room.findOne({ roomId });
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Room not found'
      });
    }

    // Check if user is in the room
    const isPlayer = room.players.some(player =>
      player.userId.toString() === req.user.id
    );
    if (!isPlayer) {
      return res.status(403).json({
        success: false,
        message: 'You are not a player in this room'
      });
    }

    // Check if room is live
    if (room.status !== 'live') {
      return res.status(400).json({
        success: false,
        message: 'Room is not live yet or room code not provided by admin.'
      });
    }

    // Check if admin has provided room code
    if (!room.ludoRoomCode) {
      return res.status(400).json({
        success: false,
        message: 'Room code not provided by admin yet. Please wait.'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        roomId: room.roomId,
        ludoRoomCode: room.ludoRoomCode,
        betAmount: room.betAmount,
        totalPrizePool: room.totalPrizePool,
        players: room.players.map(p => ({
          ludoUsername: p.ludoUsername,
          joinedAt: p.joinedAt
        }))
      }
    });

  } catch (error) {
    console.error('Get room code error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};



// Get user's rooms
const getUserRooms = async (req, res) => {
  try {
    const { status } = req.query;

    const query = {
      'players.userId': req.user.id
    };

    if (status) {
      query.status = status;
    }

    const rooms = await Room.find(query)
      .populate('createdBy', 'fullName username')
      .populate('players.userId', 'fullName username')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: rooms.map(room => ({
        roomId: room.roomId,
        betAmount: room.betAmount,
        status: room.status,
        playersCount: room.players.length,
        createdBy: room.createdBy.fullName,
        gameStartedAt: room.gameStartedAt,
        winner: room.winner,
        totalPrizePool: room.totalPrizePool
      }))
    });

  } catch (error) {
    console.error('Get user rooms error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get all rooms with optional status filter
const getAllRooms = async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;

    const query = {};
    if (status && ['pending', 'live', 'ended', 'finished'].includes(status)) {
      query.status = status;
    }
    console.log(query)
    const rooms = await Room.find(query)
      .populate('createdBy', 'fullName username')
      .populate('players.userId', 'fullName username')
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
          maxPlayers: 2,
          createdBy: room.createdBy.fullName,
          gameStartedAt: room.gameStartedAt,
          gameEndedAt: room.gameEndedAt,
          winner: room.winner,
          totalPrizePool: room.totalPrizePool,
          players: room.players.map(p => ({
            fullName: p.userId.fullName,
            ludoUsername: p.ludoUsername,
            joinedAt: p.joinedAt
          })),
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

// Manual check room result (API endpoint)
const checkRoomResultManual = async (req, res) => {
  try {
    const { roomId } = req.body;

    if (!roomId) {
      return res.status(400).json({
        success: false,
        message: 'Room ID is required'
      });
    }

    const room = await Room.findOne({ roomId }).populate('players.userId');
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Room not found'
      });
    }

    // Check if user is in the room (only room players can check result)
    const isPlayer = room.players.some(player =>
      player.userId._id.toString() === req.user.id
    );
    if (!isPlayer) {
      return res.status(403).json({
        success: false,
        message: 'You are not a player in this room'
      });
    }

    if (room.status === 'finished') {
      return res.status(200).json({
        success: true,
        message: 'Game already finished',
        data: {
          roomId: room.roomId,
          winner: room.winner,
          status: 'finished'
        }
      });
    }

    if (room.status !== 'live') {
      return res.status(400).json({
        success: false,
        message: 'Room is not live yet.'
      });
    }

    // Check if winner has been declared by admin
    if (!room.winner) {
      return res.status(400).json({
        success: false,
        message: 'Game result not declared by admin yet. Please wait.'
      });
    }

    // Return the winner information
    return res.status(200).json({
      success: true,
      message: 'Game finished',
      data: {
        roomId: room.roomId,
        winner: room.winner,
        serviceCharge: room.serviceCharge,
        status: 'finished'
      }
    });

  } catch (error) {
    console.error('Manual check room result error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Claim room result (win with screenshot or loss without screenshot)
const claimRoomResult = async (req, res) => {
  try {
    const { roomId, ludoUsername, claimType } = req.fields;
    const screenshot = req.files ? req.files.screenshot : null;

    if (!roomId || !ludoUsername || !claimType) {
      return res.status(400).json({
        success: false,
        message: 'Room ID, Ludo username, and claim type are required'
      });
    }

    if (!['win', 'loss'].includes(claimType)) {
      return res.status(400).json({
        success: false,
        message: 'Claim type must be either "win" or "loss"'
      });
    }

    if (claimType === 'win' && !screenshot) {
      return res.status(400).json({
        success: false,
        message: 'Screenshot is required to claim win'
      });
    }

    const room = await Room.findOne({ roomId }).populate('players.userId');
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Room not found'
      });
    }

    // If room is already finished or resolved, no more claims
    if (room.status === 'finished' || room.disputeStatus === 'resolved') {
      return res.status(400).json({
        success: false,
        message: 'Game is already finished or resolved. Cannot claim result.'
      });
    }
    // If room is 'pending' (waiting for second player to join), cannot claim result yet.
    if (room.status === 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Game has not started yet. Cannot claim result.'
      });
    }

    // Check if user is in the room
    const isPlayer = room.players.some(player =>
      player.userId._id.toString() === req.user.id
    );
    if (!isPlayer) {
      return res.status(403).json({
        success: false,
        message: 'You are not a player in this room'
      });
    }

    // Check if user already claimed for this room
    const existingClaim = await RoomDispute.findOne({
      roomId: roomId,
      claimedBy: req.user.id
    });
    if (existingClaim) {
      return res.status(400).json({
        success: false,
        message: 'You have already made a claim for this room'
      });
    }

    // Create claim record
    const claimData = {
      roomId: roomId,
      claimedBy: req.user.id,
      claimType: claimType,
      ludoUsername: ludoUsername,
    };

    // Add screenshot only for win claims
    if (claimType === 'win' && screenshot) {
      const screenshotBuffer = fs.readFileSync(screenshot.path);

      claimData.screenshot = {
        data: screenshotBuffer,
        contentType: screenshot.type
      };

      // Clean up temporary file
      fs.unlinkSync(screenshot.path);
    }

    const newClaim = new RoomDispute(claimData);
    await newClaim.save();

    // Get all claims for this room (including the newly created one)
    const allClaims = await RoomDispute.find({ roomId: roomId });
    const winClaims = allClaims.filter(claim => claim.claimType === 'win');
    const lossClaims = allClaims.filter(claim => claim.claimType === 'loss');

    let message = '';

    // Scenario 1: This is the first claim for the room
    if (allClaims.length === 1) {
      if (claimType === 'loss') {
        // Current user claims loss, so the other player is the winner
        const otherPlayer = room.players.find(player =>
          player.userId._id.toString() !== req.user.id
        );

        if (otherPlayer) {
          const serviceCharge = Math.floor(room.betAmount * 2 * 0.03);
          const netWinning = (room.betAmount * 2) - serviceCharge;

          const winnerWallet = await Wallet.findOne({ userId: otherPlayer.userId._id });
          if (winnerWallet) {
            winnerWallet.winningBalance += netWinning;
            winnerWallet.totalBalance += netWinning;
            await winnerWallet.save();

            const winningTransaction = new Transaction({
              userId: otherPlayer.userId._id,
              type: 'winning',
              amount: netWinning,
              status: 'success',
              description: `Won room ${roomId} - ₹${netWinning} (opponent accepted loss)`,
              walletType: 'winning'
            });
            await winningTransaction.save();
          }

          room.winner = {
            userId: otherPlayer.userId._id,
            ludoUsername: otherPlayer.ludoUsername,
            amountWon: room.betAmount * 2,
            netAmount: netWinning
          };
          room.serviceCharge = serviceCharge;
          room.status = 'finished'; // Game is definitively finished
          room.disputeStatus = 'resolved';
          room.gameEndedAt = new Date();

          // Mark current user's claim as rejected
          await RoomDispute.updateOne(
            { _id: newClaim._id }, // The newly created claim by the current user
            { status: 'rejected', verifiedAt: new Date(), adminNotes: 'Claimed loss, opponent wins.' }
          );

          message = 'You claimed loss. Opponent automatically wins and game is finished.';
        } else {
          // This case should ideally not be reached if there are always two players in a 'live' room
          message = 'Claim submitted as loss. Waiting for opponent to claim win.';
          room.disputeStatus = 'single_claim';
          room.disputeCount = 1;
          room.status = 'ended'; // Game is ended, awaiting opponent's claim
        }
      } else { // claimType === 'win'
        // First player claims win, room status remains live to allow opponent to claim
        room.disputeStatus = 'single_claim';
        room.disputeCount = 1;
        room.status = 'live'; // Keep as live to allow opponent to claim
        message = 'Win claimed successfully. Waiting for opponent\'s response.';
      }
    }
    // Scenario 2: This is the second claim for the room
    else if (allClaims.length === 2) {
      // Sub-case A: One win, one loss (clear winner)
      if (winClaims.length === 1 && lossClaims.length === 1) {
        const winnerClaim = winClaims[0];
        const loserClaim = lossClaims[0];

        const winnerPlayer = room.players.find(player =>
          player.userId._id.toString() === winnerClaim.claimedBy.toString()
        );

        if (winnerPlayer) {
          const serviceCharge = Math.floor(room.betAmount * 2 * 0.03);
          const netWinning = (room.betAmount * 2) - serviceCharge;

          const winnerWallet = await Wallet.findOne({ userId: winnerClaim.claimedBy });
          if (winnerWallet) {
            winnerWallet.winningBalance += netWinning;
            winnerWallet.totalBalance += netWinning;
            await winnerWallet.save();

            const winningTransaction = new Transaction({
              userId: winnerClaim.claimedBy,
              type: 'winning',
              amount: netWinning,
              status: 'success',
              description: `Won room ${roomId} - ₹${netWinning} (opponent accepted loss)`,
              walletType: 'winning'
            });
            await winningTransaction.save();
          }

          room.winner = {
            userId: winnerClaim.claimedBy,
            ludoUsername: winnerPlayer.ludoUsername,
            amountWon: room.betAmount * 2,
            netAmount: netWinning
          };
          room.serviceCharge = serviceCharge;
          room.status = 'finished'; // Game is definitively finished
          room.disputeStatus = 'resolved';
          room.gameEndedAt = new Date();

          // Update claims statuses
          await RoomDispute.updateOne(
            { _id: winnerClaim._id },
            { status: 'verified', verifiedAt: new Date() }
          );
          await RoomDispute.updateOne(
            { _id: loserClaim._id },
            { status: 'rejected', verifiedAt: new Date() }
          );

          message = 'Game completed! Winner decided without dispute.';
        }
      }
      // Sub-case B: Both claimed win (dispute situation)
      else if (winClaims.length === 2) {
        room.disputeStatus = 'disputed';
        room.disputeCount = 2;
        room.status = 'ended'; // Game is ended, but contested, awaiting admin resolution
        room.winner = null; // Clear any temporary winner
        room.tempWinnerRefunded = false; // No temporary winner to refund with this new logic

        message = 'Both players claimed win. Admin will verify and decide the winner.';
      }
      // Sub-case C: Both claimed loss (no winner)
      else if (lossClaims.length === 2) {
        room.status = 'finished'; // Game is definitively finished
        room.disputeStatus = 'resolved';
        room.gameEndedAt = new Date();
        room.winner = null; // No winner if both claim loss

        // Mark both claims as rejected
        await RoomDispute.updateMany(
          { roomId: roomId },
          { status: 'rejected', verifiedAt: new Date(), adminNotes: 'Both players claimed loss.' }
        );

        message = 'Both players claimed loss. Game finished with no winner.';
      }
    }
    // Default message if none of the above specific cases are met (should not happen with 2 players)
    else {
      message = 'Claim submitted successfully. Awaiting opponent\'s response or admin review.';
    }

    await room.save();

    res.status(200).json({
      success: true,
      message: message,
      data: {
        roomId: roomId,
        disputeStatus: room.disputeStatus,
        disputeCount: room.disputeCount,
        claimType: claimType,
        roomStatus: room.status // Include current room status in response
      }
    });

  } catch (error) {
    console.error('Claim room result error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};


// Handle join requests (approve/reject)
const handleJoinRequest = async (req, res) => {
  try {
    const { roomId, userId, action } = req.body;

    if (!roomId || !userId || !action) {
      return res.status(400).json({
        success: false,
        message: 'Room ID, user ID, and action are required'
      });
    }

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Action must be either "approve" or "reject"'
      });
    }

    const room = await Room.findOne({ roomId }).populate('players.userId', 'fullName username');
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Room not found'
      });
    }

    // Check if current user is the room creator
    if (room.createdBy.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Only room creator can approve/reject join requests'
      });
    }

    // Find the player in the room
    const playerIndex = room.players.findIndex(player =>
      player.userId._id.toString() === userId && player.status === 'pending'
    );

    if (playerIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Pending player not found in this room'
      });
    }

    const player = room.players[playerIndex];

    if (action === 'approve') {
      // Approve the player
      room.players[playerIndex].status = 'approved';

      // Check if we now have 2 approved players
      const approvedPlayers = room.players.filter(p => p.status === 'approved');
      if (approvedPlayers.length === 2) {
        room.status = 'live';
        room.gameStartedAt = new Date();
      }

      await room.save();

      res.status(200).json({
        success: true,
        message: 'Player approved successfully',
        data: {
          roomId: room.roomId,
          approvedPlayer: {
            fullName: player.userId.fullName,
            ludoUsername: player.ludoUsername
          },
          roomStatus: room.status,
          gameStartedAt: room.gameStartedAt,
          approvedPlayersCount: approvedPlayers.length
        }
      });

    } else if (action === 'reject') {
      // Remove player from room
      room.players.splice(playerIndex, 1);
      room.totalPrizePool -= room.betAmount;

      // Refund money to rejected player
      const wallet = await Wallet.findOne({ userId: userId });
      if (wallet) {
        wallet.depositBalance += room.betAmount;
        wallet.totalBalance += room.betAmount;
        await wallet.save();

        // Create refund transaction
        const refundTransaction = new Transaction({
          userId: userId,
          type: 'deposit',
          amount: room.betAmount,
          status: 'success',
          description: `Refund for rejected join request - Room ${roomId}`,
          walletType: 'deposit'
        });
        await refundTransaction.save();
      }

      await room.save();

      res.status(200).json({
        success: true,
        message: 'Player rejected and refunded successfully',
        data: {
          roomId: room.roomId,
          rejectedPlayer: {
            fullName: player.userId.fullName,
            ludoUsername: player.ludoUsername
          },
          refundAmount: room.betAmount,
          remainingPlayersCount: room.players.length
        }
      });
    }

  } catch (error) {
    console.error('Handle join request error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get pending join requests for room creator
const getPendingRequests = async (req, res) => {
  try {
    const rooms = await Room.find({
      createdBy: req.user.id,
      status: 'pending'
    }).populate('players.userId', 'fullName username mobileNumber');

    const roomsWithPendingPlayers = rooms.filter(room =>
      room.players.some(player => player.status === 'pending')
    );

    res.status(200).json({
      success: true,
      data: roomsWithPendingPlayers.map(room => ({
        roomId: room.roomId,
        betAmount: room.betAmount,
        totalPrizePool: room.totalPrizePool,
        createdAt: room.createdAt,
        pendingPlayers: room.players
          .filter(player => player.status === 'pending')
          .map(player => ({
            userId: player.userId._id,
            fullName: player.userId.fullName,
            username: player.userId.username,
            mobileNumber: player.userId.mobileNumber,
            ludoUsername: player.ludoUsername,
            joinedAt: player.joinedAt
          }))
      }))
    });

  } catch (error) {
    console.error('Get pending requests error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// New function to get user's finished games
const getUserFinishedGames = async (req, res) => {
  try {
    const rooms = await Room.find({
      'players.userId': req.user.id, // User must be a player in the room
      status: 'finished' // Room status must be finished
    })
      .populate('createdBy', 'fullName username')
      .populate('players.userId', 'fullName username')
      .populate('winner.userId', 'fullName username') // Populate winner details
      .sort({ gameEndedAt: -1 }); // Sort by when the game ended

    res.status(200).json({
      success: true,
      data: rooms.map(room => ({
        roomId: room.roomId,
        betAmount: room.betAmount,
        status: room.status,
        playersCount: room.players.length,
        createdBy: room.createdBy.fullName,
        gameStartedAt: room.gameStartedAt,
        gameEndedAt: room.gameEndedAt,
        winner: room.winner ? {
          userId: room.winner.userId._id,
          fullName: room.winner.userId.fullName,
          ludoUsername: room.winner.ludoUsername,
          amountWon: room.winner.amountWon,
          netAmount: room.winner.netAmount
        } : null,
        totalPrizePool: room.totalPrizePool,
        players: room.players.map(p => ({
          fullName: p.userId.fullName,
          ludoUsername: p.ludoUsername,
          status: p.status
        }))
      }))
    });

  } catch (error) {
    console.error('Get user finished games error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};



// New function to cancel a room
const cancelRoom = async (req, res) => {
  try {
    const { roomId } = req.params;

    if (!roomId) {
      return res.status(400).json({
        success: false,
        message: 'Room ID is required'
      });
    }

    const room = await Room.findOne({ roomId });
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Room not found'
      });
    }

    // Check if the authenticated user is the creator of the room
    if (room.createdBy.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to cancel this room.'
      });
    }

    // Check if another player has joined the room
    // The creator is always the first player, so if players.length > 1, another player has joined.
    if (room.players.length > 1) {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel room: another player has already joined.'
      });
    }

    // Refund the bet amount to the creator's wallet
    const creatorWallet = await Wallet.findOne({ userId: req.user.id });
    if (creatorWallet) {
      creatorWallet.depositBalance += room.betAmount;
      creatorWallet.totalBalance += room.betAmount;
      await creatorWallet.save();

      // Create a transaction record for the refund
      const refundTransaction = new Transaction({
        userId: req.user.id,
        type: 'deposit',
        amount: room.betAmount,
        status: 'success',
        description: `Refund for cancelled room ${roomId}`,
        walletType: 'deposit'
      });
      await refundTransaction.save();
    } else {
      console.warn(`Wallet not found for user ${req.user.id} during room cancellation refund.`);
    }

    // Delete the room
    await Room.deleteOne({ roomId });

    res.status(200).json({
      success: true,
      message: 'Room cancelled successfully and bet amount refunded.',
      data: {
        roomId: roomId,
        refundAmount: room.betAmount
      }
    });

  } catch (error) {
    console.error('Cancel room error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};


module.exports = {
  createRoom,
  joinRoom,
  getRoomCode,
  getUserRooms,
  getAllRooms,
  checkRoomResultManual,
  claimRoomResult,
  handleJoinRequest,
  getPendingRequests,
  getUserFinishedGames,
  cancelRoom
};
