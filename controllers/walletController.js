const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const axios = require('axios'); // Import axios for HTTP requests
const FormData = require('form-data'); // Import FormData for x-www-form-urlencoded



// Get wallet balance
const getWallet = async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ userId: req.user.id });

    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: 'Wallet not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        totalBalance: wallet.totalBalance,
        depositBalance: wallet.depositBalance,
        winningBalance: wallet.winningBalance
      }
    });

  } catch (error) {
    console.error('Get wallet error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Deposit money
const deposit = async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid deposit amount'
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Generate a unique, alphanumeric order_id for Zapupi
    // Using a prefix, last 8 characters of user ID, and last 7 characters of current timestamp
    // This creates a shorter, alphanumeric ID like "DEP123456789012345"
    const orderId = `DEP${req.user.id.toString().slice(-8)}${Date.now().toString().slice(-7)}`;

    // --- Start Logging for Debugging ---
    console.log('ZAPUPI_API_TOKEN (deposit):', process.env.ZAPUPI_API_TOKEN);
    console.log('ZAPUPI_SECRET_KEY (deposit):', process.env.ZAPUPI_SECRET_KEY);
    // --- End Logging for Debugging ---

    // Prepare data for Zapupi API
    const form = new FormData();
    form.append('token_key', process.env.ZAPUPI_API_TOKEN);
    form.append('secret_key', process.env.ZAPUPI_SECRET_KEY);
    form.append('amount', amount);
    form.append('order_id', orderId);
    form.append('custumer_mobile', user.mobileNumber); // Use user's mobile number
    form.append('remark', `Deposit for user ${user.username}`);
    form.append('redirect_url', process.env.ZAPUPI_REDIRECT_URL); // URL where Zapupi redirects after payment

    // Call Zapupi Create Order API
    const zapupiResponse = await axios.post(
      process.env.ZAPUPI_CREATE_ORDER_URL, // e.g., 'https://api.zapupi.com/api/create-order'
      form,
      {
        headers: {
          ...form.getHeaders(),
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    if (zapupiResponse.data.status === 'success') {
      const { payment_url, order_id: zapupiOrderId } = zapupiResponse.data;

      // Create a pending transaction record in your database
      const transaction = new Transaction({
        userId: req.user.id,
        type: 'deposit',
        amount,
        status: 'pending', // Mark as pending until Zapupi confirms
        description: `Pending deposit of ₹${amount} via Zapupi`,
        walletType: 'deposit',
        zapupiOrderId: zapupiOrderId // Store Zapupi's order ID
      });
      await transaction.save();

      res.status(200).json({
        success: true,
        message: 'Zapupi order created successfully. Redirecting for payment.',
        data: {
          paymentUrl: payment_url,
          orderId: zapupiOrderId,
          localTransactionId: transaction._id
        }
      });
    } else {
      console.error('Zapupi Create Order failed:', zapupiResponse.data);
      return res.status(400).json({
        success: false,
        message: zapupiResponse.data.message || 'Failed to create Zapupi order.'
      });
    }

  } catch (error) {
    console.error('Deposit error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error or Zapupi API error.'
    });
  }
};

const withdraw = async (req, res) => {
  try {
    const { amount, type, upiId, bankAccountNumber } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid withdrawal amount'
      });
    }

    if (!type || !['upi', 'bank'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid withdrawal type. Must be upi or bank'
      });
    }

    if (type === 'upi' && !upiId) {
      return res.status(400).json({
        success: false,
        message: 'UPI ID is required for UPI withdrawal'
      });
    }

    if (type === 'bank' && !bankAccountNumber) {
      return res.status(400).json({
        success: false,
        message: 'Bank account number is required for bank withdrawal'
      });
    }

    // CHECK FOR 3-HOUR COOLDOWN
    // Find the last withdrawal request (regardless of status)
    const lastWithdrawal = await Transaction.findOne({
      userId: req.user.id,
      type: 'withdraw'
    }).sort({ createdAt: -1 });

    if (lastWithdrawal) {
      const THREE_HOURS = 3 * 60 * 60 * 1000; // 3 hours in milliseconds
      const timeSinceLastWithdrawal = Date.now() - lastWithdrawal.createdAt.getTime();

      if (timeSinceLastWithdrawal < THREE_HOURS) {
        const remainingTime = THREE_HOURS - timeSinceLastWithdrawal;
        const hoursLeft = Math.floor(remainingTime / (60 * 60 * 1000));
        const minutesLeft = Math.floor((remainingTime % (60 * 60 * 1000)) / (60 * 1000));

        return res.status(429).json({
          success: false,
          message: `You can only withdraw once every 3 hours. Please wait ${hoursLeft} hour(s) and ${minutesLeft} minute(s) before trying again.`,
          data: {
            remainingTimeMs: remainingTime,
            nextWithdrawalTime: new Date(lastWithdrawal.createdAt.getTime() + THREE_HOURS)
          }
        });
      }
    }

    const wallet = await Wallet.findOne({ userId: req.user.id });
    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: 'Wallet not found'
      });
    }

    // Check if sufficient winning balance only
    if (wallet.winningBalance < amount) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient winning balance. You can only withdraw from winning wallet.'
      });
    }

    // Update wallet balance - deduct only from winning balance
    wallet.winningBalance -= amount;
    wallet.totalBalance -= amount; // Total balance is also updated to reflect the change in winning balance

    await wallet.save();

    // Create transaction record
    const transactionData = {
      userId: req.user.id,
      type: 'withdraw',
      amount,
      status: 'pending',
      description: `Withdrawal of ₹${amount} via ${type.toUpperCase()}`,
      withdrawMethod: type
    };

    if (type === 'upi') {
      transactionData.upiId = upiId;
    } else {
      transactionData.bankAccountNumber = bankAccountNumber;
    }

    const transaction = new Transaction(transactionData);
    await transaction.save();

    res.status(200).json({
      success: true,
      message: 'Withdrawal request submitted successfully. It will be processed by admin.',
      data: {
        transactionId: transaction._id,
        amount,
        status: 'pending',
        withdrawalMethod: type
      }
    });

  } catch (error) {
    console.error('Withdraw error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};


// Get transaction history
const getTransactionHistory = async (req, res) => {
  try {
    const { page = 1, limit = 10, type } = req.query;

    const query = { userId: req.user.id };
    if (type) {
      query.type = type;
    }

    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .select('-__v');

    const total = await Transaction.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        transactions,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        totalTransactions: total
      }
    });

  } catch (error) {
    console.error('Get transaction history error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Check Zapupi payment status and update wallet
const checkZapupiStatus = async (req, res) => {
  try {
    const { zapupiOrderId } = req.body;

    if (!zapupiOrderId) {
      return res.status(400).json({
        success: false,
        message: 'Zapupi order ID is required'
      });
    }

    // Find the pending transaction
    // We specifically look for a 'pending' transaction to avoid re-processing
    const transaction = await Transaction.findOne({
      zapupiOrderId: zapupiOrderId,
      userId: req.user.id,
      status: 'pending'
    });

    if (!transaction) {
      // If transaction is not found or not pending, it might have been processed already
      // or the orderId is incorrect.
      return res.status(404).json({
        success: false,
        message: 'Transaction not found or already processed'
      });
    }

    // --- Start Logging for Debugging ---
    console.log('ZAPUPI_API_TOKEN (checkZapupiStatus):', process.env.ZAPUPI_API_TOKEN);
    console.log('ZAPUPI_SECRET_KEY (checkZapupiStatus):', process.env.ZAPUPI_SECRET_KEY);
    // --- End Logging for Debugging ---

    // Prepare data for Zapupi Order Status API
    const form = new FormData();
    form.append('token_key', process.env.ZAPUPI_API_TOKEN);
    form.append('secret_key', process.env.ZAPUPI_SECRET_KEY);
    form.append('order_id', zapupiOrderId);

    // Call Zapupi Order Status API
    const zapupiResponse = await axios.post(
      process.env.ZAPUPI_ORDER_STATUS_URL, // e.g., 'https://api.zapupi.com/api/order-status'
      form,
      {
        headers: {
          ...form.getHeaders(),
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    if (zapupiResponse.data.status === 'success') {
      const zapupiData = zapupiResponse.data.data;

      if (zapupiData.status === 'Success') {
        // Update transaction status to 'success'
        transaction.status = 'success';
        transaction.description = `Deposit of ₹${transaction.amount} via Zapupi - Completed`;
        transaction.zapupiTxnId = zapupiData.txn_id;
        await transaction.save();

        res.status(200).json({
          success: true,
          message: 'Deposit completed successfully',
          data: {
            transactionId: transaction._id,
            amount: transaction.amount,
            status: 'success',
            zapupiTxnId: zapupiData.txn_id
          }
        });
      } else if (zapupiData.status === 'Failed') {
        // Payment failed - update transaction status to 'failed'
        transaction.status = 'failed';
        transaction.description = `Deposit of ₹${transaction.amount} via Zapupi - Failed`;
        await transaction.save();

        res.status(200).json({
          success: false,
          message: `Payment status: ${zapupiData.status}`,
          data: {
            transactionId: transaction._id,
            amount: transaction.amount,
            status: 'failed',
            zapupiOrderId: zapupiOrderId
          }
        });
      } else {
        // Payment is still pending according to Zapupi. No change to local DB status.
        res.status(200).json({
          success: false,
          message: `Payment status: ${zapupiData.status}. Still pending.`,
          data: {
            transactionId: transaction._id, // Return local transaction ID
            amount: transaction.amount,
            status: 'pending', // Explicitly state pending
            zapupiOrderId: zapupiOrderId
          }
        });
      }
    } else {
      console.error('Zapupi Order Status API call failed:', zapupiResponse.data);
      return res.status(400).json({
        success: false,
        message: zapupiResponse.data.message || 'Failed to check Zapupi order status.'
      });
    }

  } catch (error) {
    console.error('Check Zapupi status error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error or Zapupi API error.'
    });
  }
};

module.exports = {
  getWallet,
  deposit,
  withdraw,
  getTransactionHistory,
  checkZapupiStatus
};
