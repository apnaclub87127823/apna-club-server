const Room = require('../models/Room');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const RoomDispute = require('../models/RoomDispute');
const fs = require('fs'); // Ensure fs is imported for file operations

// .05
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
        message: `Insufficient balance. Required: ₹${betAmount}, Available: ₹${wallet ? wallet.totalBalance : 0}`
      });
    }

    // Calculate how much to deduct from each wallet
    const amountFromDeposit = Math.min(wallet.depositBalance, betAmount);
    const amountFromWinning = betAmount - amountFromDeposit;

    // Deduct from deposit wallet first
    wallet.depositBalance -= amountFromDeposit;

    // Deduct remaining from winning wallet (if needed)
    if (amountFromWinning > 0) {
      wallet.winningBalance -= amountFromWinning;
    }

    // Update total balance
    wallet.totalBalance -= betAmount;
    await wallet.save();

    // Create transaction record(s)
    if (amountFromDeposit > 0) {
      const depositTransaction = new Transaction({
        userId: req.user.id,
        type: 'Room Create',
        amount: amountFromDeposit,
        status: 'success',
        description: `Room creation bet from deposit - ₹${amountFromDeposit}`,
        walletType: 'deposit'
      });
      await depositTransaction.save();
    }

    if (amountFromWinning > 0) {
      const winningTransaction = new Transaction({
        userId: req.user.id,
        type: 'penalty',
        amount: amountFromWinning,
        status: 'success',
        description: `Room creation bet from winning - ₹${amountFromWinning}`,
        walletType: 'winning'
      });
      await winningTransaction.save();
    }

    // Create room
    const room = new Room({
      createdBy: req.user.id,
      betAmount,
      ludoRoomCode: ludoRoomCode || null,
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
        message: `Insufficient balance. Required: ₹${room.betAmount}, Available: ₹${wallet ? wallet.totalBalance : 0}`
      });
    }

    // Calculate how much to deduct from each wallet
    const amountFromDeposit = Math.min(wallet.depositBalance, room.betAmount);
    const amountFromWinning = room.betAmount - amountFromDeposit;

    // Deduct from deposit wallet first
    wallet.depositBalance -= amountFromDeposit;

    // Deduct remaining from winning wallet (if needed)
    if (amountFromWinning > 0) {
      wallet.winningBalance -= amountFromWinning;
    }

    // Update total balance
    wallet.totalBalance -= room.betAmount;
    await wallet.save();

    // Create transaction record(s)
    if (amountFromDeposit > 0) {
      const depositTransaction = new Transaction({
        userId: req.user.id,
        type: 'penalty',
        amount: amountFromDeposit,
        status: 'success',
        description: `Joined room ${roomId} from deposit - ₹${amountFromDeposit}`,
        walletType: 'deposit'
      });
      await depositTransaction.save();
    }

    if (amountFromWinning > 0) {
      const winningTransaction = new Transaction({
        userId: req.user.id,
        type: 'penalty',
        amount: amountFromWinning,
        status: 'success',
        description: `Joined room ${roomId} from winning - ₹${amountFromWinning}`,
        walletType: 'winning'
      });
      await winningTransaction.save();
    }

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

    const isPlayer = room.players.some(player =>
      player.userId.toString() === req.user.id
    );
    if (!isPlayer) {
      return res.status(403).json({
        success: false,
        message: 'You are not a player in this room'
      });
    }

    if (room.status !== 'live') {
      return res.status(400).json({
        success: false,
        message: 'Room is not live yet or room code not provided by admin.'
      });
    }

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

const getLudoRoomCode = async (req, res) => {
  try {
    const { roomId } = req.params;
    console.log('getludoroomcode');

    // Populate 'createdBy' to get the full user object for the room creator
    const room = await Room.findOne({ roomId }).populate('createdBy', 'fullName username');

    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Room not found'
      });
    }

    // Only approved players can get the room code
    const isApprovedPlayer = room.players.some(player =>
      player.userId.toString() === req.user.id && player.status === 'approved'
    );
    if (!isApprovedPlayer) {
      return res.status(403).json({
        success: false,
        message: 'You are not an approved player in this room'
      });
    }

    // Room must be live to get the code
    if (room.status !== 'live') {
      return res.status(400).json({
        success: false,
        message: 'Room is not live yet or room code not provided by admin.'
      });
    }

    if (!room.ludoRoomCode) {
      return res.status(200).json({
        success: true,
        message: 'Room code not yet provided by the room creator',
        data: {
          roomId: room.roomId,
          ludoRoomCode: null,
          codeAvailable: false
        }
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        roomCreator: room.createdBy ? { // Ensure createdBy exists before accessing properties
          id: room.createdBy._id,
          fullName: room.createdBy.fullName,
          username: room.createdBy.username
        } : null,
        roomId: room.roomId,
        ludoRoomCode: room.ludoRoomCode,
        codeAvailable: true,
      }
    });
  } catch (error) {
    console.error('Get ludo room code error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};


const saveLudoRoomCode = async (req, res) => {
  try {
    const { roomId, ludoRoomCode } = req.body;

    if (!roomId || !ludoRoomCode) {
      return res.status(400).json({
        success: false,
        message: 'Room ID and Ludo Room Code are required'
      });
    }

    const room = await Room.findOne({ roomId });
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Room not found'
      });
    }

    if (room.createdBy.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Only room creator can add or update the room code'
      });
    }

    if (room.status !== 'pending' && room.status !== 'live') {
      return res.status(400).json({
        success: false,
        message: `Cannot update room code. Room status is '${room.status}'`
      });
    }

    room.ludoRoomCode = ludoRoomCode;
    await room.save();

    res.status(200).json({
      success: true,
      message: 'Ludo room code saved successfully',
      data: {
        roomId: room.roomId,
        ludoRoomCode: room.ludoRoomCode
      }
    });

  } catch (error) {
    console.error('Save ludo room code error:', error);
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
          const totalPrizePool = room.betAmount * 2;
          const netWinningForWinner = Math.floor(totalPrizePool * 0.95); // Winner always gets 95%

          let adminServiceCharge = 0;
          let referralBonusAmount = 0;
          let referrerUser = null;

          // Check if the winner was referred
          if (otherPlayer.userId.referredBy) {
            referralBonusAmount = Math.floor(totalPrizePool * 0.02); // 2% for referrer
            adminServiceCharge = totalPrizePool - netWinningForWinner - referralBonusAmount; // Remaining of the 5% for admin
            referrerUser = await User.findOne({ referCode: otherPlayer.userId.referredBy });
          } else {
            adminServiceCharge = totalPrizePool - netWinningForWinner; // All 5% for admin
          }

          const winnerWallet = await Wallet.findOne({ userId: otherPlayer.userId._id });
          if (winnerWallet) {
            winnerWallet.winningBalance += netWinningForWinner;
            winnerWallet.totalBalance += netWinningForWinner;
            await winnerWallet.save();

            const winningTransaction = new Transaction({
              userId: otherPlayer.userId._id,
              type: 'winning',
              amount: netWinningForWinner,
              status: 'success',
              description: `Won room ${roomId} - ₹${netWinningForWinner} (opponent accepted loss, after service charge)`,
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
                description: `Referral bonus for ${otherPlayer.userId.fullName} winning room ${roomId}`,
                walletType: 'winning'
              });
              await referralTransaction.save();
            }
          }

          room.winner = {
            userId: otherPlayer.userId._id,
            ludoUsername: otherPlayer.ludoUsername,
            amountWon: totalPrizePool, // Gross amount
            netAmount: netWinningForWinner
          };
          room.serviceCharge = adminServiceCharge;
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
          const totalPrizePool = room.betAmount * 2;
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

          const winnerWallet = await Wallet.findOne({ userId: winnerClaim.claimedBy });
          if (winnerWallet) {
            winnerWallet.winningBalance += netWinningForWinner;
            winnerWallet.totalBalance += netWinningForWinner;
            await winnerWallet.save();

            const winningTransaction = new Transaction({
              userId: winnerClaim.claimedBy,
              type: 'winning',
              amount: netWinningForWinner,
              status: 'success',
              description: `Won room ${roomId} - ₹${netWinningForWinner} (opponent accepted loss, after service charge)`,
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

          room.winner = {
            userId: winnerClaim.claimedBy,
            ludoUsername: winnerPlayer.ludoUsername,
            amountWon: totalPrizePool, // Gross amount
            netAmount: netWinningForWinner
          };
          room.serviceCharge = adminServiceCharge;
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



// // New function to cancel a room
// const cancelRoom = async (req, res) => {
//   try {
//     const { roomId } = req.params;
//     const { reason } = req.body; // Optional reason for cancellation

//     if (!roomId) {
//       return res.status(400).json({
//         success: false,
//         message: 'Room ID is required'
//       });
//     }

//     const room = await Room.findOne({ roomId }).populate('players.userId'); // Populate to get user details for refund
//     if (!room) {
//       return res.status(404).json({
//         success: false,
//         message: 'Room not found'
//       });
//     }

//     // Check if the authenticated user is a player in the room
//     const isPlayer = room.players.some(player =>
//       player.userId._id.toString() === req.user.id
//     );
//     if (!isPlayer) {
//       return res.status(403).json({
//         success: false,
//         message: 'You are not a player in this room and cannot cancel it.'
//       });
//     }

//     // Only allow cancellation if the room is still in 'pending' status
//     // This prevents cancellation of games that have already started or finished.
//     if (room.status !== 'pending' || room.status !== 'live') {
//       return res.status(400).json({
//         success: false,
//         message: `Cannot cancel room. Room status is '${room.status}'. Only 'pending' rooms can be cancelled.`
//       });
//     }

//     // Refund the bet amount to ALL players in the room
//     const refundedPlayers = [];
//     for (const player of room.players) {
//       const playerWallet = await Wallet.findOne({ userId: player.userId._id });
//       if (playerWallet) {
//         playerWallet.depositBalance += room.betAmount;
//         playerWallet.totalBalance += room.betAmount;
//         await playerWallet.save();

//         // Create a transaction record for the refund
//         const refundDescription = `Refund for cancelled room ${roomId}.` + (reason ? ` Reason: ${reason}` : '');
//         const refundTransaction = new Transaction({
//           userId: player.userId._id,
//           type: 'deposit',
//           amount: room.betAmount,
//           status: 'success',
//           description: refundDescription,
//           walletType: 'deposit'
//         });
//         await refundTransaction.save();
//         refundedPlayers.push({ userId: player.userId._id, amount: room.betAmount });
//       } else {
//         console.warn(`Wallet not found for user ${player.userId._id} during room cancellation refund.`);
//       }
//     }

//     // Delete the room
//     await Room.deleteOne({ roomId });

//     res.status(200).json({
//       success: true,
//       message: 'Room cancelled successfully and bet amounts refunded to all players.',
//       data: {
//         roomId: roomId,
//         refundedPlayers: refundedPlayers,
//         cancellationReason: reason || 'No reason provided.'
//       }
//     });

//   } catch (error) {
//     console.error('Cancel room error:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Internal server error'
//     });
//   }
// };


// New function to cancel a room
const cancelRoom = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { reason } = req.body; // Optional reason for cancellation

    if (!roomId) {
      return res.status(400).json({
        success: false,
        message: 'Room ID is required'
      });
    }

    const room = await Room.findOne({ roomId }).populate('players.userId'); // Populate to get user details for refund
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Room not found'
      });
    }

    // Check if the authenticated user is a player in the room
    const isPlayer = room.players.some(player =>
      player.userId._id.toString() === req.user.id
    );
    if (!isPlayer) {
      return res.status(403).json({
        success: false,
        message: 'You are not a player in this room and cannot cancel it.'
      });
    }

    // Only allow cancellation if the room is in 'pending' or 'live' status
    // This prevents cancellation of games that are already ended or finished.
    if (room.status !== 'pending' && room.status !== 'live') {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel room. Room status is '${room.status}'. Only 'pending' or 'live' rooms can be cancelled.`
      });
    }

    // Refund the bet amount to ALL players in the room
    const refundedPlayers = [];
    for (const player of room.players) {
      const playerWallet = await Wallet.findOne({ userId: player.userId._id });
      if (playerWallet) {
        playerWallet.depositBalance += room.betAmount;
        playerWallet.totalBalance += room.betAmount;
        await playerWallet.save();

        // Create a transaction record for the refund
        const refundDescription = `Refund for cancelled room ${roomId}.` + (reason ? ` Reason: ${reason}` : '');
        const refundTransaction = new Transaction({
          userId: player.userId._id,
          type: 'Room Cancellation Refund',
          amount: room.betAmount,
          status: 'success',
          description: refundDescription,
          walletType: 'deposit'
        });
        await refundTransaction.save();
        refundedPlayers.push({ userId: player.userId._id, amount: room.betAmount });
      } else {
        console.warn(`Wallet not found for user ${player.userId._id} during room cancellation refund.`);
      }
    }

    // Delete the room
    await Room.deleteOne({ roomId });

    res.status(200).json({
      success: true,
      message: 'Room cancelled successfully and bet amounts refunded to all players.',
      data: {
        roomId: roomId,
        refundedPlayers: refundedPlayers,
        cancellationReason: reason || 'No reason provided.'
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


// New function to request mutual room cancellation
const requestMutualRoomCancellation = async (req, res) => {
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

    // Check if the authenticated user is a player in the room
    const playerIndex = room.players.findIndex(player =>
      player.userId._id.toString() === req.user.id
    );
    if (playerIndex === -1) {
      return res.status(403).json({
        success: false,
        message: 'You are not a player in this room.'
      });
    }

    // Only allow mutual cancellation for 'pending' or 'live' rooms
    if (!['pending', 'live'].includes(room.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot request mutual cancellation. Room status is '${room.status}'. Only 'pending' or 'live' rooms can be mutually cancelled.`
      });
    }

    // Mark the current user's cancellation request
    if (room.players[playerIndex].cancelRequested) {
      return res.status(200).json({
        success: true,
        message: 'You have already requested cancellation. Waiting for the other player.',
        data: { roomId: room.roomId }
      });
    }

    room.players[playerIndex].cancelRequested = true;
    await room.save();

    // Check if all players have requested cancellation
    const allPlayersRequestedCancel = room.players.every(player => player.cancelRequested);

    if (allPlayersRequestedCancel) {
      // Both players have requested cancellation, proceed with refund and deletion
      const refundedPlayers = [];
      for (const player of room.players) {
        const playerWallet = await Wallet.findOne({ userId: player.userId._id });
        if (playerWallet) {
          playerWallet.depositBalance += room.betAmount;
          playerWallet.totalBalance += room.betAmount;
          await playerWallet.save();

          const refundDescription = `Refund for mutually cancelled room ${roomId}.`;
          const refundTransaction = new Transaction({
            userId: player.userId._id,
            type: 'deposit',
            amount: room.betAmount,
            status: 'success',
            description: refundDescription,
            walletType: 'deposit'
          });
          await refundTransaction.save();
          refundedPlayers.push({ userId: player.userId._id, amount: room.betAmount });
        } else {
          console.warn(`Wallet not found for user ${player.userId._id} during mutual room cancellation refund.`);
        }
      }

      // Delete the room
      await Room.deleteOne({ roomId });

      return res.status(200).json({
        success: true,
        message: 'Room mutually cancelled successfully and bet amounts refunded to all players.',
        data: {
          roomId: room.roomId,
          refundedPlayers: refundedPlayers
        }
      });
    } else {
      // Only one player has requested cancellation so far
      return res.status(200).json({
        success: true,
        message: 'Cancellation request sent. Waiting for the other player to confirm.',
        data: { roomId: room.roomId }
      });
    }

  } catch (error) {
    console.error('Request mutual room cancellation error:', error);
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
  getLudoRoomCode,
  saveLudoRoomCode,
  getUserRooms,
  getAllRooms,
  checkRoomResultManual,
  claimRoomResult,
  handleJoinRequest,
  getPendingRequests,
  getUserFinishedGames,
  cancelRoom,
  requestMutualRoomCancellation
};

