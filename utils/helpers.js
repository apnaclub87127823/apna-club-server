const crypto = require('crypto');
const { generateOtp: generateRandomOtp, sendOtp } = require('./otpService');

// Generate unique refer code
const generateReferCode = () => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
};

// Generate OTP (using random 6-digit OTP)
const generateOTP = () => {
  return generateRandomOtp().toString();
};

// Format mobile number (ensure it's in correct format)
const formatMobileNumber = (mobile) => {
  // Remove any non-digits
  mobile = mobile.replace(/\D/g, '');

  // If starts with +91, remove it
  if (mobile.startsWith('91') && mobile.length === 12) {
    mobile = mobile.substring(2);
  }

  // Ensure 10 digits for Indian mobile numbers
  if (mobile.length === 10) {
    return mobile;
  }

  throw new Error('Invalid mobile number format');
};

module.exports = {
  generateReferCode,
  generateOTP,
  formatMobileNumber,
  sendOtp
};