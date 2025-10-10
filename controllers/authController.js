const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const cache = require('../utils/cache');
const { generateReferCode, generateOTP, formatMobileNumber, sendOtp } = require('../utils/helpers');

// Signup - Send OTP
const signup = async (req, res) => {
  try {
    const { fullName, mobileNumber, referCode } = req.body;

    if (!fullName || !mobileNumber) {
      return res.status(400).json({
        success: false,
        message: 'Full name and mobile number are required'
      });
    }

    const formattedMobile = formatMobileNumber(mobileNumber);

    // Check if user already exists
    const existingUser = await User.findOne({ mobileNumber: formattedMobile });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this mobile number already exists'
      });
    }

    // Validate refer code if provided
    if (referCode) {
      const referrer = await User.findOne({ referCode });
      if (!referrer) {
        return res.status(400).json({
          success: false,
          message: 'Invalid refer code'
        });
      }
    }

    // Generate OTP
    const otp = generateOTP();

    // Send OTP via SMS service
    const otpResult = await sendOtp(formattedMobile, otp);
    console.log('OTP send result:', otpResult);

    // Store OTP in cache with mobile number as key
    cache.set(`signup_otp_${formattedMobile}`, {
      otp,
      fullName,
      referCode,
      timestamp: Date.now()
    });

    // Log OTP for development (remove in production)
    console.log(`OTP for ${formattedMobile}: ${otp}`);

    res.status(200).json({
      success: true,
      message: 'OTP sent successfully',
      mobileNumber: formattedMobile
    });

  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Verify Signup OTP
// Verify Signup OTP
const verifySignupOTP = async (req, res) => {
  try {
    const { mobileNumber, otp } = req.body;

    if (!mobileNumber || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Mobile number and OTP are required'
      });
    }

    const formattedMobile = formatMobileNumber(mobileNumber);

    // Get OTP from cache
    const cachedData = cache.get(`signup_otp_${formattedMobile}`);

    if (!cachedData) {
      return res.status(400).json({
        success: false,
        message: 'OTP expired or invalid'
      });
    }

    if (cachedData.otp !== otp) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP'
      });
    }

    // Generate unique refer code
    let userReferCode;
    let isUnique = false;
    while (!isUnique) {
      userReferCode = generateReferCode();
      const existingUser = await User.findOne({ referCode: userReferCode });
      if (!existingUser) {
        isUnique = true;
      }
    }

    // ✅ Fixed: set role manually instead of using undefined `user.role`
    const user = new User({
      fullName: cachedData.fullName,
      mobileNumber: formattedMobile,
      referCode: userReferCode,
      referredBy: cachedData.referCode || null,
      role: 'user' // Default role assigned properly
    });

    await user.save();

    // Create wallet for new user
    const wallet = new Wallet({
      userId: user._id
    });
    await wallet.save();

    // If user was referred, add referral earning to referrer
    if (cachedData.referCode) {
      const referrer = await User.findOne({ referCode: cachedData.referCode });
      if (referrer) {
        referrer.referralEarning += 20;
        await referrer.save();

        const referrerWallet = await Wallet.findOne({ userId: referrer._id });
        if (referrerWallet) {
          referrerWallet.winningBalance += 20;
          referrerWallet.totalBalance += 20;
          await referrerWallet.save();

          // Add referral transaction
          const referralTransaction = new Transaction({
            userId: referrer._id,
            type: 'referral',
            amount: 20,
            status: 'success',
            description: `Referral bonus for inviting ${user.fullName}`,
            walletType: 'winning'
          });
          await referralTransaction.save();
        }
      }
    }

    // Generate JWT
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    // Remove OTP from cache
    cache.del(`signup_otp_${formattedMobile}`);

    res.status(201).json({
      success: true,
      message: 'Signup successful',
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        mobileNumber: user.mobileNumber,
        referCode: user.referCode,
        referredBy: user.referredBy
      }
    });

  } catch (error) {
    console.error('Verify signup OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};


// Login - Send OTP
const login = async (req, res) => {
  try {
    const { mobileNumber } = req.body;

    if (!mobileNumber) {
      return res.status(400).json({
        success: false,
        message: 'Mobile number is required'
      });
    }

    const formattedMobile = formatMobileNumber(mobileNumber);

    // Check if user exists
    const user = await User.findOne({ mobileNumber: formattedMobile });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Generate OTP
    const otp = generateOTP();

    // Send OTP via SMS service
    const otpResult = await sendOtp(formattedMobile, otp);
    console.log('OTP send result:', otpResult);

    // Store OTP in cache
    cache.set(`login_otp_${formattedMobile}`, {
      otp,
      userId: user._id,
      timestamp: Date.now()
    });

    // Log OTP for development (remove in production)
    console.log(`Login OTP for ${formattedMobile}: ${otp}`);

    res.status(200).json({
      success: true,
      message: 'OTP sent successfully',
      mobileNumber: formattedMobile
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Verify Login OTP
const verifyLoginOTP = async (req, res) => {
  try {
    const { mobileNumber, otp } = req.body;

    if (!mobileNumber || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Mobile number and OTP are required'
      });
    }

    const formattedMobile = formatMobileNumber(mobileNumber);

    // Get OTP from cache
    const cachedData = cache.get(`login_otp_${formattedMobile}`);

    if (!cachedData) {
      return res.status(400).json({
        success: false,
        message: 'OTP expired or invalid'
      });
    }

    if (cachedData.otp !== otp) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP'
      });
    }

    // Get user
    const user = await User.findById(cachedData.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    // Remove OTP from cache
    cache.del(`login_otp_${formattedMobile}`);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        username: user.username,
        mobileNumber: user.mobileNumber,
        referCode: user.referCode,
        role: user.role
      }
    });

  } catch (error) {
    console.error('Verify login OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

module.exports = {
  signup,
  verifySignupOTP,
  login,
  verifyLoginOTP
};
